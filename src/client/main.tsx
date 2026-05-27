import React from "react";
import { createRoot } from "react-dom/client";
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardCopy,
  Clock3,
  Database,
  GitBranch,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import {
  fixtureDecisions,
  fixtureQueueItems,
  fixtureRetention,
} from "../shared/fixtures";
import { createDecisionRecord, matchPrecedents } from "../shared/memory";
import type {
  DecisionOutcome,
  DecisionRecord,
  MatchResult,
} from "../shared/types";
import "./styles.css";

const STORAGE_KEY = "mdm-decisions-v1";

function loadDecisions(): DecisionRecord[] {
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (!stored) return fixtureDecisions;
  try {
    const parsed = JSON.parse(stored) as DecisionRecord[];
    return parsed.length > 0 ? parsed : fixtureDecisions;
  } catch {
    return fixtureDecisions;
  }
}

function outcomeLabel(outcome: DecisionOutcome): string {
  return outcome.replace(/-/g, " ");
}

function App() {
  const [queueId, setQueueId] = React.useState(fixtureQueueItems[0].id);
  const [decisions, setDecisions] =
    React.useState<DecisionRecord[]>(loadDecisions);
  const [copied, setCopied] = React.useState("");
  const [actionStatus, setActionStatus] = React.useState("");
  const [formError, setFormError] = React.useState("");
  const [form, setForm] = React.useState({
    ruleTag: "legal-advice",
    outcome: "escalated" as DecisionOutcome,
    summary:
      "Escalated because the post asks for a legal outcome but can be reframed as a process question.",
    template:
      "A senior moderator will review this because it is close to our legal-advice boundary. Please keep the question process-focused.",
    keywords: "legal-advice jurisdiction workplace process",
  });

  const activeItem =
    fixtureQueueItems.find((item) => item.id === queueId) ??
    fixtureQueueItems[0];
  const [matches, setMatches] = React.useState<MatchResult[]>(() =>
    matchPrecedents(activeItem, decisions, 3),
  );
  const [refreshKey, setRefreshKey] = React.useState(0);

  React.useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(decisions));
  }, [decisions]);

  // Show deterministic matches instantly, then upgrade to the server's
  // semantic (embedding-backed) ranking when running live inside Devvit.
  // Any fetch failure (e.g. the offline Vite preview) keeps the local result.
  React.useEffect(() => {
    setMatches(matchPrecedents(activeItem, decisions, 3));
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/match", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(activeItem),
        });
        if (!res.ok) return;
        const data = (await res.json()) as { matches?: MatchResult[] };
        if (
          !cancelled &&
          Array.isArray(data.matches) &&
          data.matches.length > 0
        ) {
          setMatches(data.matches);
        }
      } catch {
        /* offline preview: keep the local deterministic matches */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeItem, decisions, refreshKey]);

  function captureDecision(event: React.FormEvent) {
    event.preventDefault();
    setFormError("");
    const input = {
      thingId: activeItem.id,
      thingType: activeItem.thingType,
      ruleTag: form.ruleTag,
      outcome: form.outcome,
      summary: form.summary,
      template: form.template,
      keywords: form.keywords,
      retentionDays: fixtureRetention.days,
      actorLabel: "demo-mod",
      source: "manual" as const,
    };
    let record: DecisionRecord;
    try {
      record = createDecisionRecord(input);
    } catch (error) {
      setFormError(
        error instanceof Error ? error.message : "Decision could not be saved.",
      );
      return;
    }
    setDecisions((current) => [record, ...current]);
    setActionStatus("Decision saved to local demo memory.");
    // When live inside Devvit, also persist to Redis with a semantic
    // embedding, then re-run the match so the new precedent is searchable.
    void (async () => {
      try {
        const res = await fetch("/api/decisions", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(input),
        });
        if (res.ok) {
          setActionStatus(
            "Decision saved to Redis with a semantic embedding for similarity search.",
          );
          setRefreshKey((key) => key + 1);
        }
      } catch {
        /* offline preview: local memory only */
      }
    })();
  }

  async function copyTemplate(record: DecisionRecord) {
    try {
      await navigator.clipboard.writeText(record.template);
      setCopied(record.id);
      setActionStatus("Template copied to clipboard.");
      window.setTimeout(() => setCopied(""), 1500);
    } catch {
      setActionStatus(
        "Clipboard is unavailable in this browser. Select the template text from the card.",
      );
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
        <div className="nav-links">
          <a href="#workflow">Workflow</a>
          <a href="#capture">Capture</a>
          <a href="#integration">Devvit</a>
        </div>
        <span className="status-pill">
          <Database size={14} /> Fixture demo data
        </span>
      </nav>

      <section className="hero" id="workflow">
        <div className="hero-copy">
          <span className="eyebrow">
            <Sparkles size={15} /> Devvit mod tool
          </span>
          <h1>Mods need precedent, not another classifier.</h1>
          <p>
            A retention-aware memory layer for rule-heavy communities. Capture
            why a borderline item was handled a certain way, then surface
            similar decisions for the next moderator.
          </p>
          <div className="hero-actions">
            <a className="primary-action" href="#capture">
              <Plus size={17} /> Capture decision
            </a>
            <a className="secondary-action" href="#integration">
              <GitBranch size={17} /> View Devvit path
            </a>
          </div>
        </div>

        <div className="pipeline" aria-label="Decision memory pipeline">
          <div className="pipeline-node source">
            <Search size={22} />
            <span>Queue item</span>
          </div>
          <div className="pipeline-line">
            <span />
          </div>
          <div className="pipeline-core">
            <div className="core-pulse" />
            <ShieldCheck size={34} />
            <strong>Rule memory</strong>
          </div>
          <div className="pipeline-line">
            <span />
          </div>
          <div className="pipeline-node destination">
            <ClipboardCopy size={22} />
            <span>Precedents</span>
          </div>
        </div>
      </section>

      <section
        className="workspace"
        aria-label="Moderator decision memory workspace"
      >
        <aside className="queue-panel">
          <div className="section-heading">
            <span>Pending review</span>
            <small>{fixtureQueueItems.length} demo items</small>
          </div>
          {fixtureQueueItems.map((item) => (
            <button
              key={item.id}
              className={`queue-item ${item.id === activeItem.id ? "active" : ""}`}
              onClick={() => setQueueId(item.id)}
              type="button"
            >
              <span className="queue-type">{item.thingType}</span>
              <strong>{item.title}</strong>
              <em>{item.reports.join(" / ")}</em>
            </button>
          ))}
        </aside>

        <section className="review-panel" id="capture">
          <div className="section-heading">
            <span>Borderline item</span>
            <small>{activeItem.source} source</small>
          </div>
          <article className="active-item">
            <div>
              <span className="queue-type">{activeItem.thingType}</span>
              <h2>{activeItem.title}</h2>
              <p>{activeItem.body}</p>
            </div>
            <div className="signals">
              {activeItem.ruleSignals.map((signal) => (
                <span key={signal}>{signal}</span>
              ))}
            </div>
          </article>

          <form className="capture-form" onSubmit={captureDecision} noValidate>
            <div className="form-row">
              <label>
                Rule tag
                <input
                  required
                  maxLength={40}
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
              Decision summary
              <textarea
                required
                maxLength={320}
                value={form.summary}
                onChange={(e) => setForm({ ...form, summary: e.target.value })}
              />
            </label>
            <label>
              Explanation template
              <textarea
                required
                maxLength={420}
                value={form.template}
                onChange={(e) => setForm({ ...form, template: e.target.value })}
              />
            </label>
            <label>
              Match keywords
              <input
                required
                value={form.keywords}
                onChange={(e) => setForm({ ...form, keywords: e.target.value })}
              />
            </label>
            <button className="submit-button" type="submit">
              <Plus size={17} /> Save to memory
            </button>
            <div className="form-feedback" aria-live="polite">
              {formError ? (
                <span className="feedback-error">{formError}</span>
              ) : (
                actionStatus
              )}
            </div>
          </form>
        </section>

        <aside className="precedent-panel">
          <div className="section-heading">
            <span>Matched precedents</span>
            <small>{matches.length} shown</small>
          </div>
          {matches.map(({ decision, score, reasons }) => (
            <article className="precedent-card" key={decision.id}>
              <div className="precedent-top">
                <span className={`outcome outcome-${decision.outcome}`}>
                  {outcomeLabel(decision.outcome)}
                </span>
                <strong>{score}</strong>
              </div>
              <h3>{decision.ruleTag}</h3>
              <p>{decision.summary}</p>
              <div className="reason-list">
                {reasons.map((reason) => (
                  <span key={reason}>{reason}</span>
                ))}
              </div>
              <button
                className="copy-button"
                type="button"
                onClick={() => copyTemplate(decision)}
              >
                {copied === decision.id ? (
                  <CheckCircle2 size={16} />
                ) : (
                  <ClipboardCopy size={16} />
                )}
                {copied === decision.id ? "Copied" : "Copy template"}
              </button>
            </article>
          ))}
        </aside>
      </section>

      <section className="integration" id="integration">
        <div>
          <span className="eyebrow">
            <Clock3 size={15} /> Real Devvit path
          </span>
          <h2>
            Manual capture first. Optional mod-action ingestion after proof.
          </h2>
          <p>
            The app is designed around Devvit menu actions, forms, Redis, and
            scheduler cleanup. `onModAction` is implemented as a conservative
            optional path, not a demo dependency.
          </p>
        </div>
        <div className="integration-grid">
          <Fact
            icon={<ShieldCheck />}
            label="Moderator control"
            value="Advisory precedents only"
          />
          <Fact
            icon={<Database />}
            label="Storage"
            value="Redis per installation"
          />
          <Fact
            icon={<Clock3 />}
            label="Retention"
            value={`${fixtureRetention.days} day default cleanup`}
          />
          <Fact
            icon={<AlertTriangle />}
            label="Privacy"
            value="No raw removed-content import"
          />
        </div>
      </section>
    </main>
  );
}

function Fact({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="fact">
      <span>{icon}</span>
      <small>{label}</small>
      <strong>{value}</strong>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
