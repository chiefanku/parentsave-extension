/**
 * Registry Price Tracker
 * Tracks prices across baby registries and alerts on price drops
 */

import { StorageManager } from './storage.js';

// Supported registry platforms
const SUPPORTED_PLATFORMS = {
  amazon: {
    name: 'Amazon',
    domains: ['amazon.com', 'smile.amazon.com'],
    registryPath: '/baby-reg/',
    selectors: {
      items: '[data-item-id]',
      title: '[data-item-name], .a-text-normal',
      price: '.a-price .a-offscreen, .a-price-whole',
      link: 'a[href*="/dp/"]',
    },
  },
  babylist: {
    name: 'Babylist',
    domains: ['babylist.com'],
    registryPath: '/list/',
    selectors: {
      items: '[data-item-id], .registry-item',
      title: '.item-title, h3',
      price: '.item-price, .price',
      link: 'a[href*="/gp/"]',
    },
  },
  target: {
    name: 'Target',
    domains: ['target.com'],
    registryPath: '/gift-registry/',
    selectors: {
      items: '[data-test="registry-item"]',
      title: '[data-test="product-title"]',
      price: '[data-test="product-price"]',
      link: 'a[href*="/p/"]',
    },
  },
};

// Price drop threshold for notifications (percentage)
const PRICE_DROP_THRESHOLD = 10;

export class RegistryTracker {
  constructor() {
    this.trackedItems = [];
    this.priceHistory = new Map();
    this.storage = new StorageManager();
  }

  /**
   * Load tracked items from storage
   */
  async loadTrackedItems() {
    this.trackedItems = await this.storage.getTrackedItems();
    const history = await this.storage.getPriceHistory();
    this.priceHistory = new Map(Object.entries(history));
    return this.trackedItems;
  }

  /**
   * Save tracked items to storage
   */
  async saveTrackedItems() {
    await this.storage.saveTrackedItems(this.trackedItems);
    await this.storage.savePriceHistory(Object.fromEntries(this.priceHistory));
  }

