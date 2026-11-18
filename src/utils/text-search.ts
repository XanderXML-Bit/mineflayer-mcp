/**
 * Text Search Utilities
 *
 * Provides fuzzy matching and relevance scoring for skill/goal search.
 */

/**
 * Calculate Levenshtein edit distance between two strings
 */
export function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];

  // Initialize first column
  for (let i = 0; i <= a.length; i++) {
    matrix[i] = [i];
  }

  // Initialize first row
  for (let j = 0; j <= b.length; j++) {
    matrix[0][j] = j;
  }

  // Fill matrix
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1, // deletion
        matrix[i][j - 1] + 1, // insertion
        matrix[i - 1][j - 1] + cost // substitution
      );
    }
  }

  return matrix[a.length][b.length];
}

/**
 * Calculate similarity score (0-1) based on Levenshtein distance
 */
export function stringSimilarity(a: string, b: string): number {
  const aLower = a.toLowerCase();
  const bLower = b.toLowerCase();

  if (aLower === bLower) return 1;
  if (aLower.length === 0 || bLower.length === 0) return 0;

  const distance = levenshteinDistance(aLower, bLower);
  const maxLength = Math.max(aLower.length, bLower.length);

  return 1 - distance / maxLength;
}

/**
 * Check if a word fuzzy-matches another word
 */
export function fuzzyMatch(query: string, target: string, threshold = 0.7): boolean {
  const queryLower = query.toLowerCase();
  const targetLower = target.toLowerCase();

  // Exact match or contains
  if (targetLower.includes(queryLower) || queryLower.includes(targetLower)) {
    return true;
  }

  // Fuzzy match
  return stringSimilarity(queryLower, targetLower) >= threshold;
}

/**
 * Common Minecraft term synonyms for better search
 */
const MINECRAFT_SYNONYMS: Record<string, string[]> = {
  // Materials
  wood: ['log', 'oak', 'birch', 'spruce', 'jungle', 'acacia', 'dark_oak', 'planks', 'timber'],
  stone: ['cobblestone', 'cobble', 'rock'],
  iron: ['metal', 'ore'],
  diamond: ['gem', 'precious'],
  gold: ['golden', 'gilded'],

  // Actions
  mine: ['dig', 'excavate', 'gather', 'collect', 'harvest'],
  craft: ['make', 'create', 'build', 'construct'],
  smelt: ['cook', 'furnace', 'melt'],
  attack: ['fight', 'combat', 'kill', 'hit', 'strike'],
  hunt: ['kill', 'chase', 'attack'],

  // Items
  pickaxe: ['pick', 'mining tool'],
  sword: ['blade', 'weapon'],
  axe: ['hatchet'],
  armor: ['protection', 'gear', 'equipment'],
  food: ['eat', 'hunger', 'meal'],

  // Concepts
  safe: ['safety', 'protection', 'secure'],
  fast: ['quick', 'speed', 'efficient'],
  easy: ['simple', 'basic', 'beginner'],
};

/**
 * Expand a search query with synonyms
 */
export function expandWithSynonyms(query: string): string[] {
  const words = query.toLowerCase().split(/\s+/);
  const expanded = new Set<string>(words);

  for (const word of words) {
    // Check if word is a key
    if (MINECRAFT_SYNONYMS[word]) {
      for (const syn of MINECRAFT_SYNONYMS[word]) {
        expanded.add(syn);
      }
    }

    // Check if word is a value (reverse lookup)
    for (const [key, synonyms] of Object.entries(MINECRAFT_SYNONYMS)) {
      if (synonyms.includes(word)) {
        expanded.add(key);
        for (const syn of synonyms) {
          expanded.add(syn);
        }
      }
    }
  }

  return Array.from(expanded);
}

/**
 * Score a document against a query
 */
export interface SearchScore {
  /** Exact match score (0-1) */
  exactScore: number;
  /** Fuzzy match score (0-1) */
  fuzzyScore: number;
  /** Synonym match score (0-1) */
  synonymScore: number;
  /** Combined relevance score (0-1) */
  totalScore: number;
  /** Number of query terms matched */
  matchedTerms: number;
}

