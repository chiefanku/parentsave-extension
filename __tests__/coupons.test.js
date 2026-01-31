/**
 * Coupon Engine Unit Tests
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// Mock fetch
global.fetch = jest.fn(() =>
  Promise.resolve({
    json: () =>
      Promise.resolve({
        amazon: {
          id: 'amazon',
          name: 'Amazon',
          domains: ['amazon.com'],
        },
      }),
  })
);

// Mock window.location using delete + Object.defineProperty pattern
const mockLocation = {
  _href: 'https://amazon.com/checkout',
  _hostname: 'amazon.com',
  get href() { return this._href; },
  set href(val) { this._href = val; },
  get hostname() { return this._hostname; },
};

Object.defineProperty(global, 'window', {
  value: { location: mockLocation },
  writable: true,
});

// Mock document
global.document = {
  querySelector: jest.fn(() => null),
  querySelectorAll: jest.fn(() => []),
};

import { CouponEngine, AFFILIATE_NETWORKS, PARENT_COUPON_SOURCES } from '../lib/coupons.js';

describe('CouponEngine', () => {
  let engine;

  beforeEach(() => {
    engine = new CouponEngine();
    jest.clearAllMocks();
  });

  describe('loadRetailers', () => {
    it('should load retailer configurations', async () => {
      await engine.loadRetailers();

      expect(engine.retailers).toHaveProperty('amazon');
    });

    it('should handle load errors', async () => {
      fetch.mockRejectedValueOnce(new Error('Network error'));

      await engine.loadRetailers();

      expect(engine.retailers).toEqual({});
    });
  });

  describe('detectRetailer', () => {
    it('should detect Amazon', async () => {
      await engine.loadRetailers();

      const retailer = await engine.detectRetailer('https://amazon.com/product');

      expect(retailer.id).toBe('amazon');
    });

    it('should return null for invalid URL', async () => {
      const retailer = await engine.detectRetailer(null);

      expect(retailer).toBeNull();
    });
  });

  describe('isCheckoutPage', () => {
    it('should detect checkout pages', () => {
      window.location._href = 'https://amazon.com/checkout';
      expect(engine.isCheckoutPage()).toBe(true);
    });

    it('should detect cart pages', () => {
      window.location._href = 'https://amazon.com/cart';
      expect(engine.isCheckoutPage()).toBe(true);
    });

    it('should not detect non-checkout pages', () => {
      window.location._href = 'https://amazon.com/product';
      expect(engine.isCheckoutPage()).toBe(false);
    });
  });

  describe('findCoupons', () => {
    it('should return empty array for null retailer', async () => {
      const coupons = await engine.findCoupons(null);

      expect(coupons).toEqual([]);
    });

    it('should find bundled coupons', async () => {
      const coupons = await engine.findCoupons({ id: 'amazon', parentFriendly: true });

      expect(coupons.length).toBeGreaterThan(0);
    });
  });

  describe('getBundledCoupons', () => {
    it('should return coupons for supported retailers', async () => {
      const coupons = await engine.getBundledCoupons('amazon');

      expect(coupons.length).toBeGreaterThan(0);
      expect(coupons[0]).toHaveProperty('code');
    });

    it('should return empty array for unknown retailer', async () => {
      const coupons = await engine.getBundledCoupons('unknown');

      expect(coupons).toEqual([]);
    });
  });

  describe('sortCoupons', () => {
    it('should sort by expected value', () => {
      const coupons = [
        { code: 'A', discount: 5, type: 'dollar' },
        { code: 'B', discount: 20, type: 'percent' },
        { code: 'C', discount: 10, type: 'percent' },
      ];

      const sorted = engine.sortCoupons(coupons);

      expect(sorted[0].code).toBe('B');
    });
  });

  describe('findCouponInput', () => {
    it('should return null when no input found', () => {
      document.querySelector = jest.fn(() => null);

      const input = engine.findCouponInput();

      expect(input).toBeNull();
    });
  });

  describe('findApplyButton', () => {
    it('should return null for null input', () => {
      const button = engine.findApplyButton(null);

      expect(button).toBeNull();
    });
  });

  describe('getCartTotal', () => {
    it('should return null when no total found', () => {
      document.querySelector = jest.fn(() => null);

      const total = engine.getCartTotal();

      expect(total).toBeNull();
    });
  });

  describe('wait', () => {
    it('should return promise that resolves after delay', async () => {
      const start = Date.now();
      await engine.wait(50);
      const elapsed = Date.now() - start;

      expect(elapsed).toBeGreaterThanOrEqual(45);
    });
  });

  describe('createCouponPopup', () => {
    it('should create popup HTML', () => {
      const coupons = [
        { code: 'TEST10', description: '10% off' },
      ];

      const html = engine.createCouponPopup(coupons, null);

      expect(html).toContain('parentsave-coupon-popup');
      expect(html).toContain('TEST10');
    });

    it('should show savings when applied', () => {
      const coupons = [{ code: 'TEST', description: 'Test' }];
      const result = { savings: 10.5 };

      const html = engine.createCouponPopup(coupons, result);

      expect(html).toContain('$10.50');
    });
  });
});

describe('Constants', () => {
  it('should have affiliate networks defined', () => {
    expect(AFFILIATE_NETWORKS).toContain('shareasale');
    expect(AFFILIATE_NETWORKS).toContain('cj');
  });

  it('should have parent coupon sources defined', () => {
    expect(PARENT_COUPON_SOURCES).toContain('carters');
  });
});
