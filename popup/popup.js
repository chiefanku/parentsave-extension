/**
 * ParentSave Popup Script
 * Handles popup UI interactions and data display
 */

class PopupController {
  constructor() {
    this.profiles = [];
    this.settings = {};
    this.stats = {
      totalSavings: 0,
      couponsApplied: 0,
      itemsTracked: 0,
    };
  }

  /**
   * Initialize popup
   */
  async init() {
    await this.loadData();
    this.renderProfiles();
    this.renderStats();
    this.setupEventListeners();
  }

  /**
   * Load data from storage via background script
   */
  async loadData() {
    try {
      const [profilesResponse, settingsResponse, itemsResponse] = await Promise.all([
        this.sendMessage({ type: 'GET_CHILD_PROFILES' }),
        this.sendMessage({ type: 'GET_SETTINGS' }),
        this.sendMessage({ type: 'GET_TRACKED_ITEMS' }),
      ]);

      this.profiles = profilesResponse?.data || [];
      this.settings = settingsResponse?.data || {};
      this.stats.itemsTracked = itemsResponse?.data?.length || 0;

      // Load stats from storage
      const statsResult = await chrome.storage.local.get('stats');
      if (statsResult.stats) {
        this.stats = { ...this.stats, ...statsResult.stats };
      }
    } catch (error) {
      console.error('Error loading data:', error);
    }
  }

  /**
   * Render child profiles
   */
  renderProfiles() {
    const container = document.getElementById('profiles-list');

    if (this.profiles.length === 0) {
      container.innerHTML = `
        <p class="empty-state">No child profiles yet. Add one to get personalized size recommendations!</p>
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
        <div class="profile-info">
          <span class="profile-name">${this.escapeHtml(profile.name)}</span>
          <span class="profile-age">${this.calculateAge(profile.birthDate)}</span>
        </div>
        <div class="profile-actions">
          <button class="icon-btn edit-profile" data-id="${profile.id}" aria-label="Edit">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
            </svg>
          </button>
          <button class="icon-btn delete-profile" data-id="${profile.id}" aria-label="Delete">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            </svg>
          </button>
        </div>
      </div>
    `
      )
      .join('');

    // Add event listeners for profile actions
    container.querySelectorAll('.edit-profile').forEach((btn) => {
      btn.addEventListener('click', (e) => this.editProfile(e.target.closest('button').dataset.id));
    });

    container.querySelectorAll('.delete-profile').forEach((btn) => {
      btn.addEventListener('click', (e) => this.deleteProfile(e.target.closest('button').dataset.id));
    });
  }

  /**
   * Render stats
   */
  renderStats() {
    document.getElementById('total-savings').textContent = `$${this.stats.totalSavings.toFixed(2)}`;
    document.getElementById('coupons-applied').textContent = this.stats.couponsApplied;
    document.getElementById('items-tracked').textContent = this.stats.itemsTracked;
  }

  /**
   * Set up event listeners
   */
  setupEventListeners() {
    // Settings button
    document.getElementById('settings-btn').addEventListener('click', () => {
      chrome.runtime.openOptionsPage();
    });

    // Add child button
    document.getElementById('add-child-btn').addEventListener('click', () => {
      this.showAddChildModal();
    });

    // Modal close
    document.querySelector('.modal-close').addEventListener('click', () => {
      this.hideAddChildModal();
    });

    // Cancel add
    document.getElementById('cancel-add').addEventListener('click', () => {
      this.hideAddChildModal();
    });

    // Add child form
    document.getElementById('add-child-form').addEventListener('submit', (e) => {
      e.preventDefault();
      this.handleAddChild(e.target);
    });

    // Close modal on outside click
    document.getElementById('add-child-modal').addEventListener('click', (e) => {
      if (e.target.classList.contains('modal')) {
        this.hideAddChildModal();
      }
    });
  }

  /**
   * Show add child modal
   */
  showAddChildModal() {
    document.getElementById('add-child-modal').classList.remove('hidden');
    document.getElementById('child-name').focus();
  }

  /**
   * Hide add child modal
   */
  hideAddChildModal() {
    document.getElementById('add-child-modal').classList.add('hidden');
    document.getElementById('add-child-form').reset();
  }

  /**
   * Handle add child form submission
   */
  async handleAddChild(form) {
    const formData = new FormData(form);

    const profile = {
      id: this.generateId(),
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
      growthPercentile: 50, // Default to 50th percentile
    };

    try {
      await this.sendMessage({ type: 'SAVE_CHILD_PROFILE', profile });
      this.profiles.push(profile);
      this.renderProfiles();
      this.hideAddChildModal();
    } catch (error) {
      console.error('Error saving profile:', error);
      alert('Failed to save profile. Please try again.');
    }
  }

  /**
   * Edit profile
   */
  async editProfile(profileId) {
    // For MVP, open options page for editing
    chrome.runtime.openOptionsPage();
  }

  /**
   * Delete profile
   */
  async deleteProfile(profileId) {
    if (!confirm('Are you sure you want to delete this profile?')) {
      return;
    }

    try {
      await this.sendMessage({ type: 'DELETE_CHILD_PROFILE', profileId });
      this.profiles = this.profiles.filter((p) => p.id !== profileId);
      this.renderProfiles();
    } catch (error) {
      console.error('Error deleting profile:', error);
      alert('Failed to delete profile. Please try again.');
    }
  }

  /**
   * Calculate age from birth date
   */
  calculateAge(birthDate) {
    const birth = new Date(birthDate);
    const now = new Date();
    const months =
      (now.getFullYear() - birth.getFullYear()) * 12 + (now.getMonth() - birth.getMonth());

    if (months < 1) {
      const days = Math.floor((now - birth) / (1000 * 60 * 60 * 24));
      return `${days} days`;
    } else if (months < 24) {
      return `${months} months`;
    } else {
      const years = Math.floor(months / 12);
      const remainingMonths = months % 12;
      return remainingMonths > 0 ? `${years}y ${remainingMonths}m` : `${years} years`;
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

// Initialize popup when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  const popup = new PopupController();
  popup.init();
});
