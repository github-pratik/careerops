# First production deployment

This is the agent's execution runbook for the review foundation. It is not evidence that production exists. See IMPLEMENTATION_STATUS.md for current state. The owner authorizes moving toward deployment; cloud account access is still missing as of 28 October 2026. Do not use the Codespace as the production server.

## Release scope

Release owner login, document/profile review, saved opportunities and immutable packet review. Submission, employer mail and assessments remain unimplemented. Keep model data transmission disabled until a provider is connected with explicit opt-in. Start with synthetic data; migrate private records only after storage, access and restore checks pass.

## Target selection

Inspect the owner's available hosting account before provisioning. Prefer a small persistent Linux VM suitable for the existing Node/PostgreSQL/pg-boss containers; check total costs against the private operating budget, including storage, network, public IP and backups. No account upgrade or trial-credit-dependent resources should be assumed.

Oracle Always Free is a candidate, not a selected or created host. Current official documentation lists a combined 2 OCPUs/12 GB memory allowance for A1 free tenancies (not older 4 OCPU/24 GB examples), capacity constraints and possible idle-instance reclamation. Inspect the actual tenancy, region, labels and limits. For an ARM host, validate the image on ARM before uploading private data. Sources: https://www.oracle.com/cloud/free/ and https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm.

## Agent execution sequence

1. Confirm account access, inspect existing resources, choose the region/shape and verify estimated recurring cost. Do not modify unrelated resources or a live database.
2. Provision the selected host and inspect its OS/architecture. Restrict SSH access, expose only HTTPS/HTTP through the proxy, and keep PostgreSQL/application ports private. Configure a real HTTPS hostname; none is currently recorded for production.
3. Use a dedicated production checkout of the reviewed commit. Install the verified Docker/Compose runtime. Preserve the legacy root Compose setup; the application stack is `infra/compose.yml`. Generate strong production credentials on the target and store them outside Git with restrictive permissions. Inspect the target database before migrations; use a new application database for the first deployment.
4. Implement and verify private document persistence and encrypted off-host backup. Back up both PostgreSQL records and matching original files. Take a consistent snapshot by quiescing writes/workers while capturing both, or implement an equivalent consistency mechanism. Perform an isolated restore drill and check original-file hashes and profile/packet integrity. Do not overwrite production during a drill.
5. Build or pull a reviewed, pinned application image for the target architecture. Bring up the database/application/proxy, verify HTTPS, health, unauthenticated record rejection, owner login, synthetic upload/extraction, profile changes invalidating packet approvals, original download and restart persistence. Never report draft approval as submission.
6. Confirm an operator recovery path, capture private production connection details and handoff, then perform an owner-authorized private-data migration. Preserve confirmed facts and import provenance; validate counts, hashes and pending proposals after migration. Keep real records out of CI/public Git.
7. Record the actual production URL, deployed commit, verification results, backup/restore evidence and costs privately. Update the public handoff only with generic implementation evidence and remaining limitations.

## Current verification and blockers

- Latest observed CI: run 40737767107 passed application verification and the Linux production-container smoke job. This does not validate production ARM, a hostname, cloud networking, backup/restore or a real deployment.
- The separate Codespace build passed, but its test run had three unhandled PostgreSQL shutdown errors despite 29 passing assertions after a locale correction. Retain this as an unresolved environment-specific failure; do not equate it with a clean Codespaces test run or suppress the errors.
- No cloud server connection, production hostname, object-storage credentials or off-host backup destination has been established. CLI presence/configuration checks found no configured Oracle/AWS/GCP server access on the current laptop. A hosting-account question is pending; never request passwords or keys in chat.
- No production resources were created by preparing this runbook. The existing Codespace is a development resource only.
