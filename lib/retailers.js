/**
 * Retailer Detection Module
 * Identifies and provides configuration for supported retailers
 */

// Supported retailers with their configurations
const RETAILER_CONFIGS = {
  amazon: {
    id: 'amazon',
    name: 'Amazon',
    domains: ['amazon.com', 'smile.amazon.com'],
    category: 'general',
    parentFriendly: true,
    selectors: {
      productTitle: '#productTitle, #title',
      price: '.a-price .a-offscreen, #priceblock_ourprice, #priceblock_dealprice',
      brand: '#bylineInfo, .po-brand .po-break-word',
      couponInput: '#spc-gcpromoinput, input[name*="coupon"]',
      applyButton: '#gcApplyButtonId, [data-action="apply-promo"]',
      cartTotal: '#sc-subtotal-amount-activecart, .a-price.a-text-bold .a-offscreen',
      productImage: '#landingImage, #imgBlkFront',
      sizeSelector: '#native_dropdown_selected_size_name, #variation_size_name',
    },
    affiliateNetwork: 'amazon-associates',
    affiliateTag: 'parentsave-20',
    commissionRate: 4,
    supportsRegistry: true,
    registryUrl: '/baby-reg/',
  },
  target: {
    id: 'target',
    name: 'Target',
    domains: ['target.com'],
    category: 'general',
    parentFriendly: true,
    selectors: {
      productTitle: '[data-test="product-title"], h1',
      price: '[data-test="product-price"]',
      brand: '[data-test="product-brand"]',
      couponInput: 'input[name="promocode"]',
      applyButton: '[data-test="apply-button"]',
      cartTotal: '[data-test="cart-summary-total"]',
      productImage: '[data-test="product-image"]',
      sizeSelector: '[data-test="size-selector"]',
    },
    affiliateNetwork: 'impact',
    commissionRate: 3,
    supportsRegistry: true,
    registryUrl: '/gift-registry/',
  },
  walmart: {
    id: 'walmart',
    name: 'Walmart',
    domains: ['walmart.com'],
    category: 'general',
    parentFriendly: true,
    selectors: {
      productTitle: '[data-automation="product-title"], h1[itemprop="name"]',
      price: '[data-automation="buybox-price"], .price-characteristic',
      brand: '[data-automation="product-brand"]',
      couponInput: 'input[name="promoCode"]',
      applyButton: '[data-automation="apply-button"]',
      cartTotal: '[data-automation="order-total"]',
      productImage: '[data-automation="product-image"] img',
      sizeSelector: '[data-automation="size-selection"]',
    },
    affiliateNetwork: 'impact',
    commissionRate: 4,
    supportsRegistry: true,
    registryUrl: '/registry/',
  },
  carters: {
    id: 'carters',
    name: "Carter's",
    domains: ['carters.com'],
    category: 'baby-clothing',
    parentFriendly: true,
    selectors: {
      productTitle: '.product-name h1, .pdp-title',
      price: '.price-sales, .product-price',
      brand: '.brand-name',
      couponInput: 'input[name="couponCode"]',
      applyButton: '.promo-code-apply',
      cartTotal: '.order-total .order-value',
      productImage: '.product-image img',
      sizeSelector: '.size-swatches, .size-select',
    },
    affiliateNetwork: 'shareasale',
    commissionRate: 8,
    supportsRegistry: false,
  },
  buybuybaby: {
    id: 'buybuybaby',
    name: 'Buy Buy Baby',
    domains: ['buybuybaby.com'],
    category: 'baby-specialty',
    parentFriendly: true,
    selectors: {
      productTitle: '.product-name h1',
      price: '.product-price .price',
      brand: '.product-brand',
      couponInput: 'input[name="promoCode"]',
      applyButton: '.apply-promo-btn',
      cartTotal: '.order-total',
      productImage: '.product-img img',
      sizeSelector: '.size-options',
    },
    affiliateNetwork: 'cj',
    commissionRate: 5,
    supportsRegistry: true,
    registryUrl: '/store/registry/',
  },
  babylist: {
    id: 'babylist',
    name: 'Babylist',
    domains: ['babylist.com'],
    category: 'baby-registry',
    parentFriendly: true,
    selectors: {
      productTitle: '.product-title, h1',
      price: '.product-price, .price',
      brand: '.product-brand',
      couponInput: 'input[name="coupon"]',
      applyButton: '.apply-coupon',
      cartTotal: '.cart-total',
      productImage: '.product-image img',
      sizeSelector: '.size-selector',
    },
    affiliateNetwork: 'impact',
    commissionRate: 6,
    supportsRegistry: true,
    registryUrl: '/list/',
  },
};

export class RetailerDetector {
  constructor() {
    this.configs = RETAILER_CONFIGS;
  }

  /**
   * Detect retailer from URL
   */
  detect(url) {
    if (!url) return null;

    try {
      const hostname = new URL(url).hostname.toLowerCase();

      for (const [id, config] of Object.entries(this.configs)) {
        if (config.domains.some((domain) => hostname.includes(domain))) {
          return { ...config };
        }
      }
    } catch (error) {
      console.error('Error detecting retailer:', error);
    }

    return null;
  }

  /**
   * Get retailer by ID
   */
  getById(id) {
    return this.configs[id] || null;
  }

  /**
   * Get all parent-friendly retailers
   */
  getParentFriendlyRetailers() {
    return Object.values(this.configs).filter((r) => r.parentFriendly);
  }

  /**
   * Get retailers by category
   */
  getByCategory(category) {
    return Object.values(this.configs).filter((r) => r.category === category);
  }

  /**
   * Get retailers that support registries
   */
  getRegistryRetailers() {
    return Object.values(this.configs).filter((r) => r.supportsRegistry);
  }

  /**
   * Check if URL is a product page
   */
  isProductPage(url) {
    if (!url) return false;

    const productPatterns = [
      /\/dp\//i, // Amazon
      /\/p\//i, // Target
      /\/ip\//i, // Walmart
      /\/product\//i,
      /\/products\//i,
      /\/item\//i,
    ];

    return productPatterns.some((pattern) => pattern.test(url));
  }

  /**
   * Check if URL is a checkout page
   */
  isCheckoutPage(url) {
    if (!url) return false;

    const checkoutPatterns = [
      /checkout/i,
      /cart/i,
      /basket/i,
      /order-review/i,
      /payment/i,
    ];

    return checkoutPatterns.some((pattern) => pattern.test(url));
  }

  /**
   * Check if URL is a registry page
   */
  isRegistryPage(url) {
    if (!url) return false;

    const retailer = this.detect(url);
    if (!retailer || !retailer.registryUrl) return false;

    return url.toLowerCase().includes(retailer.registryUrl);
  }

  /**
   * Extract product info from page
   */
  extractProductInfo(retailer) {
    if (!retailer || !retailer.selectors) {
      return null;
    }

    const selectors = retailer.selectors;

    const getTextContent = (selector) => {
      try {
        const element = document.querySelector(selector);
        return element?.textContent?.trim() || null;
      } catch {
        return null;
      }
    };

    const getPrice = (selector) => {
      const text = getTextContent(selector);
      if (!text) return null;

      const match = text.match(/\$?([\d,]+\.?\d*)/);
      return match ? parseFloat(match[1].replace(',', '')) : null;
    };

    return {
      title: getTextContent(selectors.productTitle),
      price: getPrice(selectors.price),
      brand: getTextContent(selectors.brand),
      imageUrl: document.querySelector(selectors.productImage)?.src || null,
      retailer: retailer.id,
      url: window.location.href,
    };
  }
}

// Export for testing
export { RETAILER_CONFIGS };
