/**
 * ParentSave Content Script
 * Injects UI elements and handles page-level features
 */

// Import modules (bundled versions would be used in production)
// For development, we'll use message passing to background script

/**
 * Main content script class
 */
class ParentSaveContent {
  constructor() {
    this.retailer = null;
    this.productInfo = null;
    this.childProfiles = [];
    this.settings = {};
    this.initialized = false;
  }

  /**
   * Initialize content script
   */
  async init() {
    if (this.initialized) return;

    try {
      // Load settings and child profiles
      await this.loadData();

      // Detect retailer
      this.retailer = await this.detectRetailer();

      if (this.retailer) {
        // Set up page observers
        this.setupObservers();

        // Check page type and act accordingly
        await this.handlePage();
      }

      this.initialized = true;
    } catch (error) {
      console.error('ParentSave init error:', error);
    }
  }

  /**
   * Load data from background script
   */
  async loadData() {
    try {
      const [profilesResponse, settingsResponse] = await Promise.all([
        this.sendMessage({ type: 'GET_CHILD_PROFILES' }),
        this.sendMessage({ type: 'GET_SETTINGS' }),
      ]);

      this.childProfiles = profilesResponse?.data || [];
      this.settings = settingsResponse?.data || {};
    } catch (error) {
      console.error('Error loading data:', error);
    }
  }

  /**
   * Detect current retailer
   */
  async detectRetailer() {
    const hostname = window.location.hostname.toLowerCase();

    // Simple retailer detection
    const retailers = {
      'amazon.com': {
        id: 'amazon',
        name: 'Amazon',
        selectors: {
          productTitle: '#productTitle',
          price: '.a-price .a-offscreen',
          brand: '#bylineInfo',
          sizeSelector: '#native_dropdown_selected_size_name, #variation_size_name',
        },
      },
      'target.com': {
        id: 'target',
        name: 'Target',
        selectors: {
          productTitle: '[data-test="product-title"]',
          price: '[data-test="product-price"]',
          brand: '[data-test="product-brand"]',
          sizeSelector: '[data-test="size-selector"]',
        },
      },
      'carters.com': {
        id: 'carters',
        name: "Carter's",
        selectors: {
          productTitle: '.product-name h1',
          price: '.price-sales',
          brand: '.brand-name',
          sizeSelector: '.size-swatches',
        },
      },
      'walmart.com': {
        id: 'walmart',
        name: 'Walmart',
        selectors: {
          productTitle: '[data-automation="product-title"]',
          price: '[data-automation="buybox-price"]',
          brand: '[data-automation="product-brand"]',
          sizeSelector: '[data-automation="size-selection"]',
        },
      },
    };

    for (const [domain, config] of Object.entries(retailers)) {
      if (hostname.includes(domain)) {
        return config;
      }
    }

    return null;
  }

  /**
   * Set up MutationObserver for dynamic content
   */
  setupObservers() {
    const observer = new MutationObserver((mutations) => {
      // Debounce to avoid excessive processing
      clearTimeout(this.observerTimeout);
      this.observerTimeout = setTimeout(() => {
        this.handleDynamicContent();
      }, 500);
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });
  }

  /**
   * Handle dynamic content changes
   */
  async handleDynamicContent() {
    // Re-check for product info if not already found
    if (!this.productInfo) {
      this.productInfo = this.extractProductInfo();
      if (this.productInfo) {
        await this.handleProductPage();
      }
    }

    // Check for checkout elements
    if (this.isCheckoutPage() && !document.querySelector('.parentsave-coupon-popup')) {
      await this.handleCheckoutPage();
    }
  }

  /**
   * Handle page based on type
   */
  async handlePage() {
    if (this.isProductPage()) {
      this.productInfo = this.extractProductInfo();
      await this.handleProductPage();
    } else if (this.isCheckoutPage()) {
      await this.handleCheckoutPage();
    } else if (this.isRegistryPage()) {
      await this.handleRegistryPage();
    }
  }

  /**
   * Handle product page
   */
  async handleProductPage() {
    if (!this.productInfo) return;

    // Check for recalls
    await this.checkRecall();

    // Show size recommendations
    await this.showSizeRecommendation();
  }

  /**
   * Check for product recalls
   */
  async checkRecall() {
    if (!this.productInfo) return;

    try {
      const response = await this.sendMessage({
        type: 'CHECK_RECALL',
        productInfo: this.productInfo,
      });

      if (response?.success && response.data) {
        this.showRecallWarning(response.data);
      }
    } catch (error) {
      console.error('Error checking recall:', error);
    }
  }

  /**
   * Show recall warning banner
   */
  showRecallWarning(recall) {
    // Remove existing warning
    document.querySelector('.parentsave-recall-warning')?.remove();

    const banner = document.createElement('div');
    banner.className = 'parentsave-recall-warning';
    banner.setAttribute('role', 'alert');
    banner.innerHTML = `
      <div class="parentsave-warning-icon">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
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
    `;

    // Add close handler
    banner.querySelector('.parentsave-warning-close').addEventListener('click', () => {
      banner.remove();
    });

    document.body.prepend(banner);
  }

