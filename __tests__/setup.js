/**
 * Jest Test Setup
 * Common mocks and setup for all tests
 */

// Mock chrome storage
export const createMockStorage = () => ({
  data: {},
  get: function(keys) {
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
    return Promise.resolve(this.data);
  },
  set: function(items) {
    Object.assign(this.data, items);
    return Promise.resolve();
  },
  clear: function() {
    this.data = {};
    return Promise.resolve();
  },
});

// Setup global chrome mock
export const setupChromeMock = (mockStorage) => {
  global.chrome = {
    storage: {
      local: mockStorage,
      sync: mockStorage,
    },
    runtime: {
      getURL: (path) => `chrome-extension://test/${path}`,
    },
    notifications: {
      create: () => Promise.resolve('notification-id'),
    },
  };
};

// Setup document mock
export const setupDocumentMock = () => {
  global.document = {
    querySelector: () => null,
    querySelectorAll: () => [],
    createElement: (tag) => ({
      tagName: tag.toUpperCase(),
      textContent: '',
      innerHTML: '',
      className: '',
      appendChild: () => {},
    }),
  };
};

// Setup window mock
export const setupWindowMock = (hostname = 'amazon.com', pathname = '/') => {
  global.window = {
    location: {
      hostname,
      pathname,
      href: `https://${hostname}${pathname}`,
    },
  };
};
