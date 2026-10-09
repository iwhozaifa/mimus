// Keywords for ilike filters. PostgREST's or() syntax treats , ( ) " as
// structure and ilike treats % _ \ as wildcards, so those are stripped
// rather than escaped -- search quality doesn't depend on them.
export function searchWords(query: string | undefined, maxWords = 5): string[] {
  if (!query) return [];
  return query
    .replace(/[%_,()"'\\*:]/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length >= 2)
    .slice(0, maxWords);
}
