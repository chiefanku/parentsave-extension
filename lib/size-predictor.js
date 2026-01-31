/**
 * Smart Size Predictor
 * Predicts clothing sizes based on child profiles and brand-specific sizing
 */

import { StorageManager } from './storage.js';

// CDC/WHO Growth Percentile Data (simplified)
// Height in cm, Weight in kg for various ages (in months)
const GROWTH_CHARTS = {
  male: {
    height: {
      // [age in months]: { p5, p50, p95 }
      0: { p5: 46.3, p50: 49.9, p95: 53.4 },
      3: { p5: 57.6, p50: 61.4, p95: 65.3 },
      6: { p5: 63.4, p50: 67.6, p95: 71.9 },
      9: { p5: 68.0, p50: 72.0, p95: 76.5 },
      12: { p5: 71.8, p50: 75.7, p95: 80.2 },
      18: { p5: 77.5, p50: 82.3, p95: 87.0 },
      24: { p5: 82.5, p50: 87.1, p95: 92.2 },
      36: { p5: 89.0, p50: 95.1, p95: 101.2 },
      48: { p5: 95.8, p50: 102.3, p95: 109.0 },
      60: { p5: 101.8, p50: 109.2, p95: 116.5 },
    },
    weight: {
      0: { p5: 2.5, p50: 3.3, p95: 4.3 },
      3: { p5: 4.9, p50: 6.0, p95: 7.4 },
      6: { p5: 6.4, p50: 7.9, p95: 9.7 },
      9: { p5: 7.5, p50: 9.2, p95: 11.2 },
      12: { p5: 8.4, p50: 10.1, p95: 12.3 },
      18: { p5: 9.4, p50: 11.5, p95: 14.0 },
      24: { p5: 10.2, p50: 12.4, p95: 15.3 },
      36: { p5: 11.9, p50: 14.3, p95: 17.8 },
      48: { p5: 13.4, p50: 16.3, p95: 20.6 },
      60: { p5: 15.0, p50: 18.4, p95: 23.5 },
    },
  },
  female: {
    height: {
      0: { p5: 45.6, p50: 49.1, p95: 52.7 },
      3: { p5: 56.2, p50: 59.8, p95: 63.5 },
      6: { p5: 61.8, p50: 65.7, p95: 69.8 },
      9: { p5: 66.1, p50: 70.1, p95: 74.5 },
      12: { p5: 69.8, p50: 74.0, p95: 78.6 },
      18: { p5: 75.9, p50: 80.7, p95: 85.6 },
      24: { p5: 81.0, p50: 85.7, p95: 91.0 },
      36: { p5: 87.7, p50: 94.1, p95: 100.5 },
      48: { p5: 94.6, p50: 101.6, p95: 108.8 },
      60: { p5: 100.8, p50: 108.4, p95: 116.1 },
    },
    weight: {
      0: { p5: 2.4, p50: 3.2, p95: 4.2 },
      3: { p5: 4.5, p50: 5.5, p95: 6.9 },
      6: { p5: 5.8, p50: 7.3, p95: 9.0 },
      9: { p5: 6.9, p50: 8.5, p95: 10.5 },
      12: { p5: 7.7, p50: 9.5, p95: 11.8 },
      18: { p5: 8.8, p50: 10.9, p95: 13.5 },
      24: { p5: 9.7, p50: 12.0, p95: 15.0 },
      36: { p5: 11.4, p50: 14.0, p95: 17.6 },
      48: { p5: 13.0, p50: 16.0, p95: 20.5 },
      60: { p5: 14.7, p50: 18.2, p95: 23.6 },
    },
  },
};

// Growth velocity (cm/month and kg/month) by age group
const GROWTH_VELOCITY = {
  // Age ranges in months: [min, max]: { height: cm/month, weight: kg/month }
  '0-3': { height: 3.5, weight: 0.9 },
  '3-6': { height: 2.0, weight: 0.6 },
  '6-12': { height: 1.3, weight: 0.35 },
  '12-24': { height: 0.8, weight: 0.2 },
  '24-36': { height: 0.7, weight: 0.15 },
  '36-60': { height: 0.6, weight: 0.15 },
};

export class SizePredictor {
  constructor() {
    this.brandSizeCharts = {};
    this.storage = new StorageManager();
  }

  /**
   * Load brand-specific size charts
   */
  async loadSizeCharts() {
    try {
      const response = await fetch(chrome.runtime.getURL('data/size-charts.json'));
      this.brandSizeCharts = await response.json();
    } catch (error) {
      console.error('Error loading size charts:', error);
      this.brandSizeCharts = {};
    }
    return this.brandSizeCharts;
  }

