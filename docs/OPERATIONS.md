# Operating the review service

The application is not deployed. The Oracle creation hold still applies. These procedures support release preparation; they do not establish a running production host.

## Encrypted backup and isolated restore

The production image includes the backup command; originals live under `/app/data/library` inside the persistent `/app/data` volume. An isolated container restore can use a fresh database and `DATA_DIR=/app/data/recovered`, then configure the application to use that restored directory. Never run the normal app against the restore destination before restoring, because startup creates its document directory.

Run `npm run backup -- create .data/backups/review.coback` with private `DATABASE_URL`, `DATA_DIR`, and `BACKUP_PASSPHRASE` (20+ characters). Existing output files are never overwritten. Keep an encrypted copy off-host and keep the passphrase separately. The snapshot contains personal data, even though encrypted: never put it in public Git. Store credentials and recovery instructions separately; `.env`, OAuth secrets, session secrets and queue internals are not included.

The tool locks application tables against writes while taking a paired database/original-file snapshot, verifies original-file hashes and encrypts with AES-256-GCM and a salted scrypt-derived key. Current limit: 100 MB serialized snapshot and 50 MB original files. Long-running writes can cause a lock timeout; retry when activity has stopped. Backups are operator initiated; no scheduled off-host copy or retention policy has been configured.

For a restore drill, stop the destination application and point `DATABASE_URL` at a **fresh database** and `DATA_DIR` at a **directory that does not exist**. Use the same backup passphrase, then run `npm run backup -- restore /private/path/review.coback`. The current schema is initialized on that explicitly selected target. Restore refuses populated application tables, checks authenticated decryption and every original-file hash, and restores provenance and immutable packets. Scan scheduling is paused and in-progress mail is marked unknown. Verify document downloads, counts, packet hashes and authentication before starting normal work. Configure new session/owner credentials separately.

Use a different database and directory for each drill. Never point this command at the live destination. If a failure occurs after original files have been published, retain them and inspect database state: a connection failure during COMMIT can have an uncertain outcome. Reconcile before repeating; restore deliberately refuses existing destinations.

An automated synthetic integration test has exercised backup, wrong-passphrase/tamper rejection, isolated restore, document hashes, provenance and packet hashes. An actual production off-host restore has not occurred.

## Dedicated Gmail connector

Configure `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `GMAIL_REFRESH_TOKEN`, `GMAIL_ADDRESS`, and `ALLOW_GMAIL=true` privately. Use Google OAuth offline access for the dedicated job-search account with `gmail.readonly` and `gmail.send`. Google's consent-screen/test-app restrictions can affect token lifetime; account provisioning, scope consent and a setup wizard remain external setup work. Never paste tokens into chats or commit them. The connected ChatGPT Gmail plugin is separate from this application's OAuth configuration.

The Email screen can save drafts while disconnected. It supports plain-text mail without attachments. The user must review the saved recipient, sender, subject and body, check the send-authorization box, then request the send. The server verifies the OAuth account matches the configured sender, binds authorization to the draft hash, serializes send claims, and limits attempts to three per rolling 24 hours. Quota/auth errors are surfaced. A provider acceptance ID is not proof of inbox delivery.

A failed/ambiguous send becomes `unknown` and is never retried automatically. Inspect Gmail's actual Sent mailbox and record evidence using the reconciliation form. A process interrupted while sending is also treated as unknown on restart. Do not create duplicate drafts to evade that check or the send cap.

Sync is explicit, reads up to 50 latest inbox summaries per request, and stores sender, subject, snippet, date and thread ID. It is not a complete mailbox mirror, push watcher, full-body reader, automatic reply engine or attachment importer. Repeated sync is idempotent for stored IDs; changing the linked account requires a separate workspace. No email content is passed to the AI model. No actual account, message send or live synchronization has been verified in this release.

References: https://developers.google.com/identity/protocols/oauth2/web-server and https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages/send.

## Listings, packets and application outcomes

Successful complete board scans close disappeared listings and invalidate unsent packets for changed/closed jobs. Failed, malformed and oversized feeds retain previous records. Closed jobs cannot be assessed or used for fresh packets. Greenhouse question discovery reads the selected imported job and retains required-field/consent warnings for human review; uploads, location and demographic/consent workflows must still be completed on the employer portal. Greenhouse API submission requires an employer board key and is not implemented as a general applicant integration.

You can save screening question/answer pairs and notes in the immutable review packet, inspect them before approval, and download the exact packet as JSON. After sending an application yourself, record evidence and an application date, then track interview/offer/rejection/withdrawal outcomes and follow-up dates. These are owner-reported records. Due dates do not automatically send mail. Profile changes preserve historical outcomes while invalidating old drafts.
