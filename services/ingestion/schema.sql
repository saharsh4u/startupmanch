CREATE EXTENSION IF NOT EXISTS timescaledb;

CREATE TABLE IF NOT EXISTS companies (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  sector TEXT,
  revenue TEXT,
  aliases TEXT[] DEFAULT '{}',
  featured_free BOOLEAN DEFAULT FALSE,
  active BOOLEAN DEFAULT TRUE
);

CREATE UNIQUE INDEX IF NOT EXISTS companies_name_idx ON companies (name);

CREATE TABLE IF NOT EXISTS raw_events (
  id BIGSERIAL PRIMARY KEY,
  source TEXT NOT NULL,
  company_id INTEGER NOT NULL REFERENCES companies(id),
  url TEXT NOT NULL,
  text TEXT NOT NULL,
  rating NUMERIC,
  language TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  hash TEXT NOT NULL UNIQUE
);

SELECT create_hypertable('raw_events', 'created_at', if_not_exists => TRUE);

CREATE INDEX IF NOT EXISTS raw_events_company_idx ON raw_events (company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS raw_events_source_idx ON raw_events (source, created_at DESC);

CREATE TABLE IF NOT EXISTS sentiment_events (
  raw_event_id BIGINT PRIMARY KEY REFERENCES raw_events(id) ON DELETE CASCADE,
  sentiment_score DOUBLE PRECISION NOT NULL,
  is_negative BOOLEAN NOT NULL
);

CREATE TABLE IF NOT EXISTS agg_windows (
  company_id INTEGER NOT NULL REFERENCES companies(id),
  window TEXT NOT NULL,
  complaint_count INTEGER NOT NULL,
  one_star_delta DOUBLE PRECISION NOT NULL,
  complaint_velocity DOUBLE PRECISION NOT NULL,
  negative_momentum DOUBLE PRECISION NOT NULL,
  source_diversity DOUBLE PRECISION NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (company_id, window)
);

CREATE TABLE IF NOT EXISTS rankings (
  company_id INTEGER NOT NULL REFERENCES companies(id),
  window TEXT NOT NULL,
  cts_score DOUBLE PRECISION NOT NULL,
  delta DOUBLE PRECISION,
  rank INTEGER NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (company_id, window)
);

CREATE TABLE IF NOT EXISTS company_sources (
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  source_label TEXT NOT NULL,
  source_url TEXT,
  PRIMARY KEY (company_id, source_label)
);

ALTER TABLE companies ADD COLUMN IF NOT EXISTS featured_free BOOLEAN DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS source_health (
  source TEXT PRIMARY KEY,
  consecutive_failures INTEGER NOT NULL DEFAULT 0,
  last_success TIMESTAMPTZ,
  last_failure TIMESTAMPTZ
);

SELECT add_retention_policy('raw_events', INTERVAL '90 days');
