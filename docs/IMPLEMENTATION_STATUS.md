# Implementation handoff

Updated: 27 October 2026. Active development branch: `codex/cloud-workspace-foundation`.

## Actual release state

This is a working **review foundation**, not the completed autonomous application service. Local development verification has been performed; no production cloud host or live employer integration has been provisioned. No real application or employer email has been sent. No user resume has been imported; test documents are synthetic.

Implemented:

- React dashboard with owner login, responsive navigation, overview, documents, profile, opportunities, review and activity screens.
- Fastify API, HTTP-only signed session cookies, write-origin/header checks and login rate limiting.
- Persistent PostgreSQL tables with the `co_` prefix, preserving legacy tables/assets.
- Original PDF/DOCX/TXT upload storage, content-hash deduplication, separate import provenance and protected downloads.
- Isolated-process text extraction with file-size, page-count, time and output limits; scanned/protected/unreadable documents become visible attention items.
- Explicitly confirmed profile facts, optional exact source quotes, retirement and invalidation of unsent approvals.
- Optional Groq profile-extraction connector: opt-in personal-data configuration, evidence-quoted suggestions, explicit confirmation, basic conflicting-label detection and monthly/daily request/spend reservations. It has not been exercised against a live model account.
- Manual job capture and public per-company Greenhouse/Lever/Ashby feed connectors retaining full descriptions. Queue wiring is tested; live employer feed coverage is not yet validated.
- pg-boss persistent extraction/scan tasks, six-hour scan scheduling, source-error recording and startup reconciliation of pending uploads.
- Fact-selected application packets with immutable payload/hash and profile version; HTML resume preview for browser printing; repeated approval creates one audit event. Approval is not submission.
- Node/Docker/Caddy deployment scaffold, separate from the legacy n8n Compose file.
- GitHub Actions checks, locked dependencies, optional Codespaces/devcontainer configuration and cross-device development instructions.

## Verification evidence

- `npm run build`: passed TypeScript checking and Vite production build on macOS ARM64 / Node 26.
- `npm test`: 15 tests passed with a real temporary PostgreSQL server. Covers auth/origin checks, duplicate originals, text extraction, rejected fake evidence, explicit fact confirmation, stale hashes, idempotent approvals, invalidation, queue startup, canonical hashing, model-evidence validation and rebuilt-asset serving.
- `npm run test:browser`: passed the complete owner workflow in headless Chrome: sign in, upload/extract a synthetic PDF, confirm a fact, save a job, create/review/approve a packet, and check mobile overflow. Desktop and mobile screenshots were inspected. The test explicitly checks that approval is not represented as submission.
- Initial dependency audit: zero reported vulnerabilities at install time; this is not a full security audit.
- Docker/Compose/Codespaces and production ARM64 images are not tested here because Docker is not installed on this computer.

## Important limitations

1. No automatic portal form filling/submission, login/session connector, submission attempts or receipt reconciliation yet.
2. No Gmail OAuth, inbox synchronization, outgoing employer mail or follow-up engine yet.
3. Resume drafts currently select confirmed facts verbatim; automated job-specific rewriting, PDF export service and document layout checks remain.
4. AI extraction is opt-in and disabled without provider credentials plus personal-data approval. Source-quote validation does not prove that every paraphrase is entailed; the user must review suggestions.
5. Upload storage is currently a private persistent filesystem volume, not the proposed cloud object-storage connector. Off-host encryption/backup/restore is not implemented.
6. Fact conflicts are detected for equal category/label, not arbitrary semantic contradictions across different labels.
7. Single-owner authentication needs a production security review, proxy/rate-limit assessment, secret management and recovery workflow.
8. The UI exposes current capabilities honestly. There is no fabricated model score, application count, cost meter or claim of live integrations.
9. GitHub sync carries code and handoff notes. Each laptop's `.data/` remains separate; production documents will be shared through the cloud service, not Git. The current chat and private facts do not transfer with a clone.

## Next development sequence

1. Commit/push this verified foundation and inspect the GitHub Actions result. Carry forward any CI-specific failures into this handoff.
2. Validate the Docker build and devcontainer on a Docker-capable runner; configure cloud account access, a hostname and secret entry with the owner. Check the actual budget before provisioning.
3. Add private object storage and an encrypted off-host backup/restore drill, then deploy the read-only review foundation with HTTPS. Local testing is not the user's hosting goal.
4. Import actual resume files through the private document library and consolidate verified profile facts. Do not publish them in this public repository.
5. Add evaluated job matching and fact-grounded drafting with bounded costs; the existing calibration data is synthetic.
6. Implement one hosted-form adapter with real required-question discovery, immutable final-packet review, durable attempt state, unknown-outcome reconciliation and confirmation evidence. Exercise it against fixtures before one reviewed real application.
7. Implement dedicated Gmail OAuth, thread synchronization and bounded follow-ups. Do not treat an approval button as permission for unseen screening answers or an email to an unverified recipient.

The larger scope remains in `CLOUD_APPLICATION_PLAN.md` and `CLOUD_APPLICATION_TEST_PLAN.md`. Those documents describe intended behavior, not completed functionality.

## Cross-device continuation

On another computer, fetch the development branch and read this file plus `AGENTS.md` before editing. Preserve local changes, use fast-forward-only pulls on a clean checkout, and keep different concurrent tasks on separate branches. The user prefers a low-cost adequate model for any explicitly authorized delegated work; no subagents were used for this foundation.
