# CareerOps — SmartJob Hunter

## Application workspace under development

The repository now includes a TypeScript/React application with a private document library, extracted resume text, confirmed profile facts, public company-board imports, review packets and version-bound approvals. Optional Groq integration proposes source-quoted facts for review. **Automatic portal submission, employer email and production cloud deployment are not implemented yet.** Approval is never displayed as a completed application.

Start with [development instructions](docs/DEVELOPMENT.md), [implementation status](docs/IMPLEMENTATION_STATUS.md) and the [cloud engineering proposal](docs/CLOUD_APPLICATION_PLAN.md). The repository also contains a Codespaces/devcontainer configuration for optional cloud development. Credentials, resumes and local databases are excluded from Git.

The original n8n prototype is preserved below. Its setup and capabilities are separate from the new application workspace.

An automated job hunting pipeline that scans multiple job boards, scores listings with AI, and delivers a daily digest via Telegram and email.

## What it does

- Scrapes job listings from JSearch (RapidAPI) and Adzuna on a schedule
- Scores each listing using Gemini Flash based on your calibration criteria
- Sends real-time Telegram alerts for high-match jobs
- Delivers a daily email digest via Resend
- Stores everything in Supabase Postgres

## Stack

| Layer | Tool |
|---|---|
| Workflow automation | n8n (self-hosted) |
| Database | Supabase (Postgres) |
| Reverse proxy / HTTPS | Caddy |
| AI scoring | Gemini Flash (free tier) |
| Notifications | Telegram Bot |
| Email | Resend |
| Hosting | DigitalOcean Droplet (2GB) |

## Getting started

### Prerequisites

- Docker + Docker Compose
- A [Supabase](https://supabase.com) project (free tier works)
- A [DigitalOcean Droplet](https://digitalocean.com) or any Linux VPS (2GB RAM minimum)
- API keys for: JSearch (RapidAPI), Adzuna, Gemini, Resend, Telegram

### Setup

1. **Clone the repo**
   ```bash
   git clone https://github.com/github-pratik/careerops.git
   cd careerops
   ```

2. **Configure environment**
   ```bash
   cp .env.template .env
   # Fill in your values — see comments inside .env.template
   ```

3. **Set up the database**
   ```bash
   # Run the schema against your Supabase project
   psql "$SUPABASE_CONNECTION_STRING" -f supabase/schema.sql
   ```

4. **Start the stack**
   ```bash
   docker compose up -d
   ```

5. **Import workflows into n8n**
   - Open n8n at `https://YOUR_DOMAIN`
   - Import each file from the `workflows/` folder
   - Set your credentials inside n8n for each service

6. **Register the Telegram webhook**
   ```bash
   bash scripts/register-webhook.sh
   ```

## Workflows

| File | Purpose |
|---|---|
| `01_scan_and_score.json` | Fetch jobs, score with Gemini, store in Supabase |
| `02_telegram_callback.json` | Handle Telegram button responses |
| `03_email_digest.json` | Send daily email summary |

## Environment variables

See [`.env.template`](.env.template) for the full list with descriptions and where to get each key.

## Roadmap

See [`TODOS.md`](TODOS.md) for planned improvements including execution data pruning, Phase 2 career site scraping with Crawlee, and custom email domain setup.
