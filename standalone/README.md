# Nexora Standalone Lead Engine

This is a standalone replacement for the Base44-dependent starter UI. It lives in `standalone/` and does not use Base44 or its credits.

## Features in this first build
- Private dashboard protected by HTTP Basic Authentication
- Business discovery through Google Places API (Text Search)
- Review and select results before importing
- Persistent lead storage as JSON on a mounted Railway volume
- Search/filter, qualification, pipeline status, deletion, and CSV export
- No automated calls, emails, SMS, or outreach

## Railway setup
Deploy the `standalone/` directory as a separate service. Do not repoint the existing production service until the new service has been tested.

Set these service variables:
- `ADMIN_PASSWORD`: a strong private password
- `GOOGLE_PLACES_API_KEY`: Google Places API key with Places API (New) enabled
- `DATA_DIR`: optional; defaults to a directory under the Railway volume mount path when available

Attach a Railway volume mounted at `/data` and set `DATA_DIR=/data` so saved leads survive redeploys.

The server listens on Railway's `PORT` and exposes `/health` for health checks.

## Important
Google Places API usage may incur charges and requires a Google Cloud billing-enabled project. Set a budget/usage cap before enabling it. Do not commit API keys or passwords to GitHub.