  /**
   * Predict size for a child at a brand
   */
  predictSize(childProfile, brand, futureDate = null) {
    if (!childProfile || !brand) {
      return null;
    }

    const { birthDate, gender, measurements, growthPercentile } = childProfile;

    if (!measurements || !measurements.height || !measurements.weight) {
      return null;
    }

    // Get current measurements (convert to metric if needed)
    const currentHeight = this.convertToMetric(
      measurements.height.value,
      measurements.height.unit,
      'height'
    );
    const currentWeight = this.convertToMetric(
      measurements.weight.value,
      measurements.weight.unit,
      'weight'
    );

    // Project growth if future date specified
    let projectedHeight = currentHeight;
    let projectedWeight = currentWeight;

    if (futureDate) {
      const projection = this.projectGrowth(
        {
          birthDate,
          gender: gender || 'male',
          currentHeight,
          currentWeight,
          growthPercentile: growthPercentile || 50,
        },
        futureDate
      );
      projectedHeight = projection.height;
      projectedWeight = projection.weight;
    }

    // Get brand chart
    const brandKey = brand.toLowerCase().replace(/[^a-z0-9]/g, '');
    const brandChart = this.brandSizeCharts[brandKey];

    if (!brandChart) {
      // Use generic sizing
      return this.getGenericSize(currentHeight, projectedHeight, futureDate);
    }

    return {
      currentSize: this.matchSize(brandChart, currentHeight, currentWeight),
      projectedSize: futureDate
        ? this.matchSize(brandChart, projectedHeight, projectedWeight)
        : null,
      projectionDate: futureDate,
      seasonalNote: futureDate ? this.getSeasonalNote(futureDate) : null,
      brand: brand,
    };
  }

  /**
   * Match measurements to a size in the chart
   */
  matchSize(brandChart, height, weight) {
    if (!brandChart || !brandChart.sizes) {
      return null;
    }

    // Find best matching size based on height (primary) and weight (secondary)
    let bestMatch = null;
    let bestScore = Infinity;

    for (const size of brandChart.sizes) {
      // Calculate fit score (lower is better)
      const heightMid = (size.heightMin + size.heightMax) / 2;
      const weightMid = (size.weightMin + size.weightMax) / 2;

      const heightDiff = Math.abs(height - heightMid);
      const weightDiff = Math.abs(weight - weightMid);

      // Weight height more than weight in scoring
      const score = heightDiff * 2 + weightDiff;

      // Check if within range
      const inHeightRange = height >= size.heightMin && height <= size.heightMax;
      const inWeightRange = weight >= size.weightMin && weight <= size.weightMax;

      // Prefer sizes where child is in range
      if (inHeightRange && inWeightRange) {
        if (score < bestScore) {
          bestScore = score;
          bestMatch = size.label;
        }
      } else if (!bestMatch) {
        // Fallback if no perfect match
        if (score < bestScore) {
          bestScore = score;
          bestMatch = size.label;
        }
      }
    }

    return bestMatch;
  }

  /**
   * Project growth to a future date
   */
  projectGrowth(profile, targetDate) {
    const { birthDate, gender, currentHeight, currentWeight, growthPercentile } = profile;

    const birth = new Date(birthDate);
    const now = new Date();
    const target = new Date(targetDate);

    // Calculate ages in months
    const currentAgeMonths = this.monthsBetween(birth, now);
    const targetAgeMonths = this.monthsBetween(birth, target);
    const monthsAhead = targetAgeMonths - currentAgeMonths;

    if (monthsAhead <= 0) {
      return { height: currentHeight, weight: currentWeight };
    }

    // Get growth velocity for current age
    const velocity = this.getGrowthVelocity(currentAgeMonths, growthPercentile);

    // Project growth
    let projectedHeight = currentHeight;
    let projectedWeight = currentWeight;

    // Apply growth month by month (accounts for changing velocity)
    let age = currentAgeMonths;
    for (let i = 0; i < monthsAhead && i < 24; i++) {
      const vel = this.getGrowthVelocity(age, growthPercentile);
      projectedHeight += vel.height;
      projectedWeight += vel.weight;
      age++;
    }

    return {
      height: Math.round(projectedHeight * 10) / 10,
      weight: Math.round(projectedWeight * 10) / 10,
    };
  }