  /**
   * Show size recommendation
   */
  async showSizeRecommendation() {
    if (this.childProfiles.length === 0 || !this.settings.sizePredictor?.enabled) {
      return;
    }

    // Find size selector on page
    const sizeSelector = this.retailer?.selectors?.sizeSelector
      ? document.querySelector(this.retailer.selectors.sizeSelector)
      : null;

    if (!sizeSelector) return;

    // Remove existing badge
    document.querySelector('.parentsave-size-badge')?.remove();

    // Get brand from product info
    const brand = this.productInfo?.brand || this.retailer?.name;

    // For MVP, show a simple recommendation based on first child
    const child = this.childProfiles[0];
    if (!child?.measurements) return;

    // Simple size calculation (would use SizePredictor in full implementation)
    const recommendation = this.calculateSimpleSize(child);

    if (recommendation) {
      const badge = document.createElement('div');
      badge.className = 'parentsave-size-badge';
      badge.innerHTML = `
        <span class="parentsave-badge-icon">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <path d="M12 2C13.1 2 14 2.9 14 4C14 5.1 13.1 6 12 6C10.9 6 10 5.1 10 4C10 2.9 10.9 2 12 2ZM21 9H15V22H13V16H11V22H9V9H3V7H21V9Z" fill="#6366F1"/>
          </svg>
        </span>
        <span class="parentsave-badge-text">
          ${this.escapeHtml(child.name)} fits: <strong>${recommendation}</strong>
        </span>
      `;

      sizeSelector.parentElement?.insertBefore(badge, sizeSelector);
    }
  }

  /**
   * Simple size calculation for MVP
   */
  calculateSimpleSize(child) {
    if (!child?.measurements?.height) return null;

    let height = child.measurements.height.value;
    const unit = child.measurements.height.unit;

    // Convert to cm if needed
    if (unit === 'inches' || unit === 'in') {
      height = height * 2.54;
    }

    // Simple height-to-size mapping
    if (height < 55) return 'Newborn';
    if (height < 61) return '0-3M';
    if (height < 67) return '3-6M';
    if (height < 72) return '6-9M';
    if (height < 77) return '9-12M';
    if (height < 82) return '12-18M';
    if (height < 87) return '18-24M';
    if (height < 92) return '2T';
    if (height < 99) return '3T';
    if (height < 106) return '4T';
    return '5T';
  }

  /**
   * Handle checkout page
   */
  async handleCheckoutPage() {
    if (!this.settings.coupons?.showPopup) return;

    try {
      const response = await this.sendMessage({
        type: 'GET_COUPONS',
        retailerId: this.retailer?.id,
      });

      const coupons = response?.data || [];

      if (coupons.length > 0) {
        this.showCouponPopup(coupons);
      }
    } catch (error) {
      console.error('Error getting coupons:', error);
    }
  }

  /**
   * Show coupon popup
   */
  showCouponPopup(coupons) {
    // Remove existing popup
    document.querySelector('.parentsave-coupon-popup')?.remove();

    const popup = document.createElement('div');
    popup.className = 'parentsave-coupon-popup';
    popup.innerHTML = `
      <div class="parentsave-popup-header">
        <span class="parentsave-popup-title">ParentSave found ${coupons.length} coupon${coupons.length !== 1 ? 's' : ''}!</span>
        <button class="parentsave-popup-close" aria-label="Close">&times;</button>
      </div>
      <div class="parentsave-coupon-list">
        ${coupons
          .slice(0, 3)
          .map(
            (c) => `
          <div class="parentsave-coupon-item">
            <span class="parentsave-coupon-code">${this.escapeHtml(c.code)}</span>
            <span class="parentsave-coupon-desc">${this.escapeHtml(c.description)}</span>
          </div>
        `
          )
          .join('')}
      </div>
      <button class="parentsave-apply-btn">Apply Best Coupon</button>
    `;

    // Add event handlers
    popup.querySelector('.parentsave-popup-close').addEventListener('click', () => {
      popup.remove();
    });

    popup.querySelector('.parentsave-apply-btn').addEventListener('click', async () => {
      await this.applyCoupons(coupons);
    });

    document.body.appendChild(popup);
  }

  /**
   * Apply coupons
   */
  async applyCoupons(coupons) {
    const couponInput = this.findCouponInput();
    const applyButton = this.findApplyButton(couponInput);

    if (!couponInput || !applyButton) {
      this.showNotification('Could not find coupon field', 'error');
      return;
    }

    // Try first coupon for MVP
    const coupon = coupons[0];
    couponInput.value = coupon.code;
    couponInput.dispatchEvent(new Event('input', { bubbles: true }));
    couponInput.dispatchEvent(new Event('change', { bubbles: true }));
    applyButton.click();

    this.showNotification(`Applied coupon: ${coupon.code}`, 'success');
  }

