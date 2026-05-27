import React from "react";
import { createRoot } from "react-dom/client";
import {
  Check,
  CheckCircle2,
  ClipboardCopy,
  Inbox,
  ShieldCheck,
  Sparkles,
  Trash2,
} from "lucide-react";
import type { DecisionOutcome, MatchResult, QueueItem } from "../shared/types";
import "./styles.css";

function outcomeLabel(outcome: DecisionOutcome): string {
  return outcome.replace(/-/g, " ");
}

type Busy = "" | "approve" | "remove";

function App() {
  const [queue, setQueue] = React.useState<QueueItem[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [live, setLive] = React.useState(false);
  const [notice, setNotice] = React.useState("");
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [matches, setMatches] = React.useState<MatchResult[]>([]);
  const [matching, setMatching] = React.useState(false);
  const [busy, setBusy] = React.useState<Busy>("");
  const [copied, setCopied] = React.useState("");
  const [status, setStatus] = React.useState("");
  const [form, setForm] = React.useState({
    ruleTag: "",
    outcome: "removed" as DecisionOutcome,
    summary: "",
    template: "",
    keywords: "",
  });

  const activeItem = queue.find((q) => q.id === selectedId) ?? null;

  const [queueSource, setQueueSource] = React.useState<
    "reported" | "recent" | "none"
  >("none");

  const loadQueue = React.useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/queue");
      const data = (await res.json()) as {
        items?: QueueItem[];
        source?: string;
        error?: string;
      };
      const items = Array.isArray(data.items) ? data.items : [];
      setQueue(items);
      setLive(true);
      setQueueSource(
        (data.source as "reported" | "recent") ||
          (items.length ? "recent" : "none"),
      );
      setNotice(data.error ?? "");
      setSelectedId((prev) => prev ?? items[0]?.id ?? null);
    } catch {
      setLive(false);
      setNotice(
        "Live mod queue loads when this app runs inside your subreddit.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void loadQueue();
  }, [loadQueue]);

  React.useEffect(() => {
    if (!activeItem) {
      setMatches([]);
      return;
    }
    let cancelled = false;
    setMatching(true);
    (async () => {
      try {
        const res = await fetch("/api/match", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(activeItem),
        });
        if (!res.ok) return;
        const data = (await res.json()) as { matches?: MatchResult[] };
        if (!cancelled && Array.isArray(data.matches)) setMatches(data.matches);
      } catch {
        if (!cancelled) setMatches([]);
      } finally {
        if (!cancelled) setMatching(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeItem]);

  async function act(action: "approve" | "remove") {
    if (!activeItem || busy) return;
    setBusy(action);
    setStatus("");
    const recordWhy = form.summary.trim();
    const decision = recordWhy
      ? {
          thingId: activeItem.id,
          thingType: activeItem.thingType,
          ruleTag:
            form.ruleTag || (action === "remove" ? "removed" : "approved"),
          outcome: form.outcome,
          summary: form.summary,
          template: form.template || form.summary,
          keywords: form.keywords || form.ruleTag,
          retentionDays: 90,
          actorLabel: "mod",
        }
      : undefined;
    try {
      const res = await fetch("/api/act", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ thingId: activeItem.id, action, decision }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setStatus(data.error ?? "Action failed.");
        return;
      }
      setStatus(
        `${action === "approve" ? "Approved" : "Removed"} u/${activeItem.authorLabel}'s ${activeItem.thingType}${decision ? " · decision recorded for the team" : ""}.`,
      );
      setQueue((q) => q.filter((it) => it.id !== activeItem.id));
      setSelectedId(null);
      setForm((f) => ({
        ...f,
        ruleTag: "",
        summary: "",
        template: "",
        keywords: "",
      }));
    } catch {
      setStatus(
        "Could not reach Reddit. Is the app installed with moderator permissions?",
      );
    } finally {
      setBusy("");
    }
  }

  async function copyTemplate(match: MatchResult) {
    try {
      await navigator.clipboard.writeText(match.decision.template);
      setCopied(match.decision.id);
      window.setTimeout(() => setCopied(""), 1500);
    } catch {
      setStatus("Clipboard unavailable — select the template text manually.");
    }
  }

  return (
    <main className="app-shell">
      <nav className="topbar" aria-label="Product">
        <div className="brand-lockup">
          <span className="brand-mark">
            <ShieldCheck size={18} />
          </span>
          <span>Decision Memory</span>
        </div>
        <span className={`status-pill ${live ? "live" : ""}`}>
          <span className="live-dot" />{" "}
          {live ? "Live mod queue" : "Connect inside a subreddit"}
        </span>
      </nav>

      <section className="workspace" aria-label="Moderator decision memory">
        <aside className="queue-panel">
          <div className="section-heading">
            <span>
              {queueSource === "reported"
                ? "Reported"
                : queueSource === "recent"
                  ? "Recent posts"
                  : "Mod queue"}
            </span>
            <small>
              {loading
                ? "…"
                : `${queue.length} ${queueSource === "reported" ? "in queue" : "to review"}`}
            </small>
          </div>
          {loading ? (
            <div className="empty-state">Loading your mod queue…</div>
          ) : queue.length === 0 ? (
            <div className="empty-state">
              <Inbox size={26} />
              <strong>Queue is clear</strong>
              <p>{notice || "Nothing is awaiting review right now."}</p>
            </div>
          ) : (
            queue.map((item) => (
              <button
                key={item.id}
                className={`queue-item ${item.id === activeItem?.id ? "active" : ""}`}
                onClick={() => setSelectedId(item.id)}
                type="button"
              >
                <span className="queue-type">{item.thingType}</span>
                <strong>{item.title}</strong>
                <em>
                  {item.reports.length
                    ? item.reports.join(" / ")
                    : `u/${item.authorLabel}`}
                </em>
              </button>
            ))
          )}
        </aside>

        <section className="review-panel">
          {activeItem ? (
            <>
              <div className="section-heading">
                <span>Reviewing</span>
                <small>u/{activeItem.authorLabel}</small>
              </div>
              <article className="active-item">
                <div>
                  <span className="queue-type">{activeItem.thingType}</span>
                  <h2>{activeItem.title}</h2>
                  <p>{activeItem.body || "(no body text)"}</p>
                </div>
                {activeItem.reports.length > 0 && (
                  <div className="signals">
                    {activeItem.reports.map((r) => (
                      <span key={r}>{r}</span>
                    ))}
                  </div>
                )}
              </article>

              <div className="action-row">
                <button
                  className="approve-action"
                  type="button"
                  disabled={busy !== ""}
                  onClick={() => act("approve")}
                >
                  <Check size={17} />{" "}
                  {busy === "approve" ? "Approving…" : "Approve"}
                </button>
                <button
                  className="remove-action"
                  type="button"
                  disabled={busy !== ""}
                  onClick={() => act("remove")}
                >
                  <Trash2 size={17} />{" "}
                  {busy === "remove" ? "Removing…" : "Remove"}
                </button>
              </div>

              <form
                className="capture-form"
                onSubmit={(e) => e.preventDefault()}
                noValidate
              >
                <div className="form-caption">
                  Record why (optional) — becomes a precedent for the next mod
                </div>
                <div className="form-row">
                  <label>
                    Rule tag
                    <input
                      maxLength={40}
                      placeholder="e.g. spam, brigading, civility"
                      value={form.ruleTag}
                      onChange={(e) =>
                        setForm({ ...form, ruleTag: e.target.value })
                      }
                    />
                  </label>
                  <label>
                    Outcome
                    <select
                      value={form.outcome}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          outcome: e.target.value as DecisionOutcome,
                        })
                      }
                    >
                      <option value="approved">Approved</option>
                      <option value="removed">Removed</option>
                      <option value="locked">Locked</option>
                      <option value="escalated">Escalated</option>
                      <option value="needs-second-review">
                        Needs second review
                      </option>
                    </select>
                  </label>
                </div>
                <label>
                  Reasoning
                  <textarea
                    maxLength={320}
                    placeholder="Why this call was made — the next mod sees this."
                    value={form.summary}
                    onChange={(e) =>
                      setForm({ ...form, summary: e.target.value })
                    }
                  />
                </label>
                <label>
                  Reusable reply template
                  <textarea
                    maxLength={420}
                    placeholder="A message the team can reuse for this kind of case."
                    value={form.template}
                    onChange={(e) =>
                      setForm({ ...form, template: e.target.value })
                    }
                  />
                </label>
                <div className="form-feedback" aria-live="polite">
                  {status}
                </div>
              </form>
            </>
          ) : (
            <div className="empty-state tall">
              <ShieldCheck size={30} />
              <strong>
                {queue.length
                  ? "Select an item to review"
                  : status || "No item selected"}
              </strong>
              <p>
                {queue.length
                  ? "Pick something from the queue to see how your team handled similar cases."
                  : "When items hit your mod queue, they appear here with matching precedents."}
              </p>
            </div>
          )}
        </section>

        <aside className="precedent-panel">
          <div className="section-heading">
            <span>Similar past decisions</span>
            <small>{matching ? "…" : `${matches.length} found`}</small>
          </div>
          {!activeItem ? (
            <div className="empty-state">Select an item to see precedents.</div>
          ) : matches.length === 0 ? (
            <div className="empty-state">
              {matching
                ? "Searching memory…"
                : "No matching precedents yet. Your decisions build this."}
            </div>
          ) : (
            matches.map((match) => (
              <article className="precedent-card" key={match.decision.id}>
                <div className="precedent-top">
                  <span className={`outcome outcome-${match.decision.outcome}`}>
                    {outcomeLabel(match.decision.outcome)}
                  </span>
                  {typeof match.semantic === "number" &&
                    match.semantic >= 0.3 && (
                      <span className="semantic-tag">
                        <Sparkles size={11} />{" "}
                        {Math.round(match.semantic * 100)}%
                      </span>
                    )}
                </div>
                <h3>{match.decision.ruleTag}</h3>
                <p>{match.decision.summary}</p>
                <div className="reason-list">
                  {match.reasons.map((reason) => (
                    <span key={reason}>{reason}</span>
                  ))}
                </div>
                <button
                  className="copy-button"
                  type="button"
                  onClick={() => copyTemplate(match)}
                >
                  {copied === match.decision.id ? (
                    <CheckCircle2 size={16} />
                  ) : (
                    <ClipboardCopy size={16} />
                  )}
                  {copied === match.decision.id
                    ? "Copied"
                    : "Copy reply template"}
                </button>
              </article>
            ))
          )}
        </aside>
      </section>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
