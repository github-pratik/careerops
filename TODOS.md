# TODOS — SmartJob Hunter

Generated from /plan-eng-review on 2026-05-02

---

## TODO-01: n8n Execution Data Pruning

**What:** Add 3 env vars to n8n Docker Compose to prevent execution log storage from filling Supabase.

**Why:** n8n stores full input/output for every workflow execution in its DB (Supabase). At 4 cycles/day × 7 source branches × job payloads, estimated ~50-80MB/month. Supabase free tier is 500MB. Storage errors start around month 6.

**When to act:** When Supabase storage dashboard shows ~400MB used, or when scans start failing with DB errors.

**Fix (5 minutes):** Add to n8n service in docker-compose.yml:
```
EXECUTIONS_DATA_SAVE_ON_SUCCESS: none
EXECUTIONS_DATA_SAVE_ON_ERROR: all
EXECUTIONS_DATA_PRUNE: true
EXECUTIONS_DATA_MAX_AGE: 168
```

**Depends on:** Nothing. Can be added anytime.

---

## TODO-02: Crawlee for Phase 2 Career Site Scraping

**What:** Use `apify/crawlee` (Node.js, https://github.com/apify/crawlee) as the scraping layer for Phase 2 Source 8 (direct company career site APIs).

**Why:** Raw Playwright fails against Tier 1 companies (Google, Amazon, Microsoft) due to JA3/JA4 TLS fingerprint detection. Crawlee's `FingerprintGenerator` rotates TLS + browser fingerprints and handles proxy management, giving much better anti-bot evasion than raw Playwright for mid-tier companies. Tier 1 still requires residential proxies on top.

**When to act:** After v1 MVP has been running for 1+ week and match quality is validated. Then investigate Phase 2 Source 8.

**Implementation path:**
1. Research which mid-tier H-1B companies have discoverable internal JSON APIs (DevTools, network tab)
2. Build Crawlee scripts for those companies (Node.js n8n Execute Command node or separate service)
3. For Google/Amazon/Microsoft: Crawlee + residential proxy rotation (Brightdata ~$5/mo student pricing)

**Depends on:** v1 MVP validated for 1+ week.

---

## TODO-03: Resend Custom Domain (Switch from Sandbox Sender)

**What:** Switch email sender from `onboarding@resend.dev` (test sandbox) to `jobs@yourdomain.com` (your own domain).

**Why:** Sandbox sender works indefinitely for testing and personal use but shows "via resend.dev" in email headers. Custom domain looks professional if you ever share the system with others, and is required if Resend restricts sandbox usage.

**When to act:** After MVP is validated. Not urgent — sandbox sender works fine for personal use.

**Fix (10 minutes):**
1. Go to Resend dashboard → Domains → Add domain → yourdomain.com
2. Add SPF + DKIM DNS records to your domain
3. Wait for DNS propagation (up to 24h, usually 1-2h)
4. Update n8n Resend node: change `from` field to `jobs@yourdomain.com`

**Depends on:** MVP validation, domain with DNS access.
