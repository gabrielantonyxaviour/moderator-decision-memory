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
  const [lastAction, setLastAction] = React.useState("");
  const [totalRecorded, setTotalRecorded] = React.useState(0);
  const [queueSource, setQueueSource] = React.useState<
    "reported" | "recent" | "none"
  >("none");
  const [form, setForm] = React.useState({
    ruleTag: "",
    outcome: "needs-second-review" as DecisionOutcome,
    summary: "",
    template: "",
  });

  const activeItem = queue.find((q) => q.id === selectedId) ?? null;
  const hasReasoning = form.summary.trim().length > 0;

  // Auto-fill rule tag from reports when selecting a new item.
  React.useEffect(() => {
    if (activeItem) {
      setForm((f) => ({
        ...f,
        ruleTag:
          activeItem.reports[0]?.toLowerCase().replace(/\s+/g, "-") ||
          f.ruleTag,
        outcome: "needs-second-review",
        summary: "",
        template: "",
      }));
    }
  }, [activeItem?.id]);

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

  // Fetch precedents for the selected item.
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
    setLastAction("");
    const decision = hasReasoning
      ? {
          thingId: activeItem.id,
          thingType: activeItem.thingType,
          ruleTag:
            form.ruleTag || (action === "remove" ? "removed" : "approved"),
          outcome: form.outcome,
          summary: form.summary,
          template: form.template || form.summary,
          keywords: form.ruleTag,
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
        setLastAction(data.error ?? "Action failed.");
        return;
      }
      const verb = action === "approve" ? "Approved" : "Removed";
      setLastAction(
        decision
          ? `${verb} and recorded — your reasoning is now a precedent for the team.`
          : `${verb} — no reasoning recorded (the team won't see why).`,
      );
      if (decision) setTotalRecorded((n) => n + 1);
      setQueue((q) => q.filter((it) => it.id !== activeItem.id));
      setSelectedId(null);
      setForm({
        ruleTag: "",
        outcome: "needs-second-review",
        summary: "",
        template: "",
      });
    } catch {
      setLastAction(
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
    } catch {}
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
          <span className="live-dot" />
          {live ? "Live" : "Connect inside a subreddit"}
          {totalRecorded > 0 && <> · {totalRecorded} recorded</>}
        </span>
      </nav>

      <section className="workspace" aria-label="Moderator decision memory">
        {/* ── Left: queue ── */}
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
            <div className="empty-state">Loading…</div>
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
                onClick={() => {
                  setSelectedId(item.id);
                  setLastAction("");
                }}
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

        {/* ── Center: review + record + act ── */}
        <section className="review-panel">
          {lastAction && !activeItem && (
            <div
              className={`action-banner ${lastAction.includes("recorded") ? "success" : ""}`}
            >
              <CheckCircle2 size={16} /> {lastAction}
            </div>
          )}

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

              {/* Reasoning form ABOVE the action buttons — the natural flow:
                  read item → record your reasoning → choose action.
                  Action buttons adapt: "Approve + Record" when reasoning is filled. */}
              <form
                className="capture-form"
                onSubmit={(e) => e.preventDefault()}
                noValidate
              >
                <div className="form-caption">
                  <ShieldCheck size={13} /> Record your reasoning — becomes a
                  precedent for the next mod
                </div>
                <div className="form-row">
                  <label>
                    Rule tag
                    <input
                      maxLength={40}
                      placeholder="e.g. vote-manipulation, spam"
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
                  Why this call was made
                  <textarea
                    maxLength={320}
                    placeholder="The next moderator who sees a case like this will read your reasoning."
                    value={form.summary}
                    onChange={(e) =>
                      setForm({ ...form, summary: e.target.value })
                    }
                  />
                </label>
                <label>
                  Reusable reply to the user
                  <textarea
                    maxLength={420}
                    placeholder="A message the team can copy-paste for this kind of case."
                    value={form.template}
                    onChange={(e) =>
                      setForm({ ...form, template: e.target.value })
                    }
                  />
                </label>
              </form>

              <div className="action-row">
                <button
                  className="approve-action"
                  type="button"
                  disabled={busy !== ""}
                  onClick={() => act("approve")}
                >
                  <Check size={17} />
                  {busy === "approve"
                    ? "Approving…"
                    : hasReasoning
                      ? "Approve + Record"
                      : "Approve"}
                </button>
                <button
                  className="remove-action"
                  type="button"
                  disabled={busy !== ""}
                  onClick={() => act("remove")}
                >
                  <Trash2 size={17} />
                  {busy === "remove"
                    ? "Removing…"
                    : hasReasoning
                      ? "Remove + Record"
                      : "Remove"}
                </button>
              </div>
              {!hasReasoning && (
                <div className="form-hint">
                  Fill in your reasoning above to save this decision as a
                  precedent for the team.
                </div>
              )}
              {lastAction && (
                <div className="form-feedback" aria-live="polite">
                  {lastAction}
                </div>
              )}
            </>
          ) : (
            <div className="empty-state tall">
              <ShieldCheck size={30} />
              <strong>
                {queue.length ? "Select an item to review" : "Queue is clear"}
              </strong>
              <p>
                {queue.length
                  ? "Pick something from the queue. You'll see how your team handled similar cases on the right."
                  : "When items hit your mod queue, they appear here with matching precedents."}
              </p>
            </div>
          )}
        </section>

        {/* ── Right: precedents ── */}
        <aside className="precedent-panel">
          <div className="section-heading">
            <span>Similar past decisions</span>
            <small>{matching ? "…" : `${matches.length} found`}</small>
          </div>
          {!activeItem ? (
            <div className="empty-state">
              <Sparkles size={20} />
              <strong>Team memory</strong>
              <p>
                Every decision you record builds the team's memory. When a
                similar case arrives, the tool surfaces past reasoning — even
                when worded differently — so the team stays consistent.
              </p>
            </div>
          ) : matches.length === 0 ? (
            <div className="empty-state">
              {matching ? (
                "Searching memory…"
              ) : (
                <>
                  <strong>No precedents yet</strong>
                  <p>
                    {totalRecorded === 0
                      ? "Record your reasoning on the left when you approve or remove a post. Your first decision becomes the first precedent."
                      : "No similar decisions found for this item. Different topics won't match — that's by design."}
                  </p>
                </>
              )}
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
                        {Math.round(match.semantic * 100)}% match
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
