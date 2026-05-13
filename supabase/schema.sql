-- SmartJob Hunter — Supabase Schema
-- Run this in Supabase SQL Editor (Dashboard → SQL Editor → New query)

-- ── Job tracking table ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS jobs (
  id         TEXT PRIMARY KEY,
  company    TEXT,
  title      TEXT,
  url        TEXT,
  score      INT,
  status     TEXT NOT NULL DEFAULT 'pending',
  source     TEXT,
  location   TEXT,
  seen_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  posted_at  DATE
  -- status values:
  --   pending   = inserted by scanner, Telegram notification not yet sent
  --   notified  = Telegram message sent, waiting for your YES/NO
  --   approved  = you tapped YES (apply to this job)
  --   skipped   = you tapped NO (don't show again)
);

-- Index for pre-filter query (status + posted_at)
CREATE INDEX IF NOT EXISTS jobs_status_idx ON jobs(status);
CREATE INDEX IF NOT EXISTS jobs_posted_idx ON jobs(posted_at);

-- ── Approval log ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS approvals (
  job_id          TEXT NOT NULL,
  telegram_msg_id BIGINT,
  approved_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Error log ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS errors (
  job_id  TEXT,
  error   TEXT,
  ts      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── System configuration (replaces hardcoded values in n8n) ─────────────
CREATE TABLE IF NOT EXISTS system_state (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Seed initial configuration
-- Edit these values in the Supabase dashboard to tune the system without editing workflows
INSERT INTO system_state (key, value) VALUES
  -- Gemini matching threshold (0-100). Only jobs scoring >= this get notified.
  ('score_threshold', '70'),

  -- Round-robin index for tier-2 companies in JSearch rotation
  ('tier2_index', '0'),

  -- JSearch monthly quota management.
  -- Set to first of next month when 402/429 received. Reset automatically at month start.
  ('jsearch_disabled_until', '2000-01-01'),

  -- Your job seeker profile. Edit skills/roles/location here to retrain Gemini scoring.
  ('profile_json', '{
    "name": "Pratik Patil",
    "education": "MS CS, George Mason University",
    "visa": "OPT",
    "seniority": "entry-level",
    "roles": ["AI Engineer", "Software Engineer", "Full Stack Developer", "ML Engineer", "Backend Engineer"],
    "location": "DC/NoVA or remote",
    "skills": ["React", "TypeScript", "Python", "PyTorch", "LangChain", "Node.js", "PostgreSQL", "Docker"]
  }'),

  -- H-1B sponsoring companies JSON array.
  -- Populate from USCIS LCA data: https://www.uscis.gov/tools/reports-and-studies/h-1b-employer-data-hub
  -- Download Excel → filter SWE/AI roles >10 approvals/year → paste JSON here.
  -- Update quarterly when USCIS refreshes data.
  ('h1b_companies_json', '[
    {"company": "Amazon.com Services LLC", "search_name": "Amazon", "tier": 1},
    {"company": "Google LLC", "search_name": "Google", "tier": 1},
    {"company": "Microsoft Corporation", "search_name": "Microsoft", "tier": 1},
    {"company": "Meta Platforms Inc", "search_name": "Meta", "tier": 1},
    {"company": "Apple Inc", "search_name": "Apple", "tier": 1},
    {"company": "NVIDIA Corporation", "search_name": "Nvidia", "tier": 1},
    {"company": "IBM Corporation", "search_name": "IBM", "tier": 1},
    {"company": "Accenture LLP", "search_name": "Accenture", "tier": 1},
    {"company": "Oracle America Inc", "search_name": "Oracle", "tier": 1},
    {"company": "Deloitte Consulting LLP", "search_name": "Deloitte", "tier": 1},
    {"company": "Salesforce Inc", "search_name": "Salesforce", "tier": 2},
    {"company": "Adobe Inc", "search_name": "Adobe", "tier": 2},
    {"company": "Cisco Systems Inc", "search_name": "Cisco", "tier": 2},
    {"company": "Intel Corporation", "search_name": "Intel", "tier": 2},
    {"company": "Qualcomm Technologies Inc", "search_name": "Qualcomm", "tier": 2},
    {"company": "JPMorgan Chase Bank NA", "search_name": "JPMorgan", "tier": 2},
    {"company": "Goldman Sachs & Co LLC", "search_name": "Goldman Sachs", "tier": 2},
    {"company": "Morgan Stanley", "search_name": "Morgan Stanley", "tier": 2},
    {"company": "Cognizant Technology Solutions", "search_name": "Cognizant", "tier": 2},
    {"company": "Infosys BPM Limited", "search_name": "Infosys", "tier": 2},
    {"company": "Tata Consultancy Services", "search_name": "TCS", "tier": 2},
    {"company": "Wipro LLC", "search_name": "Wipro", "tier": 2},
    {"company": "HCL America Inc", "search_name": "HCL", "tier": 2},
    {"company": "ServiceNow Inc", "search_name": "ServiceNow", "tier": 2},
    {"company": "Workday Inc", "search_name": "Workday", "tier": 2},
    {"company": "Palo Alto Networks Inc", "search_name": "Palo Alto Networks", "tier": 2},
    {"company": "CrowdStrike Inc", "search_name": "CrowdStrike", "tier": 2},
    {"company": "Palantir Technologies Inc", "search_name": "Palantir", "tier": 2},
    {"company": "Snowflake Inc", "search_name": "Snowflake", "tier": 2},
    {"company": "Databricks Inc", "search_name": "Databricks", "tier": 2}
  ]')
ON CONFLICT (key) DO NOTHING;
