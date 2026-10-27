# CareerOps: cloud application service

Engineering proposal — 27 October 2026

Status: proposal retained for scope and architecture. A review foundation is now implemented; see `IMPLEMENTATION_STATUS.md` for actual capabilities and test evidence. Cloud deployment and the full submission/mail service are not complete. The choices below are recommendations, not claims of tested production capability.

## 1. Outcome and confirmed requirements

Build a personal cloud service that discovers suitable jobs, prepares truthful application materials, presents them for review, submits approved applications, monitors a dedicated mailbox, follows up, and reports results. The service must run without the user's laptop. The user reviews resume accuracy and application reports; routine configuration and maintenance should be automated.

Public engineering requirements (personal pilot details are stored outside Git):

- Monthly operating budget: up to USD 10, free services first.
- Graduation, citizenship and work authorization: supplied privately and confirmed in the candidate profile; never infer them from sample data.
- Target markets and exact compensation preferences are configured privately, not embedded in the public source code.
- Earnings preferences are expressed as monthly take-home pay and can vary with residence and employment arrangement, rather than applying one universal rejection threshold.
- The policy supports a lower target for full-time remote employment permitting work from a specified home country. Never invent a missing scenario-specific minimum.
- Experience range: fresher through credible mid-level opportunities, assessed from the resume.
- Oracle account/server and dedicated mailbox readiness: unknown.

Still needed for a live pilot: privately supplied resume and supporting project/work evidence, target role preferences, exact work-authorization answers and relevant dates, relocation preferences, and country/city preferences. Existing repository profile seeds are historical examples, not verified facts.

Do not convert a take-home target directly to a gross annual filter. Net pay depends on location, residency, deductions, social contributions, and exchange rates. Store original salary currency and gross period. Any net estimate must include its source, assumptions, FX date, and uncertainty. Until the necessary facts and a maintained country-specific calculation are available, label net pay unknown; do not invent an estimate or automatically reject undisclosed-salary jobs.

### Situation-dependent compensation policy

Evaluate compensation against the actual work arrangement, not just the employer's country or a “remote” label. Record employer location, permitted work countries, intended residence, employment type, currency, benefits and any relocation requirement separately.

| Situation | Compensation treatment |
|---|---|
| Role requiring residence abroad | Use the privately configured monthly take-home target; show uncertainty or exceptions for review |
| Full-time remote employment explicitly permitting work from the configured home country | Lower pay may qualify; rank and present the opportunity using the applicable scenario preference |
| Remote role with unclear geographic restrictions | Work-from-India eligibility is unknown; do not assume the India exception applies |
| Contract/freelance work | Evaluate separately; the user's full-time employment exception does not automatically extend to contracting |

Until the user defines a scenario-specific hard floor, compensation is a ranking and review criterion rather than an automatic rejection rule. Show the applicable scenario and why a lower-paying job was shortlisted. Missing salary remains unknown. Never invent the user's minimum, disclose willingness to accept less in an application, or negotiate/accept compensation automatically. Save future user-approved scenario rules as versioned preferences; changed rules trigger re-evaluation of unsent opportunities without altering past submissions.

## 2. Recommendation

Use one Oracle ARM VM if free capacity is available, with a TypeScript application, PostgreSQL, a durable job worker, Playwright browser automation, and a private dashboard. Use hosted models through a small routing layer. Retain n8n only where its integrations save work; the application service owns application state and all external actions.

This is a single-user system. Separate agent responsibilities into modules and queued tasks, not a fleet of servers. A worker wakes for scheduled work and waits when idle. It does not continuously spend tokens thinking.

### Decision table

| Decision | Recommendation | Reason and tradeoff |
|---|---|---|
| Cloud | Oracle A1, verified against the actual account's free allowance | Fits a small browser worker; capacity and reclamation remain risks |
| Runtime | Node.js/TypeScript, Fastify API, React/Vite dashboard | One language across browser, business rules, API and UI |
| Durable storage | PostgreSQL on a persistent volume; encrypted off-VM backups | One source of truth, no additional database subscription; requires restore automation |
| Queue | pg-boss using the same PostgreSQL server | Delayed jobs and retries without a Redis service; external actions still need their own reconciliation |
| Browser | Playwright Chromium, one active application session initially | Testable portal adapters; lower cost than an unconstrained vision loop |
| Models | Groq hosted open-weight model candidates; approved alternatives via adapters | Free quota first, bounded paid fallback; exact models selected by evaluation and account access |
| Personal memory | Versioned facts, evidence and approved answers in PostgreSQL | Updates immediately without model training; every claim can be traced |
| n8n | Optional private integration container | Reuse useful existing flows; no manual workflow editing required of the user |
| Mail | Dedicated Gmail account through OAuth and Gmail API | Replies and application correspondence share the user's mailbox and threads |
| Deployment | Docker Compose, Caddy, OCI infrastructure automation, CI images | Small operational footprint and reproducible recovery |

