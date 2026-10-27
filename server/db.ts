import pg from "pg";
export const createDb = (connectionString: string) =>
  new pg.Pool({ connectionString, max: 8, statement_timeout: 15000 });
export type Db = ReturnType<typeof createDb>;
export async function transaction<T>(
  db: Db,
  fn: (client: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const c = await db.connect();
  try {
    await c.query("BEGIN");
    const result = await fn(c);
    await c.query("COMMIT");
    return result;
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
}
export async function migrate(db: Db) {
  await db.query(`
    CREATE TABLE IF NOT EXISTS co_documents (
      id uuid PRIMARY KEY, hash text UNIQUE NOT NULL, filename text NOT NULL, kind text NOT NULL,
      bytes integer NOT NULL, state text NOT NULL DEFAULT 'queued', content text, error text,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS co_imports (
      id bigserial PRIMARY KEY, document_id uuid REFERENCES co_documents(id), filename text NOT NULL,
      source text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS co_facts (
      id uuid PRIMARY KEY, category text NOT NULL, label text NOT NULL, value text NOT NULL,
      document_id uuid REFERENCES co_documents(id), quote text, active boolean NOT NULL DEFAULT true,
      version integer NOT NULL DEFAULT 1, confirmed_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS co_settings (
      id boolean PRIMARY KEY DEFAULT true CHECK(id), profile_version integer NOT NULL DEFAULT 0,
      paused boolean NOT NULL DEFAULT true,
      preferences jsonb NOT NULL DEFAULT '{"monthlyBudgetUsd":10,"usualNetMonthlyUsd":null,"indiaRemoteFlexible":false,"markets":[]}'::jsonb
    );
    INSERT INTO co_settings(id) VALUES(true) ON CONFLICT DO NOTHING;
    CREATE TABLE IF NOT EXISTS co_sources (
      id uuid PRIMARY KEY, provider text NOT NULL, board text NOT NULL, company text NOT NULL,
      last_scan timestamptz, last_error text, UNIQUE(provider,board)
    );
    CREATE TABLE IF NOT EXISTS co_jobs (
      id uuid PRIMARY KEY, source_id uuid REFERENCES co_sources(id), external_id text,
      company text NOT NULL, title text NOT NULL, location text NOT NULL, url text NOT NULL,
      description text NOT NULL, state text NOT NULL DEFAULT 'new', created_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE(source_id,external_id)
    );
    CREATE TABLE IF NOT EXISTS co_packets (
      id uuid PRIMARY KEY, job_id uuid NOT NULL REFERENCES co_jobs(id), profile_version integer NOT NULL,
      payload jsonb NOT NULL, hash text NOT NULL, state text NOT NULL DEFAULT 'review',
      approved_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS co_audit (
      id bigserial PRIMARY KEY, action text NOT NULL, entity_id text,
      detail jsonb NOT NULL DEFAULT '{}'::jsonb, created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS co_packets_job_idx ON co_packets(job_id);
    CREATE INDEX IF NOT EXISTS co_jobs_created_idx ON co_jobs(created_at DESC);
    CREATE TABLE IF NOT EXISTS co_proposals (
      id uuid PRIMARY KEY, document_id uuid NOT NULL REFERENCES co_documents(id),
      category text NOT NULL, label text NOT NULL, value text NOT NULL, quote text NOT NULL,
      state text NOT NULL DEFAULT 'proposed', created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS co_model_calls (
      id uuid PRIMARY KEY, document_id uuid REFERENCES co_documents(id), model text NOT NULL,
      state text NOT NULL, reserved_usd numeric NOT NULL, cost_usd numeric,
      error text, created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS co_manual_job_url ON co_jobs(url) WHERE source_id IS NULL;
  `);
}
