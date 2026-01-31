/**
 * Jest Global Setup
 * Runs before all test suites
 */

// Ensure jest globals are available
import { jest } from '@jest/globals';

// Make jest available globally for ES modules
global.jest = jest;

// Mock chrome API globally
const mockStorage = {
  data: {},
  get: jest.fn(function(keys) {
    if (typeof keys === 'string') {
      return Promise.resolve({ [keys]: this.data[keys] });
    }
    if (Array.isArray(keys)) {
      const result = {};
      keys.forEach(key => {
        result[key] = this.data[key];
      });
      return Promise.resolve(result);
    }
    return Promise.resolve({ ...this.data });
  }),
  set: jest.fn(function(items) {
    Object.assign(this.data, items);
    return Promise.resolve();
  }),
  clear: jest.fn(function() {
    this.data = {};
    return Promise.resolve();
  }),
};

global.chrome = {
  storage: {
    local: mockStorage,
    sync: mockStorage,
  },
  runtime: {
    getURL: jest.fn((path) => `chrome-extension://test/${path}`),
    sendMessage: jest.fn(),
    onMessage: {
      addListener: jest.fn(),
    },
    onInstalled: {
      addListener: jest.fn(),
    },
  },
  notifications: {
    create: jest.fn(() => Promise.resolve('notification-id')),
    clear: jest.fn(() => Promise.resolve()),
    onButtonClicked: {
      addListener: jest.fn(),
    },
    onClicked: {
      addListener: jest.fn(),
    },
  },
  alarms: {
    create: jest.fn(),
    clearAll: jest.fn(() => Promise.resolve()),
    onAlarm: {
      addListener: jest.fn(),
    },
  },
  tabs: {
    create: jest.fn(),
  },
};

// Reset mock storage data before each test
beforeEach(() => {
  mockStorage.data = {};
  jest.clearAllMocks();
});
