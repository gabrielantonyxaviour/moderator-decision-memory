import type {
  DecisionInput,
  DecisionOutcome,
  DecisionRecord,
  MatchResult,
  QueueItem,
} from "./types";

const OUTCOMES: DecisionOutcome[] = [
  "approved",
  "removed",
  "locked",
  "escalated",
  "needs-second-review",
];

export function normalizeToken(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function tokenizeText(value: string): string[] {
  return Array.from(
    new Set(
      value
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .map((token) => token.trim())
        .filter((token) => token.length > 2),
    ),
  );
}

export function coerceKeywords(value: string[] | string): string[] {
  const list = Array.isArray(value) ? value : value.split(/[,;\s]+/);
  return Array.from(new Set(list.map(normalizeToken).filter(Boolean))).slice(
    0,
    12,
  );
}

export function validateDecisionInput(input: DecisionInput): string[] {
  const errors: string[] = [];
  if (!input.thingId || input.thingId.length > 80)
    errors.push("thingId is required.");
  if (!["post", "comment"].includes(input.thingType))
    errors.push("thingType is invalid.");
  if (!input.ruleTag || input.ruleTag.length > 40)
    errors.push("ruleTag is required.");
  if (!OUTCOMES.includes(input.outcome)) errors.push("outcome is invalid.");
  if (!input.summary || input.summary.length > 320)
    errors.push("summary must be 1-320 characters.");
  if (!input.template || input.template.length > 420) {
    errors.push("template must be 1-420 characters.");
  }
  const days = input.retentionDays ?? 30;
  if (!Number.isFinite(days) || days < 1 || days > 365) {
    errors.push("retentionDays must be between 1 and 365.");
  }
  return errors;
}

export function createDecisionRecord(
  input: DecisionInput,
  now = new Date(),
): DecisionRecord {
  const errors = validateDecisionInput(input);
  if (errors.length > 0) throw new Error(errors.join(" "));

  const retentionDays = input.retentionDays ?? 30;
  const createdAt = now.toISOString();
  const expiresAt = new Date(
    now.getTime() + retentionDays * 24 * 60 * 60 * 1000,
  ).toISOString();
  const ruleTag = normalizeToken(input.ruleTag);
  const keywords = coerceKeywords(input.keywords);
  const source = input.source ?? "manual";
  const id = `${source}-${ruleTag}-${now.getTime().toString(36)}`;

  return {
    id,
    thingId: input.thingId,
    thingType: input.thingType,
    ruleTag,
    outcome: input.outcome,
    summary: input.summary.trim(),
    template: input.template.trim(),
    keywords,
    createdAt,
    expiresAt,
    actorLabel: input.actorLabel?.trim() || "mod-team",
    source,
  };
}

export function itemTokenSet(item: QueueItem): Set<string> {
  return new Set([
    ...tokenizeText(item.title),
    ...tokenizeText(item.body),
    ...item.reports.map(normalizeToken),
    ...item.ruleSignals.map(normalizeToken),
  ]);
}

export function scoreDecision(
  item: QueueItem,
  decision: DecisionRecord,
  itemTokens: Set<string> = itemTokenSet(item),
): { score: number; reasons: string[] } {
  const reasons: string[] = [];
  let score = 0;

  if (item.ruleSignals.map(normalizeToken).includes(decision.ruleTag)) {
    score += 45;
    reasons.push(`same rule tag: ${decision.ruleTag}`);
  }

  const keywordHits = decision.keywords.filter((keyword) =>
    itemTokens.has(keyword),
  );
  if (keywordHits.length > 0) {
    score += keywordHits.length * 12;
    reasons.push(`keyword overlap: ${keywordHits.slice(0, 3).join(", ")}`);
  }

  const reportHits = item.reports
    .map(normalizeToken)
    .filter((report) => decision.keywords.includes(report));
  if (reportHits.length > 0) {
    score += reportHits.length * 8;
    reasons.push(`same report family: ${reportHits[0]}`);
  }

  if (decision.thingType === item.thingType) {
    score += 4;
    reasons.push(`same target type: ${item.thingType}`);
  }

  return { score, reasons };
}

export function matchPrecedents(
  item: QueueItem,
  decisions: DecisionRecord[],
  limit = 3,
): MatchResult[] {
  const itemTokens = itemTokenSet(item);
  return decisions
    .map((decision) => ({
      decision,
      ...scoreDecision(item, decision, itemTokens),
    }))
    .filter((result) => result.score > 0)
    .sort(
      (a, b) =>
        b.score - a.score ||
        b.decision.createdAt.localeCompare(a.decision.createdAt),
    )
    .slice(0, limit);
}

export function cleanupExpired(
  decisions: DecisionRecord[],
  now = new Date(),
): { active: DecisionRecord[]; expired: DecisionRecord[] } {
  const active: DecisionRecord[] = [];
  const expired: DecisionRecord[] = [];
  decisions.forEach((decision) => {
    if (new Date(decision.expiresAt).getTime() <= now.getTime())
      expired.push(decision);
    else active.push(decision);
  });
  return { active, expired };
}
