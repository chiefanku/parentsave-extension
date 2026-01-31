/**
 * ParentSave Options Page Script
 */

class OptionsController {
  constructor() {
    this.profiles = [];
    this.settings = {};
  }

  /**
   * Initialize options page
   */
  async init() {
    await this.loadData();
    this.renderProfiles();
    this.bindSettings();
    this.setupEventListeners();
  }

  /**
   * Load data from storage
   */
  async loadData() {
    try {
      const [profilesResponse, settingsResponse] = await Promise.all([
        this.sendMessage({ type: 'GET_CHILD_PROFILES' }),
        this.sendMessage({ type: 'GET_SETTINGS' }),
      ]);

      this.profiles = profilesResponse?.data || [];
      this.settings = settingsResponse?.data || {};
    } catch (error) {
      console.error('Error loading data:', error);
    }
  }

  /**
   * Render child profiles
   */
  renderProfiles() {
    const container = document.getElementById('profiles-container');

    if (this.profiles.length === 0) {
      container.innerHTML = `
        <div class="empty-profiles">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" stroke-width="1.5">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
            <circle cx="12" cy="7" r="4"></circle>
          </svg>
          <p>No child profiles yet</p>
          <span>Add your first child to get personalized size recommendations</span>
        </div>
      `;
      return;
    }

    container.innerHTML = this.profiles
      .map(
        (profile) => `
      <div class="profile-card" data-id="${profile.id}">
        <div class="profile-avatar">
          ${this.getInitials(profile.name)}
        </div>
        <div class="profile-details">
          <h3 class="profile-name">${this.escapeHtml(profile.name)}</h3>
          <p class="profile-info">${this.calculateAge(profile.birthDate)} old</p>
          ${this.getMeasurementsText(profile)}
        </div>
        <div class="profile-actions">
          <button class="btn-icon edit-profile" data-id="${profile.id}" title="Edit">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
            </svg>
          </button>
          <button class="btn-icon delete-profile" data-id="${profile.id}" title="Delete">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            </svg>
          </button>
        </div>
      </div>
    `
      )
      .join('');

    // Add event listeners
    container.querySelectorAll('.edit-profile').forEach((btn) => {
      btn.addEventListener('click', () => this.editProfile(btn.dataset.id));
    });

    container.querySelectorAll('.delete-profile').forEach((btn) => {
      btn.addEventListener('click', () => this.deleteProfile(btn.dataset.id));
    });
  }

  /**
   * Get measurements text for profile
   */
  getMeasurementsText(profile) {
    if (!profile.measurements) return '';

    const parts = [];
    if (profile.measurements.height?.value) {
      parts.push(`${profile.measurements.height.value} ${profile.measurements.height.unit}`);
    }
    if (profile.measurements.weight?.value) {
      parts.push(`${profile.measurements.weight.value} ${profile.measurements.weight.unit}`);
    }

    if (parts.length === 0) return '';
    return `<p class="profile-measurements">${parts.join(' | ')}</p>`;
  }

  /**
   * Bind settings to form elements
   */
  bindSettings() {
    // Notifications
    document.getElementById('notify-price-drops').checked =
      this.settings.notifications?.priceDrops !== false;
    document.getElementById('notify-recalls').checked =
      this.settings.notifications?.recalls !== false;
    document.getElementById('notify-coupons').checked =
      this.settings.notifications?.coupons !== false;

    // Size Predictor
    document.getElementById('size-enabled').checked =
      this.settings.sizePredictor?.enabled !== false;
    document.getElementById('size-future').checked =
      this.settings.sizePredictor?.showFutureSizes !== false;

    // Coupons
    document.getElementById('coupon-popup').checked =
      this.settings.coupons?.showPopup !== false;
    document.getElementById('coupon-auto').checked =
      this.settings.coupons?.autoApply === true;
  }

