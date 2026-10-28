# CareerOps decision record

Updated 28 October 2026. This is a durable summary of decisions from the development conversation, not a full chat transcript. Read alongside `IMPLEMENTATION_STATUS.md` for actual implementation and verification. New agent sessions must not infer completion from plans or recreate personal facts from missing chat context.

## Product outcome and working relationship

- Deliver a cloud-hosted job-search and application system accessible from either laptop while local computers may be asleep. A local preview or a cloud coding workspace alone does not meet the production goal.
- The intended scope includes job discovery, matching, truthful tailored application materials, supported portal applications, dedicated-inbox synchronization, employer correspondence, follow-ups and an activity/review dashboard. Submission and mail are future work, not implemented capabilities.
- The owner wants the agent to do routine engineering, setup and verification, explaining choices plainly and requesting user action only for missing account access, necessary factual answers or an actual approval boundary. Do not repeatedly ask the owner to choose routine implementation details.
- Resume facts need owner verification. Present experience strongly without inventing employment, dates, qualifications, outcomes or work authorization. Quoted document text is evidence, not automatic confirmation.
- Preferences are dynamic and editable. Compensation should reflect market, location, taxes and remote-work arrangements; do not impose an assumed universal cutoff. Actual personal preferences belong in private storage.
- Target zero recurring cost. A previously discussed spending ceiling is an exception ceiling, not standing permission to provision paid services; propose any unavoidable charge separately and obtain specific owner approval. Distinguish Always Free allowances from expiring trial credits and gross cost estimates from actual free-tier eligibility. Prefer the least costly adequate model for authorized delegated work. Respect provider limits with budgets, caching, backoff and legitimate fallback; do not evade limits. Do not claim token savings without measurement. Delegate only when authorized and useful.

## Architecture in use

- Application foundation: React/Vite dashboard, TypeScript/Fastify API, PostgreSQL `co_` tables, pg-boss durable jobs, isolated document extraction and private original-file storage.
- Immutable review packets bind saved content hashes and profile versions. Profile or preference changes invalidate unsent approvals. Approval is not application submission.
- An optional model gateway supports evidence-quoted profile proposals and matching. No live-provider quality evaluation has been completed; personal-data transmission requires runtime opt-in. Credentials are never committed.
- Initial public company-feed connectors target Greenhouse, Lever and Ashby. Do not claim comprehensive live discovery or portal support.
- Preserve the original n8n exports and legacy Supabase assets. They are not the new production system and must not be overwritten during new `co_` table work.
- Docker/Caddy are deployment scaffolds. Oracle, AWS, Azure, Google Cloud and Cloudflare were discussed as options, not all selected or deployed. Choose hosting after access, suitability and actual costs are verified; do not add platforms just for resume keywords.

## Cross-device continuity

- Public GitHub repository: `github-pratik/careerops`. Development branch: `codex/cloud-workspace-foundation`; draft PR #1 tracks the foundation. Inspect remote changes and preserve another laptop's edits; never force-push or reset to synchronize.
- Git stores code, tests, generic decisions and implementation notes. It must not contain resume originals/text, private candidate facts, credentials, databases, `.env`, `.data` or personal screenshots.
- Native Codex Cloud was attempted but its environment is unpublished and setup/editing fails. Do not repeat account setup or create duplicate environments as though none exists.
- A single GitHub Codespace is the current coding fallback. The remote editor connected and Codex installed. Its owner-specific link and access notes are private. Reopen the same workspace from both laptops; it can stop on inactivity/quota, and deletion can remove its uncommitted state. It is not a production server.
- Codex sign-in and an actual agent task inside that Codespace are not verified. The embedded browser's extension panel had rendering/time-out problems. Do not report that the agent is running there.
- This local chat has not migrated. Personal document intake and confirmed profile records remain in the private local library. A Drive resume folder is available to connected intake, but there is no production Drive watcher/OAuth sync. Neither a Git clone nor a new Codespace reconstructs those private records.

## Immediate continuation

1. Inspect Git state and the latest `IMPLEMENTATION_STATUS.md`; preserve work before fast-forwarding the implementation branch.
2. Reuse the existing Codespace and verify Codex authentication with a bounded agent task. Keep ports private and use synthetic data for testing.
3. Resolve the cloud test teardown failure: the build passed; after correcting the locale, 29 assertions passed but three unhandled PostgreSQL connection-termination errors remained. That run was not clean. Do not suppress errors or claim full validation.
4. Obtain private continuity context through an owner-authorized private transfer. Missing private facts are unknown, not facts to invent or prompts to repeat automatically.
5. Confirm hosting access and budget, implement secure private cloud storage and backup/restore, and deploy the review foundation over HTTPS. Then continue evaluated matching, one supported submission adapter and dedicated mail integration in that order.

At every meaningful handoff, update this file if a decision changes and update implementation status with what actually ran, failures, blockers and next steps. Keep sensitive owner-specific changes in private storage instead.

## Session review — 28 October 2026

Reviewed this decision record and the implementation handoff with the owner in a follow-up session. Summarized the recorded product, cross-device continuity, privacy, zero-cost and staged-delivery decisions. The Oracle creation hold remains in force. No new product or deployment decisions were made, and no resources were provisioned. This note records the review, not a transfer of full chat history or private records.
