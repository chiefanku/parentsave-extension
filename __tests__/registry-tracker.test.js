/**
 * Registry Tracker Unit Tests
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// Mock window.location with getter/setter pattern
const mockLocation = {
  _hostname: 'amazon.com',
  _pathname: '/baby-reg/123',
  _href: 'https://amazon.com/baby-reg/123',
  get hostname() { return this._hostname; },
  set hostname(val) { this._hostname = val; },
  get pathname() { return this._pathname; },
  set pathname(val) { this._pathname = val; },
  get href() { return this._href; },
  set href(val) { this._href = val; },
};

Object.defineProperty(global, 'window', {
  value: { location: mockLocation },
  writable: true,
});

// Mock document
global.document = {
  querySelectorAll: jest.fn(() => []),
  querySelector: jest.fn(() => null),
};

import { RegistryTracker, SUPPORTED_PLATFORMS, PRICE_DROP_THRESHOLD } from '../lib/registry-tracker.js';

describe('RegistryTracker', () => {
  let tracker;

  beforeEach(() => {
    tracker = new RegistryTracker();
    chrome.storage.local.data = {};
  });

  describe('loadTrackedItems', () => {
    it('should load items from storage', async () => {
      chrome.storage.local.data.trackedItems = [{ id: '1', title: 'Test Item' }];
      chrome.storage.local.data.priceHistory = { '1': [{ price: 29.99, date: '2024-01-01' }] };

      await tracker.loadTrackedItems();

      expect(tracker.trackedItems).toHaveLength(1);
    });

    it('should handle empty storage', async () => {
      await tracker.loadTrackedItems();

      expect(tracker.trackedItems).toEqual([]);
    });
  });

  describe('addTrackedItem', () => {
    it('should add new item to tracking', async () => {
      const item = { id: '1', title: 'Test Item', price: 29.99 };

      await tracker.addTrackedItem(item);

      expect(tracker.trackedItems).toHaveLength(1);
      expect(tracker.trackedItems[0].addedAt).toBeDefined();
    });

    it('should update existing item', async () => {
      tracker.trackedItems = [{ id: '1', title: 'Old Title' }];

      await tracker.addTrackedItem({ id: '1', title: 'New Title' });

      expect(tracker.trackedItems).toHaveLength(1);
      expect(tracker.trackedItems[0].title).toBe('New Title');
    });

    it('should throw for invalid item', async () => {
      await expect(tracker.addTrackedItem(null)).rejects.toThrow('Invalid item');
      await expect(tracker.addTrackedItem({})).rejects.toThrow('id is required');
    });
  });

  describe('removeTrackedItem', () => {
    it('should remove item from tracking', async () => {
      tracker.trackedItems = [{ id: '1' }, { id: '2' }];
      tracker.priceHistory.set('1', []);

      await tracker.removeTrackedItem('1');

      expect(tracker.trackedItems).toHaveLength(1);
      expect(tracker.trackedItems[0].id).toBe('2');
    });

    it('should throw for non-existent item', async () => {
      tracker.trackedItems = [{ id: '1' }];

      await expect(tracker.removeTrackedItem('999')).rejects.toThrow('Item not found');
    });
  });

  describe('detectPlatform', () => {
    it('should detect Amazon registry', () => {
      window.location._hostname = 'amazon.com';
      window.location._pathname = '/baby-reg/123';

      const platform = tracker.detectPlatform();

      expect(platform.id).toBe('amazon');
    });

    it('should return null for unsupported sites', () => {
      window.location._hostname = 'unknown.com';
      window.location._pathname = '/';

      const platform = tracker.detectPlatform();

      expect(platform).toBeNull();
    });
  });

  describe('getPriceStats', () => {
    it('should calculate price statistics', () => {
      tracker.priceHistory.set('1', [
        { price: 100, date: '2024-01-01' },
        { price: 80, date: '2024-01-15' },
        { price: 90, date: '2024-01-30' },
      ]);

      const stats = tracker.getPriceStats('1');

      expect(stats.min).toBe(80);
      expect(stats.max).toBe(100);
      expect(stats.current).toBe(90);
    });

    it('should return null for no history', () => {
      const stats = tracker.getPriceStats('nonexistent');

      expect(stats).toBeNull();
    });
  });

  describe('parsePrice', () => {
    it('should parse various price formats', () => {
      expect(tracker.parsePrice('$29.99')).toBe(29.99);
      expect(tracker.parsePrice('29.99')).toBe(29.99);
      expect(tracker.parsePrice('$1,299.00')).toBe(1299);
    });

    it('should return null for invalid input', () => {
      expect(tracker.parsePrice(null)).toBeNull();
      expect(tracker.parsePrice('')).toBeNull();
    });
  });

  describe('truncate', () => {
    it('should truncate long strings', () => {
      const result = tracker.truncate('This is a very long string', 15);

      expect(result).toBe('This is a ve...');
    });

    it('should not truncate short strings', () => {
      const result = tracker.truncate('Short', 15);

      expect(result).toBe('Short');
    });

    it('should handle empty strings', () => {
      expect(tracker.truncate('', 10)).toBe('');
      expect(tracker.truncate(null, 10)).toBe('');
    });
  });

  describe('generateItemId', () => {
    it('should generate unique IDs', () => {
      const id1 = tracker.generateItemId();
      const id2 = tracker.generateItemId();

      expect(id1).not.toBe(id2);
      expect(id1).toMatch(/^item-\d+-[a-z0-9]+$/);
    });
  });
});

describe('Constants', () => {
  it('should have supported platforms defined', () => {
    expect(SUPPORTED_PLATFORMS).toHaveProperty('amazon');
    expect(SUPPORTED_PLATFORMS).toHaveProperty('babylist');
  });

  it('should have price drop threshold defined', () => {
    expect(PRICE_DROP_THRESHOLD).toBe(10);
  });
});
