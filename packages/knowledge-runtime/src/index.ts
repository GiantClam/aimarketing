export interface KnowledgeChunk { readonly id: string; readonly documentPath: string; readonly heading?: string; readonly text: string; readonly hash: string; readonly lineStart?: number; readonly lineEnd?: number; readonly tags?: readonly string[]; readonly links?: readonly string[]; }
export interface KnowledgeCitation { readonly chunkId: string; readonly documentPath: string; readonly heading?: string; readonly excerpt: string; readonly score: number; readonly lineStart?: number; readonly lineEnd?: number; }
export interface EmbeddingPort { readonly dimensions: number; embed(text: string, signal?: AbortSignal): Promise<readonly number[]>; }
export interface VectorStorePort { upsert(chunks: readonly KnowledgeChunk[], vectors: readonly (readonly number[])[]): Promise<void>; search(vector: readonly number[], limit: number): Promise<readonly { chunkId: string; score: number }[]>; }

export class HybridKnowledgeRetriever {
  constructor(private readonly vector?: { readonly embedder: EmbeddingPort; readonly store: VectorStorePort }) {}

  async retrieve(chunks: readonly KnowledgeChunk[], query: string, limit = 8, signal?: AbortSignal): Promise<KnowledgeCitation[]> {
    const lexical = lexicalSearch(chunks, query, limit * 2);
    if (!this.vector) return lexical.slice(0, limit).map(toCitation);
    const vector = await this.vector.embedder.embed(query, signal);
    const matches = await this.vector.store.search(vector, limit * 2);
    const byId = new Map(chunks.map((chunk) => [chunk.id, chunk]));
    const merged = new Map<string, number>();
    lexical.forEach((item) => merged.set(item.chunk.id, Math.max(merged.get(item.chunk.id) ?? 0, item.score * 0.4)));
    matches.forEach((item) => merged.set(item.chunkId, Math.max(merged.get(item.chunkId) ?? 0, item.score * 0.6)));
    return [...merged.entries()].map(([chunkId, score]) => ({ chunk: byId.get(chunkId), score })).filter((item): item is { chunk: KnowledgeChunk; score: number } => Boolean(item.chunk)).sort((a, b) => b.score - a.score || a.chunk.id.localeCompare(b.chunk.id)).slice(0, limit).map((item) => toCitation({ chunk: item.chunk, score: item.score }));
  }
}

function lexicalSearch(chunks: readonly KnowledgeChunk[], query: string, limit: number) {
  const terms = query.toLocaleLowerCase().split(/\s+/u).filter(Boolean);
  return chunks.map((chunk) => {
    const searchable = [chunk.documentPath, chunk.heading, ...(chunk.tags ?? []), ...(chunk.links ?? []), chunk.text].filter((value): value is string => typeof value === "string" && value.length > 0).join("\n").toLocaleLowerCase();
    return { chunk, score: terms.reduce((score, term) => score + (searchable.includes(term) ? 1 : 0), 0) };
  }).filter((item) => item.score > 0).sort((a, b) => b.score - a.score || a.chunk.id.localeCompare(b.chunk.id)).slice(0, limit);
}

function toCitation(item: { chunk: KnowledgeChunk; score: number }): KnowledgeCitation {
  return { chunkId: item.chunk.id, documentPath: item.chunk.documentPath, ...(item.chunk.heading ? { heading: item.chunk.heading } : {}), excerpt: item.chunk.text.slice(0, 500), score: item.score, ...(item.chunk.lineStart === undefined ? {} : { lineStart: item.chunk.lineStart }), ...(item.chunk.lineEnd === undefined ? {} : { lineEnd: item.chunk.lineEnd }) };
}
