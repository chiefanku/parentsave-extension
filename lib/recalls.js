/**
 * Product Safety Shield - Recall Detection
 * Monitors product pages and alerts users to recalled items
 */

import { StorageManager } from './storage.js';

// CPSC API endpoints
const CPSC_RSS_URL = 'https://www.cpsc.gov/Recalls/CPSC-Recalls-RSS-Feed';
const CPSC_API_URL = 'https://www.saferproducts.gov/RestWebServices/Recall';

// Child product categories to monitor
const CHILD_CATEGORIES = [
  'children',
  'child',
  'baby',
  'infant',
  'toddler',
  'nursery',
  'toy',
  'toys',
  'juvenile',
  'kids',
  'crib',
  'stroller',
  'car seat',
  'high chair',
  'playpen',
  'bassinet',
];

export class RecallChecker {
  constructor() {
    this.recallCache = new Map();
    this.cacheExpiry = 24 * 60 * 60 * 1000; // 24 hours
    this.storage = new StorageManager();
  }

  /**
   * Check if a product has been recalled
   */
  async checkProduct(productInfo) {
    if (!productInfo) {
      return null;
    }

    const { title, brand, upc, asin, description } = productInfo;

    // Generate cache key
    const cacheKey = upc || asin || `${brand || ''}-${title || ''}`.toLowerCase();

    // Check in-memory cache first
    if (this.recallCache.has(cacheKey)) {
      const cached = this.recallCache.get(cacheKey);
      if (Date.now() - cached.timestamp < this.cacheExpiry) {
        return cached.recall;
      }
    }

    // Load from storage cache
    const storageCache = await this.storage.getRecallCache();
    const recalls = storageCache.recalls || [];

    // Search for matching recall
    const recall = this.findMatchingRecall(recalls, productInfo);

    // Update in-memory cache
    this.recallCache.set(cacheKey, {
      recall,
      timestamp: Date.now(),
    });

    return recall;
  }

  /**
   * Find a matching recall in the cache
   */
  findMatchingRecall(recalls, productInfo) {
    if (!recalls || !Array.isArray(recalls) || recalls.length === 0) {
      return null;
    }

    const { title, brand, upc, asin, description } = productInfo;
    const searchTerms = [title, brand, description].filter(Boolean).map((s) => s.toLowerCase());

    for (const recall of recalls) {
      // Check UPC match
      if (upc && recall.upcs && recall.upcs.includes(upc)) {
        return this.formatRecall(recall);
      }

      // Check text matches
      const recallText = [recall.title, recall.description, recall.products]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      for (const term of searchTerms) {
        // Check for significant word overlap (at least 3 words)
        const termWords = term.split(/\s+/).filter((w) => w.length > 3);
        let matchCount = 0;

        for (const word of termWords) {
          if (recallText.includes(word)) {
            matchCount++;
          }
        }

        if (matchCount >= 3) {
          return this.formatRecall(recall);
        }
      }
    }

    return null;
  }

  /**
   * Format recall for display
   */
  formatRecall(recall) {
    return {
      id: recall.recallId || recall.id,
      title: recall.title || 'Product Recall',
      description: recall.description || recall.hazard || 'This product has been recalled.',
      date: recall.recallDate || recall.date,
      url: recall.url || `https://www.cpsc.gov/Recalls/${recall.recallId || ''}`,
      hazard: recall.hazard,
      remedy: recall.remedy,
      manufacturer: recall.manufacturer,
    };
  }

  /**
   * Update the recall cache — tries CPSC API first, falls back to bundled data
   */
  async updateRecallCache() {
    try {
      const recalls = await this.fetchFromSaferProducts();
      if (recalls && recalls.length > 0) {
        await this.storage.saveRecallCache(recalls);
        console.log(`Updated recall cache with ${recalls.length} recalls from CPSC`);
        return recalls;
      }
    } catch (error) {
      console.error('Error fetching from CPSC API:', error);
    }

    // Fall back to bundled recalls data
    try {
      const bundled = await this.loadBundledRecalls();
      if (bundled.length > 0) {
        await this.storage.saveRecallCache(bundled);
        console.log(`Loaded ${bundled.length} bundled recalls as fallback`);
        return bundled;
      }
    } catch (error) {
      console.error('Error loading bundled recalls:', error);
    }

    return [];
  }

  /**
   * Load bundled recalls from the extension's data directory
   */
  async loadBundledRecalls() {
    const url = chrome.runtime.getURL('data/recalls.json');
    const response = await fetch(url);
    if (!response.ok) throw new Error('Failed to load bundled recalls');
    const data = await response.json();
    return data.recalls || [];
  }

  /**
   * Fetch recalls from SaferProducts.gov API
   */
  async fetchFromSaferProducts() {
    const recalls = [];

    try {
      // Fetch recent child product recalls
      for (const category of ['toys', 'nursery equipment', 'children\'s products']) {
        const response = await fetch(
          `${CPSC_API_URL}?format=json&ProductType=${encodeURIComponent(category)}&RecallDateStart=2023-01-01`,
          {
            method: 'GET',
            headers: {
              Accept: 'application/json',
            },
          }
        );

        if (response.ok) {
          const data = await response.json();
          if (Array.isArray(data)) {
            recalls.push(
              ...data.map((item) => ({
                id: item.RecallID,
                recallId: item.RecallNumber,
                title: item.Title,
                description: item.Description,
                hazard: item.Hazard,
                remedy: item.Remedy,
                recallDate: item.RecallDate,
                manufacturer: item.Manufacturers?.[0]?.Name,
                products: item.Products?.map((p) => p.Name).join(', '),
                upcs: item.UPCs || [],
                url: item.URL,
              }))
            );
          }
        }
      }
    } catch (error) {
      console.error('Error fetching from SaferProducts API:', error);
    }

    // Deduplicate by recallId
    const seen = new Set();
    return recalls.filter((r) => {
      if (seen.has(r.recallId)) return false;
      seen.add(r.recallId);
      return true;
    });
  }

  /**
   * Check if a category is child-related
   */
  isChildCategory(category) {
    if (!category) return false;
    const lower = category.toLowerCase();
    return CHILD_CATEGORIES.some((c) => lower.includes(c));
  }

  /**
   * Create recall warning banner HTML
   */
  createWarningBanner(recall) {
    return `
      <div class="parentsave-recall-warning" role="alert">
        <div class="parentsave-warning-icon">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 9V14M12 17.5V18M4.5 19H19.5L12 4L4.5 19Z" stroke="#DC2626" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </div>
        <div class="parentsave-warning-content">
          <strong class="parentsave-warning-title">RECALL ALERT</strong>
          <p class="parentsave-warning-description">${this.escapeHtml(recall.description)}</p>
          <a href="${this.escapeHtml(recall.url)}" target="_blank" rel="noopener noreferrer" class="parentsave-warning-link">
            View Recall Details
          </a>
        </div>
        <button class="parentsave-warning-close" aria-label="Dismiss warning">&times;</button>
      </div>
    `;
  }

  /**
   * Escape HTML to prevent XSS (no DOM dependency — safe in service worker)
   */
  escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}

// Export for testing
export { CHILD_CATEGORIES, CPSC_API_URL };
