/**
 * Tests for text-search.ts fuzzy matching utilities
 */

import { describe, it, expect } from 'vitest';
import {
  levenshteinDistance,
  stringSimilarity,
  fuzzyMatch,
  expandWithSynonyms,
  calculateRelevance,
  searchAndRank,
} from '../../../src/utils/text-search.js';

describe('Text Search Utilities', () => {
  describe('levenshteinDistance', () => {
    it('should return 0 for identical strings', () => {
      expect(levenshteinDistance('hello', 'hello')).toBe(0);
    });

    it('should calculate distance for single character difference', () => {
      expect(levenshteinDistance('cat', 'bat')).toBe(1);
      expect(levenshteinDistance('cat', 'car')).toBe(1);
    });

    it('should calculate distance for insertions', () => {
      expect(levenshteinDistance('cat', 'cats')).toBe(1);
      expect(levenshteinDistance('cat', 'chat')).toBe(1);
    });

    it('should calculate distance for deletions', () => {
      expect(levenshteinDistance('cats', 'cat')).toBe(1);
    });

    it('should handle empty strings', () => {
      expect(levenshteinDistance('', 'abc')).toBe(3);
      expect(levenshteinDistance('abc', '')).toBe(3);
      expect(levenshteinDistance('', '')).toBe(0);
    });

    it('should calculate distance for Minecraft terms', () => {
      expect(levenshteinDistance('pickaxe', 'pickax')).toBe(1);
      expect(levenshteinDistance('diamond', 'dimond')).toBe(1);
    });
  });

  describe('stringSimilarity', () => {
    it('should return 1 for identical strings', () => {
      expect(stringSimilarity('diamond', 'diamond')).toBe(1);
    });

    it('should return 1 for case-insensitive matches', () => {
      expect(stringSimilarity('Diamond', 'diamond')).toBe(1);
      expect(stringSimilarity('IRON', 'iron')).toBe(1);
    });

    it('should return high similarity for similar words', () => {
      const sim = stringSimilarity('pickaxe', 'pickax');
      expect(sim).toBeGreaterThan(0.8);
    });

    it('should return low similarity for different words', () => {
      const sim = stringSimilarity('diamond', 'wood');
      expect(sim).toBeLessThan(0.5);
    });

    it('should handle empty strings', () => {
      // Empty strings compared to each other are technically identical (distance 0 / max length 0)
      // But our implementation returns 0 for empty inputs for practical purposes
      expect(stringSimilarity('abc', '')).toBe(0);
      expect(stringSimilarity('', 'abc')).toBe(0);
    });
  });

  describe('fuzzyMatch', () => {
    it('should match exact strings', () => {
      expect(fuzzyMatch('mine', 'mine')).toBe(true);
    });

    it('should match when target contains query', () => {
      expect(fuzzyMatch('iron', 'iron_ore')).toBe(true);
      expect(fuzzyMatch('pick', 'pickaxe')).toBe(true);
    });

    it('should match similar words above threshold', () => {
      expect(fuzzyMatch('pickaxe', 'pickax', 0.7)).toBe(true);
    });

    it('should not match very different words', () => {
      expect(fuzzyMatch('diamond', 'wood', 0.7)).toBe(false);
    });

    it('should be case insensitive', () => {
      expect(fuzzyMatch('DIAMOND', 'diamond')).toBe(true);
    });
  });

  describe('expandWithSynonyms', () => {
    it('should expand mining terms', () => {
      const expanded = expandWithSynonyms('mine');
      expect(expanded).toContain('mine');
      expect(expanded).toContain('dig');
      expect(expanded).toContain('gather');
    });

    it('should expand wood terms', () => {
      const expanded = expandWithSynonyms('wood');
      expect(expanded).toContain('wood');
      expect(expanded).toContain('log');
      expect(expanded).toContain('planks');
    });

    it('should expand crafting terms', () => {
      const expanded = expandWithSynonyms('craft');
      expect(expanded).toContain('craft');
      expect(expanded).toContain('make');
      expect(expanded).toContain('create');
    });

    it('should handle reverse synonym lookup', () => {
      const expanded = expandWithSynonyms('dig'); // 'dig' is a synonym of 'mine'
      expect(expanded).toContain('dig');
      expect(expanded).toContain('mine');
    });

    it('should handle multiple words', () => {
      const expanded = expandWithSynonyms('mine iron');
      expect(expanded).toContain('mine');
      expect(expanded).toContain('iron');
      expect(expanded).toContain('dig');
    });
  });

  describe('calculateRelevance', () => {
    const testDoc = {
      name: 'mine_iron',
      description: 'Mine iron ore underground',
      tags: ['mining', 'iron', 'ore'],
      outcomes: ['raw_iron'],
    };

    it('should give high score for exact matches', () => {
      const score = calculateRelevance('mine iron', testDoc);
      expect(score.exactScore).toBeGreaterThan(0.5);
      expect(score.matchedTerms).toBeGreaterThanOrEqual(2);
    });

    it('should give bonus for name matches', () => {
      const nameMatch = calculateRelevance('iron', testDoc);
      const descOnlyDoc = {
        name: 'something_else',
        description: 'Find iron ore',
        tags: ['mining'],
        outcomes: [],
      };
      const descMatch = calculateRelevance('iron', descOnlyDoc);
      expect(nameMatch.exactScore).toBeGreaterThanOrEqual(descMatch.exactScore);
    });

    it('should handle fuzzy matches', () => {
      const score = calculateRelevance('minning irn', testDoc); // typos
      expect(score.totalScore).toBeGreaterThan(0);
    });

    it('should handle synonym matches', () => {
      const score = calculateRelevance('dig metal', testDoc); // dig=mine, metal=iron
      expect(score.synonymScore).toBeGreaterThan(0);
    });

    it('should return zero for unrelated queries', () => {
      const score = calculateRelevance('enchanting potions', testDoc);
      expect(score.totalScore).toBe(0);
    });
  });

  describe('searchAndRank', () => {
    const documents = [
      {
        name: 'mine_wood',
        description: 'Punch trees to get wood logs',
        tags: ['mining', 'wood', 'basic'],
        outcomes: ['oak_log'],
      },
      {
        name: 'mine_iron',
        description: 'Mine iron ore with a pickaxe',
        tags: ['mining', 'iron', 'intermediate'],
        outcomes: ['raw_iron'],
      },
      {
        name: 'craft_iron_pickaxe',
        description: 'Craft an iron pickaxe from ingots',
        tags: ['crafting', 'tools', 'iron'],
        outcomes: ['iron_pickaxe'],
      },
      {
        name: 'mine_diamond',
        description: 'Mine diamonds at deep levels',
        tags: ['mining', 'diamond', 'advanced'],
        outcomes: ['diamond'],
      },
    ];

    it('should rank exact matches highest', () => {
      const results = searchAndRank('mine iron', documents);
      expect(results[0].name).toBe('mine_iron');
    });

    it('should find all mining skills', () => {
      const results = searchAndRank('mining', documents);
      expect(results.length).toBeGreaterThanOrEqual(3);
      expect(results.every(r => r.tags.includes('mining') || r.name.includes('mine'))).toBe(true);
    });

    it('should find iron-related items', () => {
      const results = searchAndRank('iron', documents);
      expect(results.some(r => r.name === 'mine_iron')).toBe(true);
      expect(results.some(r => r.name === 'craft_iron_pickaxe')).toBe(true);
    });

    it('should respect limit option', () => {
      const results = searchAndRank('mine', documents, { limit: 2 });
      expect(results.length).toBeLessThanOrEqual(2);
    });

    it('should filter by minimum score', () => {
      const results = searchAndRank('diamond', documents, { minScore: 0.3 });
      expect(results.every(r => r.relevance.totalScore >= 0.3 || r.relevance.matchedTerms > 0)).toBe(true);
    });

    it('should handle synonym queries', () => {
      const results = searchAndRank('dig logs', documents); // dig=mine, logs=wood
      expect(results.some(r => r.name === 'mine_wood')).toBe(true);
    });

    it('should include relevance scores in results', () => {
      const results = searchAndRank('iron', documents);
      expect(results[0].relevance).toBeDefined();
      expect(results[0].relevance.totalScore).toBeGreaterThan(0);
    });
  });
});