  /**
   * Set up event listeners
   */
  setupEventListeners() {
    // Add profile button
    document.getElementById('add-profile-btn').addEventListener('click', () => {
      this.showProfileModal();
    });

    // Modal close
    document.querySelector('.modal-close').addEventListener('click', () => {
      this.hideProfileModal();
    });

    // Cancel profile
    document.getElementById('cancel-profile').addEventListener('click', () => {
      this.hideProfileModal();
    });

    // Profile form submit
    document.getElementById('profile-form').addEventListener('submit', (e) => {
      e.preventDefault();
      this.saveProfile();
    });

    // Settings changes
    const settingInputs = [
      'notify-price-drops',
      'notify-recalls',
      'notify-coupons',
      'size-enabled',
      'size-future',
      'coupon-popup',
      'coupon-auto',
    ];

    settingInputs.forEach((id) => {
      document.getElementById(id).addEventListener('change', () => {
        this.saveSettings();
      });
    });

    // Export data
    document.getElementById('export-data-btn').addEventListener('click', () => {
      this.exportData();
    });

    // Import data
    document.getElementById('import-data-btn').addEventListener('click', () => {
      document.getElementById('import-file').click();
    });

    document.getElementById('import-file').addEventListener('change', (e) => {
      this.importData(e.target.files[0]);
    });

    // Clear data
    document.getElementById('clear-data-btn').addEventListener('click', () => {
      this.clearData();
    });

    // Close modal on outside click
    document.getElementById('profile-modal').addEventListener('click', (e) => {
      if (e.target.classList.contains('modal')) {
        this.hideProfileModal();
      }
    });
  }

  /**
   * Show profile modal
   */
  showProfileModal(profile = null) {
    const modal = document.getElementById('profile-modal');
    const form = document.getElementById('profile-form');
    const title = document.getElementById('modal-title');

    if (profile) {
      title.textContent = 'Edit Child Profile';
      document.getElementById('profile-id').value = profile.id;
      document.getElementById('profile-name').value = profile.name;
      document.getElementById('profile-birthdate').value = profile.birthDate;
      document.getElementById('profile-gender').value = profile.gender || 'female';
      document.getElementById('profile-height').value = profile.measurements?.height?.value || '';
      document.getElementById('profile-height-unit').value =
        profile.measurements?.height?.unit || 'inches';
      document.getElementById('profile-weight').value = profile.measurements?.weight?.value || '';
      document.getElementById('profile-weight-unit').value =
        profile.measurements?.weight?.unit || 'lbs';
      document.getElementById('profile-percentile').value = profile.growthPercentile || 50;
    } else {
      title.textContent = 'Add Child Profile';
      form.reset();
      document.getElementById('profile-id').value = '';
    }

    modal.classList.remove('hidden');
    document.getElementById('profile-name').focus();
  }

  /**
   * Hide profile modal
   */
  hideProfileModal() {
    document.getElementById('profile-modal').classList.add('hidden');
    document.getElementById('profile-form').reset();
  }

  /**
   * Save profile from form
   */
  async saveProfile() {
    const form = document.getElementById('profile-form');
    const formData = new FormData(form);

    const profileId = formData.get('id') || this.generateId();
    const existingProfile = this.profiles.find((p) => p.id === profileId);

    const profile = {
      id: profileId,
      name: formData.get('name'),
      birthDate: formData.get('birthDate'),
      gender: formData.get('gender'),
      measurements: {
        height: {
          value: parseFloat(formData.get('height')) || null,
          unit: formData.get('heightUnit'),
          date: new Date().toISOString(),
        },
        weight: {
          value: parseFloat(formData.get('weight')) || null,
          unit: formData.get('weightUnit'),
          date: new Date().toISOString(),
        },
      },
      growthPercentile: parseInt(formData.get('growthPercentile'), 10),
      createdAt: existingProfile?.createdAt || new Date().toISOString(),
    };

    try {
      await this.sendMessage({ type: 'SAVE_CHILD_PROFILE', profile });

      if (existingProfile) {
        const index = this.profiles.findIndex((p) => p.id === profileId);
        this.profiles[index] = profile;
      } else {
        this.profiles.push(profile);
      }

      this.renderProfiles();
      this.hideProfileModal();
      this.showNotification('Profile saved successfully');
    } catch (error) {
      console.error('Error saving profile:', error);
      this.showNotification('Failed to save profile', 'error');
    }
  }

  /**
   * Edit profile
   */
  editProfile(profileId) {
    const profile = this.profiles.find((p) => p.id === profileId);
    if (profile) {
      this.showProfileModal(profile);
    }
  }

