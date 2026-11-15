# Operations API

All endpoints below require the dashboard's HTTP Basic Auth.

## Persistent records
Each collection is stored as its own JSON file under `DATA_DIR`:
- `/api/clients`
- `/api/appointments`
- `/api/tasks`
- `/api/invoices`
- `/api/approvals`

Each collection supports:
- `GET /api/{collection}` with optional `?status=` and `?q=`
- `POST /api/{collection}` to create a record
- `PATCH /api/{collection}/{id}` to update allowed fields
- `DELETE /api/{collection}/{id}` to delete a record

Approval records are created with `status: pending`. A user can explicitly change the status to `approved` or `rejected`. This is only an approval ledger; it does not send messages or trigger payments.

## Integration readiness
`GET /api/config` reports whether these environment variables are present:
- Google Places: `GOOGLE_PLACES_API_KEY`
- GoHighLevel: `GHL_API_KEY` and `GHL_LOCATION_ID`
- Voice provider: `VOICE_PROVIDER_API_KEY`

Presence checks do not prove the credentials are valid. The GoHighLevel and voice integrations are not yet wired to provider APIs. Never commit secrets to source control.

## Current boundaries
- No SMS, email, calls, or other outreach are sent.
- No appointments are booked with an external calendar.
- No invoices are charged or payment links created.
- No GoHighLevel records are synced yet.
- No voice calls or live voice agent are active.
