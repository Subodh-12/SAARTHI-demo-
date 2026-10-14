// Offline retrieval — local BM25-ish + glossary expansion over the
// installed pack. Used when network is OFFLINE; the doubt branch falls
// back to extractive answers from these chunks (no model required).

interface Chunk { chunk_id: string; concept_id: string; chapter_id: string; text_or: string; source_ref: string; glossary_refs?: string[]; }
interface GlossaryEntry { term_or: string; term_en: string; definition_or: string; definition_en: string; }

function tokenize(text: string): string[] {
  return text.toLowerCase().split(/[\s।,.!?;:()\[\]{}"']+/).filter(Boolean);
}

export interface OfflineRetrievedChunk {
  chunk_id: string; concept_id: string; chapter_id: string;
  text_or: string; source_ref: string; score: number; matched_terms: string[];
}

export function offlineRetrieve(
  query: string, chunks: Chunk[], glossary: GlossaryEntry[],
  topK: number = 5,
): OfflineRetrievedChunk[] {
  const qTokens = new Set(tokenize(query));
  // Glossary expansion
  const extraTerms: string[] = [];
  for (const g of glossary) {
    if (query.toLowerCase().includes(g.term_en.toLowerCase())) extraTerms.push(g.term_or);
    if (query.includes(g.term_or)) extraTerms.push(g.term_en.toLowerCase());
  }
  for (const t of extraTerms) qTokens.add(t);
  if (qTokens.size === 0) return [];
  // Compute simple TF-IDF-ish overlap score
  const results: OfflineRetrievedChunk[] = [];
  for (const c of chunks) {
    const cTokens = tokenize(c.text_or);
    let hits = 0;
    const matched: string[] = [];
    for (const t of cTokens) {
      if (qTokens.has(t)) {
        hits++;
        if (!matched.includes(t)) matched.push(t);
      }
    }
    if (hits === 0) continue;
    const score = hits / Math.sqrt(cTokens.length);
    results.push({
      chunk_id: c.chunk_id, concept_id: c.concept_id, chapter_id: c.chapter_id,
      text_or: c.text_or, source_ref: c.source_ref,
      score, matched_terms: matched,
    });
  }
  results.sort((a, b) => b.score - a.score);
  return results.slice(0, topK);
}