  /**
   * Handle registry page — parse items from DOM and track via background
   */
  async handleRegistryPage() {
    const importButton = document.createElement('button');
    importButton.className = 'parentsave-import-btn';
    importButton.textContent = 'Track with ParentSave';

    importButton.addEventListener('click', async () => {
      const items = this.extractRegistryItems();
      if (items.length === 0) {
        this.showNotification('No registry items found on this page', 'error');
        return;
      }

      let tracked = 0;
      for (const item of items) {
        try {
          const response = await this.sendMessage({ type: 'TRACK_REGISTRY_ITEM', item });
          if (response?.success) tracked++;
        } catch (err) {
          console.error('ParentSave: error tracking item', err);
        }
      }

      if (tracked > 0) {
        this.showNotification(`Tracking ${tracked} item${tracked !== 1 ? 's' : ''}!`, 'success');
      } else {
        this.showNotification('Could not track registry items', 'error');
      }
    });

    const header = document.querySelector('header, .registry-header, h1');
    if (header) {
      header.parentElement?.insertBefore(importButton, header.nextSibling);
    }
  }

  /**
   * Extract registry items from the current page DOM
   */
  extractRegistryItems() {
    const items = [];
    const candidates = document.querySelectorAll(
      '[data-item-id], .registry-item, [data-test="registry-item"], .a-list-item'
    );

    candidates.forEach((el) => {
      const titleEl = el.querySelector(
        this.retailer?.selectors?.productTitle ||
          '[data-item-name], .a-text-normal, .item-title, h3, [data-test="product-title"]'
      );
      const title = titleEl?.textContent?.trim();
      if (!title) return;

      const priceEl = el.querySelector(
        this.retailer?.selectors?.price ||
          '.a-price .a-offscreen, .a-price-whole, .item-price, [data-test="product-price"]'
      );
      const linkEl = el.querySelector('a[href]');

      items.push({
        id: el.dataset?.itemId || `${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        title,
        price: this.parsePrice(priceEl?.textContent),
        url: linkEl?.href || window.location.href,
        platform: this.retailer?.id || 'unknown',
        imageUrl: el.querySelector('img')?.src || null,
      });
    });

    return items;
  }

  /**
   * Extract product info from page
   */
  extractProductInfo() {
    if (!this.retailer?.selectors) return null;

    const selectors = this.retailer.selectors;

    const getTextContent = (selector) => {
      try {
        return document.querySelector(selector)?.textContent?.trim() || null;
      } catch {
        return null;
      }
    };

    const title = getTextContent(selectors.productTitle);
    if (!title) return null;

    return {
      title,
      price: this.parsePrice(getTextContent(selectors.price)),
      brand: getTextContent(selectors.brand),
      retailer: this.retailer.id,
      url: window.location.href,
    };
  }

  /**
   * Page type detection helpers
   */
  isProductPage() {
    const url = window.location.href.toLowerCase();
    const patterns = ['/dp/', '/p/', '/ip/', '/product/', '/item/'];
    return patterns.some((p) => url.includes(p));
  }

  isCheckoutPage() {
    const url = window.location.href.toLowerCase();
    const patterns = ['/checkout', '/cart', '/basket', '/order-summary', '/order-confirmation'];
    return patterns.some((p) => url.includes(p));
  }

  isRegistryPage() {
    const url = window.location.href.toLowerCase();
    const patterns = ['/registry', '/baby-reg', '/gift-registry', '/list/'];
    return patterns.some((p) => url.includes(p));
  }

  /**
   * Find coupon input field
   */
  findCouponInput() {
    const selectors = [
      'input[name*="coupon" i]',
      'input[name*="promo" i]',
      'input[id*="coupon" i]',
      'input[placeholder*="code" i]',
    ];

    for (const selector of selectors) {
      const input = document.querySelector(selector);
      if (input?.offsetParent !== null) return input;
    }
    return null;
  }

  /**
   * Find apply button
   */
  findApplyButton(input) {
    if (!input) return null;

    const parent = input.closest('form') || input.parentElement;
    if (!parent) return null;

    const button = parent.querySelector('button, input[type="submit"]');
    return button?.offsetParent !== null ? button : null;
  }

  /**
   * Parse price from text
   */
  parsePrice(text) {
    if (!text) return null;
    const match = text.match(/\$?([\d,]+\.?\d*)/);
    return match ? parseFloat(match[1].replace(',', '')) : null;
  }

  /**
   * Show notification
   */
  showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `parentsave-notification parentsave-notification-${type}`;
    notification.textContent = message;

    document.body.appendChild(notification);

    setTimeout(() => {
      notification.classList.add('parentsave-notification-fade');
      setTimeout(() => notification.remove(), 300);
    }, 3000);
  }

  /**
   * Send message to background script
   */
  sendMessage(message) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(message, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(response);
        }
      });
    });
  }

  /**
   * Escape HTML
   */
  escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    const parentsave = new ParentSaveContent();
    parentsave.init();
  });
} else {
  const parentsave = new ParentSaveContent();
  parentsave.init();
}

// Export for testing
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { ParentSaveContent };
}
