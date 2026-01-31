/**
 * API Integration Module
 * Handles external API calls for recalls, coupons, and affiliate networks
 */

// API endpoints
const API_ENDPOINTS = {
  cpsc: {
    recalls: 'https://www.saferproducts.gov/RestWebServices/Recall',
    rss: 'https://www.cpsc.gov/Recalls/CPSC-Recalls-RSS-Feed',
  },
  parentsave: {
    // Future ParentSave backend API
    base: 'https://api.parentsave.com/v1',
    coupons: '/coupons',
    analytics: '/analytics',
  },
};

// Request timeout
const DEFAULT_TIMEOUT = 10000; // 10 seconds

/**
 * Make an API request with timeout and error handling
 */
async function apiRequest(url, options = {}) {
  const controller = new AbortController();
  const timeout = options.timeout || DEFAULT_TIMEOUT;

  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...options.headers,
      },
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new ApiError(`HTTP ${response.status}: ${response.statusText}`, response.status);
    }

    // Check if response is JSON
    const contentType = response.headers.get('content-type');
    if (contentType && contentType.includes('application/json')) {
      return await response.json();
    }

    return await response.text();
  } catch (error) {
    clearTimeout(timeoutId);

    if (error.name === 'AbortError') {
      throw new ApiError('Request timeout', 408);
    }

    throw error;
  }
}

/**
 * Custom API Error class
 */
export class ApiError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
  }
}

/**
 * CPSC Recall API
 */
export class CPSCApi {
  constructor() {
    this.baseUrl = API_ENDPOINTS.cpsc.recalls;
  }

  /**
   * Search for recalls
   */
  async searchRecalls(params = {}) {
    const queryParams = new URLSearchParams({
      format: 'json',
      ...params,
    });

    try {
      const data = await apiRequest(`${this.baseUrl}?${queryParams.toString()}`);
      return Array.isArray(data) ? data : [];
    } catch (error) {
      console.error('Error fetching recalls:', error);
      return [];
    }
  }

  /**
   * Get recent child product recalls
   */
  async getChildProductRecalls(daysBack = 365) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - daysBack);
    const dateStr = startDate.toISOString().split('T')[0];

    const categories = ['toys', 'nursery equipment', "children's products", 'juvenile products'];

    const allRecalls = [];

    for (const category of categories) {
      try {
        const recalls = await this.searchRecalls({
          ProductType: category,
          RecallDateStart: dateStr,
        });
        allRecalls.push(...recalls);
      } catch (error) {
        console.error(`Error fetching ${category} recalls:`, error);
      }
    }

    // Deduplicate
    const seen = new Set();
    return allRecalls.filter((r) => {
      const id = r.RecallNumber || r.RecallID;
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    });
  }

  /**
   * Check if a specific product is recalled
   */
  async checkProduct(upc, brand, productName) {
    try {
      // Search by UPC if available
      if (upc) {
        const results = await this.searchRecalls({ UPC: upc });
        if (results.length > 0) return results[0];
      }

      // Search by manufacturer/brand
      if (brand) {
        const results = await this.searchRecalls({
          Manufacturer: brand,
          RecallDateStart: this.getDateYearsAgo(5),
        });

        // Filter by product name match
        if (productName) {
          const matched = results.find((r) =>
            r.Title?.toLowerCase().includes(productName.toLowerCase())
          );
          if (matched) return matched;
        }
      }

      return null;
    } catch (error) {
      console.error('Error checking product:', error);
      return null;
    }
  }

  /**
   * Get date string for X years ago
   */
  getDateYearsAgo(years) {
    const date = new Date();
    date.setFullYear(date.getFullYear() - years);
    return date.toISOString().split('T')[0];
  }
}

/**
 * Coupon API (Future ParentSave backend)
 */
export class CouponApi {
  constructor() {
    this.baseUrl = API_ENDPOINTS.parentsave.base + API_ENDPOINTS.parentsave.coupons;
  }

  /**
   * Get coupons for a retailer
   */
  async getCoupons(retailerId) {
    try {
      const data = await apiRequest(`${this.baseUrl}/${retailerId}`);
      return data.coupons || [];
    } catch (error) {
      // For MVP, return empty array - backend not yet implemented
      console.warn('Coupon API not available:', error.message);
      return [];
    }
  }

  /**
   * Report coupon usage
   */
  async reportUsage(retailerId, couponCode, success, savings = 0) {
    try {
      await apiRequest(`${this.baseUrl}/report`, {
        method: 'POST',
        body: JSON.stringify({
          retailerId,
          couponCode,
          success,
          savings,
          timestamp: new Date().toISOString(),
        }),
      });
    } catch (error) {
      // Silently fail for analytics
      console.warn('Coupon report failed:', error.message);
    }
  }
}

/**
 * Analytics API (Future ParentSave backend)
 */
export class AnalyticsApi {
  constructor() {
    this.baseUrl = API_ENDPOINTS.parentsave.base + API_ENDPOINTS.parentsave.analytics;
    this.queue = [];
    this.flushInterval = 30000; // 30 seconds
  }

  /**
   * Track an event
   */
  track(eventName, properties = {}) {
    this.queue.push({
      event: eventName,
      properties,
      timestamp: new Date().toISOString(),
    });

    // Flush if queue is large
    if (this.queue.length >= 10) {
      this.flush();
    }
  }

  /**
   * Flush event queue
   */
  async flush() {
    if (this.queue.length === 0) return;

    const events = [...this.queue];
    this.queue = [];

    try {
      await apiRequest(this.baseUrl, {
        method: 'POST',
        body: JSON.stringify({ events }),
      });
    } catch (error) {
      // Re-queue events on failure
      this.queue.push(...events);
      console.warn('Analytics flush failed:', error.message);
    }
  }

  /**
   * Start periodic flushing
   */
  startPeriodicFlush() {
    setInterval(() => this.flush(), this.flushInterval);
  }
}

/**
 * Price API (for fetching current prices)
 */
export class PriceApi {
  /**
   * Fetch current price for a product URL
   * Note: This would require a backend service for production
   */
  async fetchPrice(url) {
    // For MVP, return null - would need backend scraping service
    console.warn('Price API not implemented for:', url);
    return null;
  }
}

// Export API instances
export const cpscApi = new CPSCApi();
export const couponApi = new CouponApi();
export const analyticsApi = new AnalyticsApi();
export const priceApi = new PriceApi();

// Export utilities
export { apiRequest, API_ENDPOINTS, DEFAULT_TIMEOUT };
