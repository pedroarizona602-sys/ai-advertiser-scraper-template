# Nexora Smart Digital — Standalone Operating System

Standalone development for Nexora Smart Digital. This project does not use Base44 and does not consume Base44 credits. Keep it deployed as a separate service until the final system has been fully built and verified.

## Current implemented foundations
- Password-protected dashboard and health endpoint
- Google Places text search and manual lead import
- Persistent lead pipeline, status updates, qualification scoring, and CSV export
- Internal records for clients, appointments, tasks, invoices, approvals, outreach drafts, proposals, website projects, and call logs
- User-confirmed GoHighLevel contact upsert for qualified leads
- JSON persistence under a Railway volume mount
- No automatic outreach or payment collection

## Deployment layout
Repository subdirectory: `standalone/`

Railway service should use this directory as its root (or run `cd standalone && npm start`). Keep a dedicated persistent volume mounted at `/data`, with `DATA_DIR=/data`. Do not attach the new service to the existing production app's volume.

## Required service variables
- `ADMIN_PASSWORD`: strong unique password, minimum 16 characters
- `DATA_DIR=/data`
- `GOOGLE_PLACES_API_KEY`: Places API (New) key, only after billing limits are configured
- `GHL_API_KEY` or `GHL_ACCESS_TOKEN`: GoHighLevel sub-account Private Integration Token / OAuth token with `contacts.write`
- `GHL_LOCATION_ID`: destination HighLevel location ID

Voice provider and calendar/payment credentials are not yet wired to this application. Do not add secrets to GitHub or chat messages; configure them only in the hosting provider's secret-variable interface.

## GoHighLevel
The dashboard can sync qualified leads after the token and location ID are configured. Each sync is initiated by a user confirmation. The server uses the Contacts Upsert endpoint to reduce duplicate contacts. It does not enroll contacts in workflows or send campaigns.

## Safety and cost
- Google Places usage may incur charges. Configure quotas and billing budgets before enabling it.
- No cold calls, SMS, emails, campaigns, calendar bookings, or card charges are automated.
- Outreach records are drafts; approvals are records only.
- Never commit passwords, API keys, OAuth tokens, or customer secrets.

## Health
The server listens on Railway's `PORT` and exposes `/health`. Full end-to-end verification is intentionally deferred until the requested feature set and integrations are complete.
