/**
 * Storage Manager Unit Tests
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { StorageManager, DEFAULT_SETTINGS, DEFAULT_STATE } from '../lib/storage.js';

describe('StorageManager', () => {
  let storage;

  beforeEach(() => {
    storage = new StorageManager();
    chrome.storage.local.data = {};
  });

  describe('initializeDefaults', () => {
    it('should initialize with default settings', async () => {
      await storage.initializeDefaults();

      expect(chrome.storage.local.set).toHaveBeenCalled();
    });

    it('should preserve existing values', async () => {
      chrome.storage.local.data.childProfiles = [{ id: '1', name: 'Test' }];

      await storage.initializeDefaults();

      expect(chrome.storage.local.data.childProfiles).toEqual([{ id: '1', name: 'Test' }]);
    });
  });

  describe('getSettings', () => {
    it('should return default settings when none exist', async () => {
      const settings = await storage.getSettings();

      expect(settings).toEqual(DEFAULT_SETTINGS);
    });

    it('should return stored settings', async () => {
      const customSettings = { ...DEFAULT_SETTINGS, notifications: { priceDrops: false } };
      chrome.storage.local.data.settings = customSettings;

      const settings = await storage.getSettings();

      expect(settings).toEqual(customSettings);
    });
  });

  describe('saveSettings', () => {
    it('should merge and save settings', async () => {
      chrome.storage.local.data.settings = DEFAULT_SETTINGS;

      await storage.saveSettings({ notifications: { priceDrops: false } });

      expect(chrome.storage.local.data.settings.notifications.priceDrops).toBe(false);
    });
  });

  describe('Child Profiles', () => {
    it('should return empty array when no profiles exist', async () => {
      const profiles = await storage.getChildProfiles();

      expect(profiles).toEqual([]);
    });

    it('should save a new profile', async () => {
      const profile = { name: 'Emma', birthDate: '2024-03-15' };

      await storage.saveChildProfile(profile);

      expect(chrome.storage.local.data.childProfiles).toHaveLength(1);
      expect(chrome.storage.local.data.childProfiles[0].name).toBe('Emma');
      expect(chrome.storage.local.data.childProfiles[0].id).toBeDefined();
    });

    it('should update an existing profile', async () => {
      chrome.storage.local.data.childProfiles = [{ id: '1', name: 'Emma', createdAt: '2024-01-01' }];

      await storage.saveChildProfile({ id: '1', name: 'Emma Rose' });

      expect(chrome.storage.local.data.childProfiles).toHaveLength(1);
      expect(chrome.storage.local.data.childProfiles[0].name).toBe('Emma Rose');
    });

    it('should delete a profile', async () => {
      chrome.storage.local.data.childProfiles = [
        { id: '1', name: 'Emma' },
        { id: '2', name: 'Oliver' },
      ];

      await storage.deleteChildProfile('1');

      expect(chrome.storage.local.data.childProfiles).toHaveLength(1);
      expect(chrome.storage.local.data.childProfiles[0].id).toBe('2');
    });

    it('should throw when deleting non-existent profile', async () => {
      chrome.storage.local.data.childProfiles = [{ id: '1', name: 'Emma' }];

      await expect(storage.deleteChildProfile('999')).rejects.toThrow('Profile not found');
    });

    it('should throw when saving invalid profile', async () => {
      await expect(storage.saveChildProfile(null)).rejects.toThrow('Invalid profile');
      await expect(storage.saveChildProfile({ id: '1' })).rejects.toThrow('name is required');
    });
  });

  describe('Tracked Items', () => {
    it('should return empty array when no items tracked', async () => {
      const items = await storage.getTrackedItems();

      expect(items).toEqual([]);
    });

    it('should save tracked items', async () => {
      const items = [{ id: '1', title: 'Test Item' }];

      await storage.saveTrackedItems(items);

      expect(chrome.storage.local.data.trackedItems).toEqual(items);
    });

    it('should throw when saving non-array', async () => {
      await expect(storage.saveTrackedItems('invalid')).rejects.toThrow('Items must be an array');
    });
  });

  describe('Price History', () => {
    it('should return empty object when no history', async () => {
      const history = await storage.getPriceHistory();

      expect(history).toEqual({});
    });

    it('should save price history', async () => {
      const history = { 'item-1': [{ price: 29.99, date: '2024-01-01' }] };

      await storage.savePriceHistory(history);

      expect(chrome.storage.local.data.priceHistory).toEqual(history);
    });
  });

  describe('Recall Cache', () => {
    it('should return empty cache when none exists', async () => {
      const cache = await storage.getRecallCache();

      expect(cache.recalls).toEqual([]);
    });

    it('should save recall cache with timestamp', async () => {
      const recalls = [{ id: '1', title: 'Test Recall' }];

      await storage.saveRecallCache(recalls);

      expect(chrome.storage.local.data.recallCache).toEqual(recalls);
      expect(chrome.storage.local.data.recallCacheTimestamp).toBeDefined();
    });
  });

  describe('Export/Import', () => {
    it('should export all data', async () => {
      chrome.storage.local.data = {
        settings: DEFAULT_SETTINGS,
        childProfiles: [{ id: '1', name: 'Emma' }],
      };

      const backup = await storage.exportData();

      expect(backup.version).toBe('1.0.0');
      expect(backup.exportedAt).toBeDefined();
      expect(backup.data.childProfiles).toHaveLength(1);
    });

    it('should import backup data', async () => {
      const backup = {
        version: '1.0.0',
        data: {
          settings: DEFAULT_SETTINGS,
          childProfiles: [{ id: '1', name: 'Emma' }],
        },
      };

      await storage.importData(backup);

      expect(chrome.storage.local.data.childProfiles).toHaveLength(1);
    });

    it('should throw on invalid backup', async () => {
      await expect(storage.importData(null)).rejects.toThrow('Invalid backup format');
      await expect(storage.importData({})).rejects.toThrow('Invalid backup format');
    });
  });

  describe('Utility Methods', () => {
    it('should generate unique IDs', () => {
      const id1 = storage.generateId();
      const id2 = storage.generateId();

      expect(id1).not.toBe(id2);
      expect(id1).toMatch(/^\d+-[a-z0-9]+$/);
    });

    it('should deep merge objects', () => {
      const target = { a: 1, b: { c: 2, d: 3 } };
      const source = { b: { c: 5 }, e: 6 };

      const result = storage.deepMerge(target, source);

      expect(result).toEqual({ a: 1, b: { c: 5, d: 3 }, e: 6 });
    });
  });
});