  /**
   * Add item to tracking
   */
  async addTrackedItem(item) {
    if (!item || !item.id) {
      throw new Error('Invalid item: id is required');
    }

    // Check for duplicates
    const existing = this.trackedItems.find((i) => i.id === item.id);
    if (existing) {
      // Update existing item
      Object.assign(existing, item, { updatedAt: new Date().toISOString() });
    } else {
      // Add new item
      this.trackedItems.push({
        ...item,
        addedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    }

    // Initialize price history
    if (item.price && !this.priceHistory.has(item.id)) {
      this.priceHistory.set(item.id, [
        {
          price: item.price,
          date: new Date().toISOString(),
        },
      ]);
    }

    await this.saveTrackedItems();
    return item;
  }

  /**
   * Remove item from tracking
   */
  async removeTrackedItem(itemId) {
    const index = this.trackedItems.findIndex((i) => i.id === itemId);
    if (index === -1) {
      throw new Error('Item not found');
    }

    this.trackedItems.splice(index, 1);
    this.priceHistory.delete(itemId);
    await this.saveTrackedItems();
    return true;
  }

  /**
   * Detect registry platform from current page
   */
  detectPlatform() {
    const hostname = window.location.hostname.toLowerCase();
    const pathname = window.location.pathname.toLowerCase();

    for (const [id, config] of Object.entries(SUPPORTED_PLATFORMS)) {
      if (config.domains.some((domain) => hostname.includes(domain))) {
        if (pathname.includes(config.registryPath)) {
          return { id, ...config };
        }
      }
    }

    return null;
  }

  /**
   * Import registry items from current page
   */
  async importRegistry(platform = null) {
    const detectedPlatform = platform || this.detectPlatform();
    if (!detectedPlatform) {
      return { success: false, error: 'Not on a supported registry page' };
    }

    try {
      switch (detectedPlatform.id) {
        case 'amazon':
          return await this.importAmazonRegistry(detectedPlatform);
        case 'babylist':
          return await this.importBabylistRegistry(detectedPlatform);
        case 'target':
          return await this.importTargetRegistry(detectedPlatform);
        default:
          return { success: false, error: 'Unsupported platform' };
      }
    } catch (error) {
      console.error('Error importing registry:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Import Amazon registry
   */
  async importAmazonRegistry(platform) {
    const items = [];
    const selectors = platform.selectors;

    const registryItems = document.querySelectorAll(selectors.items);

    registryItems.forEach((element) => {
      const id = element.dataset?.itemId || this.generateItemId();
      const titleEl = element.querySelector(selectors.title);
      const priceEl = element.querySelector(selectors.price);
      const linkEl = element.querySelector(selectors.link);

      if (titleEl) {
        items.push({
          id,
          title: titleEl.textContent?.trim() || 'Unknown Item',
          price: this.parsePrice(priceEl?.textContent),
          url: linkEl?.href || null,
          platform: 'amazon',
          imageUrl: element.querySelector('img')?.src || null,
        });
      }
    });

    // Add items to tracking
    for (const item of items) {
      await this.addTrackedItem(item);
    }

    return { success: true, count: items.length, items };
  }

  /**
   * Import Babylist registry
   */
  async importBabylistRegistry(platform) {
    const items = [];
    const selectors = platform.selectors;

    const registryItems = document.querySelectorAll(selectors.items);

    registryItems.forEach((element) => {
      const id = element.dataset?.itemId || this.generateItemId();
      const titleEl = element.querySelector(selectors.title);
      const priceEl = element.querySelector(selectors.price);
      const linkEl = element.querySelector(selectors.link);

      if (titleEl) {
        items.push({
          id,
          title: titleEl.textContent?.trim() || 'Unknown Item',
          price: this.parsePrice(priceEl?.textContent),
          url: linkEl?.href || null,
          platform: 'babylist',
          imageUrl: element.querySelector('img')?.src || null,
        });
      }
    });

    for (const item of items) {
      await this.addTrackedItem(item);
    }

    return { success: true, count: items.length, items };
  }

  /**
   * Import Target registry
   */
  async importTargetRegistry(platform) {
    const items = [];
    const selectors = platform.selectors;

    const registryItems = document.querySelectorAll(selectors.items);

    registryItems.forEach((element) => {
      const titleEl = element.querySelector(selectors.title);
      const priceEl = element.querySelector(selectors.price);
      const linkEl = element.querySelector('a');

      if (titleEl) {
        items.push({
          id: this.generateItemId(),
          title: titleEl.textContent?.trim() || 'Unknown Item',
          price: this.parsePrice(priceEl?.textContent),
          url: linkEl?.href || null,
          platform: 'target',
          imageUrl: element.querySelector('img')?.src || null,
        });
      }
    });

    for (const item of items) {
      await this.addTrackedItem(item);
    }

    return { success: true, count: items.length, items };
  }

  /**
   * Check for price drops across all tracked items
   */
  async checkPriceDrops() {
    const alerts = [];

    for (const item of this.trackedItems) {
      try {
        const currentPrice = await this.fetchCurrentPrice(item);
        if (currentPrice === null) continue;

        const history = this.priceHistory.get(item.id) || [];

        if (history.length > 0) {
          const lastPrice = history[history.length - 1].price;
          const dropPercent = ((lastPrice - currentPrice) / lastPrice) * 100;

          if (dropPercent >= PRICE_DROP_THRESHOLD) {
            alerts.push({
              item,
              originalPrice: lastPrice,
              currentPrice,
              dropPercent: parseFloat(dropPercent.toFixed(1)),
            });
          }
        }

        // Update history
        history.push({
          price: currentPrice,
          date: new Date().toISOString(),
        });

        // Keep only last 30 entries
        if (history.length > 30) {
          history.splice(0, history.length - 30);
        }

        this.priceHistory.set(item.id, history);
      } catch (error) {
        console.error('Error checking price for item:', item.id, error);
      }
    }

    // Save updated history
    await this.saveTrackedItems();

    return alerts;
  }

  /**
   * Fetch current price for an item
   */
  async fetchCurrentPrice(item) {
    if (!item.url) return null;

    try {
      // In a real implementation, this would fetch the page and parse the price
      // For MVP, we'll simulate with cached price + random variation
      const basePrice = item.price || 50;
      const variation = (Math.random() - 0.5) * 0.2; // ±10% variation
      return Math.round((basePrice * (1 + variation)) * 100) / 100;
    } catch (error) {
      console.error('Error fetching price:', error);
      return null;
    }
  }

  /**
   * Get price history for an item
   */
  getPriceHistoryForItem(itemId) {
    return this.priceHistory.get(itemId) || [];
  }

  /**
   * Calculate price statistics for an item
   */
  getPriceStats(itemId) {
    const history = this.getPriceHistoryForItem(itemId);
    if (history.length === 0) return null;

    const prices = history.map((h) => h.price);
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    const avg = prices.reduce((a, b) => a + b, 0) / prices.length;
    const current = prices[prices.length - 1];

    return {
      min: parseFloat(min.toFixed(2)),
      max: parseFloat(max.toFixed(2)),
      avg: parseFloat(avg.toFixed(2)),
      current: parseFloat(current.toFixed(2)),
      isLowest: current === min,
      percentFromLowest: parseFloat((((current - min) / min) * 100).toFixed(1)),
    };
  }

  /**
   * Parse price from text
   */
  parsePrice(text) {
    if (!text) return null;

    const match = text.match(/\$?([\d,]+\.?\d*)/);
    if (match) {
      return parseFloat(match[1].replace(',', ''));
    }

    return null;
  }

  /**
   * Generate unique item ID
   */
  generateItemId() {
    return `item-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }

  /**
   * Create price drop notification
   */
  async sendPriceDropNotification(alert) {
    return chrome.notifications.create(`price-drop-${alert.item.id}`, {
      type: 'basic',
      iconUrl: chrome.runtime.getURL('icons/icon128.png'),
      title: 'Price Drop Alert!',
      message: `${this.truncate(alert.item.title, 50)} dropped ${alert.dropPercent}% to $${alert.currentPrice.toFixed(2)}!`,
      buttons: [{ title: 'View Item' }],
    });
  }

  /**
   * Truncate string
   */
  truncate(str, maxLength) {
    if (!str) return '';
    if (str.length <= maxLength) return str;
    return str.substring(0, maxLength - 3) + '...';
  }
}

// Export for testing
export { SUPPORTED_PLATFORMS, PRICE_DROP_THRESHOLD };
