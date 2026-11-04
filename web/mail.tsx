import React from "react";
export function MailWorkspace({
  state,
  busy,
  run,
  api,
}: {
  state: any;
  busy: boolean;
  run: (task: () => Promise<unknown>, message?: string) => Promise<void>;
  api: (url: string, method?: string, body?: unknown) => Promise<any>;
}) {
  const data = (form: HTMLFormElement) =>
    Object.fromEntries(new FormData(form));
  return (
    <>
      <section className="panel">
        <h2>Dedicated job-search email</h2>
        <p>
          {state.capabilities.emailConfigured
            ? `Configured account: ${state.mailAccount}. ${state.mailVerifiedAt ? "Last inbox verification: " + new Date(state.mailVerifiedAt).toLocaleString() : "Account has not been verified yet."}`
            : "Email is disconnected. An administrator must configure a dedicated Gmail account using OAuth credentials and explicitly enable it. You can prepare drafts before connecting."}
        </p>
        <p>
          Sync reads up to 50 recent inbox message summaries. Messages and
          tokens are never passed to an AI model. Sending requires a separate
          review of the exact recipient and content; no automatic follow-up
          emails are sent.
        </p>
        <button
          disabled={busy || !state.capabilities.emailConfigured}
          onClick={() =>
            void run(
              () => api("/mail/sync", "POST", {}),
              "Inbox summaries synchronized",
            )
          }
        >
          Sync dedicated inbox
        </button>
      </section>
      <section className="panel">
        <h2>Prepare an email</h2>
        <p>
          Enter a recipient you have verified and your own truthful message.
          This editor sends plain text without attachments. Saving creates a
          reviewable draft.
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const form = e.currentTarget,
              input = data(form);
            void run(async () => {
              await api("/mail/drafts", "POST", input);
              form.reset();
            }, "Email draft saved for review; nothing sent");
          }}
        >
          <label>
            Sender address
            <input
              name="from"
              type="email"
              required
              defaultValue={state.mailAccount}
              maxLength={254}
            />
          </label>
          <label>
            Verified recipient address
            <input name="to" type="email" required maxLength={254} />
          </label>
          <label>
            Email subject
            <input name="subject" required maxLength={200} />
          </label>
          <label>
            Email message
            <textarea name="body" required maxLength={20000} rows={8} />
          </label>
          <button disabled={busy}>Save email for review</button>
        </form>
      </section>
      <section className="panel">
        <h2>Saved email drafts and delivery</h2>
        {!state.mailDrafts?.length && <p>No email drafts yet.</p>}
        {state.mailDrafts?.map((d: any) => (
          <details className="review-fact" key={d.id}>
            <summary>
              {d.payload.subject} ·{" "}
              {d.state === "sent"
                ? "Provider accepted / reconciled as sent"
                : d.state === "sending"
                  ? "Sending — do not retry"
                  : d.state}
            </summary>
            <p>
              <strong>From:</strong> {d.payload.from}
              <br />
              <strong>To:</strong> {d.payload.to}
            </p>
            <p className="preserve">{d.payload.body}</p>
            {d.provider_id && <p>Provider reference: {d.provider_id}</p>}
            {d.state === "draft" && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void run(
                    () =>
                      api("/mail/drafts/" + d.id + "/send", "POST", {
                        hash: d.hash,
                        confirmed: true,
                      }),
                    "Email accepted by provider; delivery is not guaranteed",
                  );
                }}
              >
                <label className="checkbox">
                  <input required type="checkbox" />I verified this recipient
                  and authorize sending this exact message.
                </label>
                <button disabled={busy || !state.capabilities.emailConfigured}>
                  Send reviewed email
                </button>
              </form>
            )}
            {d.state === "unknown" && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const input = data(e.currentTarget);
                  void run(
                    () =>
                      api("/mail/drafts/" + d.id + "/reconcile", "POST", {
                        ...input,
                        confirmed: true,
                      }),
                    "Delivery outcome recorded from your review",
                  );
                }}
              >
                <p>
                  Delivery is uncertain. Check the actual Sent mailbox before
                  recording an outcome. Do not compose a duplicate until you
                  resolve this.
                </p>
                <label>
                  Verified outcome
                  <select name="state">
                    <option value="sent">I found the sent message</option>
                    <option value="failed">I verified it was not sent</option>
                  </select>
                </label>
                <label>
                  Delivery evidence
                  <textarea
                    name="evidence"
                    required
                    minLength={10}
                    maxLength={3000}
                  />
                </label>
                <label className="checkbox">
                  <input required type="checkbox" />I checked the mailbox and
                  confirm this outcome.
                </label>
                <button disabled={busy}>Record delivery outcome</button>
              </form>
            )}
          </details>
        ))}
      </section>
      <section className="panel">
        <h2>Inbox summaries</h2>
        {!state.mailMessages?.length && <p>No synchronized messages.</p>}
        {state.mailMessages?.map((m: any) => (
          <details className="review-fact" key={m.id}>
            <summary>{m.subject || "(No subject)"}</summary>
            <p>
              {m.sender} · {new Date(m.received_at).toLocaleString()}
            </p>
            <p>{m.snippet}</p>
            <a
              href={
                "https://mail.google.com/mail/u/" +
                encodeURIComponent(state.mailAccount) +
                "/#inbox/" +
                encodeURIComponent(m.thread_id)
              }
              target="_blank"
              rel="noreferrer"
            >
              Open in Gmail
            </a>
          </details>
        ))}
      </section>
    </>
  );
}
