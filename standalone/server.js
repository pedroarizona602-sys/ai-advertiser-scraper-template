import http from "node:http";
import { readFile, writeFile, mkdir, rename } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";
import { createWorkflowStore } from "./workflow-store.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 3000);
const DATA_DIR = process.env.DATA_DIR || (process.env.RAILWAY_VOLUME_MOUNT_PATH ? path.join(process.env.RAILWAY_VOLUME_MOUNT_PATH, "nexora") : path.join(__dirname, "data"));
const DB_FILE = path.join(DATA_DIR, "leads.json");
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "";
const GOOGLE_PLACES_API_KEY = process.env.GOOGLE_PLACES_API_KEY || "";
const GHL_API_KEY = process.env.GHL_API_KEY || process.env.GHL_ACCESS_TOKEN || "";
const GHL_LOCATION_ID = process.env.GHL_LOCATION_ID || "";
let leads = [];

await mkdir(DATA_DIR, { recursive: true });
const handleWorkflow = createWorkflowStore(DATA_DIR);
try { leads = JSON.parse(await readFile(DB_FILE, "utf8")); if (!Array.isArray(leads)) leads = []; } catch { leads = []; }
async function persist() {
  const temp = DB_FILE + ".tmp";
  await writeFile(temp, JSON.stringify(leads, null, 2), "utf8");
  await rename(temp, DB_FILE);
}
const send = (res, status, data, type="application/json; charset=utf-8") => {
  res.writeHead(status, { "content-type": type, "cache-control": "no-store", "access-control-allow-origin": "null" });
  res.end(type.startsWith("application/json") ? JSON.stringify(data) : data);
};
const readBody = async req => {
  let raw=""; for await (const chunk of req) { raw += chunk; if (raw.length > 1_000_000) throw new Error("Request too large"); }
  return raw ? JSON.parse(raw) : {};
};
function authorized(req) {
  if (!ADMIN_PASSWORD || ADMIN_PASSWORD.length < 16) return false;
  const value = req.headers.authorization || "";
  if (!value.startsWith("Basic ")) return false;
  try {
    const decoded = Buffer.from(value.slice(6), "base64").toString("utf8");
    const separator = decoded.indexOf(":");
    if (separator < 1) return false;
    const supplied = Buffer.from(decoded.slice(separator + 1));
    const expected = Buffer.from(ADMIN_PASSWORD);
    return supplied.length === expected.length && crypto.timingSafeEqual(supplied, expected);
  } catch { return false; }
}
function qualifyLead(lead) {
  let score = 0;
  const reasons = [];
  if (!lead.website) { score += 35; reasons.push("No website listed"); }
  else { score += 5; reasons.push("Website listed"); }
  if (lead.phone) { score += 15; reasons.push("Phone number available"); }
  if (typeof lead.rating === "number") {
    if (lead.rating >= 4.5) score += 15;
    else if (lead.rating >= 4) score += 10;
    else if (lead.rating < 3.5) score += 5;
    reasons.push("Public rating: " + lead.rating);
  }
  if (Number(lead.reviewCount) >= 20) score += 10;
  else if (Number(lead.reviewCount) > 0) score += 5;
  if (lead.address) score += 5;
  if (lead.status === "new") score += 5;
  score = Math.min(100, score);
  return { score, tier: score >= 65 ? "high" : score >= 40 ? "medium" : "low", reasons };
}
function cleanPlace(p, niche, location) {
  const phone = p.nationalPhoneNumber || p.internationalPhoneNumber || "";
  const website = p.websiteUri || "";
  return {
    id: crypto.randomUUID(), sourceId: p.id || "", name: p.displayName?.text || "Unnamed business",
    phone, website, address: p.formattedAddress || "", rating: p.rating ?? null,
    reviewCount: p.userRatingCount ?? 0, mapsUrl: p.googleMapsUri || "",
    niche, city: location, status: "new", qualified: false,
    createdAt: new Date().toISOString()
  };
}
const server = http.createServer(async (req,res) => {
  try {
    const url = new URL(req.url, "http://localhost");
    if (req.method === "OPTIONS") { res.writeHead(204, {"access-control-allow-methods":"GET,POST,PATCH,DELETE,OPTIONS","access-control-allow-headers":"Content-Type,Authorization"}); return res.end(); }
    if (url.pathname === "/health") return send(res,200,{ok:true,service:"nexora-lead-engine",savedLeads:leads.length});
    if (!authorized(req)) { res.writeHead(401, {"www-authenticate":'Basic realm="Nexora Lead Engine"',"content-type":"application/json"}); return res.end(JSON.stringify({error:"Sign in required"})); }
    if (url.pathname === "/api/config" && req.method === "GET") return send(res,200,{placesReady:Boolean(GOOGLE_PLACES_API_KEY),googlePlacesConfigured:Boolean(GOOGLE_PLACES_API_KEY),goHighLevelConfigured:Boolean(GHL_API_KEY && GHL_LOCATION_ID),voiceConfigured:Boolean(process.env.VOICE_PROVIDER_API_KEY),savedLeads:leads.length,securePasswordConfigured:ADMIN_PASSWORD.length>=16});
    if (url.pathname === "/api/dashboard/summary" && req.method === "GET") {
      const readCollection=async name=>{try{const value=JSON.parse(await readFile(path.join(DATA_DIR,name+".json"),"utf8"));return Array.isArray(value)?value:[]}catch{return []}};
      const [clients,appointments,tasks,invoices,approvals,outreach,proposals,projects,callLogs]=await Promise.all(["clients","appointments","tasks","invoices","approvals","outreach","proposals","projects","callLogs"].map(readCollection));
      return send(res,200,{leads:{total:leads.length,qualified:leads.filter(x=>x.qualified).length,withoutWebsite:leads.filter(x=>!x.website).length,new:leads.filter(x=>x.status==="new").length,highPriority:leads.filter(x=>x.scoreTier==="high").length},clients:clients.length,appointments:{total:appointments.length,upcoming:appointments.filter(x=>["requested","scheduled"].includes(x.status)).length},tasks:{total:tasks.length,open:tasks.filter(x=>x.status!=="done").length},invoices:{total:invoices.length,unpaid:invoices.filter(x=>!["paid","cancelled"].includes(x.status)).length},approvals:{total:approvals.length,pending:approvals.filter(x=>x.status==="pending").length},outreach:{drafts:outreach.length,awaitingApproval:outreach.filter(x=>x.status==="pending_approval").length},proposals:{total:proposals.length,awaitingReview:proposals.filter(x=>x.status==="ready_for_review").length},projects:{total:projects.length,active:projects.filter(x=>!["completed","on_hold"].includes(x.status)).length},callLogs:callLogs.length});
    }
    const ghlSyncMatch=url.pathname.match(/^\\/api\\/integrations\\/highlevel\\/sync\\/([\\w-]+)$/);
    if (ghlSyncMatch && req.method === "POST") {
      if (!GHL_API_KEY || !GHL_LOCATION_ID) return send(res,503,{error:"GoHighLevel is not configured. Add a sub-account Private Integration Token and location ID in Railway Variables."});
      const lead=leads.find(x=>x.id===ghlSyncMatch[1]);
      if (!lead) return send(res,404,{error:"Lead not found"});
      if (lead.ghlContactId) return send(res,200,{ok:true,alreadySynced:true,contactId:lead.ghlContactId});
      const payload={locationId:GHL_LOCATION_ID,name:lead.name,companyName:lead.name,phone:lead.phone||undefined,website:lead.website||undefined,address1:lead.address||undefined,source:"Nexora Smart Digital Lead Engine",tags:["Nexora Lead","Website Prospect"]};
      const response=await fetch("https://services.leadconnectorhq.com/contacts/upsert",{method:"POST",headers:{"Authorization":"Bearer "+GHL_API_KEY,"Version":"2021-07-28","Content-Type":"application/json","Accept":"application/json"},body:JSON.stringify(payload)});
      const result=await response.json().catch(()=>({}));
      if(!response.ok) return send(res,502,{error:result.message||result.error||"GoHighLevel sync failed. Check token permissions and location."});
      const contactId=result.contact?.id;
      if(!contactId) return send(res,502,{error:"GoHighLevel returned no contact ID; local lead was not marked synced."});
      lead.ghlContactId=contactId; lead.ghlSyncedAt=new Date().toISOString(); await persist();
      return send(res,200,{ok:true,contactId,created:result.new??null});
    }
    const salesKitMatch=url.pathname.match(/^\\/api\\/sales-kit\\/([\\w-]+)$/);
    if (salesKitMatch && req.method==="GET") {
      const lead=leads.find(x=>x.id===salesKitMatch[1]);
      if(!lead) return send(res,404,{error:"Lead not found"});
      const missing=lead.website?"":"No website is listed on the public business profile";
      const subject="A quick website opportunity for "+lead.name;
      const opener="Hi "+lead.name+", I came across your business in "+(lead.city||"your area")+" and wanted to reach out.";
      const value=lead.website?"I noticed an opportunity to make it easier for local customers to request quotes and contact you from their phones.":"I couldn't find a website listed for your business, which may make it harder for customers to see your services and request a quote.";
      const pitch=opener+" "+value+" Nexora Smart Digital builds mobile-friendly websites with clear calls to action and lead capture. Would you be open to seeing a free custom website preview?";
      const callScript="Hi, is this "+lead.name+"? My name is calling from Nexora Smart Digital. We help local service businesses turn more website visitors into quote requests. "+(missing? "I couldn't find a website listed for your business.":"I noticed a few opportunities to improve how customers contact you online.")+" Would you be interested in a free custom website preview?";
      return send(res,200,{lead:{id:lead.id,name:lead.name,phone:lead.phone,website:lead.website,city:lead.city},subject,emailDraft:pitch,callScript,opportunity:missing||"Improve mobile contact and quote-request conversion",recommendedNextStep:"Review the business website and public details before contacting. Personalize this draft and obtain approval before sending.",claimsToVerify:["Current website quality and mobile experience","Services and service area","Existing quote or booking process"]});
    }
    if (url.pathname === "/api/qualification" && req.method === "POST") {
      const body=await readBody(req), ids=Array.isArray(body.ids)?new Set(body.ids):null;
      let updated=0;
      for (const lead of leads) {
        if (ids && !ids.has(lead.id)) continue;
        const result=qualifyLead(lead);
        lead.score=result.score; lead.scoreTier=result.tier; lead.scoreReasons=result.reasons;
        lead.qualified=result.score>=60; lead.scoredAt=new Date().toISOString(); updated++;
      }
      await persist();
      return send(res,200,{updated,leads:leads.map(x=>({id:x.id,score:x.score,scoreTier:x.scoreTier,qualified:x.qualified}))});
    }
    if (await handleWorkflow(req,res,url,send,readBody)) return;
    if (url.pathname === "/api/leads" && req.method === "GET") {
      const q=(url.searchParams.get("q")||"").toLowerCase();
      const status=url.searchParams.get("status")||"";
      const items=leads.filter(x=>(!status||x.status===status) && (!q||[x.name,x.phone,x.address,x.niche,x.city].join(" ").toLowerCase().includes(q)));
      return send(res,200,{leads:items,total:items.length});
    }
    if (url.pathname === "/api/search" && req.method === "POST") {
      if (!GOOGLE_PLACES_API_KEY) return send(res,503,{error:"Lead discovery is not configured yet. Add GOOGLE_PLACES_API_KEY in the service environment."});
      const body=await readBody(req), niche=String(body.niche||"").trim(), location=String(body.location||"").trim();
      if (!niche||!location) return send(res,400,{error:"Enter an industry and a city or area."});
      if (niche.length>100 || location.length>120) return send(res,400,{error:"Search terms are too long."});
      const max=Math.min(20,Math.max(1,Number(body.maxResults)||20));
      const response=await fetch("https://places.googleapis.com/v1/places:searchText",{
        method:"POST",headers:{"Content-Type":"application/json","X-Goog-Api-Key":GOOGLE_PLACES_API_KEY,"X-Goog-FieldMask":"places.id,places.displayName,places.nationalPhoneNumber,places.internationalPhoneNumber,places.websiteUri,places.formattedAddress,places.rating,places.userRatingCount,places.googleMapsUri"},
        body:JSON.stringify({textQuery:niche+" in "+location,pageSize:max})
      });
      const result=await response.json();
      if (!response.ok) return send(res,502,{error:result.error?.message||"Business search provider returned an error."});
      const existing=new Set(leads.map(x=>x.sourceId).filter(Boolean));
      const prospects=(result.places||[]).map(p=>cleanPlace(p,niche,location)).map(p=>({...p,alreadySaved:existing.has(p.sourceId)}));
      return send(res,200,{prospects,total:prospects.length,provider:"Google Places"});
    }
    if (url.pathname === "/api/leads/import" && req.method === "POST") {
      const body=await readBody(req), items=Array.isArray(body.leads)?body.leads:[];
      let added=0;
      for (const item of items) {
        if (!item?.name) continue;
        const duplicate=leads.some(x=>(item.sourceId&&x.sourceId===item.sourceId)||(!item.sourceId&&x.name===item.name&&x.address===item.address));
        if (!duplicate) { leads.unshift({...item,id:crypto.randomUUID(),status:"new",qualified:false,createdAt:new Date().toISOString()}); added++; }
      }
      await persist(); return send(res,200,{added,total:leads.length});
    }
    const match=url.pathname.match(/^\/api\/leads\/([\w-]+)$/);
    if (match && req.method==="PATCH") {
      const body=await readBody(req), item=leads.find(x=>x.id===match[1]);
      if (!item) return send(res,404,{error:"Lead not found"});
      if ("status" in body && !["new","contacted","qualified","customer","not_a_fit"].includes(body.status)) return send(res,400,{error:"Invalid lead status"});
      if ("qualified" in body && typeof body.qualified!=="boolean") return send(res,400,{error:"Qualified must be true or false"});
      if ("notes" in body && typeof body.notes!=="string") return send(res,400,{error:"Notes must be text"});
      for (const key of ["status","qualified","notes"]) if (key in body) item[key]=body[key];
      await persist(); return send(res,200,{lead:item});
    }
    if (match && req.method==="DELETE") {
      const before=leads.length; leads=leads.filter(x=>x.id!==match[1]);
      if (before===leads.length) return send(res,404,{error:"Lead not found"});
      await persist(); return send(res,200,{ok:true});
    }
    if (url.pathname==="/api/export.csv" && req.method==="GET") {
      const fields=["name","phone","website","address","rating","reviewCount","niche","city","status","qualified","mapsUrl"];
      const esc=v=>'"'+String(v??"").replaceAll('"','""')+'"';
      const csv=[fields.join(","),...leads.map(x=>fields.map(k=>esc(x[k])).join(","))].join("\r\n");
      return send(res,200,csv,"text/csv; charset=utf-8");
    }
    if (url.pathname.startsWith("/api/")) return send(res,404,{error:"API route not found"});
    const file=path.join(__dirname,"public",url.pathname==="/"?"index.html":path.basename(url.pathname));
    try { const content=await readFile(file); const ext=path.extname(file); const types={".html":"text/html; charset=utf-8",".js":"text/javascript; charset=utf-8",".css":"text/css; charset=utf-8"}; return send(res,200,content,types[ext]||"application/octet-stream"); }
    catch { return send(res,404,"Not found","text/plain; charset=utf-8"); }
  } catch (error) { console.error(error); return send(res,500,{error:"Unexpected server error"}); }
});
server.listen(PORT,"0.0.0.0",()=>console.log("Nexora Lead Engine listening on "+PORT));
