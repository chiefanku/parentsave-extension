/**
 * Recall Checker Unit Tests
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// Mock fetch
global.fetch = jest.fn();

import { RecallChecker, CHILD_CATEGORIES, CPSC_API_URL } from '../lib/recalls.js';

describe('RecallChecker', () => {
  let checker;

  beforeEach(() => {
    checker = new RecallChecker();
    jest.clearAllMocks();
    fetch.mockReset();
  });

  describe('checkProduct', () => {
    it('should return null for empty product info', async () => {
      const result = await checker.checkProduct(null);
      expect(result).toBeNull();
    });

    it('should check cache first', async () => {
      // Add to cache
      checker.recallCache.set('test-asin', {
        recall: { id: '1', title: 'Test Recall' },
        timestamp: Date.now(),
      });

      const result = await checker.checkProduct({ asin: 'test-asin' });

      expect(result).toEqual({ id: '1', title: 'Test Recall' });
    });
  });

  describe('findMatchingRecall', () => {
    const sampleRecalls = [
      {
        recallId: '24-001',
        title: 'Baby Sleep Positioner Recall',
        description: 'Recalled due to suffocation hazard',
        hazard: 'Suffocation',
        upcs: ['123456789012'],
      },
      {
        recallId: '24-002',
        title: 'Wooden Teething Toy Recall',
        description: 'Small parts can detach causing choking hazard',
        hazard: 'Choking',
        products: 'Wooden teething rings, rattles',
      },
    ];

    it('should find recall by UPC match', () => {
      const result = checker.findMatchingRecall(sampleRecalls, {
        upc: '123456789012',
      });

      expect(result.id).toBe('24-001');
    });

    it('should return null when no match found', () => {
      const result = checker.findMatchingRecall(sampleRecalls, {
        title: 'Completely Different Product',
        brand: 'Unknown',
      });

      expect(result).toBeNull();
    });

    it('should return null for empty recalls array', () => {
      const result = checker.findMatchingRecall([], {
        title: 'Test Product',
      });

      expect(result).toBeNull();
    });
  });

  describe('formatRecall', () => {
    it('should format recall with all fields', () => {
      const recall = {
        recallId: '24-001',
        title: 'Test Recall',
        description: 'Test description',
        hazard: 'Test hazard',
        remedy: 'Contact manufacturer',
        recallDate: '2024-01-15',
        manufacturer: 'Test Co',
        url: 'https://test.com',
      };

      const result = checker.formatRecall(recall);

      expect(result.id).toBe('24-001');
      expect(result.title).toBe('Test Recall');
      expect(result.description).toBe('Test description');
    });

    it('should provide default values for missing fields', () => {
      const recall = {
        recallId: '24-001',
      };

      const result = checker.formatRecall(recall);

      expect(result.title).toBe('Product Recall');
      expect(result.description).toBe('This product has been recalled.');
    });
  });

  describe('updateRecallCache', () => {
    it('should handle API errors gracefully', async () => {
      fetch.mockRejectedValue(new Error('Network error'));

      const result = await checker.updateRecallCache();

      expect(result).toEqual([]);
    });
  });

  describe('isChildCategory', () => {
    it('should recognize child-related categories', () => {
      expect(checker.isChildCategory('baby products')).toBe(true);
      expect(checker.isChildCategory('children toys')).toBe(true);
      expect(checker.isChildCategory('infant car seat')).toBe(true);
    });

    it('should reject non-child categories', () => {
      expect(checker.isChildCategory('adult furniture')).toBe(false);
      expect(checker.isChildCategory('office supplies')).toBe(false);
      expect(checker.isChildCategory(null)).toBe(false);
    });
  });

  describe('createWarningBanner', () => {
    it('should create HTML banner with recall info', () => {
      const recall = {
        description: 'Product has been recalled',
        url: 'https://cpsc.gov/recall/123',
      };

      const html = checker.createWarningBanner(recall);

      expect(html).toContain('parentsave-recall-warning');
      expect(html).toContain('RECALL ALERT');
    });
  });

  describe('escapeHtml', () => {
    it('should escape HTML special characters', () => {
      expect(checker.escapeHtml('<div>')).toBe('&lt;div&gt;');
    });

    it('should handle null and empty strings', () => {
      expect(checker.escapeHtml(null)).toBe('');
      expect(checker.escapeHtml('')).toBe('');
    });
  });
});

describe('Constants', () => {
  it('should have child categories defined', () => {
    expect(CHILD_CATEGORIES).toContain('baby');
    expect(CHILD_CATEGORIES).toContain('toy');
  });

  it('should have CPSC API URL defined', () => {
    expect(CPSC_API_URL).toContain('saferproducts.gov');
  });
});
