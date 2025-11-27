import { BotSettings } from '../database/models.js';

class BotSettingsService {
  /**
   * Get setting by key
   */
  async getSetting(key) {
    try {
      const setting = await BotSettings.findOne({ where: { key } });
      return setting ? setting.value : null;
    } catch (error) {
      console.error(`Error getting setting ${key}:`, error);
      return null;
    }
  }

  /**
   * Set setting value
   */
  async setSetting(key, value, description = null) {
    try {
      const [setting, created] = await BotSettings.findOrCreate({
        where: { key },
        defaults: { key, value, description }
      });

      if (!created) {
        await setting.update({ value, description });
      }

      return setting;
    } catch (error) {
      console.error(`Error setting ${key}:`, error);
      throw error;
    }
  }

  /**
   * Get all settings
   */
  async getAllSettings() {
    try {
      const settings = await BotSettings.findAll();
      const settingsMap = {};
      
      settings.forEach(setting => {
        settingsMap[setting.key] = setting.value;
      });

      return settingsMap;
    } catch (error) {
      console.error('Error getting all settings:', error);
      return {};
    }
  }

  /**
   * Initialize default settings
   */
  async initializeDefaults() {
    const defaults = {
      // Auto-reply settings
      auto_reply_enabled: {
        value: true,
        description: 'Enable/disable automatic AI replies'
      },
      auto_reply_delay: {
        value: { min: 2000, max: 5000 },
        description: 'Delay before auto-reply (milliseconds)'
      },

      // Business hours
      business_hours_enabled: {
        value: false,
        description: 'Only reply during business hours'
      },
      business_hours_start: {
        value: '09:00',
        description: 'Business hours start time (HH:MM)'
      },
      business_hours_end: {
        value: '17:00',
        description: 'Business hours end time (HH:MM)'
      },
      business_hours_days: {
        value: [1, 2, 3, 4, 5], // Monday to Friday
        description: 'Business days (0=Sunday, 6=Saturday)'
      },

      // Out of office
      out_of_office_enabled: {
        value: false,
        description: 'Enable out of office auto-reply'
      },
      out_of_office_message: {
        value: 'Terima kasih atas pesan Anda. Kami sedang di luar jam kerja. Kami akan membalas Anda pada jam kerja berikutnya (Senin-Jumat, 09:00-17:00).',
        description: 'Out of office message template'
      },
      out_of_office_use_ai: {
        value: false,
        description: 'Use AI to generate out of office reply'
      },

      // Stop conditions
      stop_keywords: {
        value: ['STOP', 'BERHENTI', 'UNSUBSCRIBE', 'CANCEL'],
        description: 'Keywords that stop bot from replying'
      },
      stop_message: {
        value: 'Anda telah berhenti dari layanan otomatis. Untuk mengaktifkan kembali, kirim pesan "START".',
        description: 'Message sent when user sends stop keyword'
      },

      // Reply limits
      max_replies_per_contact: {
        value: 10,
        description: 'Maximum auto-replies per contact per day (0 = unlimited)'
      },
      max_conversation_turns: {
        value: 20,
        description: 'Maximum back-and-forth turns before requiring human (0 = unlimited)'
      },

      // AI behavior
      require_human_keywords: {
        value: ['MANUSIA', 'HUMAN', 'OPERATOR', 'AGENT', 'CUSTOMER SERVICE'],
        description: 'Keywords that trigger "need human" flag'
      },
      require_human_message: {
        value: 'Saya akan menghubungkan Anda dengan tim kami. Mohon tunggu sebentar.',
        description: 'Message when human is requested'
      },

      // Group settings
      reply_in_groups: {
        value: false,
        description: 'Enable auto-reply in group chats'
      },
      group_mention_only: {
        value: true,
        description: 'Only reply when mentioned in groups'
      },

      // Message filtering
      ignore_broadcast: {
        value: true,
        description: 'Ignore broadcast messages'
      },
      ignore_forwarded: {
        value: false,
        description: 'Ignore forwarded messages'
      },

      // Greeting
      first_message_greeting: {
        value: true,
        description: 'Send greeting on first contact'
      },
      greeting_message: {
        value: 'Halo! 👋 Terima kasih telah menghubungi kami. Ada yang bisa saya bantu?',
        description: 'First contact greeting message'
      },

      // Human takeover
      human_takeover_enabled: {
        value: true,
        description: 'Allow manual takeover from dashboard'
      },
      human_takeover_notification: {
        value: 'Tim kami sekarang akan melanjutkan percakapan ini.',
        description: 'Message when human takes over'
      }
    };

    for (const [key, config] of Object.entries(defaults)) {
      const exists = await BotSettings.findOne({ where: { key } });
      if (!exists) {
        await BotSettings.create({
          key,
          value: config.value,
          description: config.description
        });
      }
    }

    console.log('✅ Bot settings initialized');
  }

  /**
   * Check if auto-reply is enabled
   */
  async isAutoReplyEnabled() {
    const enabled = await this.getSetting('auto_reply_enabled');
    return enabled !== false; // Default true
  }

