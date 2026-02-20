/**
 * ParentSave Background Service Worker
 * Handles alarms, notifications, and message passing
 * NOTE: No DOM access in Manifest V3 service workers
 */

// Import modules
import { StorageManager } from '../lib/storage.js';
import { RecallChecker } from '../lib/recalls.js';
import { RegistryTracker } from '../lib/registry-tracker.js';
import { CouponEngine } from '../lib/coupons.js';

// Constants
const ALARM_NAMES = {
  PRICE_CHECK: 'parentsave-price-check',
  RECALL_UPDATE: 'parentsave-recall-update',
};

const ALARM_INTERVALS = {
  PRICE_CHECK: 60, // minutes
  RECALL_UPDATE: 360, // 6 hours
};

/**
 * Initialize extension on install
 */
chrome.runtime.onInstalled.addListener(async (details) => {
  console.log('ParentSave installed:', details.reason);

  // Initialize storage with defaults
  const storage = new StorageManager();
  await storage.initializeDefaults();

  // Set up alarms for periodic tasks
  await setupAlarms();

  // Show welcome notification on fresh install
  if (details.reason === 'install') {
    chrome.notifications.create('welcome', {
      type: 'basic',
      iconUrl: chrome.runtime.getURL('icons/icon128.png'),
      title: 'Welcome to ParentSave!',
      message: 'Click the extension icon to set up your child profiles and start saving.',
    });
  }
});

/**
 * Set up periodic alarms
 */
async function setupAlarms() {
  // Clear existing alarms first
  await chrome.alarms.clearAll();

  // Price check alarm (every hour)
  chrome.alarms.create(ALARM_NAMES.PRICE_CHECK, {
    delayInMinutes: 1,
    periodInMinutes: ALARM_INTERVALS.PRICE_CHECK,
  });

  // Recall update alarm (every 6 hours)
  chrome.alarms.create(ALARM_NAMES.RECALL_UPDATE, {
    delayInMinutes: 5,
    periodInMinutes: ALARM_INTERVALS.RECALL_UPDATE,
  });
}

/**
 * Handle alarms
 */
chrome.alarms.onAlarm.addListener(async (alarm) => {
  console.log('Alarm triggered:', alarm.name);

  try {
    switch (alarm.name) {
      case ALARM_NAMES.PRICE_CHECK:
        await handlePriceCheck();
        break;
      case ALARM_NAMES.RECALL_UPDATE:
        await handleRecallUpdate();
        break;
    }
  } catch (error) {
    console.error('Error handling alarm:', alarm.name, error);
  }
});

/**
 * Check for price drops on tracked registry items
 */
async function handlePriceCheck() {
  const tracker = new RegistryTracker();
  await tracker.loadTrackedItems();

  const alerts = await tracker.checkPriceDrops();

  for (const alert of alerts) {
    await chrome.notifications.create(`price-drop-${alert.item.id}`, {
      type: 'basic',
      iconUrl: chrome.runtime.getURL('icons/icon128.png'),
      title: 'Price Drop Alert!',
      message: `${truncate(alert.item.title, 50)} dropped ${alert.dropPercent}% to $${alert.currentPrice.toFixed(2)}!`,
      buttons: [{ title: 'View Item' }],
    });
  }
}

/**
 * Update recall database cache
 */
async function handleRecallUpdate() {
  const recallChecker = new RecallChecker();
  await recallChecker.updateRecallCache();
}

/**
 * Message passing handler
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Message received:', message.type, 'from:', sender.tab?.id || 'popup');

  // Use async handler
  handleMessage(message, sender)
    .then(sendResponse)
    .catch((error) => {
      console.error('Message handler error:', error);
      sendResponse({ success: false, error: error.message });
    });

  // Return true to indicate async response
  return true;
});

/**
 * Handle incoming messages
 */
async function handleMessage(message, sender) {
  const storage = new StorageManager();

  switch (message.type) {
    case 'GET_CHILD_PROFILES':
      return { success: true, data: await storage.getChildProfiles() };

    case 'SAVE_CHILD_PROFILE':
      await storage.saveChildProfile(message.profile);
      return { success: true };

    case 'DELETE_CHILD_PROFILE':
      await storage.deleteChildProfile(message.profileId);
      return { success: true };

    case 'CHECK_RECALL':
      const recallChecker = new RecallChecker();
      const recall = await recallChecker.checkProduct(message.productInfo);
      return { success: true, data: recall };

    case 'GET_COUPONS': {
      const engine = new CouponEngine();
      const coupons = await engine.findCoupons({ id: message.retailerId });
      return { success: true, data: coupons };
    }

    case 'TRACK_REGISTRY_ITEM': {
      const tracker = new RegistryTracker();
      await tracker.loadTrackedItems(); // Must load existing items before adding
      await tracker.addTrackedItem(message.item);
      return { success: true };
    }

    case 'GET_TRACKED_ITEMS':
      const registryTracker = new RegistryTracker();
      await registryTracker.loadTrackedItems();
      return { success: true, data: registryTracker.trackedItems };

    case 'GET_SETTINGS':
      return { success: true, data: await storage.getSettings() };

    case 'SAVE_SETTINGS':
      await storage.saveSettings(message.settings);
      return { success: true };

    case 'GET_SIZE_RECOMMENDATION': {
      // Size calculation is handled inline by the content script
      // This is a no-op passthrough for future server-side recommendations
      return { success: true, data: null };
    }

    default:
      console.warn('Unknown message type:', message.type);
      return { success: false, error: 'Unknown message type' };
  }
}

/**
 * Handle notification button clicks
 */
chrome.notifications.onButtonClicked.addListener(async (notificationId, buttonIndex) => {
  if (notificationId.startsWith('price-drop-')) {
    const itemId = notificationId.replace('price-drop-', '');
    const tracker = new RegistryTracker();
    await tracker.loadTrackedItems();
    const item = tracker.trackedItems.find((i) => i.id === itemId);

    if (item && item.url) {
      chrome.tabs.create({ url: item.url });
    }
  }

  chrome.notifications.clear(notificationId);
});

/**
 * Handle notification clicks
 */
chrome.notifications.onClicked.addListener((notificationId) => {
  chrome.notifications.clear(notificationId);
});

/**
 * Utility: Truncate string
 */
function truncate(str, maxLength) {
  if (!str) return '';
  if (str.length <= maxLength) return str;
  return str.substring(0, maxLength - 3) + '...';
}

// Export for testing
export { setupAlarms, handlePriceCheck, handleRecallUpdate, handleMessage, truncate };
