import { describe, expect, it } from "vitest";
import { cosineSimilarity, hybridRank } from "./embeddings";
import { matchPrecedents } from "./memory";
import type { DecisionRecord, QueueItem } from "./types";

const decision = (over: Partial<DecisionRecord>): DecisionRecord => ({
  id: "d",
  thingId: "t3_x",
  thingType: "post",
  ruleTag: "spam",
  outcome: "removed",
  summary: "summary",
  template: "template",
  keywords: [],
  createdAt: "2026-05-20T00:00:00.000Z",
  expiresAt: "2026-06-20T00:00:00.000Z",
  actorLabel: "mod",
  source: "manual",
  ...over,
});

const item: QueueItem = {
  id: "q",
  thingType: "post",
  title: "vote manipulation suspicion",
  body: "several accounts coordinating upvotes on a thread",
  authorLabel: "user",
  reports: [],
  ruleSignals: [],
  createdAt: "2026-05-21T00:00:00.000Z",
  source: "reddit",
};

describe("cosineSimilarity", () => {
  it("returns 1 for identical vectors", () => {
    expect(cosineSimilarity([1, 0, 0], [1, 0, 0])).toBeCloseTo(1);
  });
  it("returns 0 for orthogonal vectors", () => {
    expect(cosineSimilarity([1, 0, 0], [0, 1, 0])).toBeCloseTo(0);
  });
  it("returns 0 for length mismatch or empty input", () => {
    expect(cosineSimilarity([1, 0], [1, 0, 0])).toBe(0);
    expect(cosineSimilarity([], [])).toBe(0);
  });
});

describe("hybridRank", () => {
  it("surfaces a semantically similar precedent with no keyword overlap", () => {
    // "brigading" shares no keywords/ruleTag with the "vote manipulation" item,
    // but its embedding is identical to the query vector.
    const semantic = decision({
      id: "semantic",
      ruleTag: "brigading",
      keywords: ["brigading"],
      embedding: [1, 0, 0],
      createdAt: "2026-05-19T00:00:00.000Z",
    });
    const unrelated = decision({
      id: "unrelated",
      ruleTag: "flair",
      keywords: ["flair"],
      embedding: [0, 1, 0],
    });

    const results = hybridRank(item, [semantic, unrelated], [1, 0, 0], 3);

    expect(results[0].decision.id).toBe("semantic");
    expect(results[0].reasons.join(" ")).toContain("semantically similar");
    expect(results[0].semantic).toBeCloseTo(1);
  });

  it("falls back to deterministic-only scoring when no query embedding", () => {
    const d = decision({ id: "d1", keywords: ["spam"], embedding: [1, 0, 0] });
    const hybrid = hybridRank(item, [d], null, 3).map((r) => ({
      id: r.decision.id,
      score: r.score,
    }));
    const deterministic = matchPrecedents(item, [d], 3).map((r) => ({
      id: r.decision.id,
      score: r.score,
    }));
    expect(hybrid).toEqual(deterministic);
  });
});