  /**
   * Check if should reply to this contact
   */
  async shouldReplyToContact(contact, messageCount = 0) {
    // Check if auto-reply is enabled
    if (!(await this.isAutoReplyEnabled())) {
      return { should: false, reason: 'Auto-reply is disabled' };
    }

    // Check business hours
    const businessHoursEnabled = await this.getSetting('business_hours_enabled');
    if (businessHoursEnabled) {
      const isBusinessHours = await this.checkBusinessHours();
      if (!isBusinessHours) {
        return { should: false, reason: 'Outside business hours' };
      }
    }

    // Check reply limits
    const maxReplies = await this.getSetting('max_replies_per_contact');
    if (maxReplies > 0 && messageCount >= maxReplies) {
      return { should: false, reason: 'Max replies reached for today' };
    }

    // Check if contact is in stopped list
    const stoppedContacts = await this.getSetting('stopped_contacts') || [];
    if (stoppedContacts.includes(contact.id)) {
      return { should: false, reason: 'Contact has stopped bot' };
    }

    // Check if group
    if (contact.isGroup) {
      const replyInGroups = await this.getSetting('reply_in_groups');
      if (!replyInGroups) {
        return { should: false, reason: 'Group replies disabled' };
      }
    }

    return { should: true, reason: null };
  }

  /**
   * Check if in business hours
   */
  async checkBusinessHours() {
    const now = new Date();
    const currentDay = now.getDay();
    const currentTime = now.getHours() * 60 + now.getMinutes();

    // Check if today is business day
    const businessDays = await this.getSetting('business_hours_days') || [1, 2, 3, 4, 5];
    if (!businessDays.includes(currentDay)) {
      return false;
    }

    // Check time
    const startTime = await this.getSetting('business_hours_start') || '09:00';
    const endTime = await this.getSetting('business_hours_end') || '17:00';

    const [startHour, startMin] = startTime.split(':').map(Number);
    const [endHour, endMin] = endTime.split(':').map(Number);

    const startMinutes = startHour * 60 + startMin;
    const endMinutes = endHour * 60 + endMin;

    return currentTime >= startMinutes && currentTime <= endMinutes;
  }

  /**
   * Check if message contains stop keyword
   */
  async checkStopKeyword(messageText) {
    const stopKeywords = await this.getSetting('stop_keywords') || [];
    const text = messageText.toUpperCase().trim();
    
    return stopKeywords.some(keyword => text === keyword.toUpperCase());
  }

  /**
   * Check if message requires human
   */
  async checkRequireHuman(messageText) {
    const keywords = await this.getSetting('require_human_keywords') || [];
    const text = messageText.toUpperCase();
    
    return keywords.some(keyword => text.includes(keyword.toUpperCase()));
  }

  /**
   * Add contact to stopped list
   */
  async stopContact(contactId) {
    const stoppedContacts = await this.getSetting('stopped_contacts') || [];
    if (!stoppedContacts.includes(contactId)) {
      stoppedContacts.push(contactId);
      await this.setSetting('stopped_contacts', stoppedContacts);
    }
  }

  /**
   * Remove contact from stopped list
   */
  async startContact(contactId) {
    const stoppedContacts = await this.getSetting('stopped_contacts') || [];
    const filtered = stoppedContacts.filter(id => id !== contactId);
    await this.setSetting('stopped_contacts', filtered);
  }

  /**
   * Get out of office message
   */
  async getOutOfOfficeMessage() {
    const useAI = await this.getSetting('out_of_office_use_ai');
    const message = await this.getSetting('out_of_office_message');
    
    return { message, useAI };
  }

  /**
   * Toggle auto-reply
   */
  async toggleAutoReply(enabled) {
    await this.setSetting('auto_reply_enabled', enabled);
    return enabled;
  }

  /**
   * Get bot status summary
   */
  async getStatusSummary() {
    const autoReplyEnabled = await this.getSetting('auto_reply_enabled');
    const businessHoursEnabled = await this.getSetting('business_hours_enabled');
    const isBusinessHours = await this.checkBusinessHours();
    const outOfOfficeEnabled = await this.getSetting('out_of_office_enabled');
    const stoppedContacts = await this.getSetting('stopped_contacts') || [];

    return {
      autoReply: {
        enabled: autoReplyEnabled,
        status: autoReplyEnabled ? 'Active' : 'Disabled'
      },
      businessHours: {
        enabled: businessHoursEnabled,
        isCurrentlyBusinessHours: isBusinessHours,
        status: businessHoursEnabled ? (isBusinessHours ? 'Active' : 'Outside hours') : 'Disabled'
      },
      outOfOffice: {
        enabled: outOfOfficeEnabled,
        status: outOfOfficeEnabled ? 'Active' : 'Disabled'
      },
      statistics: {
        stoppedContactsCount: stoppedContacts.length
      }
    };
  }
}

export default new BotSettingsService();