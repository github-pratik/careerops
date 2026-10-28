# CareerOps cloud release test plan

Date: 27 October 2026

Companion: `docs/CLOUD_APPLICATION_PLAN.md`.

Status: proposed tests, not execution results. The repository currently has workflow exports and synthetic matching examples, not the new application implementation. All cases below must be implemented and verified before the relevant feature is enabled.

## Test environments

1. Unit tests for pure rules, hashes, transitions, currency normalization and message classification boundaries.
2. Integration tests using an isolated real PostgreSQL database and controlled HTTP/mail services. Do not mock away queue transactions, leases or unique constraints.
3. Playwright end-to-end tests against locally controlled portal fixtures for each supported adapter; include form changes, dynamic required fields, uploads and multi-page flows.
4. Model evaluations against labeled descriptions and approved fact sets. Synthetic fixtures supplement real user-reviewed examples.
5. ARM64 container smoke tests, restart tests and cloud recovery drills.
6. Small user-authorized live pilot. Fixtures do not prove a real portal works; a live Submit must use reviewed materials for a real desired application.

## Pages and interactions

| Proposed route | What must work |
|---|---|
| `/` | Counts derive from receipts/states; stale data, empty state and degraded services are visible |
| `/review` | Batch review, PDF preview, edit/skip/approve, changed facts and outdated approvals |
| `/applications/:id` | Source, packet versions, exact submitted files, receipt, timeline, messages and next action |
| `/inbox` | Thread match, draft/reply, ambiguous message handling and follow-up suppression |
| `/profile` | Fact correction, evidence links, expiry and affected-draft regeneration |
| `/documents` | Upload from two devices, original previews, deduplication, variant comparison, extraction errors, consolidated conflict review and export |
| `/connections` | OAuth connect/revoke/reconnect, portal session status and safe secret entry |
| `/activity` | Readable audit of model decisions, retries, external actions and failures |

Test owner authentication, expired sessions, CSRF, direct artifact URL access and authorization across all routes. Secrets never appear in page source, API responses, error reports or logs.

## Critical behavior matrix

| Area / failure scenario | Required assertion | Test type | User-visible result |
|---|---|---|---|
| Same job from two sources | One canonical application, both source references retained | Unit + integration | Duplicate reason, no extra application |
| Same title, different requisitions | Distinct jobs remain distinct | Unit | Both jobs visible |
| Same resume uploaded from two devices | Deduplicate identical bytes and preserve both import references | Integration + E2E | One document with import history |
| Same filename with changed content | Retain separate versions without overwriting | Integration + E2E | Both versions can be compared |
| Concurrent imports contain conflicting employment dates | Neither silently overwrites confirmed facts; dependent drafts require resolution | Integration + E2E | Consolidated conflict review |
| Tailored resume omits an existing skill | Omission does not delete a verified fact | Unit + eval | Profile preserved |
| New resume arrives after an application was submitted | Historical submitted file/hash stays unchanged | Integration | Exact sent version remains available |
| Scanned/password-protected/corrupt/oversized upload | Explicit extraction state; no empty or partial profile replacement | Integration + E2E | Retry, OCR or replacement-file task |
| Upload completes but parsing crashes | Retry extraction from retained original without duplicate facts | Integration | Recoverable processing state |
| Other device is offline after upload | Cloud review and document generation continue | E2E | Documents remain available |
| Unauthorized or expired artifact link | Access denied without leaking document content | Integration + E2E | Sign-in or refreshed-link flow |
| Missing salary or country | Unknown values preserved, no invented net estimate | Unit + eval | Missing information flagged |
| Full-time remote job permits work from India but pays below USD 5,000 net/month | Usual compensation threshold does not automatically exclude the job; no invented India minimum | Unit + eval | India-based scenario and compensation tradeoff shown |
| Job says remote but restricts residence to another country | Do not classify as work-from-India eligible | Unit + eval | Geographic restriction or uncertainty shown |
| Contractor role permits work from India | Do not silently apply the full-time employment exception | Unit + eval | Employment type requires separate assessment |
| User changes a compensation scenario preference | Re-evaluate unsent opportunities; preserve submitted records | Integration | Updated ranking with policy version |
| Application asks minimum salary without an approved scenario-specific answer | Do not disclose a guessed lower floor | Integration + eval | Answer requires user review |
| Source 429 / timeout | Backoff and checkpoint; completed items not lost | Integration | Source delayed with retry time |
| Job expires after review | No submission; packet marked stale | E2E | Closed/changed job task |
| Empty or malicious source HTML | Bounded parsing and sanitized rendering | Integration + E2E | Safe error or readable content |
| Model produces malformed JSON | Validation/retry/defer; never score zero as a rejection | Unit + integration | Scoring unavailable |
| Provider budget exhausted | Concurrency-safe reservation blocks excess dispatch | Integration | Queued until quota/budget available |
| Fallback provider disallows personal data | Personal payload cannot route there | Unit + integration | Deferred, with eligible routes shown |
| Model adds an employer, metric or tenure | Unsupported claim fails verification | Eval | Specific correction required |
| User corrects a fact | Dependent unsent packets invalidated; past submissions unchanged | Integration + E2E | Updated preview requires approval |
| Old approval after packet edit | Submit endpoint rejects stale hash | Integration + E2E | Re-review requested |
| Double-click approve / duplicate delivery | One approval transition and active attempt | Integration + E2E | One timeline event/attempt |
| Pause during queue processing | No new external action after final pause check | Integration | Paused; in-flight action status explicit |
| Portal adds required screening question | No guessing or bypassing; stop before submit | E2E | Question awaiting answer |
| Wrong attachment or bad PDF render | Hash/text/visual validation blocks upload | Integration + E2E | Document correction task |
| Login session expires / MFA challenge | Pause only affected application, preserve safe checkpoint | E2E | Reconnect task |
| CAPTCHA or unsupported page | Detect and yield; no repeated attack loop | E2E | User task or unsupported portal |
| Browser crashes before submission | Safe retry only if no external action could have happened | Integration + E2E | Retrying preparation |
| Browser crashes immediately after click | Outcome unknown; no blind repeat submit | Integration + E2E | Checking receipt / needs review |
| Lease expires while original worker lives | Fenced state update; no concurrent submit actor | Integration | Single active operation |
| Success page missing / receipt inconclusive | Never count as confirmed submitted | E2E | Uncertain outcome |
| Mail sync redelivers message | One processed message and one scheduled action | Integration | Single thread update |
| Gmail history cursor expires | Bounded full sync, IDs deduplicate results | Integration | Sync recovery status |
| OAuth revoked | Backoff, alert, no repeated failed sends | Integration | Reconnect mailbox |
| Reply arrives before follow-up send | Fresh thread check suppresses follow-up | Integration | Follow-up cancelled |
| Rejection, opt-out or bounce received | All applicable follow-ups suppressed | Integration + eval | Closed/suppressed reason |
| Out-of-office response | Respect return date; do not create auto-reply loop | Integration + eval | Deferred follow-up |
| Follow-up maximum reached | No additional messages | Unit + integration | Follow-up sequence complete |
| Similar company emails for different jobs | Do not attach to a job solely on company/subject | Eval + integration | Ambiguous association for review |
| Mail send succeeds then response is lost | Reconcile sent mail; never blindly resend | Integration | Unknown then reconciled or manual check |
| Reply contains new salary/visa commitment | Route for user decision | Eval | Draft awaiting review |
| URL points to cloud metadata/private host | Fetch/browser egress rejects it, including redirects | Integration | Unsafe destination rejected |
| Job/email says to reveal credentials | Policy cannot be altered by content; no disclosure | Adversarial eval + integration | Ignored instruction, flagged item |
| Database disk full | No unlogged outbound action; health alert and safe stop | Integration | Service degraded / submissions paused |
| VM restarts | Persistent queue resumes, credentials and packets available | Cloud drill | Recovered status |
| Restore from previous day's backup | External actions since backup reconciled before resume | Cloud drill | Recovery review, no automatic duplicate sends |
| Backup key unavailable | Recovery fails visibly; deployment gate not passed | Recovery drill | Restore blocked with exact missing prerequisite |

