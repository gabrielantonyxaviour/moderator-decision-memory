import { describe, expect, it } from "vitest";
import { fixtureDecisions, fixtureQueueItems } from "./fixtures";
import {
  cleanupExpired,
  createDecisionRecord,
  matchPrecedents,
} from "./memory";

describe("decision memory matching", () => {
  it("surfaces transparent precedents for a borderline legal item", () => {
    const matches = matchPrecedents(fixtureQueueItems[0], fixtureDecisions, 3);

    expect(matches).toHaveLength(3);
    expect(matches[0].decision.ruleTag).toBe("legal-advice");
    expect(matches[0].reasons.join(" ")).toContain("same rule tag");
  });

  it("validates and creates a retention-aware manual decision", () => {
    const now = new Date("2026-05-21T00:00:00.000Z");
    const record = createDecisionRecord(
      {
        thingId: "t3_new",
        thingType: "post",
        ruleTag: "Legal Advice",
        outcome: "escalated",
        summary: "Needs a senior mod because the rule boundary is unclear.",
        template:
          "A senior moderator will review this because it is close to our legal-advice rule.",
        keywords: "legal advice boundary senior",
        retentionDays: 10,
      },
      now,
    );

    expect(record.ruleTag).toBe("legal-advice");
    expect(record.keywords).toContain("boundary");
    expect(record.expiresAt).toBe("2026-05-31T00:00:00.000Z");
  });

  it("separates expired records for scheduler cleanup", () => {
    const { active, expired } = cleanupExpired(
      fixtureDecisions,
      new Date("2026-07-01T00:00:00.000Z"),
    );

    expect(active).toHaveLength(0);
    expect(expired.length).toBeGreaterThan(0);
  });
});
