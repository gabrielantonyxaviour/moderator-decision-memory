import { settings } from "@devvit/web/server";
import { EMBEDDING_MODEL } from "../shared/embeddings";

async function getApiKey(): Promise<string | null> {
  try {
    const key = await settings.get("openaiApiKey");
    return typeof key === "string" && key.trim().length > 0 ? key.trim() : null;
  } catch {
    return null;
  }
}

/**
 * Returns an embedding vector for `text`, or null if embeddings are
 * unavailable (no API key configured, network error, or bad response).
 * Callers must treat null as "fall back to deterministic matching".
 */
export async function fetchEmbedding(text: string): Promise<number[] | null> {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const apiKey = await getApiKey();
  if (!apiKey) return null;

  try {
    const res = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        input: trimmed.slice(0, 8000),
        model: EMBEDDING_MODEL,
      }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      data?: Array<{ embedding?: number[] }>;
    };
    const embedding = data.data?.[0]?.embedding;
    return Array.isArray(embedding) ? embedding : null;
  } catch {
    return null;
  }
}

export async function semanticConfigured(): Promise<boolean> {
  return (await getApiKey()) !== null;
}
