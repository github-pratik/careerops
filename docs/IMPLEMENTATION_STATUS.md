# Implementation handoff

Updated: 28 October 2026. Active development branch: `codex/cloud-workspace-foundation`.

## Actual release state

This is a working **review foundation**, not the completed autonomous application service. Local development verification has been performed; no production cloud host or live employer integration has been provisioned. No real application or employer email has been sent. Any user resume intake is private in the isolated library workspace; automated tests use separate synthetic data. This public handoff intentionally excludes personal document inventories and profile details.

Implemented:

- React dashboard with owner login, responsive navigation, overview, documents, profile, opportunities, review and activity screens.
- Fastify API, HTTP-only signed session cookies, write-origin/header checks and login rate limiting.
- Persistent PostgreSQL tables with the `co_` prefix, preserving legacy tables/assets.
- Original PDF/DOCX/TXT upload storage, content-hash deduplication, separate import provenance and protected downloads.
- Explicit-folder batch intake uses the same document-storage path, verifies copied originals and stores private reports. Supporting academic/identity records, TeX sources and symbolic links are excluded from resume drafting. The personal intake library is isolated from the synthetic preview/test workspace.
- Isolated-process text extraction with file-size, page-count, time and output limits; scanned/protected/unreadable documents become visible attention items.
- Explicitly confirmed profile facts, optional exact source quotes, retirement and invalidation of unsent approvals.
- Optional Groq profile-extraction connector: opt-in personal-data configuration, evidence-quoted suggestions, explicit confirmation, basic conflicting-label detection and monthly/daily request/spend reservations. It has not been exercised against a live model account.
- Job matching compares the full saved description with confirmed non-identity/non-authorization facts, validates references and literal requirement quotes, stores versioned assessments and recommends existing facts in relevance order. Scores are labeled AI estimates, never hiring probabilities or proof of eligibility. Provider failures create errors, not rejection scores.
- Search/compensation preferences are privately editable. Changes invalidate unsent approvals and make old assessments stale. Model extraction and matching share a bounded spend/request gateway; zero service budget blocks new model calls.
- Manual job capture and public per-company Greenhouse/Lever/Ashby feed connectors retaining full descriptions. Queue wiring is tested; live employer feed coverage is not yet validated.
- pg-boss persistent extraction/scan tasks, six-hour scan scheduling, source-error recording and startup reconciliation of pending uploads.
- Fact-selected application packets with immutable payload/hash and profile version; HTML resume preview for browser printing; repeated approval creates one audit event. Approval is not submission.
- Node/Docker/Caddy deployment scaffold, separate from the legacy n8n Compose file.
- GitHub Actions checks, locked dependencies, optional Codespaces/devcontainer configuration and cross-device development instructions.

## Verification evidence

- `npm run build`: passed TypeScript checking and Vite production build on macOS ARM64 / Node 26.
- `npm test`: 29 tests passed, including real PostgreSQL integration tests and selected-folder classification boundaries. Matching cases cover unknown fact IDs, false job quotes, invalid scores, cache reuse, identity/authorization minimization, stale location/profile/preferences, quota errors and budget exhaustion. Model responses are mocked in these tests: they establish contracts and failure handling, not real-model quality.
- `npm run test:browser`: passed the complete owner workflow in headless Chrome: sign in, upload/extract a synthetic PDF, confirm a fact, save a job, create/review/approve a packet, and check mobile overflow. Desktop and mobile screenshots were inspected. The test explicitly checks that approval is not represented as submission.
- GitHub Actions run `40565883692` passed the build, all 15 tests and the browser flow on a Linux runner with Node 24. Draft PR: https://github.com/github-pratik/careerops/pull/1.
- Initial dependency audit: zero reported vulnerabilities at install time; this is not a full security audit.
- GitHub Actions run `40566173952` passed both application verification and the Docker/Compose smoke job: built the production image, started the app with PostgreSQL, checked health and required authentication for records, then removed isolated CI containers/volumes. Docker is not installed on this computer. Codespaces and production ARM64 images still require validation.
- CI is pinned to Ubuntu 24.04 and uses the runner's installed Chrome to avoid repeated browser/dependency downloads. The check prints the actual browser version; normal developer environments may use the documented Playwright installation path.
- The matching extension also passed the local browser workflow, including disabled matching controls when the provider is disconnected. Inspect the latest PR checks for its current Linux/container result.
- A real private intake was exercised locally with successful text extraction and copied-content verification; details and review questions are in ignored private reports. Representative PDF pages were visually inspected. Imported claims have not been auto-confirmed or sent to a model provider.
- A one-time connected Drive intake also completed locally: original bytes were hash-verified, identical documents reused, text extraction completed and the confirmed-fact table was verified unchanged before/after. Source identifiers, inventories and results are stored only in ignored private reports. This operation changed no application source; the existing application/container CI run `40574430162` passed, and `git diff --check` passed for this documentation update. Build/browser tests were not rerun for the documentation-only change.

