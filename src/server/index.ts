import { Hono } from "hono";
import {
  context,
  createServer,
  getServerPort,
  redis,
  reddit,
  scheduler,
} from "@devvit/web/server";
import { getRequestListener } from "@hono/node-server";
import type {
  MenuItemRequest,
  TriggerResponse,
  UiResponse,
} from "@devvit/web/shared";
import type { TaskRequest, TaskResponse } from "@devvit/web/server";
import {
  cleanupExpired,
  createDecisionRecord,
  matchPrecedents,
} from "../shared/memory";
import {
  decisionEmbeddingText,
  hybridRank,
  queryEmbeddingText,
} from "../shared/embeddings";
import { fetchEmbedding } from "./embeddings";
import { fixtureQueueItems } from "../shared/fixtures";
import type { DecisionInput, DecisionRecord, QueueItem } from "../shared/types";

type CaptureFormRequest = DecisionInput & { retentionDays?: number };

const app = new Hono();
const DECISION_HASH = "decisions:index";
const RETENTION_AUDIT = "audit:retention";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown error.";
}

function storageErrorMessage(error: unknown): string {
  const message = errorMessage(error);
  if (message.includes("Devvit config is not available")) {
    return "Devvit Redis is unavailable outside an initialized Devvit runtime.";
  }
  return message;
}

function parseStoredDecision(value: unknown): DecisionRecord | null {
  if (typeof value !== "string") return null;
  try {
    return JSON.parse(value) as DecisionRecord;
  } catch {
    return null;
  }
}