  /**
   * Get growth velocity for age
   */
  getGrowthVelocity(ageMonths, percentile = 50) {
    let velocityKey = '36-60';

    if (ageMonths < 3) velocityKey = '0-3';
    else if (ageMonths < 6) velocityKey = '3-6';
    else if (ageMonths < 12) velocityKey = '6-12';
    else if (ageMonths < 24) velocityKey = '12-24';
    else if (ageMonths < 36) velocityKey = '24-36';

    const baseVelocity = GROWTH_VELOCITY[velocityKey];

    // Adjust for percentile (higher percentile = slightly faster growth)
    const percentileFactor = 0.8 + (percentile / 100) * 0.4;

    return {
      height: baseVelocity.height * percentileFactor,
      weight: baseVelocity.weight * percentileFactor,
    };
  }

  /**
   * Calculate months between two dates
   */
  monthsBetween(date1, date2) {
    const d1 = new Date(date1);
    const d2 = new Date(date2);
    return (d2.getFullYear() - d1.getFullYear()) * 12 + (d2.getMonth() - d1.getMonth());
  }

  /**
   * Get seasonal note for size prediction
   */
  getSeasonalNote(targetDate) {
    const date = new Date(targetDate);
    const month = date.getMonth();

    if (month >= 11 || month <= 1) {
      return 'Winter season - consider sizing up for layers';
    } else if (month >= 2 && month <= 4) {
      return 'Spring season - transitional weather';
    } else if (month >= 5 && month <= 7) {
      return 'Summer season - lighter clothing';
    } else {
      return 'Fall season - consider upcoming cold weather';
    }
  }

  /**
   * Get generic size when brand chart not available
   */
  getGenericSize(currentHeight, projectedHeight = null, futureDate = null) {
    // Generic US children's sizing based on height (cm)
    const genericChart = [
      { label: 'Newborn', heightMin: 45, heightMax: 55 },
      { label: '0-3M', heightMin: 55, heightMax: 61 },
      { label: '3-6M', heightMin: 61, heightMax: 67 },
      { label: '6-9M', heightMin: 67, heightMax: 72 },
      { label: '9-12M', heightMin: 72, heightMax: 77 },
      { label: '12-18M', heightMin: 77, heightMax: 82 },
      { label: '18-24M', heightMin: 82, heightMax: 87 },
      { label: '2T', heightMin: 87, heightMax: 92 },
      { label: '3T', heightMin: 92, heightMax: 99 },
      { label: '4T', heightMin: 99, heightMax: 106 },
      { label: '5T', heightMin: 106, heightMax: 113 },
    ];

    const findSize = (height) => {
      for (const size of genericChart) {
        if (height >= size.heightMin && height <= size.heightMax) {
          return size.label;
        }
      }
      // If above range
      if (height > 113) return '5T+';
      if (height < 45) return 'Preemie';
      return null;
    };

    return {
      currentSize: findSize(currentHeight),
      projectedSize: projectedHeight ? findSize(projectedHeight) : null,
      projectionDate: futureDate,
      seasonalNote: futureDate ? this.getSeasonalNote(futureDate) : null,
      brand: 'Generic',
    };
  }

  /**
   * Convert measurements to metric
   */
  convertToMetric(value, unit, type) {
    if (!value || !unit) return value;

    if (type === 'height') {
      if (unit === 'inches' || unit === 'in') {
        return value * 2.54; // inches to cm
      }
      if (unit === 'feet' || unit === 'ft') {
        return value * 30.48; // feet to cm
      }
    }

    if (type === 'weight') {
      if (unit === 'lbs' || unit === 'pounds' || unit === 'lb') {
        return value * 0.453592; // lbs to kg
      }
      if (unit === 'oz' || unit === 'ounces') {
        return value * 0.0283495; // oz to kg
      }
    }

    return value; // Assume already in metric
  }

  /**
   * Create size badge HTML
   */
  createSizeBadge(recommendation) {
    if (!recommendation || !recommendation.currentSize) {
      return '';
    }

    const projectedHtml =
      recommendation.projectedSize && recommendation.projectedSize !== recommendation.currentSize
        ? `<small class="parentsave-size-future">In 6 months: ${recommendation.projectedSize}</small>`
        : '';

    return `
      <div class="parentsave-size-badge">
        <span class="parentsave-badge-icon">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 2C13.1 2 14 2.9 14 4C14 5.1 13.1 6 12 6C10.9 6 10 5.1 10 4C10 2.9 10.9 2 12 2ZM21 9H15V22H13V16H11V22H9V9H3V7H21V9Z" fill="#6366F1"/>
          </svg>
        </span>
        <span class="parentsave-badge-text">
          Your child fits: <strong>${recommendation.currentSize}</strong>
          ${projectedHtml}
        </span>
      </div>
    `;
  }
}

// Export for testing
export { GROWTH_CHARTS, GROWTH_VELOCITY };
