# Development across computers

The GitHub repository is the source of truth for application code, tests and general development notes. Documents and production records belong to private runtime storage, not Git. A coding agent on another computer should read `AGENTS.md` and `docs/IMPLEMENTATION_STATUS.md` to continue. Chat history is not automatically synchronized by cloning the repository.

## First setup

Use Node.js 24 or newer supported by the lockfile. Clone `https://github.com/github-pratik/careerops.git`, switch to the active development branch shown in the handoff/PR, and run:

```sh
npm ci
npm run build
node --import tsx scripts/preview.ts
```

The preview script starts an isolated development PostgreSQL server and the app at `http://localhost:3100`. It writes a generated owner password to `.data/preview-password`, which the developer can view locally. It does not log the password or use production credentials. Stop with Ctrl-C. Persistent development files live in ignored `.data/`; each laptop has separate test data.

For an existing PostgreSQL service, run `npm run setup`, set the private `.env` values for that instance and use `npm start`. For Vite live frontend editing, run `npm run dev:web` and use its URL; match `APP_ORIGIN` to that browser origin when making authenticated requests. The normal built preview needs no separate frontend process.

## Private selected-folder intake

After the user identifies a folder, the agent can import its supported resume files without editing the originals:

```sh
node --import tsx scripts/import-resumes.ts /absolute/path/to/selected-folder
```

This creates private copies in `.data/library-files` and an isolated PostgreSQL library in `.data/library-db` (port 15441). It records file provenance, checks copied-content hashes and extracts text locally. It skips hidden files, subdirectories, symbolic links, TeX sources, and filenames indicating supporting transcripts/identity records. No remote model or cloud upload occurs. Reports are private under `.data/resume-intake/`.

To inspect the private intake workspace temporarily:

```sh
node --import tsx scripts/preview.ts --workspace=library
```

The owner password is generated in `.data/library-password`. Stop this inspection server before rerunning the offline importer. The default preview workspace and browser tests use separate synthetic data on database port 15440. Neither local workspace is production hosting; private records must be migrated securely once a cloud account is connected. Never commit reports, source folders, original files, database contents or personal profile suggestions.

Imported resume content remains evidence for review. Newer filenames and timestamps do not establish factual accuracy; conflicting dates/titles require user confirmation. Supporting academic/immigration records require a separate, specific workflow before use.

## Tests

```sh
npm run build
npm test
npm run test:browser
```

Unit/integration tests use an isolated temporary PostgreSQL cluster on port 15439. Preview/browser tests use port 15440 for their separate database and port 3100 for HTTP. Do not run duplicate copies on these ports.

On macOS, the browser suite uses the installed Google Chrome executable. On other systems install Playwright Chromium with `npx playwright install --with-deps chromium` before the browser suite. Browser fixtures contain synthetic candidate/job information. Browser evidence is written to ignored `.data/screenshots/`; do not commit screenshots of personal documents.

CI uses the Chrome executable already installed on the Ubuntu runner and passes its location through `PLAYWRIGHT_CHROME_EXECUTABLE`. This setting also allows a developer to select an existing Chrome installation explicitly.

## Switching laptops

1. On the current computer: finish checks, update implementation notes, commit the coherent change and push its branch.
2. On the other computer: inspect local `git status`; if clean, `git fetch origin`, check out the branch, then `git pull --ff-only`. Run `npm ci` when the lockfile changed.
3. Start the coding agent in the repository. Ask it to read the handoff notes and continue from the documented next task.

If both computers have edits, retain both on separate branches and integrate deliberately. Never use `reset --hard` or a force-push as a synchronization tool. Uncommitted edits do not appear on the other laptop.

## Cloud development option

Prefer a native Codex Cloud environment for coding tasks that must continue while either laptop is asleep. The owner signs in once; an agent can then prepare the repository, dependencies and checks in the environment setup flow. Reopen the same cloud task from the other device to continue its conversation. A new task has separate working files. Official setup guidance: https://learn.chatgpt.com/docs/environments/cloud-environments.

Select the implementation branch recorded in the handoff, not an assumed default-branch implementation. Validate Node 24, `npm ci`, `npm run build`, `npm test` and `npm run test:browser` before declaring the environment ready. Embedded PostgreSQL requires an unprivileged process and local shared memory/sockets; browser dependencies must also be available. Keep forwarded ports private. Do not import local `.data`, personal records or credentials during coding-environment setup. Account access, limits and a successful environment setup/publish still need verification.

A GitHub Codespaces configuration remains an optional fallback for a browser-accessible editor, using a dedicated development PostgreSQL service. It does not currently install or authenticate Codex, migrate this chat or provide continuous operation. Check account permissions, availability, actual quota and billing controls before creating one. Neither coding environment is the 24/7 production host. Do not put real resumes or production secrets into a public repository or committed devcontainer configuration.

## Deployment boundary

`infra/compose.yml` is the new application deployment scaffold. Root `docker-compose.yml` is the original n8n setup and is retained separately. New application runtime values are owner password, session secret, database password and HTTPS hostname. The agent can provision/configure these after cloud account access is available. No cloud resources or paid services have been created.

The Linux container build and health/authentication smoke test are verified in GitHub Actions. Production validation still needs a real host, target architecture, backups/restore, cloud secrets, pinned image digests and the remaining submission/mail features. CI verification does not establish a live production deployment.

## Matching and model configuration

Model extraction and job matching require both `GROQ_API_KEY` and explicit `ALLOW_PERSONAL_DATA_TO_GROQ=true` in private runtime configuration. Confirm provider privacy settings before enabling. No credentials are stored in source control. Matching excludes identity and authorization fact categories from provider payloads and always leaves work eligibility for review.

Use Profile → Search and compensation preferences to update markets, roles, take-home preferences and the service budget. Matching reads the full saved job description and confirmed profile facts; evidence references and quotes are validated before an assessment is saved. Prepare packet selects existing facts in recommended order; it does not generate employment history or submit an application.

`tests/matching.test.ts` and matching cases in `tests/app.test.ts` use synthetic data and mocked provider responses. A successful test run does not establish live model availability, output quality or employer acceptance.