## Important limitations

1. No automatic portal form filling/submission, login/session connector, submission attempts or receipt reconciliation yet.
2. No Gmail OAuth, inbox synchronization, outgoing employer mail or follow-up engine yet.
3. Resume drafts use confirmed facts verbatim, optionally selected/ordered by the matching assessment. Automated rewriting, PDF export service and document layout checks remain. No live-model quality evaluation has been performed.
4. AI extraction is opt-in and disabled without provider credentials plus personal-data approval. Source-quote validation does not prove that every paraphrase is entailed; the user must review suggestions.
5. Upload storage is currently a private persistent filesystem volume, not the proposed cloud object-storage connector. Off-host encryption/backup/restore is not implemented.
6. Fact conflicts are detected for equal category/label, not arbitrary semantic contradictions across different labels.
7. Single-owner authentication needs a production security review, proxy/rate-limit assessment, secret management and recovery workflow.
8. The UI exposes current capabilities honestly. AI scores exist only after a valid provider response and are labeled estimates. There is no fabricated application count, live cost meter or claim of connected employer integrations.
9. GitHub sync carries code and handoff notes. Each laptop's `.data/` remains separate; production documents will be shared through the cloud service, not Git. The current chat and private facts do not transfer with a clone.
10. Connector-assisted Drive intake is a one-time private operation. The application has no persistent Drive OAuth connection, folder watcher or continuous cloud document synchronization. Private source manifests and intake reports remain excluded from Git.
11. Native Codex Cloud is the preferred cross-device coding path. Owner ChatGPT/GitHub sign-in completed and the repository became visible in the picker. A private `careerops` environment now appears in Settings → Codex Cloud as **Unpublished**. Setup is blocked: the initial chat displayed “Could not start this chat”; its retry failed, and the saved environment's “Continue setup” action returned to settings without a working draft. No environment tests ran and nothing was published. Preserve this existing environment rather than creating duplicates. A read-only Codespaces API check also returned HTTP 403 because the current GitHub CLI token lacks the `codespace` scope; no Codespace was created. Codespaces quota/billing is unverified. Local chat state is not automatically migrated to a cloud task.

## Next development sequence

1. Sync this extension and inspect its latest GitHub Actions result. Carry forward any CI-specific failures into this handoff.
2. The Linux container smoke test is already verified. Validate the devcontainer and target cloud architecture; configure cloud account access, a hostname and secret entry with the owner. Check the actual budget before provisioning.
3. Add private object storage and an encrypted off-host backup/restore drill, then deploy the read-only review foundation with HTTPS. Local testing is not the user's hosting goal.
4. Import actual resume files through the private document library and consolidate verified profile facts. Do not publish them in this public repository.
5. Evaluate the implemented matcher using a connected provider and real user-reviewed jobs; the existing calibration data is synthetic. Add evaluated fact-grounded rewriting only after this quality gate. Provider access and an approved profile are still needed.
6. Implement one hosted-form adapter with real required-question discovery, immutable final-packet review, durable attempt state, unknown-outcome reconciliation and confirmation evidence. Exercise it against fixtures before one reviewed real application.
7. Implement dedicated Gmail OAuth, thread synchronization and bounded follow-ups. Do not treat an approval button as permission for unseen screening answers or an email to an unverified recipient.

The larger scope remains in `CLOUD_APPLICATION_PLAN.md` and `CLOUD_APPLICATION_TEST_PLAN.md`. Those documents describe intended behavior, not completed functionality.

## Cross-device continuation

On another computer, fetch the development branch and read this file plus `AGENTS.md` before editing. Preserve local changes, use fast-forward-only pulls on a clean checkout, and keep different concurrent tasks on separate branches. The user prefers a low-cost adequate model for any explicitly authorized delegated work; no subagents were used for this foundation.
