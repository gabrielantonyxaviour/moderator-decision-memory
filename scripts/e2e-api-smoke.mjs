const module = await import("../dist/server/server/index.js");
const app = module.default?.default ?? module.default ?? module;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function json(response) {
  return response.json();
}

const validDecision = {
  thingId: "t3_e2e_smoke",
  thingType: "post",
  ruleTag: "legal-advice",
  outcome: "escalated",
  summary: "Escalated because the post asks for a legal outcome.",
  template: "A senior moderator will review this because it is close to our legal-advice rule.",
  keywords: "legal-advice jurisdiction process",
  retentionDays: 30,
};

const results = [];

const health = await app.request("http://localhost/api/health");
results.push({ name: "health", status: health.status, body: await json(health) });
assert(health.status === 200, "Health endpoint should return 200");

const demo = await app.request("http://localhost/api/demo-state");
const demoBody = await json(demo);
results.push({ name: "demo-state", status: demo.status, mode: demoBody.mode, queueItems: demoBody.queueItems?.length });
assert(demo.status === 200, "Demo state endpoint should return 200");
assert(demoBody.mode === "fixture-empty", "Demo state should honestly report fixture-empty outside Devvit runtime");

const invalid = await app.request("http://localhost/api/decisions", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({}),
});
results.push({ name: "invalid-decision", status: invalid.status, body: await json(invalid) });
assert(invalid.status === 400, "Invalid decisions should return 400");

const unavailableWrite = await app.request("http://localhost/api/decisions", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(validDecision),
});
const unavailableWriteBody = await json(unavailableWrite);
results.push({ name: "devvit-runtime-required-write", status: unavailableWrite.status, body: unavailableWriteBody });
assert(unavailableWrite.status === 503, "Writes outside Devvit runtime should return 503");
assert(
  unavailableWriteBody.detail.includes("Devvit Redis is unavailable"),
  "Write failure should explain Devvit Redis runtime dependency",
);

process.stdout.write(`${JSON.stringify({ status: "passed", results }, null, 2)}\n`);
