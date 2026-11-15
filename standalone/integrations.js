const present = (...names) => names.every(name => Boolean(process.env[name] && String(process.env[name]).trim()));
export function getIntegrationStatus(env = process.env) {
  const configured = (...names) => names.every(name => Boolean(env[name] && String(env[name]).trim()));
  return [
    { id:"lead_discovery", name:"Google Places lead discovery", category:"leads", configured:configured("GOOGLE_PLACES_API_KEY"), required:["GOOGLE_PLACES_API_KEY"], mode:"live_search" },
    { id:"highlevel_contacts", name:"GoHighLevel contact sync", category:"crm", configured:configured("GHL_LOCATION_ID") && configured("GHL_API_KEY","GHL_ACCESS_TOKEN"), required:["GHL_LOCATION_ID","GHL_API_KEY or GHL_ACCESS_TOKEN"], mode:"contact_upsert" },
    { id:"highlevel_workflows", name:"GoHighLevel workflows and opportunities", category:"crm_automation", configured:configured("GHL_LOCATION_ID") && configured("GHL_API_KEY","GHL_ACCESS_TOKEN"), required:["GHL_LOCATION_ID","GHL_API_KEY or GHL_ACCESS_TOKEN"], mode:"provider_extension_required" },
    { id:"website_audits", name:"Automated website audits", category:"website", configured:configured("WEBSITE_AUDIT_PROVIDER_URL","WEBSITE_AUDIT_API_KEY"), required:["WEBSITE_AUDIT_PROVIDER_URL","WEBSITE_AUDIT_API_KEY"], mode:"provider_extension_required" },
    { id:"calendar", name:"Calendar booking and reminders", category:"scheduling", configured:configured("CALENDAR_PROVIDER","CALENDAR_ACCESS_TOKEN"), required:["CALENDAR_PROVIDER","CALENDAR_ACCESS_TOKEN"], mode:"provider_extension_required" },
    { id:"payments", name:"Payment collection and reconciliation", category:"payments", configured:configured("PAYMENT_PROVIDER","PAYMENT_SECRET_KEY","PAYMENT_WEBHOOK_SECRET"), required:["PAYMENT_PROVIDER","PAYMENT_SECRET_KEY","PAYMENT_WEBHOOK_SECRET"], mode:"provider_extension_required" },
    { id:"voice", name:"AI voice receptionist", category:"voice", configured:configured("VOICE_PROVIDER","VOICE_PROVIDER_API_KEY","VOICE_PHONE_NUMBER"), required:["VOICE_PROVIDER","VOICE_PROVIDER_API_KEY","VOICE_PHONE_NUMBER"], mode:"provider_extension_required" },
    { id:"outreach", name:"Compliant outreach delivery", category:"outreach", configured:configured("OUTREACH_PROVIDER","OUTREACH_API_KEY"), required:["OUTREACH_PROVIDER","OUTREACH_API_KEY","verified consent and opt-out controls"], mode:"drafts_only_until_compliance_enabled" },
    { id:"website_publish", name:"Website build and publishing", category:"production", configured:configured("DEPLOY_PROVIDER","DEPLOY_API_TOKEN"), required:["DEPLOY_PROVIDER","DEPLOY_API_TOKEN"], mode:"provider_extension_required" },
    { id:"ai_commands", name:"AI command and voice assistant", category:"assistant", configured:configured("AI_PROVIDER_API_KEY"), required:["AI_PROVIDER_API_KEY"], mode:"provider_extension_required" },
    { id:"backups", name:"Local data backups", category:"reliability", configured:true, required:[], mode:"manual_snapshot_endpoint" }
  ].map(item => ({...item, state:item.configured ? "configured" : "not_configured"}));
}
