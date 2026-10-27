# CareerOps agent handoff

Read `docs/DEVELOPMENT.md` and `docs/IMPLEMENTATION_STATUS.md` before changing this repository. They describe implemented behavior and remaining work. `docs/CLOUD_APPLICATION_PLAN.md` is a proposal, not proof that all capabilities exist.

## Working rules

- Deliver an operating cloud service. Local processes are development/test tools, not the production destination.
- Prefer the lowest-cost adequate model for any user-authorized delegated tasks. Do not spawn agents solely because concurrency is available. Never claim a model override reduced token usage without measurement.
- Keep resumes, profile data, credentials, OAuth tokens, databases, screenshots containing personal information, `.env` and `.data/` out of Git. This repository is public. Use synthetic test data only in committed fixtures.
- Do not open `keys.local.md` unless a specific authorized integration needs it. Never log secrets.
- Application submission, employer email and assessments are not currently implemented. Do not represent draft approval as submission. Do not add fabricated experience or infer work authorization.
- Every approved packet binds to its saved content hash and profile version. Profile changes invalidate unsent approvals. Preserve this in modifications and tests.
- Preserve the original n8n exports and Supabase schema as legacy assets. New application tables use the `co_` prefix; never migrate or overwrite a live database without inspecting the target.
- Use the repository's locked dependency versions. Run `npm run build` and `npm test` for backend/domain changes. Run the browser suite for affected user flows.
- Use one `codex/` branch per coherent task. Inspect remote changes before pushing. Never force-push, reset user work or overwrite another laptop's edits to synchronize.
- At handoff, update `docs/IMPLEMENTATION_STATUS.md` with actual test evidence, blockers and next steps; commit only intentional source/config/documentation files.

## Checks

`npm ci`, `npm run build`, `npm test`, `npm run test:browser`.

The integration tests start an isolated PostgreSQL server using `embedded-postgres`. PostgreSQL shared memory and local sockets may need execution outside a restrictive sandbox. See development docs for browser setup. Never replace an integration failure with a success claim.
