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

## Tests

```sh
npm run build
npm test
npm run test:browser
```

Unit/integration tests use an isolated temporary PostgreSQL cluster on port 15439. Preview/browser tests use port 15440 for their separate database and port 3100 for HTTP. Do not run duplicate copies on these ports.

On macOS, the browser suite uses the installed Google Chrome executable. On other systems install Playwright Chromium with `npx playwright install --with-deps chromium` before the browser suite. Browser fixtures contain synthetic candidate/job information. Browser evidence is written to ignored `.data/screenshots/`; do not commit screenshots of personal documents.

## Switching laptops

1. On the current computer: finish checks, update implementation notes, commit the coherent change and push its branch.
2. On the other computer: inspect local `git status`; if clean, `git fetch origin`, check out the branch, then `git pull --ff-only`. Run `npm ci` when the lockfile changed.
3. Start the coding agent in the repository. Ask it to read the handoff notes and continue from the documented next task.

If both computers have edits, retain both on separate branches and integrate deliberately. Never use `reset --hard` or a force-push as a synchronization tool. Uncommitted edits do not appear on the other laptop.

## Cloud development option

A GitHub Codespaces configuration is included for a shared browser-accessible development environment, using a dedicated development PostgreSQL service. The account's Codespaces availability/quota must be checked before use. It is an optional development environment, not the 24/7 production host. Do not put real resumes or production secrets into a public repository or committed devcontainer configuration.

## Deployment boundary

`infra/compose.yml` is the new application deployment scaffold. Root `docker-compose.yml` is the original n8n setup and is retained separately. New application runtime values are owner password, session secret, database password and HTTPS hostname. The agent can provision/configure these after cloud account access is available. No cloud resources or paid services have been created.

Production validation still needs a container build, real host, backups/restore, cloud secrets, pinned image digests and the remaining submission/mail features. Local verification does not establish production readiness.
