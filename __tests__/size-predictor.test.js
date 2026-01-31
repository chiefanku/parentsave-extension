/**
 * Size Predictor Unit Tests
 */
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// Mock fetch for loading size charts
global.fetch = jest.fn(() =>
  Promise.resolve({
    json: () =>
      Promise.resolve({
        carters: {
          brand: "Carter's",
          sizes: [
            { label: 'Newborn', heightMin: 45, heightMax: 55, weightMin: 2.3, weightMax: 4.1 },
            { label: '3M', heightMin: 55, heightMax: 61, weightMin: 3.6, weightMax: 5.9 },
            { label: '6M', heightMin: 61, heightMax: 67, weightMin: 5.4, weightMax: 7.7 },
            { label: '9M', heightMin: 67, heightMax: 72, weightMin: 7.3, weightMax: 9.5 },
            { label: '12M', heightMin: 72, heightMax: 77, weightMin: 9.1, weightMax: 11.3 },
            { label: '18M', heightMin: 77, heightMax: 82, weightMin: 10.4, weightMax: 12.2 },
            { label: '24M', heightMin: 82, heightMax: 87, weightMin: 11.3, weightMax: 13.6 },
            { label: '2T', heightMin: 84, heightMax: 89, weightMin: 11.8, weightMax: 14.1 },
            { label: '3T', heightMin: 89, heightMax: 97, weightMin: 13.2, weightMax: 15.4 },
            { label: '4T', heightMin: 97, heightMax: 105, weightMin: 14.5, weightMax: 17.2 },
          ],
        },
      }),
  })
);

import { SizePredictor, GROWTH_CHARTS, GROWTH_VELOCITY } from '../lib/size-predictor.js';

describe('SizePredictor', () => {
  let predictor;

  beforeEach(async () => {
    predictor = new SizePredictor();
    await predictor.loadSizeCharts();
  });

  describe('loadSizeCharts', () => {
    it('should load brand size charts', async () => {
      expect(predictor.brandSizeCharts).toHaveProperty('carters');
      expect(predictor.brandSizeCharts.carters.sizes).toHaveLength(10);
    });
  });

  describe('convertToMetric', () => {
    it('should convert inches to cm', () => {
      const result = predictor.convertToMetric(28, 'inches', 'height');
      expect(result).toBeCloseTo(71.12, 1);
    });

    it('should convert lbs to kg', () => {
      const result = predictor.convertToMetric(22, 'lbs', 'weight');
      expect(result).toBeCloseTo(9.98, 1);
    });

    it('should return value unchanged if already metric', () => {
      const result = predictor.convertToMetric(70, 'cm', 'height');
      expect(result).toBe(70);
    });
  });

  describe('monthsBetween', () => {
    it('should calculate months between dates', () => {
      const date1 = new Date('2024-01-01');
      const date2 = new Date('2024-07-01');

      const months = predictor.monthsBetween(date1, date2);

      expect(months).toBe(6);
    });

    it('should handle same month', () => {
      const date1 = new Date('2024-01-15');
      const date2 = new Date('2024-01-15');

      const months = predictor.monthsBetween(date1, date2);

      expect(months).toBe(0);
    });
  });

  describe('getGrowthVelocity', () => {
    it('should return higher velocity for younger ages', () => {
      const velocity0_3 = predictor.getGrowthVelocity(1, 50);
      const velocity12_24 = predictor.getGrowthVelocity(18, 50);

      expect(velocity0_3.height).toBeGreaterThan(velocity12_24.height);
    });

    it('should adjust for percentile', () => {
      const velocity5th = predictor.getGrowthVelocity(12, 5);
      const velocity95th = predictor.getGrowthVelocity(12, 95);

      expect(velocity95th.height).toBeGreaterThan(velocity5th.height);
    });
  });

  describe('matchSize', () => {
    it('should match size for measurements in range', () => {
      const brandChart = predictor.brandSizeCharts.carters;
      const size = predictor.matchSize(brandChart, 70, 8);

      expect(size).toBe('9M');
    });

    it('should return null for missing chart', () => {
      const size = predictor.matchSize(null, 70, 8);

      expect(size).toBeNull();
    });
  });

  describe('predictSize', () => {
    it('should predict current size from child profile', () => {
      const childProfile = {
        birthDate: '2023-06-15',
        gender: 'female',
        measurements: {
          height: { value: 28, unit: 'inches' },
          weight: { value: 22, unit: 'lbs' },
        },
        growthPercentile: 50,
      };

      const prediction = predictor.predictSize(childProfile, "Carter's");

      expect(prediction.currentSize).toBeDefined();
      expect(prediction.brand).toBe("Carter's");
    });

    it('should return null for missing profile', () => {
      const prediction = predictor.predictSize(null, "Carter's");

      expect(prediction).toBeNull();
    });

    it('should return null for missing measurements', () => {
      const childProfile = {
        birthDate: '2023-06-15',
        gender: 'female',
      };

      const prediction = predictor.predictSize(childProfile, "Carter's");

      expect(prediction).toBeNull();
    });
  });

  describe('projectGrowth', () => {
    it('should project growth to future date', () => {
      const profile = {
        birthDate: '2024-01-15',
        gender: 'male',
        currentHeight: 70,
        currentWeight: 9,
        growthPercentile: 50,
      };

      const futureDate = new Date();
      futureDate.setMonth(futureDate.getMonth() + 6);

      const projection = predictor.projectGrowth(profile, futureDate);

      expect(projection.height).toBeGreaterThan(70);
      expect(projection.weight).toBeGreaterThan(9);
    });
  });

  describe('getSeasonalNote', () => {
    it('should return winter note for December', () => {
      const note = predictor.getSeasonalNote(new Date('2024-12-15'));

      expect(note).toContain('Winter');
    });

    it('should return summer note for July', () => {
      const note = predictor.getSeasonalNote(new Date('2024-07-15'));

      expect(note).toContain('Summer');
    });
  });

  describe('getGenericSize', () => {
    it('should return correct generic sizes', () => {
      expect(predictor.getGenericSize(50).currentSize).toBe('Newborn');
      expect(predictor.getGenericSize(65).currentSize).toBe('3-6M');
      expect(predictor.getGenericSize(90).currentSize).toBe('2T');
    });

    it('should handle out of range values', () => {
      expect(predictor.getGenericSize(40).currentSize).toBe('Preemie');
      expect(predictor.getGenericSize(120).currentSize).toBe('5T+');
    });
  });

  describe('createSizeBadge', () => {
    it('should create size badge HTML', () => {
      const recommendation = {
        currentSize: '12M',
        projectedSize: '18M',
      };

      const html = predictor.createSizeBadge(recommendation);

      expect(html).toContain('parentsave-size-badge');
      expect(html).toContain('12M');
    });

    it('should return empty for null recommendation', () => {
      const html = predictor.createSizeBadge(null);

      expect(html).toBe('');
    });
  });
});

describe('Growth Constants', () => {
  it('should have growth charts for male and female', () => {
    expect(GROWTH_CHARTS).toHaveProperty('male');
    expect(GROWTH_CHARTS).toHaveProperty('female');
  });

  it('should have height and weight data', () => {
    expect(GROWTH_CHARTS.male).toHaveProperty('height');
    expect(GROWTH_CHARTS.male).toHaveProperty('weight');
  });

  it('should have growth velocity data for age ranges', () => {
    expect(GROWTH_VELOCITY).toHaveProperty('0-3');
    expect(GROWTH_VELOCITY).toHaveProperty('12-24');
    expect(GROWTH_VELOCITY['0-3'].height).toBeGreaterThan(0);
  });
});
