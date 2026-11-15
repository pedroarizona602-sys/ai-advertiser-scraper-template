# Operations API

All routes except `/health` require dashboard HTTP Basic Authentication. Records are persisted as JSON files under `DATA_DIR`.

## Collections

| Route | Purpose | Default status |
|---|---|---|
| `/api/clients` | Client directory and onboarding notes | active |
| `/api/appointments` | Appointment requests and schedule records | requested |
| `/api/tasks` | Internal work queue | todo |
| `/api/invoices` | Invoice and balance tracking records | draft |
| `/api/approvals` | Explicit approval ledger | pending |
| `/api/outreach` | Email/SMS message drafts | draft |
| `/api/proposals` | Sales proposal pipeline | draft |
| `/api/projects` | Website project delivery tracking | intake |
| `/api/callLogs` | Call notes and follow-up tracking | new |

Each collection supports `GET /api/{collection}` with optional `?status=` and `?q=`, `POST` to create, `PATCH /api/{collection}/{id}` to update allowlisted fields, and `DELETE` to delete a record.

## Approval and outreach safety

Approval records require an action and description. Outreach drafts require channel, recipient, and message. Creating or approving a record does **not** send it. No SMS, email, calls, or external actions are triggered by this store. A future provider integration must implement a separate send action, permission checks, audit logging, and explicit approval gates.

## Integration readiness

`GET /api/config` reports whether these environment variables are present:
- Google Places: `GOOGLE_PLACES_API_KEY`
- GoHighLevel: `GHL_API_KEY` and `GHL_LOCATION_ID`
- Voice provider: `VOICE_PROVIDER_API_KEY`

Presence checks do not prove credentials are valid. GoHighLevel contact upsert is implemented at `POST /api/integrations/highlevel/sync/{leadId}` and uses `GHL_API_KEY` (or `GHL_ACCESS_TOKEN`) plus `GHL_LOCATION_ID`. The token must be a sub-account Private Integration Token or OAuth access token with `contacts.write`. The dashboard sync action requires a deliberate confirmation; qualified leads only are sent. Never commit secrets to source control.

## Current boundaries

- Google Places search is implemented but requires a configured API key and billing-enabled project.
- GoHighLevel contact upsert is available after a valid token and location ID are configured; sync is user-triggered.
- No external calendar is connected and no appointments are booked.
- Invoice records do not charge cards or create payment links.
- Outreach records are drafts only; no messages are sent.
- No voice calls or live AI receptionist are active.
- Website projects are tracked but no automatic site publishing engine is connected.
- No LLM-powered sales assistant is connected yet.


## Client onboarding checklist

`POST /api/clients/onboarding` with `{ "clientId": "..." }` creates a repeat-safe set of internal onboarding tasks for an existing client: business details, services/pricing, brand assets, website requirements, domain/access, first draft, revisions, and explicit launch approval. It updates the client to `onboarding`. It does not email the client, collect files, request credentials, or publish a website.

Outreach records are drafts only. The API rejects attempts to mark an outreach record `sent` until a delivery integration and receipt workflow exist.