  /**
   * Delete profile
   */
  async deleteProfile(profileId) {
    if (!confirm('Are you sure you want to delete this child profile?')) {
      return;
    }

    try {
      await this.sendMessage({ type: 'DELETE_CHILD_PROFILE', profileId });
      this.profiles = this.profiles.filter((p) => p.id !== profileId);
      this.renderProfiles();
      this.showNotification('Profile deleted');
    } catch (error) {
      console.error('Error deleting profile:', error);
      this.showNotification('Failed to delete profile', 'error');
    }
  }

  /**
   * Save settings
   */
  async saveSettings() {
    const settings = {
      notifications: {
        priceDrops: document.getElementById('notify-price-drops').checked,
        recalls: document.getElementById('notify-recalls').checked,
        coupons: document.getElementById('notify-coupons').checked,
      },
      sizePredictor: {
        enabled: document.getElementById('size-enabled').checked,
        showFutureSizes: document.getElementById('size-future').checked,
      },
      coupons: {
        showPopup: document.getElementById('coupon-popup').checked,
        autoApply: document.getElementById('coupon-auto').checked,
      },
    };

    try {
      await this.sendMessage({ type: 'SAVE_SETTINGS', settings });
      this.settings = settings;
      this.showNotification('Settings saved');
    } catch (error) {
      console.error('Error saving settings:', error);
      this.showNotification('Failed to save settings', 'error');
    }
  }

  /**
   * Export data
   */
  async exportData() {
    try {
      const data = {
        version: '1.0.0',
        exportedAt: new Date().toISOString(),
        profiles: this.profiles,
        settings: this.settings,
      };

      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `parentsave-backup-${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);

      this.showNotification('Data exported successfully');
    } catch (error) {
      console.error('Error exporting data:', error);
      this.showNotification('Failed to export data', 'error');
    }
  }

  /**
   * Import data
   */
  async importData(file) {
    if (!file) return;

    try {
      const text = await file.text();
      const data = JSON.parse(text);

      if (!data.version || !data.profiles) {
        throw new Error('Invalid backup file');
      }

      // Import profiles
      for (const profile of data.profiles) {
        await this.sendMessage({ type: 'SAVE_CHILD_PROFILE', profile });
      }

      // Import settings
      if (data.settings) {
        await this.sendMessage({ type: 'SAVE_SETTINGS', settings: data.settings });
      }

      // Reload data
      await this.loadData();
      this.renderProfiles();
      this.bindSettings();

      this.showNotification('Data imported successfully');
    } catch (error) {
      console.error('Error importing data:', error);
      this.showNotification('Failed to import data: ' + error.message, 'error');
    }

    // Reset file input
    document.getElementById('import-file').value = '';
  }

  /**
   * Clear all data
   */
  async clearData() {
    if (!confirm('Are you sure you want to clear ALL data? This cannot be undone.')) {
      return;
    }

    try {
      await chrome.storage.local.clear();
      this.profiles = [];
      this.settings = {};
      this.renderProfiles();
      this.bindSettings();
      this.showNotification('All data cleared');
    } catch (error) {
      console.error('Error clearing data:', error);
      this.showNotification('Failed to clear data', 'error');
    }
  }

  /**
   * Show notification
   */
  showNotification(message, type = 'success') {
    // Remove existing notification
    document.querySelector('.notification')?.remove();

    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.textContent = message;

    document.body.appendChild(notification);

    setTimeout(() => {
      notification.classList.add('fade-out');
      setTimeout(() => notification.remove(), 300);
    }, 3000);
  }

  /**
   * Calculate age from birth date
   */
  calculateAge(birthDate) {
    const birth = new Date(birthDate);
    const now = new Date();
    const months =
      (now.getFullYear() - birth.getFullYear()) * 12 + (now.getMonth() - birth.getMonth());

    if (months < 24) {
      return `${months} months`;
    } else {
      const years = Math.floor(months / 12);
      return `${years} years`;
    }
  }

  /**
   * Get initials from name
   */
  getInitials(name) {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .substring(0, 2);
  }

  /**
   * Generate unique ID
   */
  generateId() {
    return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }

  /**
   * Send message to background script
   */
  sendMessage(message) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(message, (response) => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
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
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  const options = new OptionsController();
  options.init();
});
