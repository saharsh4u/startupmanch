# Yenduku Ingestion Service

This service ingests public complaint signals, stores raw events, runs sentiment scoring, and produces rolling CTS rankings.

## Setup

1. Create a PostgreSQL database with TimescaleDB enabled.
2. Apply the schema:
   - `psql "$DATABASE_URL" -f services/ingestion/schema.sql`
3. Seed companies:
   - `python -m services.ingestion.seed_companies`
4. Install dependencies:
   - `pip install -r services/ingestion/requirements.txt`
   - `playwright install chromium`

## Environment

Copy `.env.example` and fill in the values.

Required:
- `DATABASE_URL`
- `SQS_QUEUE_URL` (for managed workers)
Optional API keys:
- `REDDIT_CLIENT_ID`, `REDDIT_CLIENT_SECRET`, `REDDIT_USER_AGENT`
- `X_BEARER_TOKEN`
- `QUORA_API_KEY` (only if you have explicit permission)

## Running

### Managed workers
- Use EventBridge (or equivalent) to run `python -m services.ingestion.scheduler` every 5 minutes.
- Run workers continuously:
  - `python -m services.ingestion.worker`
- Run aggregation every 5 minutes (cron or scheduler):
  - `python -m services.ingestion.aggregate`

### Local dev
- Run a single local ingestion pass (no queue):
  - `python -m services.ingestion.local_run`
- Run aggregation:
  - `python -m services.ingestion.aggregate`

Run the commands from the repo root so the `services` package is on `PYTHONPATH`.

## Compliance & Safety
- All adapters check `robots.txt` and skip blocked URLs.
- No proxies are used. If a source blocks scraping or lacks API access, it will be skipped.
- `news_rss`, `reddit`, and `x` are API/RSS-based by default; enable other sources only if allowed.
- Adapters are template-based and use lightweight text heuristics. For production, add source-specific selectors and parsing logic.

## Outputs
- `raw_events` stores normalized complaint snippets.
- `sentiment_events` stores sentiment scores.
- `agg_windows` stores per-window metrics.
- `rankings` stores CTS scores and ranks per window.
