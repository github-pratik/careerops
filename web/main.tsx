import React, { useEffect, useState, type FormEvent } from "react";
import { createRoot } from "react-dom/client";
import "./style.css";

async function api(url: string, method = "GET", body?: unknown) {
  const response = await fetch("/api" + url, {
    method,
    headers:
      method === "GET"
        ? {}
        : body instanceof FormData
          ? { "X-CareerOps-Request": "1" }
          : { "Content-Type": "application/json", "X-CareerOps-Request": "1" },
    body:
      body === undefined
        ? undefined
        : body instanceof FormData
          ? body
          : JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Request failed");
  return data;
}
const date = (v: string) =>
  new Date(v).toLocaleDateString(undefined, { month: "short", day: "numeric" });
const fields = (event: FormEvent<HTMLFormElement>) =>
  Object.fromEntries(new FormData(event.currentTarget));
const labels: Record<string, string> = {
  queued: "Queued",
  extracting: "Reading document",
  ready: "Ready",
  needs_attention: "Needs attention",
  review: "Awaiting review",
  approved: "Approved · not submitted",
  stale: "Needs a fresh draft",
};
function Badge({ state }: { state: string }) {
  return <span className={"badge " + state}>{labels[state] || state}</span>;
}
function App() {
  const [authenticated, setAuthenticated] = useState<boolean | null>(null),
    [state, setState] = useState<any>(null),
    [page, setPage] = useState("Overview");
  const [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false);
  const [selectedDoc, setSelectedDoc] = useState<any>(null),
    [selectedJob, setSelectedJob] = useState<any>(null),
    [selectedPacket, setSelectedPacket] = useState<any>(null);
  const [factIds, setFactIds] = useState<string[]>([]),
    [query, setQuery] = useState("");
  async function refresh() {
    try {
      setState(await api("/state"));
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    api("/session")
      .then((v) => setAuthenticated(v.authenticated))
      .catch((e) => setError(e.message));
  }, []);
  useEffect(() => {
    if (!authenticated) return;
    void refresh();
    const timer = setInterval(() => void refresh(), 5000);
    return () => clearInterval(timer);
  }, [authenticated]);
  async function run(task: () => Promise<unknown>, message = "Saved") {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await task();
      await refresh();
      setNotice(message);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (authenticated === null)
    return (
      <main className="loading">
        Opening your workspace…{error && <p>{error}</p>}
      </main>
    );
  if (!authenticated)
    return (
      <div className="login">
        <div className="login-art">
          <span className="wordmark">
            career<span>ops</span>
            <i>↗</i>
          </span>
          <h1>
            A little more clarity.
            <br />A lot more possibility.
          </h1>
          <p>
            Your documents, experience, and next opportunities.
            <br />
            One private workspace.
          </p>
          <div className="rings" />
        </div>
        <form
          className="login-form"
          onSubmit={async (e) => {
            e.preventDefault();
            const data = fields(e);
            setError("");
            try {
              await api("/login", "POST", data);
              setAuthenticated(true);
            } catch (err) {
              setError((err as Error).message);
            }
          }}
        >
          <span className="eyebrow">YOUR PERSONAL WORKSPACE</span>
          <h2>Welcome back.</h2>
          <p>Sign in to manage your next chapter.</p>
          <label>
            Owner password
            <input
              type="password"
              name="password"
              required
              autoComplete="current-password"
            />
          </label>
          <button>
            Open workspace <span>→</span>
          </button>
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
          <small>
            Your password is stored in the deployment configuration. Resumes
            stay private to your account.
          </small>
        </form>
      </div>
    );
  if (!state)
    return (
      <main className="loading">
        Loading your workspace…{error && <p role="alert">{error}</p>}
      </main>
    );
  const docs = state.documents,
    facts = state.facts,
    jobs = state.jobs,
    packets = state.packets;
  const pending = packets.filter((p: any) => p.state === "review").length;
  const selectedAssessment = state.assessments?.find(
    (a: any) => a.job_id === selectedJob?.id,
  );
  const nav = [
    "Overview",
    "Documents",
    "Profile",
    "Opportunities",
    "Review",
    "Activity",
  ];
  const descriptions: Record<string, string> = {
    Overview: "A clear view of your search, and what comes next.",
    Documents: "All your resumes. Every version. From any device.",
    Profile: "The experience behind every application. Confirm it once.",
    Opportunities: "Collect roles worth your time. Keep the full context.",
    Review: "Know exactly what an application will say about you.",
    Activity: "A record of your decisions, changes, and progress.",
  };
  return (
    <div className="layout">
      <aside className="sidebar">
        <a
          className="wordmark"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            setPage("Overview");
          }}
        >
          career<span>ops</span>
          <i>↗</i>
        </a>
        <div className="workspace-label">PERSONAL WORKSPACE</div>
        <nav>
          {nav.map((name, i) => (
            <button
              key={name}
              aria-label={name}
              className={page === name ? "active" : ""}
              onClick={() => {
                setPage(name);
                setSelectedPacket(null);
                setSelectedJob(null);
              }}
            >
              <span className="nav-icon" aria-hidden="true">
                {["◫", "▤", "◉", "↗", "✓", "≋"][i]}
              </span>
              {name}
              {name === "Review" && pending > 0 && <b>{pending}</b>}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="avatar">P</div>
          <div>
            <strong>Your workspace</strong>
            <small>Private · single owner</small>
          </div>
          <button
            className="signout"
            title="Sign out"
            onClick={async () => {
              await api("/logout", "POST", {});
              setAuthenticated(false);
              setState(null);
            }}
          >
            ↪
          </button>
        </div>
      </aside>
      <main className="main">
        <header>
          <div>
            <div className="eyebrow">CAREEROPS / {page.toUpperCase()}</div>
            <h1>{page === "Overview" ? "Your next chapter." : page}</h1>
            <p>{descriptions[page]}</p>
          </div>
          <div className="mode">
            <span className="dot" />
            Review workspace<small>External actions not connected</small>
          </div>
        </header>
        {error && (
          <div className="message error" role="alert">
            {error}
            <button onClick={() => setError("")}>Dismiss</button>
          </div>
        )}
        {notice && (
          <div className="message success" role="status">
            {notice}
            <button onClick={() => setNotice("")}>Dismiss</button>
          </div>
        )}
        {page === "Profile" && (
          <details className="panel">
            <summary>
              Search and compensation preferences <span>+</span>
            </summary>
            <p className="caption">
              These stay in your private database. Updating them makes old
              assessments and unsent approvals stale.
            </p>
            <form
              key={state.settings.profile_version}
              onSubmit={(e) => {
                e.preventDefault();
                const f = fields(e);
                void run(
                  () =>
                    api("/preferences", "POST", {
                      monthlyBudgetUsd: Number(f.budget),
                      usualNetMonthlyUsd: f.net === "" ? null : Number(f.net),
                      indiaRemoteFlexible: f.india === "on",
                      markets: String(f.markets)
                        .split(",")
                        .map((s) => s.trim())
                        .filter(Boolean),
                      targetRoles: String(f.roles)
                        .split(",")
                        .map((s) => s.trim())
                        .filter(Boolean),
                    }),
                  "Preferences updated. Existing drafts need a fresh review.",
                );
              }}
            >
              <label>
                Target roles (comma-separated)
                <input
                  name="roles"
                  defaultValue={
                    state.settings.preferences.targetRoles?.join(", ") || ""
                  }
                />
              </label>
              <label>
                Target markets (comma-separated)
                <input
                  name="markets"
                  defaultValue={
                    state.settings.preferences.markets?.join(", ") || ""
                  }
                />
              </label>
              <label>
                Usual monthly take-home target (USD)
                <input
                  type="number"
                  name="net"
                  min="0"
                  max="1000000"
                  defaultValue={
                    state.settings.preferences.usualNetMonthlyUsd ?? ""
                  }
                />
              </label>
              <label className="checkbox">
                <input
                  type="checkbox"
                  name="india"
                  defaultChecked={
                    state.settings.preferences.indiaRemoteFlexible
                  }
                />
                Consider lower pay for full-time remote employment explicitly
                permitting work from India.
              </label>
              <label>
                Monthly service budget (USD, maximum 10)
                <input
                  type="number"
                  name="budget"
                  min="0"
                  max="10"
                  step="0.01"
                  required
                  defaultValue={state.settings.preferences.monthlyBudgetUsd}
                />
              </label>
              <button disabled={busy}>Save preferences</button>
            </form>
          </details>
        )}
        {page === "Documents" && (
          <section className="panel">
            <div className="section-head">
              <h2>Let AI propose the profile details</h2>
              <Badge
                state={
                  state.capabilities.aiConnected ? "ready" : "Not connected"
                }
              />
            </div>
            <p>
              Extract proposed facts with exact source quotes. You confirm them
              before they enter your profile.
            </p>
            {state.capabilities.aiConnected ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const data = fields(e);
                  void run(async () => {
                    await api(
                      "/documents/" + data.documentId + "/analyze",
                      "POST",
                      {},
                    );
                    setPage("Profile");
                  }, "Proposed facts are ready for your review.");
                }}
              >
                <label>
                  Readable source
                  <select name="documentId" required>
                    <option value="">Choose a document</option>
                    {docs
                      .filter((d: any) => d.state === "ready")
                      .map((d: any) => (
                        <option key={d.id} value={d.id}>
                          {d.filename}
                        </option>
                      ))}
                  </select>
                </label>
                <button disabled={busy}>
                  {busy ? "Analyzing…" : "Propose profile facts"}
                </button>
              </form>
            ) : (
              <p className="caption">
                Provider connection and approval for processing personal data
                are still needed. Uploads and manual fact confirmation already
                work.
              </p>
            )}
          </section>
        )}
        {page === "Profile" && state.proposals?.length > 0 && (
          <section className="panel">
            <div className="section-head">
              <h2>Proposed facts · review before confirming</h2>
              <span className="count">{state.proposals.length}</span>
            </div>
            {state.proposals.map((p: any) => (
              <article className="review-fact" key={p.id}>
                <span className="eyebrow">
                  {p.category} · {p.filename}
                </span>
                <h3>{p.label}</h3>
                <p>{p.value}</p>
                <details>
                  <summary>Exact supporting quote</summary>
                  <p>{p.quote}</p>
                </details>
                {facts.some(
                  (f: any) =>
                    f.category === p.category &&
                    f.label.toLowerCase() === p.label.toLowerCase() &&
                    f.value !== p.value,
                ) && (
                  <p className="error">
                    This differs from a confirmed fact. Resolve it before
                    confirming.
                  </p>
                )}
                <div className="actions">
                  <button
                    disabled={busy}
                    onClick={() =>
                      void run(
                        () =>
                          api("/proposals/" + p.id + "/confirm", "POST", {
                            confirmed: true,
                          }),
                        "Fact confirmed",
                      )
                    }
                  >
                    Confirm accurate
                  </button>
                  <button
                    className="secondary"
                    disabled={busy}
                    onClick={() =>
                      void run(
                        () =>
                          api("/proposals/" + p.id + "/dismiss", "POST", {}),
                        "Suggestion dismissed",
                      )
                    }
                  >
                    Dismiss
                  </button>
                </div>
              </article>
            ))}
          </section>
        )}
        {page === "Overview" && (
          <>
            <section className="hero">
              <div>
                <span className="eyebrow">START WITH YOUR STORY</span>
                <h2>
                  Your experience.
                  <br />
                  Ready for what’s next.
                </h2>
                <p>
                  Bring your resumes together, confirm the details,
                  <br />
                  and prepare applications you can stand behind.
                </p>
                <button
                  onClick={() => setPage(docs.length ? "Profile" : "Documents")}
                >
                  {docs.length
                    ? "Review your profile"
                    : "Add your first resume"}{" "}
                  <span>↗</span>
                </button>
              </div>
              <div className="hero-graphic" aria-hidden="true">
                <div className="paper p-back" />
                <div className="paper">
                  <span className="paper-dot" />
                  <div className="paper-line wide" />
                  <div className="paper-line" />
                  <hr />
                  <div className="paper-line wide" />
                  <div className="paper-line wide" />
                  <div className="paper-line" />
                  <span className="paper-check">✓</span>
                </div>
                <span className="orbit-label">ONE SOURCE OF TRUTH</span>
              </div>
            </section>
            <section className="stats">
              {[
                [docs.length, "Documents", "Your original files"],
                [facts.length, "Confirmed facts", "Ready to use"],
                [jobs.length, "Opportunities", "Saved for consideration"],
                [pending, "To review", "Awaiting your decision"],
              ].map(([n, label, sub]) => (
                <div className="stat" key={String(label)}>
                  <small>{label}</small>
                  <strong>{n}</strong>
                  <span>{sub}</span>
                </div>
              ))}
            </section>
            <div className="columns">
              <section className="panel">
                <div className="section-head">
                  <h2>Your setup</h2>
                  <span className="subtle">BUILD A TRUSTED FOUNDATION</span>
                </div>
                {[
                  [
                    "1",
                    "Bring your resumes together",
                    `${docs.length} document${docs.length === 1 ? "" : "s"} in your library`,
                    "Documents",
                    docs.length > 0,
                  ],
                  [
                    "2",
                    "Confirm your experience",
                    `${facts.length} verified facts`,
                    "Profile",
                    facts.length > 0,
                  ],
                  [
                    "3",
                    "Find your first opportunity",
                    `${jobs.length} saved roles`,
                    "Opportunities",
                    jobs.length > 0,
                  ],
                ].map(([n, title, sub, target, done]) => (
                  <button
                    className="step"
                    key={String(n)}
                    onClick={() => setPage(String(target))}
                  >
                    <span className={"step-number " + (done ? "done" : "")}>
                      {done ? "✓" : n}
                    </span>
                    <span>
                      <strong>{title}</strong>
                      <small>{sub}</small>
                    </span>
                    <span className="arrow">→</span>
                  </button>
                ))}
              </section>
              <section className="panel preferences">
                <div className="section-head">
                  <h2>Your direction</h2>
                  <span>◎</span>
                </div>
                <label>MARKETS</label>
                <p>
                  {state.settings.preferences.markets?.join(" · ") ||
                    "Not configured"}
                </p>
                <label>COMPENSATION</label>
                <p>
                  {state.settings.preferences.usualNetMonthlyUsd
                    ? "$" +
                      Number(
                        state.settings.preferences.usualNetMonthlyUsd,
                      ).toLocaleString() +
                      "+ monthly take-home"
                    : "No target configured"}
                </p>
                <small>
                  {state.settings.preferences.indiaRemoteFlexible
                    ? "Flexible for full-time remote work from India. "
                    : ""}
                  No automatic salary rejection.
                </small>
                <label>MONTHLY OPERATING BUDGET</label>
                <p>
                  ${state.settings.preferences.monthlyBudgetUsd} maximum planned
                </p>
                <small>
                  Cloud and model billing are not connected yet. This is your
                  budget, not a live spending meter.
                </small>
              </section>
            </div>
            <section className="panel">
              <div className="section-head">
                <h2>Connection readiness</h2>
                <span className="subtle">HONEST STATUS, ALWAYS</span>
              </div>
              <div className="connections">
                <div>
                  <span className="dot" />
                  <strong>Document library</strong>
                  <small>Available</small>
                </div>
                <div>
                  <span className="dot amber" />
                  <strong>AI writing</strong>
                  <small>Provider not connected</small>
                </div>
                <div>
                  <span className="dot amber" />
                  <strong>Portal submission</strong>
                  <small>Not enabled</small>
                </div>
                <div>
                  <span className="dot amber" />
                  <strong>Mailbox</strong>
                  <small>Not connected</small>
                </div>
              </div>
            </section>
          </>
        )}
        {page === "Documents" && (
          <>
            <section className="upload panel">
              <div>
                <span className="upload-icon">↑</span>
                <h2>Your resumes, together.</h2>
                <p>
                  Upload from this computer, then open the same workspace on
                  your other device.
                  <br />
                  Originals are preserved. Identical files are recognized
                  automatically.
                </p>
                <small>
                  PDF, DOCX or TXT · up to 10 MB each · text-based documents
                </small>
              </div>
              <label className="button">
                {busy ? "Uploading…" : "Choose documents"}
                <input
                  aria-label="Upload documents"
                  type="file"
                  multiple
                  accept=".pdf,.docx,.txt"
                  disabled={busy}
                  onChange={(e) => {
                    const files = Array.from(e.target.files || []);
                    void run(async () => {
                      for (const file of files) {
                        const form = new FormData();
                        form.append("file", file);
                        await api("/documents", "POST", form);
                      }
                    }, "Files uploaded. Text extraction runs in the background.");
                    e.target.value = "";
                  }}
                />
              </label>
            </section>
            <div className="section-head">
              <h2>
                Document library <span className="count">{docs.length}</span>
              </h2>
              <span className="subtle">ORIGINALS ARE NEVER OVERWRITTEN</span>
            </div>
            {!docs.length ? (
              <Empty
                title="A fresh start"
                text="Your uploaded resumes will appear here, with readable text and version history."
              />
            ) : (
              <div className="document-grid">
                {docs.map((d: any) => (
                  <article className="panel document" key={d.id}>
                    <div className="doc-top">
                      <span className="file-type">{d.kind.toUpperCase()}</span>
                      <Badge state={d.state} />
                    </div>
                    <h3>{d.filename}</h3>
                    <small>
                      {date(d.created_at)} · {Math.ceil(d.bytes / 1024)} KB ·{" "}
                      {d.imports} import{d.imports === 1 ? "" : "s"}
                    </small>
                    {d.error && <p className="error">{d.error}</p>}
                    <div className="actions">
                      <button
                        className="secondary"
                        onClick={() => setSelectedDoc(d)}
                      >
                        Read extracted text
                      </button>
                      <a href={"/api/documents/" + d.id + "/download"}>
                        Download ↗
                      </a>
                    </div>
                    {d.state === "needs_attention" && (
                      <button
                        className="text-button"
                        disabled={busy}
                        onClick={() =>
                          void run(
                            () =>
                              api("/documents/" + d.id + "/retry", "POST", {}),
                            "Extraction queued",
                          )
                        }
                      >
                        Retry extraction
                      </button>
                    )}
                  </article>
                ))}
              </div>
            )}
            {selectedDoc && (
              <section className="panel detail">
                <div className="section-head">
                  <h2>{selectedDoc.filename}</h2>
                  <button
                    className="secondary"
                    onClick={() => setSelectedDoc(null)}
                  >
                    Close
                  </button>
                </div>
                <p>
                  Extracted text is a source to review, not automatically
                  verified profile information.
                </p>
                <pre>
                  {docs.find((d: any) => d.id === selectedDoc.id)?.content ||
                    "No readable text is available yet."}
                </pre>
                <button onClick={() => setPage("Profile")}>
                  Confirm profile facts →
                </button>
              </section>
            )}
          </>
        )}
        {page === "Profile" && (
          <>
            <div className="info">
              Your confirmed facts are the source for application documents. New
              uploads never silently replace them. Retiring a fact invalidates
              existing unsent packets.
            </div>
            <div className="columns">
              <section className="panel">
                <h2>Add a confirmed fact</h2>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const form = e.currentTarget,
                      data = fields(e);
                    void run(async () => {
                      await api("/facts", "POST", {
                        ...data,
                        documentId: data.documentId || null,
                        quote: data.quote || null,
                        confirmed: data.confirmed === "on",
                      });
                      form.reset();
                    }, "Fact confirmed. Existing review packets will need a fresh draft.");
                  }}
                >
                  <label>
                    Category
                    <select name="category" aria-label="Category">
                      {[
                        "identity",
                        "summary",
                        "experience",
                        "project",
                        "education",
                        "skill",
                        "authorization",
                      ].map((v) => (
                        <option key={v}>{v}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Label
                    <input
                      name="label"
                      placeholder="e.g. University, project name, or technical skill"
                      required
                      maxLength={150}
                    />
                  </label>
                  <label>
                    Accurate details
                    <textarea
                      name="value"
                      placeholder="Describe only what you can support."
                      required
                      rows={4}
                      maxLength={3000}
                    />
                  </label>
                  <label>
                    Source document (optional)
                    <select name="documentId">
                      <option value="">I am confirming this directly</option>
                      {docs
                        .filter((d: any) => d.state === "ready")
                        .map((d: any) => (
                          <option key={d.id} value={d.id}>
                            {d.filename}
                          </option>
                        ))}
                    </select>
                  </label>
                  <label>
                    Exact supporting quote (required with a source)
                    <textarea
                      name="quote"
                      rows={2}
                      placeholder="Copy a passage from the extracted document text."
                    />
                  </label>
                  <label className="checkbox">
                    <input type="checkbox" name="confirmed" required />I confirm
                    these details are accurate.
                  </label>
                  <button disabled={busy}>Save confirmed fact</button>
                </form>
              </section>
              <section>
                <div className="section-head">
                  <h2>Verified profile</h2>
                  <span className="count">{facts.length}</span>
                </div>
                {facts.length ? (
                  facts.map((f: any) => (
                    <article className="panel fact" key={f.id}>
                      <span className="eyebrow">{f.category}</span>
                      <h3>{f.label}</h3>
                      <p>{f.value}</p>
                      <div className="section-head">
                        <small>
                          {f.document_id
                            ? "Linked to source evidence"
                            : "Confirmed directly by you"}
                        </small>
                        <button
                          className="text-button"
                          disabled={busy}
                          onClick={() =>
                            void run(
                              () => api("/facts/" + f.id, "DELETE"),
                              "Fact retired. Previous packets are now stale.",
                            )
                          }
                        >
                          Retire
                        </button>
                      </div>
                    </article>
                  ))
                ) : (
                  <Empty
                    title="Your story starts here"
                    text="Confirm your experience, education and skills. They will be reusable across your applications."
                  />
                )}
              </section>
            </div>
          </>
        )}
        {page === "Opportunities" && (
          <>
            <details className="panel">
              <summary>
                Add an opportunity or connect a company board <span>+</span>
              </summary>
              <div className="columns">
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const form = e.currentTarget,
                      data = fields(e);
                    void run(async () => {
                      await api("/jobs", "POST", data);
                      form.reset();
                    }, "Opportunity saved");
                  }}
                >
                  <h3>Save a job</h3>
                  {[
                    ["company", "Company"],
                    ["title", "Job title"],
                    ["location", "Work location"],
                    ["url", "HTTPS application URL"],
                  ].map(([name, label]) => (
                    <label key={name}>
                      {label}
                      <input
                        name={name}
                        required
                        type={name === "url" ? "url" : "text"}
                      />
                    </label>
                  ))}
                  <label>
                    Full job description
                    <textarea
                      name="description"
                      required
                      minLength={40}
                      rows={5}
                    />
                  </label>
                  <button disabled={busy}>Save opportunity</button>
                </form>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const form = e.currentTarget,
                      data = fields(e);
                    void run(async () => {
                      await api("/sources", "POST", data);
                      form.reset();
                    }, "Board added and scan queued");
                  }}
                >
                  <h3>Connect a public company board</h3>
                  <p>
                    Fetch published roles from a specific company. These feeds
                    do not search every employer.
                  </p>
                  <label>
                    Platform
                    <select name="provider">
                      <option value="greenhouse">Greenhouse</option>
                      <option value="lever">Lever</option>
                      <option value="ashby">Ashby</option>
                    </select>
                  </label>
                  <label>
                    Company name
                    <input name="company" required />
                  </label>
                  <label>
                    Board identifier
                    <input
                      name="board"
                      pattern="[a-zA-Z0-9_-]+"
                      placeholder="The company identifier in its board URL"
                      required
                    />
                  </label>
                  <button disabled={busy}>Connect and scan</button>
                </form>
              </div>
            </details>
            <div className="panel">
              <div className="section-head">
                <h2>Connected boards</h2>
                <button
                  className="secondary"
                  disabled={busy}
                  onClick={() =>
                    void run(
                      () =>
                        api("/settings/pause", "POST", {
                          paused: !state.settings.paused,
                        }),
                      "Scan schedule updated",
                    )
                  }
                >
                  {state.settings.paused
                    ? "Enable 6-hour scans"
                    : "Pause scheduled scans"}
                </button>
              </div>
              {state.sources.length ? (
                state.sources.map((s: any) => (
                  <div className="source" key={s.id}>
                    <div>
                      <strong>{s.company}</strong>
                      <small>
                        {s.provider} ·{" "}
                        {s.last_scan
                          ? "Last scan " + date(s.last_scan)
                          : "Waiting for first scan"}
                      </small>
                      {s.last_error && <p className="error">{s.last_error}</p>}
                    </div>
                    <button
                      className="secondary"
                      disabled={busy}
                      onClick={() =>
                        void run(
                          () => api("/sources/" + s.id + "/scan", "POST", {}),
                          "Scan queued",
                        )
                      }
                    >
                      Scan now
                    </button>
                  </div>
                ))
              ) : (
                <p>
                  No company boards connected yet. Add one above, or save an
                  individual job.
                </p>
              )}
            </div>
            <div className="section-head">
              <h2>
                Saved opportunities <span className="count">{jobs.length}</span>
              </h2>
              <input
                className="search"
                aria-label="Search opportunities"
                placeholder="Search roles or companies"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            {jobs.length ? (
              jobs
                .filter((j: any) =>
                  (j.title + " " + j.company + " " + j.location)
                    .toLowerCase()
                    .includes(query.toLowerCase()),
                )
                .map((j: any) => (
                  <article className="panel job" key={j.id}>
                    <div className="company-avatar">
                      {j.company.slice(0, 1)}
                    </div>
                    <div className="job-main">
                      <small>{j.company}</small>
                      <h3>{j.title}</h3>
                      <p>{j.location}</p>
                      {state.assessments?.find(
                        (a: any) => a.job_id === j.id,
                      ) && (
                        <small>
                          {state.assessments.find((a: any) => a.job_id === j.id)
                            .stale
                            ? "Assessment needs updating"
                            : `AI fit estimate: ${state.assessments.find((a: any) => a.job_id === j.id).output.score}/100`}
                        </small>
                      )}
                    </div>
                    <button
                      className="secondary"
                      disabled={
                        busy || !state.capabilities.aiConnected || !facts.length
                      }
                      title={
                        state.capabilities.aiConnected
                          ? "Compare with confirmed profile facts"
                          : "Connect the model provider before matching"
                      }
                      onClick={() =>
                        void run(
                          () => api("/jobs/" + j.id + "/assess", "POST", {}),
                          "Job assessment saved for review",
                        )
                      }
                    >
                      Assess fit
                    </button>
                    <button
                      className="secondary"
                      onClick={() => {
                        setSelectedJob(j);
                        const assessment = state.assessments?.find(
                          (a: any) => a.job_id === j.id && !a.stale,
                        );
                        setFactIds(
                          assessment
                            ? [
                                ...new Set([
                                  ...facts
                                    .filter(
                                      (f: any) => f.category === "identity",
                                    )
                                    .map((f: any) => f.id),
                                  ...assessment.output.recommendedFactIds,
                                ]),
                              ]
                            : facts.map((f: any) => f.id),
                        );
                      }}
                    >
                      Prepare packet →
                    </button>
                  </article>
                ))
            ) : (
              <Empty
                title="Make room for the right opportunity"
                text="Connect a company board or save a role with its full description. No invented match scores."
              />
            )}
            {selectedJob && (
              <section className="panel detail">
                <div className="section-head">
                  <h2>{selectedJob.title}</h2>
                  <button
                    className="secondary"
                    onClick={() => setSelectedJob(null)}
                  >
                    Close
                  </button>
                </div>
                <a href={selectedJob.url} target="_blank" rel="noreferrer">
                  View employer posting ↗
                </a>
                <details>
                  <summary>Read full description</summary>
                  <p className="preserve">{selectedJob.description}</p>
                </details>
                <h3>Select confirmed facts for this application</h3>
                {selectedAssessment && (
                  <div className="info">
                    {selectedAssessment.stale ? (
                      <p>
                        This assessment is stale because the job or profile
                        changed.
                      </p>
                    ) : (
                      <>
                        <strong>
                          AI fit estimate: {selectedAssessment.output.score}/100
                        </strong>
                        <p>{selectedAssessment.output.summary}</p>
                        <p className="caption">
                          This is a model estimate, not a hiring probability.
                          Work eligibility still requires review.
                        </p>
                        {selectedAssessment.output.matches.map(
                          (m: any, i: number) => (
                            <p key={"match-" + i}>
                              <strong>Relevant:</strong> “{m.requirementQuote}”
                              →{" "}
                              {facts.find((f: any) => f.id === m.factId)?.label}
                              . {m.reason}
                            </p>
                          ),
                        )}
                        {selectedAssessment.output.gaps.map(
                          (g: any, i: number) => (
                            <p key={"gap-" + i}>
                              <strong>Gap / unknown:</strong> “
                              {g.requirementQuote}” — {g.reason}
                            </p>
                          ),
                        )}
                        {selectedAssessment.output.warnings.map(
                          (w: string, i: number) => (
                            <p key={"warning-" + i}>{w}</p>
                          ),
                        )}
                      </>
                    )}
                  </div>
                )}
                {facts.map((f: any) => (
                  <label className="checkbox" key={f.id}>
                    <input
                      type="checkbox"
                      checked={factIds.includes(f.id)}
                      onChange={(e) =>
                        setFactIds(
                          e.target.checked
                            ? [...factIds, f.id]
                            : factIds.filter((id) => id !== f.id),
                        )
                      }
                    />
                    {f.label}: {f.value.slice(0, 120)}
                  </label>
                ))}
                {!facts.length && (
                  <p>
                    Add confirmed profile facts before preparing an application.
                  </p>
                )}
                <button
                  disabled={busy || !factIds.length}
                  onClick={() =>
                    void run(async () => {
                      await api(
                        "/jobs/" + selectedJob.id + "/packets",
                        "POST",
                        {
                          factIds,
                          note: "",
                          answers: [],
                          assessmentId:
                            selectedAssessment && !selectedAssessment.stale
                              ? selectedAssessment.id
                              : undefined,
                        },
                      );
                      setSelectedJob(null);
                      setPage("Review");
                    }, "Review packet prepared from your selected facts")
                  }
                >
                  Create review packet
                </button>
                <p className="caption">
                  This creates a document draft. It does not fill or submit the
                  employer’s form.
                </p>
              </section>
            )}
          </>
        )}
        {page === "Review" && (
          <>
            <div className="info">
              Approval saves the exact version you reviewed. Submission is not
              connected yet; approved packets stay here and are never counted as
              submitted.
            </div>
            {packets.length ? (
              packets.map((p: any) => (
                <article className="panel job" key={p.id}>
                  <div className="company-avatar">✓</div>
                  <div className="job-main">
                    <small>{p.company}</small>
                    <h3>{p.title}</h3>
                    <Badge state={p.state} />
                  </div>
                  <button
                    className="secondary"
                    onClick={() => setSelectedPacket(p)}
                  >
                    Inspect packet →
                  </button>
                </article>
              ))
            ) : (
              <Empty
                title="A second look, before the next step"
                text="Prepare a packet from an opportunity to review its exact facts and document."
              />
            )}
            {selectedPacket && (
              <section className="panel detail">
                <div className="section-head">
                  <h2>Review: {selectedPacket.title}</h2>
                  <button
                    className="secondary"
                    onClick={() => setSelectedPacket(null)}
                  >
                    Close
                  </button>
                </div>
                <a
                  className="button secondary"
                  target="_blank"
                  rel="noreferrer"
                  href={"/api/packets/" + selectedPacket.id + "/resume"}
                >
                  Open resume preview / print to PDF ↗
                </a>
                <p className="caption">
                  Authorization facts are shown below for review but are
                  excluded from the resume layout.
                </p>
                {selectedPacket.payload.assessment && (
                  <div className="info">
                    <strong>Preparation rationale</strong>
                    <p>{selectedPacket.payload.assessment.summary}</p>
                    <small>
                      The resume uses the selected confirmed facts verbatim. No
                      new experience is generated.
                    </small>
                  </div>
                )}
                {selectedPacket.payload.facts.map((f: any) => (
                  <div className="review-fact" key={f.id}>
                    <strong>{f.label}</strong>
                    <p>{f.value}</p>
                  </div>
                ))}
                <div className="info">
                  Portal-specific screening questions have not been collected.
                  This approves the saved draft only; it does not authorize
                  unseen answers.
                </div>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void run(async () => {
                      await api(
                        "/packets/" + selectedPacket.id + "/approve",
                        "POST",
                        { hash: selectedPacket.hash },
                      );
                      setSelectedPacket(null);
                    }, "Approved draft retained. No application has been submitted.");
                  }}
                >
                  <label className="checkbox">
                    <input type="checkbox" required />I reviewed these details
                    and the resume preview for accuracy.
                  </label>
                  <button disabled={busy || selectedPacket.state !== "review"}>
                    Approve this version
                  </button>
                </form>
              </section>
            )}
          </>
        )}
        {page === "Activity" && (
          <section className="panel">
            <div className="section-head">
              <h2>Workspace history</h2>
              <span className="subtle">LATEST 100 EVENTS</span>
            </div>
            {state.audit.length ? (
              state.audit.map((a: any) => (
                <div className="timeline" key={a.id}>
                  <span className="timeline-dot" />
                  <div>
                    <strong>{a.action.replaceAll("_", " ")}</strong>
                    <small>{a.entity_id}</small>
                  </div>
                  <time>{new Date(a.created_at).toLocaleString()}</time>
                </div>
              ))
            ) : (
              <Empty
                title="Your progress will live here"
                text="Uploads, confirmed facts, prepared packets and approvals create an audit trail."
              />
            )}
          </section>
        )}
        <footer>
          <span>CareerOps · Built around your next move.</span>
          <span>Version 0.1 · Review foundation</span>
        </footer>
      </main>
    </div>
  );
}
function Empty({ title, text }: { title: string; text: string }) {
  return (
    <div className="empty">
      <span>↗</span>
      <h3>{title}</h3>
      <p>{text}</p>
    </div>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