/**
 * Calculate relevance score for a document against a query
 */
export function calculateRelevance(
  query: string,
  document: {
    name: string;
    description: string;
    tags: string[];
    outcomes?: string[];
  }
): SearchScore {
  const queryWords = query.toLowerCase().split(/\s+/).filter(w => w.length > 1);
  const expandedQuery = expandWithSynonyms(query);

  // Build searchable text from document
  const nameText = document.name.toLowerCase();
  const descText = document.description.toLowerCase();
  const tagsText = document.tags.join(' ').toLowerCase();
  const outcomesText = (document.outcomes ?? []).join(' ').toLowerCase();
  const fullText = `${nameText} ${descText} ${tagsText} ${outcomesText}`;

  // Split document into words for fuzzy matching
  const docWords = fullText.split(/[\s_-]+/).filter(w => w.length > 1);

  let exactScore = 0;
  let fuzzyScore = 0;
  let synonymScore = 0;
  let matchedTerms = 0;

  for (const qWord of queryWords) {
    // Exact match in full text (fastest check first)
    if (fullText.includes(qWord)) {
      exactScore += 1;
      matchedTerms++;

      // Bonus for name match
      if (nameText.includes(qWord)) {
        exactScore += 0.5;
      }
      continue; // Skip fuzzy/synonym checks - exact match is best
    }

    // Fuzzy match against document words with early termination
    let bestFuzzy = 0;
    for (const dWord of docWords) {
      // Skip very short words and length mismatches > 3 chars (optimization)
      if (dWord.length < 2) continue;
      const lenDiff = Math.abs(qWord.length - dWord.length);
      if (lenDiff > 3) continue;

      const similarity = stringSimilarity(qWord, dWord);
      if (similarity > bestFuzzy && similarity >= 0.7) {
        bestFuzzy = similarity;
        // Early termination: if we found a near-perfect match, stop searching
        if (similarity >= 0.95) break;
      }
    }
    if (bestFuzzy > 0) {
      fuzzyScore += bestFuzzy;
      matchedTerms++;
      continue; // Skip synonym check - fuzzy match found
    }

    // Check expanded synonyms (only if no exact or fuzzy match)
    for (const synonym of expandedQuery) {
      if (synonym !== qWord && fullText.includes(synonym)) {
        synonymScore += 0.5;
        matchedTerms++;
        break;
      }
    }
  }

  // Normalize scores
  const numQueryWords = queryWords.length || 1;
  exactScore = exactScore / numQueryWords;
  fuzzyScore = fuzzyScore / numQueryWords;
  synonymScore = synonymScore / numQueryWords;

  // Calculate total with weights
  const totalScore = exactScore * 0.5 + fuzzyScore * 0.3 + synonymScore * 0.2;

  return {
    exactScore: Math.min(1, exactScore),
    fuzzyScore: Math.min(1, fuzzyScore),
    synonymScore: Math.min(1, synonymScore),
    totalScore: Math.min(1, totalScore),
    matchedTerms,
  };
}

/**
 * Search and rank documents by relevance
 */
export function searchAndRank<T extends { name: string; description: string; tags: string[]; outcomes?: string[] }>(
  query: string,
  documents: T[],
  options: {
    minScore?: number;
    limit?: number;
  } = {}
): Array<T & { relevance: SearchScore }> {
  const minScore = options.minScore ?? 0.1;

  const scored = documents
    .map(doc => ({
      ...doc,
      relevance: calculateRelevance(query, doc),
    }))
    .filter(doc => doc.relevance.totalScore >= minScore || doc.relevance.matchedTerms > 0);

  // Sort by total score descending
  scored.sort((a, b) => b.relevance.totalScore - a.relevance.totalScore);

  if (options.limit && options.limit > 0) {
    return scored.slice(0, options.limit);
  }

  return scored;
}
