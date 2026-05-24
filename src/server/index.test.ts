import { beforeEach, describe, expect, it, vi } from "vitest";
import { fixtureQueueItems } from "../shared/fixtures";

const devvitMocks = vi.hoisted(() => {
  const hashes = new Map<string, Map<string, string>>();
  const values = new Map<string, string>();

  return {
    redis: {
      async hGetAll(key: string) {
        return Object.fromEntries(hashes.get(key) ?? new Map<string, string>());
      },
      async hSet(key: string, entries: Record<string, string>) {
        const hash = hashes.get(key) ?? new Map<string, string>();
        Object.entries(entries).forEach(([field, value]) => hash.set(field, value));
        hashes.set(key, hash);
      },
      async hDel(key: string, fields: string | string[]) {
        const hash = hashes.get(key);
        if (!hash) return;
        const list = Array.isArray(fields) ? fields : [fields];
        list.forEach((field) => hash.delete(field));
      },
      async set(key: string, value: string) {
        values.set(key, value);
      },
    },
    scheduler: {
      runJob: vi.fn(async () => "test-retention-job"),
    },
    reset() {
      hashes.clear();
      values.clear();
      this.scheduler.runJob.mockClear();
    },
  };
});

vi.mock("@devvit/web/server", () => ({
  redis: devvitMocks.redis,
  scheduler: devvitMocks.scheduler,
}));

import app from "./index";

const validDecision = {
  thingId: "t3_api_test",
  thingType: "post",
  ruleTag: "legal-advice",
  outcome: "escalated",
  summary: "Escalated because the post asks for a legal outcome.",
  template: "A senior moderator will review this because it is close to our legal-advice rule.",
  keywords: "legal-advice jurisdiction process",
  retentionDays: 30,
};

describe("decision memory API", () => {
  beforeEach(() => {
    devvitMocks.reset();
  });

  it("reports health without touching Redis", async () => {
    const response = await app.request("http://localhost/api/health");

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      app: "moderator-decision-memory",
    });
  });

  it("returns 400 for invalid decision input instead of a server error", async () => {
    const response = await app.request("http://localhost/api/decisions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "Invalid decision input.",
    });
  });

  it("stores a decision and returns transparent matches through the API", async () => {
    const createResponse = await app.request("http://localhost/api/decisions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(validDecision),
    });

    expect(createResponse.status).toBe(201);

    const matchResponse = await app.request("http://localhost/api/match", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(fixtureQueueItems[0]),
    });

    expect(matchResponse.status).toBe(200);
    const body = (await matchResponse.json()) as { matches: Array<{ score: number; reasons: string[] }> };
    expect(body.matches[0].score).toBeGreaterThan(0);
    expect(body.matches[0].reasons.join(" ")).toContain("same rule tag");
  });

  it("can schedule retention cleanup from the moderator menu endpoint", async () => {
    const response = await app.request("http://localhost/internal/menu/schedule-retention-cleanup", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    });

    expect(response.status).toBe(200);
    expect(devvitMocks.scheduler.runJob).toHaveBeenCalledWith(
      expect.objectContaining({ name: "retention-cleanup" }),
    );
  });
});
