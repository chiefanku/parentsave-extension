/**
 * Coupon Engine
 * Finds and applies coupons at checkout
 */

import { StorageManager } from './storage.js';

// Affiliate networks
const AFFILIATE_NETWORKS = ['shareasale', 'cj', 'impact', 'rakuten', 'awin'];

// Curated parent-specific coupon sources
const PARENT_COUPON_SOURCES = [
  'carters',
  'oshkosh',
  'gerber',
  'buybuybaby',
  'babylist',
  'target',
  'amazon-baby',
];

export class CouponEngine {
  constructor() {
    this.retailers = {};
    this.couponCache = new Map();
    this.cacheDuration = 30 * 60 * 1000; // 30 minutes
    this.storage = new StorageManager();
  }

  /**
   * Load retailer configurations
   */
  async loadRetailers() {
    try {
      const response = await fetch(chrome.runtime.getURL('data/retailers.json'));
      this.retailers = await response.json();
    } catch (error) {
      console.error('Error loading retailers:', error);
      this.retailers = {};
    }
    return this.retailers;
  }

  /**
   * Detect retailer from URL
   */
  async detectRetailer(url) {
    if (!url) return null;

    const hostname = new URL(url).hostname.toLowerCase();

    // Ensure retailers are loaded
    if (Object.keys(this.retailers).length === 0) {
      await this.loadRetailers();
    }

    // Find matching retailer
    for (const [id, config] of Object.entries(this.retailers)) {
      if (config.domains && config.domains.some((domain) => hostname.includes(domain))) {
        return { id, ...config };
      }
    }

    return null;
  }

  /**
   * Check if current page is a checkout page
   */
  isCheckoutPage() {
    const url = window.location.href.toLowerCase();
    const checkoutIndicators = [
      '/checkout',
      '/cart',
      '/basket',
      '/order',
      'checkout=',
      'cart=',
      'proceed',
    ];

    return checkoutIndicators.some((indicator) => url.includes(indicator));
  }

  /**
   * Find available coupons for a retailer
   */
  async findCoupons(retailer) {
    if (!retailer || !retailer.id) {
      return [];
    }

    // Check cache
    const cacheKey = retailer.id;
    const cached = this.couponCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.cacheDuration) {
      return cached.coupons;
    }

    const coupons = [];

    try {
      // 1. Load bundled coupons
      const bundledCoupons = await this.getBundledCoupons(retailer.id);
      coupons.push(...bundledCoupons);

      // 2. Check for parent-specific deals
      if (retailer.parentFriendly) {
        const parentDeals = await this.getParentSpecificDeals(retailer.id);
        coupons.push(...parentDeals);
      }
    } catch (error) {
      console.error('Error finding coupons:', error);
    }

    // Sort by expected value (discount amount or percentage)
    const sortedCoupons = this.sortCoupons(coupons);

    // Update cache
    this.couponCache.set(cacheKey, {
      coupons: sortedCoupons,
      timestamp: Date.now(),
    });

