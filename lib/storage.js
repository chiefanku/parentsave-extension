/**
 * Chrome Storage Wrapper
 * Provides a clean interface for chrome.storage.local and chrome.storage.sync
 */

const DEFAULT_SETTINGS = {
  notifications: {
    priceDrops: true,
    recalls: true,
    coupons: true,
  },
  sizePredictor: {
    enabled: true,
    showFutureSizes: true,
  },
  coupons: {
    autoApply: false,
    showPopup: true,
  },
  privacy: {
    analytics: false,
  },
};

const DEFAULT_STATE = {
  childProfiles: [],
  trackedItems: [],
  priceHistory: {},
  recallCache: [],
  recallCacheTimestamp: null,
};

export class StorageManager {
  constructor() {
    this.storage = chrome.storage.local;
    this.syncStorage = chrome.storage.sync;
  }

  /**
   * Initialize storage with default values
   */
  async initializeDefaults() {
    const existing = await this.storage.get(null);

    const defaults = {
      settings: DEFAULT_SETTINGS,
      ...DEFAULT_STATE,
    };

    // Merge with existing, keeping existing values
    const merged = { ...defaults };
    for (const key of Object.keys(defaults)) {
      if (existing[key] !== undefined) {
        merged[key] = existing[key];
      }
    }

    await this.storage.set(merged);
    return merged;
  }

  /**
   * Get all settings
   */
  async getSettings() {
    const result = await this.storage.get('settings');
    return result.settings || DEFAULT_SETTINGS;
  }

  /**
   * Save settings
   */
  async saveSettings(settings) {
    const current = await this.getSettings();
    const merged = this.deepMerge(current, settings);
    await this.storage.set({ settings: merged });
    return merged;
  }

  /**
   * Get all child profiles
   */
  async getChildProfiles() {
    const result = await this.storage.get('childProfiles');
    return result.childProfiles || [];
  }

  /**
   * Save a child profile (create or update)
   */
  async saveChildProfile(profile) {
    if (!profile || typeof profile !== 'object') {
      throw new Error('Invalid profile: must be an object');
    }

    const profiles = await this.getChildProfiles();
    const existingIndex = profiles.findIndex((p) => p.id === profile.id);

    // Validate required fields
    if (!profile.id) {
      profile.id = this.generateId();
    }
    if (!profile.name || typeof profile.name !== 'string') {
      throw new Error('Invalid profile: name is required');
    }

    // Add timestamps
    profile.updatedAt = new Date().toISOString();
    if (existingIndex === -1) {
      profile.createdAt = profile.updatedAt;
      profiles.push(profile);
    } else {
      profile.createdAt = profiles[existingIndex].createdAt;
      profiles[existingIndex] = profile;
    }

    await this.storage.set({ childProfiles: profiles });
    return profile;
  }

  /**
   * Delete a child profile
   */
  async deleteChildProfile(profileId) {
    if (!profileId) {
      throw new Error('Profile ID is required');
    }

    const profiles = await this.getChildProfiles();
    const filtered = profiles.filter((p) => p.id !== profileId);

    if (filtered.length === profiles.length) {
      throw new Error('Profile not found');
    }

    await this.storage.set({ childProfiles: filtered });
    return true;
  }

  /**
   * Get tracked registry items
   */
  async getTrackedItems() {
    const result = await this.storage.get('trackedItems');
    return result.trackedItems || [];
  }

  /**
   * Save tracked items
   */
  async saveTrackedItems(items) {
    if (!Array.isArray(items)) {
      throw new Error('Items must be an array');
    }
    await this.storage.set({ trackedItems: items });
    return items;
  }

  /**
   * Get price history
   */
  async getPriceHistory() {
    const result = await this.storage.get('priceHistory');
    return result.priceHistory || {};
  }

  /**
   * Save price history
   */
  async savePriceHistory(history) {
    if (!history || typeof history !== 'object') {
      throw new Error('History must be an object');
    }
    await this.storage.set({ priceHistory: history });
    return history;
  }

  /**
   * Get recall cache
   */
  async getRecallCache() {
    const result = await this.storage.get(['recallCache', 'recallCacheTimestamp']);
    return {
      recalls: result.recallCache || [],
      timestamp: result.recallCacheTimestamp,
    };
  }

  /**
   * Save recall cache
   */
  async saveRecallCache(recalls) {
    if (!Array.isArray(recalls)) {
      throw new Error('Recalls must be an array');
    }
    await this.storage.set({
      recallCache: recalls,
      recallCacheTimestamp: new Date().toISOString(),
    });
    return recalls;
  }

  /**
   * Clear all data
   */
  async clearAll() {
    await this.storage.clear();
    await this.initializeDefaults();
  }

  /**
   * Export all data for backup
   */
  async exportData() {
    const data = await this.storage.get(null);
    return {
      version: '1.0.0',
      exportedAt: new Date().toISOString(),
      data,
    };
  }

  /**
   * Import data from backup
   */
  async importData(backup) {
    if (!backup || !backup.data) {
      throw new Error('Invalid backup format');
    }

    // Validate version compatibility
    if (backup.version !== '1.0.0') {
      console.warn('Importing from different version:', backup.version);
    }

    await this.storage.set(backup.data);
    return true;
  }

  /**
   * Generate a unique ID
   */
  generateId() {
    return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }

  /**
   * Deep merge objects
   */
  deepMerge(target, source) {
    const result = { ...target };
    for (const key of Object.keys(source)) {
      if (source[key] instanceof Object && key in target && target[key] instanceof Object) {
        result[key] = this.deepMerge(target[key], source[key]);
      } else {
        result[key] = source[key];
      }
    }
    return result;
  }
}

// Export defaults for testing
export { DEFAULT_SETTINGS, DEFAULT_STATE };