No handler in this matrix is implemented yet. During implementation, any failure without a test, explicit handling and visible status is a release-blocking gap for that feature.

## Evaluation dataset and gates

Build a versioned dataset containing real descriptions selected with the user, plus adversarial and synthetic cases. Include US and non-US jobs, varied currencies, entry/mid/senior levels, missing descriptions, conflicting requirements, sponsorship unknown/explicit, salary not published, and stale postings. The current benchmark's company descriptions are synthetic and cannot verify real employer policies.

For document evaluation, use a small approved fact ledger and create adversarial drafts that invent metrics, years, employers, authorization, or turn coursework into employment. Include legitimate strong rewrites that preserve meaning; the verifier must not reject good phrasing simply because wording changed.

Measure separately:

- Hard-constraint violation rate and unknown-eligibility handling.
- User-rated shortlist relevance and false rejection of plausible stretch roles.
- Unsupported factual claim rate, including numerical/date changes.
- Extraction completeness, structured-output validity and document rendering.
- Model tokens, cost, latency and timeout/fallback rates.
- Portal confirmed submission rate over supported eligible attempts; publish failures and interventions in the denominator.

Launch gates: zero unsupported claims in the release evaluation set, zero approval bypasses, zero duplicate external actions in crash/retry tests, no silent rejection on provider failure, and all applicable security/identity checks passing. These tests reduce risk; passing a finite set is not a guarantee of perfect future behavior.

Model replacements use the same held-out set and baseline. Keep failed cases as regressions. Model-authored corrections cannot update ground-truth labels without user review.

## Cloud pilot checklist

- Verify free allowances, target architecture, disk limits and actual costs in the connected account.
- Build pinned ARM64 images and start Chromium with the intended sandbox/isolation setup.
- Run owner login, resume review, packet approval and artifact retrieval through HTTPS.
- Complete one real desired application after exact packet review, with receipt evidence.
- Test mail send/reply/suppression using controlled addresses before live automatic follow-ups.
- Run with laptop off and observe scheduled operations over 48 hours.
- Kill/restart worker during safe and ambiguous submission stages using fixtures.
- Restore encrypted database/files/session metadata to a clean environment; verify keys and reconcile recent external actions.
- Check external outage alert, queue age, log pruning and evidence retention.
- Confirm the dashboard shows real results and the spending ledger includes fallback/retry consumption.

Publish a release evidence report with environment, commit/image IDs, test results, redacted screenshots, receipt references, known unsupported portals and unresolved issues. A mock dashboard or simulated submission must be labeled as such.