pg-boss provides retry and scheduling facilities, but no queue can guarantee exactly-once effects at a third-party website. [Queue documentation](https://github.com/timgit/pg-boss/blob/master/docs/api/jobs.md).

n8n's Community edition is free to self-host under its Sustainable Use License; it is source-available rather than an unrestricted open-source dependency. Personal use is the intended scope here. [n8n license explanation](https://support.n8n.io/article/can-i-use-your-license-for-my-use-case).

### Alternatives considered

- **Everything in n8n:** quickest to extend discovery, but application approval versions, submission recovery and portal tests become scattered across workflows. Keep it peripheral.
- **A general browser agent for every click:** flexible, but expensive in tokens and hard to prove correct. Use explicit adapters, with bounded model assistance for field interpretation. Unknown screens become review items.
- **Browser Use:** an available MIT-licensed browser-agent library; a possible later experiment for unsupported forms. It adds another runtime and does not remove site challenges, so it is not a launch dependency. [Upstream project](https://github.com/browser-use/browser-use).
- **Train a custom model from other models:** does not solve changing personal facts, adds training and licensing work, and is unnecessary at this scale. Retrieval from approved evidence is the first solution.
- **Host a large model on the free VM:** competes with the browser and database for limited CPU/RAM. Hosted inference is the initial path; small local inference is a later measured experiment.
- **Kubernetes, Redis, dedicated vector database, independent agent servers:** no demonstrated need for a single user. Add a component only when measurement identifies a bottleneck.

## 3. What already exists

Inspected repository baseline: commit `df081a3`; no pre-existing working-tree changes reported at inspection. Live n8n, databases and cloud services were not contacted.

| Existing asset | Use in the new service |
|---|---|
| `workflows/01_scan_and_score.json` | Reuse source/profile concepts; replace scoring and delivery weaknesses before use |
| `workflows/02_telegram_callback.json` | Optional alert channel; replace approval handling with authenticated API calls |
| `workflows/03_email_digest.json` | Digest presentation reference; actual schedule is weekly, despite README saying daily |
| `supabase/schema.sql` | Migration input for existing job IDs/statuses; preserve historical records |
| `calibration/benchmark.json` | Synthetic starter cases; augment with real descriptions and user decisions |
| `docker-compose.yml`, `Caddyfile` | Deployment starting point; replace floating tags and tighten network/security configuration |
| `scripts/setup-droplet.sh` | Reference for Docker setup; current script is DigitalOcean-oriented and requires manual steps |

Concrete inspection findings:

1. **High confidence:** `Build Score Prompt` uses title, company and location, not the full job description. `Parse Job Results` extracts a description, but `Upsert Jobs` does not persist it and the schema has no description column. Current scores cannot reliably assess role requirements.
2. **High confidence:** `Send Telegram` and `Log Telegram Msg` reference a nonexistent `Check Threshold` node. A static reference check found nine occurrences across these two nodes. Runtime behavior still requires a test.
3. **High confidence:** malformed scoring output becomes score zero in extraction nodes. A provider/formatting failure can be confused with a poor-fit job.
4. **High confidence:** the schema ends at pending/notified/approved/skipped. There are no application attempts, immutable approval packets, receipts, correspondence threads or follow-up records.
5. **High confidence:** the Docker setup uses `n8n:latest`, disables database certificate rejection, and leaves execution pruning commented out. These must be addressed before an unattended deployment.
6. **High confidence:** callback parsing accepts a supplied action/job ID without demonstrating owner validation in that parser. The replacement must authenticate the user, validate actions and authorize the specific packet. A separate live webhook configuration was not inspected.
7. **High confidence:** exports contain a project URL and an embedded public/anon database key. This alone does not prove a secret leak. Actual database permissions and any privileged credentials require an audit before reuse; the local credential file was not opened.

The README overstates source coverage: the inspected scan workflow contains JSearch, not a demonstrated Adzuna branch. Do not promise coverage from documentation alone.

Existing TODOs: log pruning becomes launch work; the custom Resend sender is unnecessary for employer correspondence through Gmail; the old scraping/anti-bot expansion is superseded by supported sources and explicit portal support.

## 4. User experience and authority

The normal loop is: review a batch of proposed applications, correct anything inaccurate, approve, and later read the report. The service completes routine actions under that approval and the saved communication policy.

| Action | Planned behavior |
|---|---|
| Discover, deduplicate, score and prepare materials | Automatic |
| Draft tailored resume, cover letter and application answers | Automatic, grounded in approved facts |
| Submit an application | Automatic after the user approves its exact material packet |
| Log in to a known portal | Use its saved encrypted session or credentials; surface MFA/session problems |
| Apply by email | Send the approved packet only when email is an accepted application route and recipient is verified |
| Routine follow-up | Automatic under the configured cadence and approved message rules |
| Reply with a previously approved factual answer | Automatic for a verified application thread, within the saved policy |
| Interview scheduling | Propose/confirm within user-approved availability only; otherwise request a decision |
| New factual claim, unclear screening answer, changed resume | Return for review |
| Offers, compensation commitments, relocation commitments, contracts | User decision required |
| CAPTCHA, identity checks, assessments, interview participation | Present a task for the user; resume surrounding automation afterward |

An application packet includes the employer and job ID, captured job description, resume PDF, cover letter if needed, all known answers, destination, evidence references, and profile/policy versions. The approval binds to a hash of this packet. Any material change invalidates approval. Bulk approval is supported, but each packet remains separately inspectable.

A paused application must not stall other jobs. The dashboard groups tasks that need attention. Pressing Pause stops new sends/submits; it cannot retract an action already accepted by an external service.

### Strong wording without invented experience

Optimize for relevance and specificity: highlight projects, describe actual ownership, explain technical decisions, use measured outcomes, and select the strongest relevant examples. Preserve the distinction between coursework, personal projects, internships and employment.

Example: if supported by the code and actual work, a weak bullet such as “worked on a chatbot” can become “Built a document-search assistant using retrieval and an LLM, with source-linked answers.” Do not add production users, invented performance gains, employers, degrees, employment dates, or years of experience. A capability the user could learn later is a skill gap or learning plan, not completed experience.

“Stretch role” is a ranking category, not permission to change credentials. An employer's historical sponsorship activity is only a lead; it does not establish sponsorship for this opening. Authorization in one country must not be reused as authorization to work in another country.

## 5. Architecture and agent boundaries

```text
Career boards / supplied job links           Dedicated mailbox
                 |                                  |
                 v                                  v
         Fetch + normalize                    Sync + classify
                 |                                  |
                 +----------> PostgreSQL <----------+
                                  |
                         durable task queue
                                  |
              +-------------------+--------------------+
              |                   |                    |
         Match task         Document task          Mail task
              |                   |                    |
              +--------> Policy + evidence checks <-----+
                                  |
                          Dashboard review
                                  |
                          Approved packet
                                  |
                       Submission / send worker
                                  |
                      Receipt + immutable audit
                                  |
                       Follow-up scheduling
```

Functional agent roles:

- **Scout:** fetch authorized public sources, normalize fields, deduplicate, preserve raw source evidence.
- **Matcher:** apply hard eligibility constraints first; score fit, explain gaps and uncertainty from the full description.
- **Writer:** select relevant approved facts and generate tailored materials with evidence references.
- **Verifier:** deterministic validation plus an independent model pass when eligible; flag unsupported claims and conflicting answers. Model agreement is not proof.
- **Applicant:** operate a supported portal adapter using only the approved packet; record each step and outcome.
- **Correspondence:** link email to applications, stop obsolete follow-ups, draft/send permitted replies and scheduling messages.
- **Supervisor:** schedule tasks, enforce quotas and policies, surface failures and produce reports. It has no unrestricted shell or self-modification capability.

Typed task inputs/outputs use shared schemas (Zod). The worker uses explicit state transitions and tool permissions. Models may propose content or classify a page; models cannot grant themselves approval, select arbitrary credential scopes, or bypass the submit gate.

### Planned modules

```text
apps/web/              dashboard and review screens
apps/api/              authenticated API, OAuth and policy endpoints
apps/worker/           queued jobs and scheduled maintenance
packages/domain/      facts, packets, state transitions and policy
packages/connectors/  job sources, Gmail and portal adapters
packages/models/      provider routing, validation and evaluations
packages/documents/   templates, PDF generation and text extraction checks
infra/                OCI configuration, Compose, backup and recovery
tests/                fixtures, integration tests and end-to-end flows
```

These are modules in one repository, not separate microservices. The web build is static and served behind the authenticated app boundary. Database, n8n editor, browser-control ports and debug tooling are not public.

## 6. Reliable submissions and recovery

```text
discovered -> eligible -> drafted -> awaiting_review -> approved
     |            |                        |              |
     v            v                        v              v
  duplicate    rejected                revision       submitting
                                                        /  |  \
                                            confirmed  /   |   \ definitive failure
                                                      v    v    v
                                                submitted unknown failed/retryable
                                                     |      |
                                                     |      +-> reconcile receipts,
                                                     |          portal state and mail;
                                                     |          never blindly resubmit
                                                     v
                                      tracking -> interview/rejected/offer/closed
```

`needs_user`, `deferred_quota`, `unsupported_portal`, `expired_job`, `paused`, and `cancelled` are explicit states/reasons where appropriate. A click on Submit is not sufficient evidence of success.

Required controls:

- Unique application identity based on candidate and canonical employer requisition, with source aliases. Do not merge distinct requisitions merely because titles match.
- Durable attempt record before an external action; one active lease per application with a fencing/version check.
- Recheck pause state, approval hash, job freshness, form schema and policy immediately before submit/send.
- Persist submission receipt, final URL, timestamp, adapter version, form field summary and redacted confirmation screenshot where available.
- If a timeout/crash occurs after an action might have been accepted, mark outcome unknown. Reconcile before retry; unresolved ambiguity is a visible review task.
- Outgoing mail uses a transactional outbox and stable operation identity. A send timeout triggers sent-mail reconciliation; never assume a matching Message-ID alone guarantees provider deduplication.
- A successful queue retry must not mean a repeated external action. Tests must kill the worker at these boundaries.
- Portal adapter breakers stop repeated failures on the same site; other portals continue.

## 7. Sources and portal support

Discovery starts with a user-relevant employer registry and public Greenhouse, Lever and Ashby postings. These are per-company feeds, not a universal job search engine. The registry must be populated and refreshed for the user's actual roles and countries. Supplied job links and optional existing JSearch quota expand coverage.

Greenhouse public reads do not require authentication, while its application POST endpoint does. We cannot assume access to an employer's secret API key. [Greenhouse documentation](https://docs.greenhouse.io/job-board).

Lever documents public posting discovery and application behavior, with submission rate limits and hosted-form handling. Use its hosted form by default; API submission is enabled only where the intended use and access are verified. [Lever documentation](https://github.com/lever/postings-api).

Ashby's public posting feed provides descriptions and application URLs; authenticated employer APIs are a separate surface. [Ashby public feed](https://developers.ashbyhq.com/docs/public-job-posting-api).

Initial submission order: Greenhouse hosted forms, Lever hosted forms, then Ashby hosted forms, each enabled only after a tested representative fixture and live permitted pilot. Workday and bespoke account-heavy portals are separate adapters with tenant-specific support, added after the first complete cloud loop works. LinkedIn/Indeed are not promised as universally automated application channels; route discovered roles to employer pages where possible and verify each platform's permitted use.

Each adapter must declare supported screens, required fields, login handling, attachment behavior, success evidence, challenge detection, and supported locale. Unknown required fields or changed forms return for review, not guessed answers. Do not evade access restrictions or claim that a different model will remove CAPTCHA/MFA requirements.

Playwright supports ARM64 Linux on documented operating systems; build and test the exact runtime image on the target architecture before deployment. [Playwright installation requirements](https://playwright.dev/docs/intro).

## 8. Dynamic memory and documents

### Central document library across devices

The user's resumes are spread across this machine and another personal machine. Provide an authenticated cloud document library accessible from either machine's browser. Files are uploaded once; application work then uses cloud copies and does not require either laptop to remain online. The service cannot access an offline or unconnected machine, and it must never silently crawl a personal filesystem.

Initial ingestion supports multi-file PDF and DOCX uploads through `/documents`, with clear upload, extraction, review and ready states. For this machine, an explicitly selected folder can be batch-imported by the agent once an upload endpoint exists. The other machine uses the same dashboard upload flow. A selected cloud-drive folder can be a later optional connector; it is not required for the first release and would need separate authorization.

Keep three distinct layers:

1. **Original documents:** retain the original bytes and content hash, filename, upload time, optional device/source label, file type and extraction status in private cloud storage. Store metadata in PostgreSQL. Same filename with different content creates a new version; identical content is deduplicated while preserving import provenance.
2. **Verified candidate profile:** extract proposed facts across documents, link them to source passages/pages, and present a consolidated review. A resume is evidence to inspect, not automatic proof. Conflicting employers, dates, degrees, metrics or skill claims must not be silently merged. The latest upload or filename containing “final” does not override a confirmed fact. Absence of a skill from a tailored resume does not delete that skill from the profile.
3. **Application documents:** generate job-specific drafts from approved facts and selected role-relevant material. Preserve the reviewed and submitted version with the application receipt, even when newer resumes are uploaded later. Historical versions remain immutable while retained under the user's retention policy.

```text
This computer -------- upload --+
                                +-> Private document library
Personal computer ---- upload --+              |
                                   Extract + compare + flag conflicts
                                               |
                                    User confirms profile changes
                                               |
                                       Verified candidate profile
                                               |
                                  Job-specific resume + answer draft
                                               |
                                     Review -> submit -> exact copy
```

Allow labels such as software, AI/ML and full-stack to identify useful resume variants without treating one file as universally best. The dashboard offers side-by-side version comparison and a consolidated fact-change review; corrections are made once and reused across applications. New source files can coexist with the current verified profile until their changes are accepted. Unresolved facts block only drafts that rely on them.

Upload/extraction requirements: validate actual file type, enforce file/page/size limits, isolate parsing, handle password-protected or scanned PDFs visibly, and expose low-confidence or missing text for review. OCR, if needed, must use the same privacy rules as other personal-data processing. Treat document text as untrusted data, not executable instructions. Extraction failure must not replace a valid profile with empty data.

Use private object storage within verified hosting quotas for originals and generated artifacts, encrypted transport/storage and authenticated retrieval or short-lived links. Include these objects and metadata in backup/restore checks. Support export and user-directed deletion with a clear explanation of effects on evidence and application history. Optional drive synchronization imports new versions but never propagates source deletion into the evidence library silently.

First-use experience: upload available resumes from either device, receive one consolidated profile/conflict review, confirm the facts, then begin reviewing tailored application packets. A later upload from the second machine adds evidence and proposed changes without restarting onboarding.

Use a fact ledger rather than accumulating unverified summaries:

| Record | Important fields |
|---|---|
| Candidate fact | type, value, evidence ID, user confirmation, valid dates, version, sensitivity |
| Evidence | uploaded resume/project reference, source hash, extraction date, access scope |
| Approved answer | question meaning, answer, jurisdiction/context, fact references, expiry |
| Job snapshot | employer/requisition, full text, source URL, fetched time, content hash |
| Application packet | job snapshot + document hashes + answer values + policy/profile versions |
| Attempt/receipt | operation identity, state, timestamp, external reference, evidence |
| Correspondence | provider message/thread IDs, matched application, classification, action |
| Decision feedback | accepted/rejected match, reason, correction and timestamp |

User corrections create a new fact version and identify dependent unsent packets for regeneration. Submitted packets remain immutable historical evidence. New job ads and recruiter emails are observations, not authority to rewrite the user's identity. Inferred preferences remain proposals until confirmed.

Use structured queries and PostgreSQL full-text search first. Add embeddings only if retrieval evaluations show a need. No fine-tuning is required to remember a newly completed project.

Document pipeline: structured facts -> selected content -> HTML template -> PDF -> extracted-text comparison and visual check -> approval. Keep contact details outside model prompts where possible and inject them deterministically into the final document. Validate dates, hyperlinks, page breaks, missing text and layout; do not claim a universal “ATS score.”

## 9. Models, quotas and privacy

Separate three concepts: open-source software, open-weight model licensing, and free hosted API quota. None guarantees the others or unlimited capacity.

| Task | Initial routing policy |
|---|---|
| URL normalization, deduplication, hard constraints, scheduling | Deterministic code; no model |
| Public description extraction/classification | Small eligible hosted model; public-text fallback allowed |
| Tailored writing and evidence comparison | Best evaluated privacy-approved model available within budget |
| Fact/format checks | Deterministic rules first; model reviewer adds semantic checks |
| Email classification/replies | Minimized application-thread content; approved provider only |
| Browser actions | Adapter logic; bounded field interpretation, no open-ended agent loop |

Groq's current production catalog lists `openai/gpt-oss-20b` and `openai/gpt-oss-120b`; these are candidates for small-task and harder-task evaluation, not a promised quota or final selection. Old repository model names must be revalidated. [Groq models](https://console.groq.com/docs/models).

Groq documents data-retention controls, including ZDR, with exceptions unless appropriately configured. Verify account settings before processing personal application material. [Groq data controls](https://console.groq.com/docs/your-data).

Gemini free-service terms include data-use provisions and warn against submitting personal/confidential material. Therefore free Gemini is restricted to public job text in this design. Privacy eligibility follows the payload across fallback providers; personal email/resume content cannot silently move to a public-data-only route. [Gemini terms](https://ai.google.dev/gemini-api/terms).

Cerebras is an optional later provider, subject to live account access, model evaluation and data-policy review. Its limits apply at organization level and vary by model. Do not rely on stale free-tier pricing pages. [Cerebras rate limits](https://inference-docs.cerebras.ai/support/rate-limits).

Router requirements:

1. Track provider/model availability, data class, quality gate, request/token budgets and reset times.
2. Reserve estimated maximum spend/tokens before dispatch, then reconcile actual usage; concurrent calls cannot overspend a shared cap.
3. Respect 429 and Retry-After; back off with jitter and open a circuit breaker after repeated failures.
4. Use another approved provider only within that provider's legitimate quota and data rules. Never multiply accounts/keys to circumvent limits.
5. If all eligible routes are unavailable, persist the task with a next-attempt time and show the delay.
6. Cache by job/profile/prompt/model version, redact logs, bound input/output and repair attempts.
7. Do not convert failed parsing, unavailable models or uncertainty into a rejection score.
8. Version prompts and model IDs; a new model or prompt passes evaluation before handling submissions.

Groq publishes organization-level limits and response headers useful for this scheduler. Multiple agents share the same allowance; they do not each receive a fresh quota. [Groq limits](https://console.groq.com/docs/rate-limits).

## 10. Email and follow-ups

Use a dedicated mailbox in the user's professional name. Existing personal email access is not needed for this plan. The user completes sign-in/consent; the service stores encrypted refresh credentials. Use minimal scopes for reading threads and sending mail; add mailbox modification only if labels are required.

OAuth must be configured for sustained personal use. Google's external Testing mode typically expires refresh tokens after seven days when Gmail scopes are involved. Verify applicable personal-use verification exceptions and account requirements; do not leave a permanent service in a temporary test configuration. [Refresh token documentation](https://developers.google.com/identity/protocols/oauth2), [verification exceptions](https://developers.google.com/identity/protocols/oauth2/production-readiness/restricted-scope-verification).

Poll incrementally every 5–10 minutes initially to avoid adding another messaging service. Preserve a sync cursor; expired history triggers a bounded full resync. Store provider IDs to deduplicate. [Gmail synchronization](https://developers.google.com/workspace/gmail/api/guides/sync).

Reply using the appropriate thread ID and message headers, not subject matching alone. Match a message to a specific application using known thread history, requisition references, sender and content; ambiguous matches require review. [Gmail threads](https://developers.google.com/workspace/gmail/api/guides/threads).

Proposed default cadence: first follow-up after seven business days, at most one further follow-up seven business days later. Employer instructions override this default. Suppress follow-ups immediately after a substantive reply, rejection, opt-out, bounce, closed role or scheduled interview. Respect out-of-office return dates, local business hours, and per-recipient/company caps.

Do not email guessed addresses, no-reply mailboxes, or an employer who instructs applicants not to follow up. An initial application email is appropriate only for a verified application contact/route; it is not an automatic extra email after every portal submission. Routine replies can be automatic after their rules are approved, but compensation negotiation, offers and new factual commitments return to the user.

Before sending any follow-up, acquire an application/thread lock, refresh recent thread state, and recheck suppression. This reduces reply-versus-send races; a reply arriving after the final check cannot be perfectly prevented, so record timestamps and avoid promising absolute ordering across providers.

## 11. Dashboard and reporting

```text
CareerOps                         Running / Paused       Budget used / $10

Needs your attention | Ready for review | Submitted | Interviews | Follow-ups

Job / employer / country          Fit + gaps         Next action
Application packet               Resume preview     Approve / edit / skip
Timeline                         Receipt            Exact documents sent

System health: source freshness | mailbox sync | browser | quota | backups
```

Pages:

- Overview: verified applications, replies, interviews, pending reviews, failures and quota delays.
- Review queue: rendered resume, changed bullets, application answers and evidence for each claim.
- Application detail: source snapshot, all approved/submitted versions, receipt, thread and next follow-up.
- Inbox: recruiter messages, proposed/automatic replies, exceptions and scheduling requests.
- Documents: upload from either machine, preview originals, compare resume variants, resolve extracted-fact conflicts and export retained versions.
- Profile: verified facts, projects, availability, situation-dependent compensation preferences, salary assumptions and expiration reminders.
- Connections/health: connection status and reconnect actions; no raw secrets.
- Activity/audit: chronological decisions, model versions, external actions and recoveries.

Daily report contains counts with denominators and links to evidence: discovered, eligible, reviewed, attempted, confirmed submitted, uncertain, failed, blocked, replies and interviews. “Submitted” excludes mere button clicks. Report country/role mix, stale sources, oldest queue age and projected budget. Use reply/interview conversion and user corrections to improve matching, without claiming outcomes are caused by the agent.

## 12. Cloud operations and budget

Oracle currently documents 1,500 A1 OCPU-hours and 9,000 GB-hours monthly, equivalent to 2 OCPUs/12 GB for Always Free tenancies, with 200 GB combined block storage. Confirm the actual tenancy before provisioning. Capacity may be unavailable and idle VMs may be reclaimed. This is a cost-saving host, not an uptime guarantee. [Oracle Always Free resources](https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm).

Proposed initial allocation: one browser session, a small API/worker, bounded PostgreSQL memory, optional n8n with pruned execution logs, and sufficient OS headroom. Browser and LLM concurrency must be measured on the real VM; do not add a local large model to this budget. No artificial load to avoid idle reclamation.

Budget policy, pending actual account inventory:

| Item | Planned monthly allowance | Control |
|---|---:|---|
| Oracle VM/storage within verified free allowances | $0 | Shape/storage quotas; no paid resources or PAYG upgrade without authorization |
| Hosted inference | Up to $6 | Application-side reservation ledger + provider caps where available |
| Recovery/other service reserve | Up to $4 | Unspent unless an itemized service fits the total |
| Total | At most $10 planned | Queue work rather than silently enable excess paid usage |

These are budget allocations, not quotes. At Groq's displayed GPT-OSS-120B token prices ($0.15/M input, $0.60/M output), a hypothetical 10M input + 1M output tokens costs $2.10; this excludes extra tools, retries and any additional billable tokens. Actual spend depends on measured workload and provider billing. [Current model pricing](https://console.groq.com/docs/models).

Paid VPS fallback is not assumed to fit the remaining $4: if Oracle is unavailable, compare a concrete replacement quote against the full $10 budget and revise allocations before purchase. Free capacity delays must be visible. Budget alerts alone are not hard cloud spending caps; the service must restrict allowed resources and monitor actual bills. No guarantee can be made about provider charges beyond the application's control.

Deployment deliverables:

- Infrastructure configuration and a cloud-init/bootstrap process; no user editing of YAML.
- Pinned images and lockfiles; Linux ARM64 build and browser smoke test; optional AMD64 portability build.
- CI lint/type checks/tests, image build and release artifacts; registry accessibility checked for the chosen account.
- One deployment command executed by the agent after cloud access, with migrations, health checks and rollback to the prior image.
- HTTPS hostname using an existing domain or an evaluated free hostname service; no silent domain purchase.
- PostgreSQL/browser/session volumes, encrypted backups off the VM, retention limits and a tested restore.
- Daily encrypted backups and pre-deploy snapshots initially; target recovery point <=24 hours. Recovery time depends on available replacement capacity, so no fixed uptime claim.
- After restore, reconcile potentially recent external actions against mailbox/portal evidence before enabling submits; a restored database can be older than an application already sent.
- External health monitoring if a suitable free service is available, plus in-app health and failed-job alerts. An on-VM watchdog alone cannot report total VM loss.
- Secret recovery materials kept outside the failed VM; encrypted backups are useless without recoverable decryption keys.

## 13. Security boundaries

The service handles personal records and acts under the user's accounts. Required design controls:

- Encrypt OAuth tokens, portal sessions and credentials; inject them into connector code only, never model prompts or screenshots/logs.
- Authenticate the single owner; secure cookies, CSRF protection, short-lived approval actions and authorization on every packet/artifact endpoint.
- Browser isolation per portal/account, private debugging endpoints, no host filesystem access or unrestricted shell, and constrained downloads/uploads.
- Block loopback, private networks and cloud metadata endpoints in URL fetching/browser egress; validate redirects and DNS resolution. An arbitrary job URL must not expose the cloud account.
- Treat job ads, web pages, emails and attachments as untrusted content. Their instructions cannot override policy, request secrets or authorize sends.
- Sanitize HTML in the dashboard and parse documents in an isolated process with size/time limits. The runtime does not execute uploaded scripts.
- Verify recipients and domains from evidence; do not follow email requests to upload identity documents or pay fees automatically.
- Redact sensitive screenshots; bounded artifact retention (initial proposal: routine browser traces 14 days, retained application records until user deletion), with user-visible deletion/export controls.
- No runtime self-editing of production policy/prompts/code. Suggested improvements pass tests and a versioned deployment.

## 14. Delivery sequence and proof of completion

The full objective includes submission and follow-up; a dashboard demo alone does not complete it. Milestones below are acceptance gates, not promised dates.

| Milestone | Deliverable | Acceptance evidence |
|---|---|---|
| M0: foundation | Cross-device document library, verified profile input path, domain records, policy, queue, auth, migrations, deployment skeleton | Two browser sessions can upload/retrieve versions; conflict review works; clean test database and restart/retry tests; no employer actions |
| M1: review loop | Public-source discovery, fit/gap scoring, evidence-backed resume/answers, dashboard batch review | Real public jobs produce readable packets; corrections invalidate dependent drafts |
| M2: first complete application | One supported hosted-form adapter, exact approval binding, receipt capture | User-approved real application submitted once, receipt displayed; failure fixtures pass |
| M3: correspondence | Dedicated inbox OAuth, thread matching, routine replies and bounded follow-ups | Controlled mailbox tests and a real thread sync; suppression and send-timeout tests pass |
| M4: cloud operation | OCI deployment, automatic recovery, secrets, TLS, backup/restore, resource limits | Service runs with laptop off; restart/restore drill and 48-hour scheduled-operation pilot |
| M5: expand coverage | Additional tested ATS adapters, country preferences and role feedback | Per-adapter success/block rates reported; no claim of universal portal coverage |

Cloud deployment scaffolding starts in M0; deploying read-only M1 on the cloud is useful before live submission. M2/M3 live external actions require the corresponding user-reviewed materials and connected accounts. Initial pilot target: up to five approved applications/day, then adjust to observed quality, portal limits, available jobs and the budget. This is a cap, not a promised daily output.

Definition of done for the first operational release:

1. Authenticated cloud URL works with the local laptop off.
2. At least one real, approved application completes through a declared supported adapter with recorded confirmation.
3. The exact submitted PDF/answers are visible and match the approval hash.
4. Inbox sync and a controlled follow-up/reply loop work; real scheduled follow-ups are eligible only when appropriate.
5. Worker crash, duplicate scheduling, quota exhaustion, expired session and changed form tests pass.
6. Restore is demonstrated; unknown external outcomes cannot trigger blind resubmission.
7. Report shows actual successes, failures, blocked jobs and cost rather than fabricated demo statistics.

## 15. Engineering review and test strategy

Scope challenge: achieving the request requires new application/domain code; three n8n JSON edits cannot provide reliable approvals and submissions. Keep one database and one worker deployment, reuse existing concepts and history, and avoid a distributed agent framework.

Architecture findings: third-party actions are not transactional with our database; browser sessions expire; account quotas and cloud capacity are outside our control; public discovery differs from authorized submission. These are addressed by explicit state, reconciliation, exceptions and support boundaries.

Code-quality findings: business logic embedded in JSON is hard to test; model failure is confused with rejection; secrets/config and business data are mixed; source descriptions are lost. Use typed modules, validated outcomes, separate secret storage and immutable source snapshots.

Test findings: no automated application test suite is present. The synthetic calibration set is useful but cannot validate browser submission, user claims or realistic job-match precision. Every critical path below is currently an implementation gap, covered by the companion test plan.

```text
SOURCE -> NORMALIZE -> MATCH -> DRAFT -> VERIFY -> REVIEW -> SUBMIT -> TRACK
  |          |          |        |        |         |         |         |
  429      duplicates  unclear  false    missing   stale     crash     new reply
  timeout  aliases     status   claim    fields    approval  timeout   bounce
  closed   locale      parse    layout  injection double    CAPTCHA   revoked OAuth
  [INT]    [UNIT]      [EVAL]   [EVAL]  [UNIT]    [E2E]    [E2E]     [INT/E2E]
```

Performance findings: browser/model work dominate, not dashboard traffic. Filter before model calls, cache versioned outputs, use one browser initially, cap content/attachments, prune traces and logs, index scheduled work and application identity, and record queue age. Increase concurrency only after measurement.

See `docs/CLOUD_APPLICATION_TEST_PLAN.md` for required tests, visible failure behavior and launch gates. No tests or live integrations were run as part of this planning deliverable.

### Workstream dependency plan

| Workstream | Modules | Depends on |
|---|---|---|
| A: domain and policy | packages/domain, apps/api, migrations | User profile contract |
| B: dashboard and documents | apps/web, packages/documents | A's schemas |
| C: sources, model router and evaluations | packages/connectors/sources, packages/models | A's schemas |
| D: browser submission | packages/connectors/portals, apps/worker | A, B; approved packet contract |
| E: email tracking and follow-up | packages/connectors/mail, apps/worker | A; mailbox access |
| F: deployment and recovery | infra, CI configuration | Initial A; complete integration before release |

B/C/F can be developed independently after A's contracts stabilize. D/E share worker orchestration, so implement that contract once and coordinate changes sequentially. No subagents were launched for this planning pass.

## 16. Work deliberately deferred

- Custom model training/distillation: no demonstrated benefit over evidence retrieval for one candidate.
- Universal portal support or guaranteed zero human intervention: portals differ and may require user-only actions.
- Automatic completion of assessments, interviews or legally binding commitments: remains with the user.
- A multi-user SaaS, Kubernetes or separate vector database: outside the personal-service goal.
- Salary/tax estimates for every country immediately: add sourced calculators for selected jurisdictions once user facts are sufficient; keep unknown values explicit.
- Autonomous production self-modification: suggestions can be tested, but cannot silently change application rules.

## 17. Required user participation, minimized

The agent can write code, infrastructure scripts, migrations, tests, deployment configuration and runbooks; perform deployment after access exists; and handle routine operations through the dashboard.

The user must supply/confirm the resume and personal facts, establish any missing accounts, complete identity/card verification and OAuth/MFA where required, and review application materials. Oracle's signup may require payment-card verification even for free services. [Oracle Free Tier FAQ](https://www.oracle.com/cloud/free/faq/).

Account discovery should start with readiness checks, not assumptions or automatic signups. A dedicated inbox is recommended. Do not paste passwords/API keys in chat; use a secure connection or secret entry flow. Cloud account creation, identity checks and arbitrary portal challenges cannot honestly be promised away.

Immediate next input: current resume, followed by project/work evidence if the resume omits important accomplishments. Reuse previously confirmed private requirements rather than repeatedly asking for the same information.

Review status: engineering plan completed with feasibility conditions. Formal interactive skill approval gates were adapted to the user's instruction to delegate routine decisions. No independent reviewer, production security audit, runtime test or deployment has been represented as completed.
