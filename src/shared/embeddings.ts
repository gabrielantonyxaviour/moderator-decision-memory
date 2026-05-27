import type { DecisionRecord, MatchResult, QueueItem } from "./types";
import { itemTokenSet, scoreDecision } from "./memory";

export const EMBEDDING_MODEL = "text-embedding-3-small";

// Below this cosine similarity, a semantic hit is treated as noise and ignored.
export const SEMANTIC_THRESHOLD = 0.3;
// Max points a perfect semantic match contributes, comparable to a rule-tag hit (45).
export const SEMANTIC_WEIGHT = 55;

/** Text we embed for a stored decision: the durable, meaning-bearing fields. */
export function decisionEmbeddingText(decision: DecisionRecord): string {
  return [
    decision.ruleTag,
    decision.outcome,
    decision.summary,
    decision.keywords.join(" "),
  ]
    .filter(Boolean)
    .join(". ");
}

/** Text we embed for an incoming queue item to find similar past decisions. */
export function queryEmbeddingText(item: QueueItem): string {
  return [
    item.title,
    item.body,
    item.ruleSignals.join(" "),
    item.reports.join(" "),
  ]
    .filter(Boolean)
    .join(". ");
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length === 0 || a.length !== b.length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Rank precedents by combining the transparent deterministic score with
 * semantic similarity. When `queryEmbedding` is null or a decision lacks an
 * embedding, that decision falls back to deterministic-only scoring, so the
 * feature degrades gracefully and never blocks a match.
 */
export function hybridRank(
  item: QueueItem,
  decisions: DecisionRecord[],
  queryEmbedding: number[] | null,
  limit = 3,
): MatchResult[] {
  const itemTokens = itemTokenSet(item);
  return decisions
    .map((decision) => {
      const base = scoreDecision(item, decision, itemTokens);
      const result: MatchResult = {
        decision,
        score: base.score,
        reasons: [...base.reasons],
      };
      if (
        queryEmbedding &&
        decision.embedding &&
        decision.embedding.length === queryEmbedding.length
      ) {
        const sim = cosineSimilarity(queryEmbedding, decision.embedding);
        result.semantic = sim;
        if (sim >= SEMANTIC_THRESHOLD) {
          result.score += Math.round(sim * SEMANTIC_WEIGHT);
          result.reasons.push(
            `semantically similar: ${Math.round(sim * 100)}%`,
          );
        }
      }
      return result;
    })
    .filter((result) => result.score > 0)
    .sort(
      (a, b) =>
        b.score - a.score ||
        b.decision.createdAt.localeCompare(a.decision.createdAt),
    )
    .slice(0, limit);
}