async function listDecisions(): Promise<DecisionRecord[]> {
  const stored = await redis.hGetAll(DECISION_HASH);
  return Object.values(stored ?? {})
    .map(parseStoredDecision)
    .filter((record): record is DecisionRecord => record !== null)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

async function saveDecision(record: DecisionRecord): Promise<void> {
  await redis.hSet(DECISION_HASH, { [record.id]: JSON.stringify(record) });
  await redis.hSet(`rule:${record.ruleTag}:decisions`, {
    [record.id]: record.createdAt,
  });
}

// Attach a semantic embedding to a decision before storage. Fails soft:
// if embeddings are unavailable the record is stored without one and the
// matcher transparently falls back to deterministic scoring for it.
async function withEmbedding(record: DecisionRecord): Promise<DecisionRecord> {
  const embedding = await fetchEmbedding(decisionEmbeddingText(record));
  return embedding ? { ...record, embedding } : record;
}

function queueFromRequest(input: Partial<MenuItemRequest>): QueueItem {
  const targetId = input.targetId ?? "unknown-target";
  return {
    id: targetId,
    thingType: input.location === "comment" ? "comment" : "post",
    title: "Current Reddit item",
    body: "Open the dashboard for full context. This menu response stores the target id for matching.",
    authorLabel: "reddit-user",
    reports: [],
    ruleSignals: [],
    createdAt: new Date().toISOString(),
    source: "reddit",
  };
}

type QueueThing = {
  id: string;
  title?: string;
  body?: string;
  authorName?: string;
  createdAt?: Date;
  userReportReasons?: string[];
  modReportReasons?: string[];
};

// Map a real Reddit mod-queue Post/Comment into the QueueItem shape the
// matcher and UI use. No fixtures: title/body/author/reports are live.
function queueItemFromThing(thing: QueueThing): QueueItem {
  const isComment = thing.id.startsWith("t1_");
  const reports = Array.from(
    new Set(
      [
        ...(thing.userReportReasons ?? []),
        ...(thing.modReportReasons ?? []),
      ].filter((r): r is string => Boolean(r)),
    ),
  );
  const author = thing.authorName ?? "unknown";
  return {
    id: thing.id,
    thingType: isComment ? "comment" : "post",
    title: isComment
      ? `Comment by u/${author}`
      : thing.title || "(untitled post)",
    body: thing.body ?? "",
    authorLabel: author,
    reports,
    ruleSignals: [],
    createdAt: (thing.createdAt ?? new Date()).toISOString(),
    source: "reddit",
  };
}

app.get("/api/queue", async (c) => {
  const subredditName = context.subredditName;
  if (!subredditName) {
    return c.json({
      items: [],
      source: "none",
      error: "No subreddit context.",
    });
  }
  try {
    const queueListing = await reddit.getModQueue({
      subreddit: subredditName,
      type: "all",
      limit: 25,
    });
    const queueThings = (await queueListing.all()) as QueueThing[];
    if (queueThings.length > 0) {
      return c.json({
        items: queueThings.map(queueItemFromThing),
        source: "reported",
        subreddit: subredditName,
      });
    }
    // No reported items — show recent posts for proactive review.
    const newListing = await reddit.getNewPosts({
      subredditName,
      limit: 15,
    });
    const newThings = (await newListing.all()) as QueueThing[];
    return c.json({
      items: newThings
        .filter((t) => !t.title?.startsWith("Decision Memory"))
        .map(queueItemFromThing),
      source: "recent",
      subreddit: subredditName,
    });
  } catch (error) {
    return c.json({ items: [], source: "error", error: errorMessage(error) });
  }
});

app.post("/api/act", async (c) => {
  const { thingId, action, decision } = await c.req.json<{
    thingId: string;
    action: "approve" | "remove";
    decision?: CaptureFormRequest;
  }>();

  try {
    if (action === "approve") {
      await reddit.approve(thingId as `t1_${string}` | `t3_${string}`);
    } else if (action === "remove") {
      await reddit.remove(thingId as `t1_${string}` | `t3_${string}`, false);
    } else {
      return c.json({ error: "Unknown action." }, 400);
    }
  } catch (error) {
    return c.json(
      { error: `Reddit action failed: ${errorMessage(error)}` },
      502,
    );
  }

  let record: DecisionRecord | undefined;
  if (decision) {
    try {
      record = createDecisionRecord({ ...decision, thingId, source: "manual" });
      await saveDecision(await withEmbedding(record));
    } catch (error) {
      return c.json({
        ok: true,
        actioned: action,
        recordError: errorMessage(error),
      });
    }
  }
  return c.json({ ok: true, actioned: action, record });
});

app.get("/api/health", (c) =>
  c.json({ ok: true, app: "moderator-decision-memory" }),
);

app.get("/api/demo-state", async (c) => {
  const decisions = await listDecisions().catch(() => []);
  return c.json({
    queueItems: fixtureQueueItems,
    decisions,
    mode: decisions.length > 0 ? "redis" : "fixture-empty",
  });
});

app.post("/api/decisions", async (c) => {
  const input = await c.req.json<CaptureFormRequest>();
  let record: DecisionRecord;
  try {
    record = createDecisionRecord(input);
  } catch (error) {
    return c.json(
      { error: "Invalid decision input.", detail: errorMessage(error) },
      400,
    );
  }

  try {
    await saveDecision(await withEmbedding(record));
  } catch (error) {
    return c.json(
      {
        error: "Decision storage unavailable.",
        detail: storageErrorMessage(error),
      },
      503,
    );
  }

  return c.json({ record }, 201);
});

app.post("/api/match", async (c) => {
  const item = await c.req.json<QueueItem>();
  let decisions: DecisionRecord[];
  try {
    decisions = await listDecisions();
  } catch (error) {
    return c.json(
      {
        error: "Decision storage unavailable.",
        detail: storageErrorMessage(error),
      },
      503,
    );
  }

  const queryEmbedding = await fetchEmbedding(queryEmbeddingText(item));
  return c.json({ matches: hybridRank(item, decisions, queryEmbedding, 3) });
});

app.post("/internal/menu/capture-decision", async (c) => {
  const input = await c.req.json<MenuItemRequest>();
  const target = queueFromRequest(input);

  return c.json<UiResponse>({
    showForm: {
      name: "decisionCapture",
      form: {
        title: "Capture decision memory",
        description: "Save a rule-tagged precedent for future moderators.",
        acceptLabel: "Save memory",
        cancelLabel: "Cancel",
        fields: [
          { type: "string", name: "thingId", label: "Reddit thing id" },
          {
            type: "string",
            name: "thingType",
            label: "Target type: post or comment",
          },
          { type: "string", name: "ruleTag", label: "Rule tag" },
          { type: "string", name: "outcome", label: "Outcome" },
          { type: "paragraph", name: "summary", label: "Decision summary" },
          {
            type: "paragraph",
            name: "template",
            label: "Reusable explanation template",
          },
          {
            type: "string",
            name: "keywords",
            label: "Match keywords, comma separated",
          },
          { type: "number", name: "retentionDays", label: "Retention days" },
        ],
      },
      data: {
        thingId: target.id,
        thingType: target.thingType,
        ruleTag: target.ruleSignals[0] ?? "manual-review",
        outcome: "needs-second-review",
        retentionDays: 30,
      },
    },
  });
});

app.post("/internal/form/capture-decision-submit", async (c) => {
  const input = await c.req.json<CaptureFormRequest>();
  let record: DecisionRecord;
  try {
    record = createDecisionRecord({
      ...input,
      keywords: input.keywords || input.ruleTag,
      actorLabel: input.actorLabel || "mod-team",
      source: "manual",
    });
    await saveDecision(await withEmbedding(record));
  } catch (error) {
    return c.json<UiResponse>({
      showToast: {
        text: `Decision memory was not saved: ${storageErrorMessage(error)}`,
        appearance: "neutral",
      },
    });
  }

  return c.json<UiResponse>({
    showToast: {
      text: "Decision memory saved for future precedent lookup.",
      appearance: "success",
    },
  });
});

app.post("/internal/menu/show-precedents", async (c) => {
  const input = await c.req.json<MenuItemRequest>();
  const item = queueFromRequest(input);
  const matches = matchPrecedents(item, await listDecisions(), 3);
  return c.json<UiResponse>({
    showToast: {
      text: matches.length
        ? `${matches.length} precedent memories found. Open the app dashboard for details.`
        : "No precedent memories yet. Capture one from the menu first.",
      appearance: matches.length ? "success" : "neutral",
    },
  });
});

app.post("/internal/triggers/mod-action", async (c) => {
  try {
    const payload = await c.req.json<Record<string, unknown>>();
    const action = String(payload.action ?? payload.type ?? "mod-action");
    const targetId = String(
      payload.targetId ??
        payload.postId ??
        payload.commentId ??
        `mod-action-${Date.now()}`,
    );
    const record = createDecisionRecord({
      thingId: targetId,
      thingType: targetId.startsWith("t1_") ? "comment" : "post",
      ruleTag: action,
      outcome: action.includes("approve") ? "approved" : "needs-second-review",
      summary: `Captured platform mod action "${action}" for later moderator review.`,
      template:
        "Review this automatically captured action and add the team's reusable explanation.",
      keywords: [action, "mod-action"],
      actorLabel: "platform-trigger",
      retentionDays: 30,
      source: "onModAction",
    });
    await saveDecision(await withEmbedding(record));
  } catch (error) {
    console.error(
      "mod-action trigger could not persist decision:",
      storageErrorMessage(error),
    );
  }
  return c.json<TriggerResponse>({ status: "ok" });
});

app.post("/internal/scheduler/retention-cleanup", async (c) => {
  const _input = await c.req.json<TaskRequest>();
  const decisions = await listDecisions();
  const { active, expired } = cleanupExpired(decisions);
  if (expired.length > 0) {
    await redis.hDel(
      DECISION_HASH,
      expired.map((record) => record.id),
    );
  }
  await redis.set(
    RETENTION_AUDIT,
    JSON.stringify({
      at: new Date().toISOString(),
      active: active.length,
      expired: expired.length,
    }),
  );
  return c.json<TaskResponse>({ status: "ok" });
});

app.post("/internal/menu/schedule-retention-cleanup", async (c) => {
  const jobId = await scheduler.runJob({
    name: "retention-cleanup",
    runAt: new Date(Date.now() + 60_000),
    data: { requestedBy: "moderator-menu" },
  });
  return c.json<UiResponse>({
    showToast: {
      text: `Retention cleanup scheduled: ${jobId}`,
      appearance: "success",
    },
  });
});

app.post("/internal/menu/create-post", async (c) => {
  try {
    const post = await reddit.submitCustomPost({
      title: "Decision Memory — moderator precedent board",
    });
    return c.json<UiResponse>({
      navigateTo: post.url,
      showToast: {
        text: "Decision Memory board created.",
        appearance: "success",
      },
    });
  } catch (error) {
    return c.json<UiResponse>({
      showToast: {
        text: `Could not create board: ${storageErrorMessage(error)}`,
        appearance: "neutral",
      },
    });
  }
});

// Devvit's createServer expects a Node request listener; bridge Hono's
// fetch handler and listen on the port Devvit assigns. Without this the
// app server never starts and every endpoint returns "fetch failed".
const server = createServer(getRequestListener(app.fetch));
server.listen(getServerPort());

export default app;
