import { readFile, writeFile, rename } from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

const TYPES = new Set(["clients", "appointments", "tasks", "invoices", "approvals"]);
const STATUSES = {
  appointments: new Set(["requested","scheduled","completed","cancelled"]),
  tasks: new Set(["todo","in_progress","done"]),
  invoices: new Set(["draft","sent","paid","overdue","cancelled"]),
  approvals: new Set(["pending","approved","rejected"])
};
export function createWorkflowStore(dataDir) {
  async function load(type) {
    if (!TYPES.has(type)) throw new Error("Unsupported record type");
    try { const data=JSON.parse(await readFile(path.join(dataDir,type+".json"),"utf8")); return Array.isArray(data)?data:[]; }
    catch { return []; }
  }
  async function save(type, rows) {
    const file=path.join(dataDir,type+".json"), tmp=file+".tmp";
    await writeFile(tmp,JSON.stringify(rows,null,2),"utf8"); await rename(tmp,file);
  }
  return async function handle(req,res,url,send,readBody) {
    const parts=url.pathname.split("/").filter(Boolean);
    if (parts[0]!=="api" || !TYPES.has(parts[1])) return false;
    const type=parts[1], id=parts[2];
    if (req.method==="GET" && !id) {
      const rows=await load(type); const status=url.searchParams.get("status")||"";
      const q=(url.searchParams.get("q")||"").toLowerCase();
      const filtered=rows.filter(x=>(!status||x.status===status)&&(!q||JSON.stringify(x).toLowerCase().includes(q)));
      send(res,200,{items:filtered,total:filtered.length}); return true;
    }
    if (req.method==="POST" && !id) {
      const body=await readBody(req);
      if (type==="approvals" && (!body.action || !body.description)) { send(res,400,{error:"An approval needs an action and description."}); return true; }
      const item={...body,id:crypto.randomUUID(),status:type==="approvals"?"pending":(body.status||"todo"),createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};
      delete item.approvedAt; const rows=await load(type); rows.unshift(item); await save(type,rows);
      send(res,201,{item}); return true;
    }
    if (id && (req.method==="PATCH" || req.method==="DELETE")) {
      const rows=await load(type), index=rows.findIndex(x=>x.id===id);
      if(index<0){send(res,404,{error:"Record not found"});return true;}
      if(req.method==="DELETE"){rows.splice(index,1);await save(type,rows);send(res,200,{ok:true});return true;}
      const body=await readBody(req);
      if(type==="approvals" && body.status==="approved") rows[index].approvedAt=new Date().toISOString();
      if(STATUSES[type] && body.status && !STATUSES[type].has(body.status)){send(res,400,{error:"Invalid status"});return true;}
      const allowed= type==="approvals" ? ["status","decisionNote"] : ["status","title","name","email","phone","company","notes","date","time","durationMinutes","amount","currency","dueDate","leadId","clientId","description","assignedTo"];
      for(const key of allowed) if(key in body) rows[index][key]=body[key];
      rows[index].updatedAt=new Date().toISOString(); await save(type,rows); send(res,200,{item:rows[index]}); return true;
    }
    send(res,405,{error:"Method not allowed"}); return true;
  };
}