    return sortedCoupons;
  }

  /**
   * Get bundled coupons from local data
   */
  async getBundledCoupons(retailerId) {
    // This would typically load from a bundled JSON or fetch from a coupon API
    // For MVP, using sample coupons
    const sampleCoupons = {
      amazon: [
        { code: 'BABY10', discount: 10, type: 'percent', description: '10% off baby items' },
        { code: 'DIAPER20', discount: 20, type: 'percent', description: '20% off diapers' },
      ],
      carters: [
        { code: 'SAVE25', discount: 25, type: 'percent', description: '25% off your order' },
        { code: 'SHIP50', discount: 0, type: 'shipping', description: 'Free shipping on $50+' },
      ],
      target: [
        { code: 'BABY15', discount: 15, type: 'percent', description: '15% off baby registry items' },
      ],
      buybuybaby: [
        { code: 'WELCOME20', discount: 20, type: 'percent', description: '20% off one item' },
      ],
    };

    return sampleCoupons[retailerId] || [];
  }

  /**
   * Get parent-specific deals
   */
  async getParentSpecificDeals(retailerId) {
    // Additional parent-focused coupons
    const parentDeals = {
      amazon: [{ code: 'REGISTRY15', discount: 15, type: 'percent', description: 'Registry completion discount' }],
      babylist: [{ code: 'NEWPARENT', discount: 10, type: 'percent', description: 'New parent discount' }],
    };

    return parentDeals[retailerId] || [];
  }

  /**
   * Sort coupons by expected value
   */
  sortCoupons(coupons) {
    return [...coupons].sort((a, b) => {
      // Prefer percentage discounts, then dollar amounts
      const aValue = a.type === 'percent' ? a.discount * 10 : a.discount;
      const bValue = b.type === 'percent' ? b.discount * 10 : b.discount;
      return bValue - aValue;
    });
  }

  /**
   * Find coupon input field on page
   */
  findCouponInput() {
    // Common selectors for coupon input fields
    const selectors = [
      'input[name*="coupon" i]',
      'input[name*="promo" i]',
      'input[name*="discount" i]',
      'input[id*="coupon" i]',
      'input[id*="promo" i]',
      'input[placeholder*="coupon" i]',
      'input[placeholder*="promo" i]',
      'input[placeholder*="code" i]',
      'input[aria-label*="coupon" i]',
      'input[aria-label*="promo" i]',
      '[data-coupon-input]',
      '[data-promo-input]',
    ];

    for (const selector of selectors) {
      try {
        const input = document.querySelector(selector);
        if (input && input.offsetParent !== null) {
          return input;
        }
      } catch (error) {
        // Invalid selector, continue
      }
    }

    return null;
  }

  /**
   * Find apply button near coupon input
   */
  findApplyButton(input) {
    if (!input) return null;

    // Look for nearby button
    const parent = input.closest('form') || input.parentElement;
    if (!parent) return null;

    const buttonSelectors = [
      'button[type="submit"]',
      'input[type="submit"]',
      'button:not([type="reset"])',
      '[class*="apply" i]',
      '[id*="apply" i]',
    ];

    for (const selector of buttonSelectors) {
      const button = parent.querySelector(selector);
      if (button && button.offsetParent !== null) {
        return button;
      }
    }

    return null;
  }

  /**
   * Get current cart total
   */
  getCartTotal() {
    const totalSelectors = [
      '[data-cart-total]',
      '[class*="total" i] [class*="price" i]',
      '[class*="order-total" i]',
      '[class*="grand-total" i]',
      '#cart-total',
      '.cart-total',
    ];

    for (const selector of totalSelectors) {
      try {
        const element = document.querySelector(selector);
        if (element) {
          const text = element.textContent;
          const match = text.match(/\$?([\d,]+\.?\d*)/);
          if (match) {
            return parseFloat(match[1].replace(',', ''));
          }
        }
      } catch (error) {
        // Continue to next selector
      }
    }

    return null;
  }

  /**
   * Apply coupons and find best one
   */
  async applyCoupons(coupons) {
    const settings = await this.storage.getSettings();

    // Check if auto-apply is enabled
    if (!settings.coupons?.autoApply) {
      return { applied: false, reason: 'Auto-apply disabled' };
    }

    const couponInput = this.findCouponInput();
    if (!couponInput) {
      return { applied: false, reason: 'No coupon field found' };
    }

    const applyButton = this.findApplyButton(couponInput);
    if (!applyButton) {
      return { applied: false, reason: 'No apply button found' };
    }

    const originalTotal = this.getCartTotal();
    if (!originalTotal) {
      return { applied: false, reason: 'Could not determine cart total' };
    }

    let bestDiscount = null;

    for (const coupon of coupons) {
      try {
        // Clear previous coupon
        couponInput.value = '';
        couponInput.dispatchEvent(new Event('input', { bubbles: true }));

        // Enter coupon code
        couponInput.value = coupon.code;
        couponInput.dispatchEvent(new Event('input', { bubbles: true }));
        couponInput.dispatchEvent(new Event('change', { bubbles: true }));

        // Click apply
        applyButton.click();

        // Wait for page to update
        await this.wait(1500);

        // Check new total
        const newTotal = this.getCartTotal();
        if (newTotal && newTotal < originalTotal) {
          const savings = originalTotal - newTotal;

          if (!bestDiscount || savings > bestDiscount.savings) {
            bestDiscount = {
              coupon,
              savings,
              originalTotal,
              newTotal,
            };
          }
        }
      } catch (error) {
        console.error('Error applying coupon:', coupon.code, error);
      }
    }

    // Re-apply best coupon if found
    if (bestDiscount) {
      couponInput.value = bestDiscount.coupon.code;
      couponInput.dispatchEvent(new Event('input', { bubbles: true }));
      couponInput.dispatchEvent(new Event('change', { bubbles: true }));
      applyButton.click();
    }

    return bestDiscount || { applied: false, reason: 'No working coupons found' };
  }

  /**
   * Wait helper
   */
  wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Create coupon popup HTML
   */
  createCouponPopup(coupons, appliedResult) {
    const savingsHtml = appliedResult?.savings
      ? `<span class="parentsave-savings">You saved $${appliedResult.savings.toFixed(2)}!</span>`
      : '<span>Click to try available coupons</span>';

    return `
      <div class="parentsave-coupon-popup">
        <div class="parentsave-popup-header">
          <img src="${chrome.runtime.getURL('icons/icon48.png')}" alt="ParentSave" class="parentsave-popup-logo">
          <span>ParentSave found ${coupons.length} coupon${coupons.length !== 1 ? 's' : ''}!</span>
          <button class="parentsave-popup-close" aria-label="Close">&times;</button>
        </div>
        <div class="parentsave-popup-result">
          ${savingsHtml}
        </div>
        <div class="parentsave-coupon-list">
          ${coupons
            .slice(0, 3)
            .map(
              (c) => `
            <div class="parentsave-coupon-item">
              <span class="parentsave-coupon-code">${c.code}</span>
              <span class="parentsave-coupon-desc">${c.description}</span>
            </div>
          `
            )
            .join('')}
        </div>
        <button class="parentsave-apply-btn">Apply Best Coupon</button>
      </div>
    `;
  }
}

// Export for testing
export { AFFILIATE_NETWORKS, PARENT_COUPON_SOURCES };
