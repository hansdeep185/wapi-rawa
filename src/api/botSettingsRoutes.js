import express from 'express';
import jwt from 'jsonwebtoken';
import botSettingsService from '../services/botSettings.js';

const router = express.Router();

// Authentication middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid or expired token' });
    }
    req.user = user;
    next();
  });
};

// ============ Bot Settings Routes ============

/**
 * Get all bot settings
 */
router.get('/bot/settings', authenticateToken, async (req, res) => {
  try {
    const settings = await botSettingsService.getAllSettings();
    
    res.json({
      success: true,
      settings
    });
  } catch (error) {
    console.error('Error getting bot settings:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Get specific setting
 */
router.get('/bot/settings/:key', authenticateToken, async (req, res) => {
  try {
    const { key } = req.params;
    const value = await botSettingsService.getSetting(key);
    
    if (value === null) {
      return res.status(404).json({ error: 'Setting not found' });
    }

    res.json({
      success: true,
      key,
      value
    });
  } catch (error) {
    console.error('Error getting setting:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Update setting
 */
router.put('/bot/settings/:key', authenticateToken, async (req, res) => {
  try {
    const { key } = req.params;
    const { value, description } = req.body;

    if (value === undefined) {
      return res.status(400).json({ error: 'Value is required' });
    }

    const setting = await botSettingsService.setSetting(key, value, description);

    res.json({
      success: true,
      message: 'Setting updated successfully',
      setting: {
        key: setting.key,
        value: setting.value,
        description: setting.description
      }
    });
  } catch (error) {
    console.error('Error updating setting:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Batch update settings
 */
router.post('/bot/settings/batch', authenticateToken, async (req, res) => {
  try {
    const { settings } = req.body;

    if (!settings || typeof settings !== 'object') {
      return res.status(400).json({ error: 'Settings object is required' });
    }

    const results = [];

    for (const [key, value] of Object.entries(settings)) {
      try {
        await botSettingsService.setSetting(key, value);
        results.push({ key, success: true });
      } catch (error) {
        results.push({ key, success: false, error: error.message });
      }
    }

    res.json({
      success: true,
      message: 'Batch update completed',
      results
    });
  } catch (error) {
    console.error('Error batch updating settings:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Get bot status summary
 */
router.get('/bot/status', authenticateToken, async (req, res) => {
  try {
    const status = await botSettingsService.getStatusSummary();
    
    res.json({
      success: true,
      status
    });
  } catch (error) {
    console.error('Error getting bot status:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Toggle auto-reply on/off
 */
router.post('/bot/auto-reply/toggle', authenticateToken, async (req, res) => {
  try {
    const { enabled } = req.body;

    if (typeof enabled !== 'boolean') {
      return res.status(400).json({ error: 'enabled (boolean) is required' });
    }

    await botSettingsService.toggleAutoReply(enabled);

    res.json({
      success: true,
      message: `Auto-reply ${enabled ? 'enabled' : 'disabled'}`,
      autoReplyEnabled: enabled
    });
  } catch (error) {
    console.error('Error toggling auto-reply:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Update business hours
 */
router.put('/bot/business-hours', authenticateToken, async (req, res) => {
  try {
    const { enabled, start, end, days } = req.body;

    const updates = {};

    if (typeof enabled === 'boolean') {
      updates.business_hours_enabled = enabled;
    }
    if (start) {
      // Validate time format
      if (!/^\d{2}:\d{2}$/.test(start)) {
        return res.status(400).json({ error: 'Invalid start time format. Use HH:MM' });
      }
      updates.business_hours_start = start;
    }
    if (end) {
      if (!/^\d{2}:\d{2}$/.test(end)) {
        return res.status(400).json({ error: 'Invalid end time format. Use HH:MM' });
      }
      updates.business_hours_end = end;
    }
    if (days) {
      if (!Array.isArray(days)) {
        return res.status(400).json({ error: 'days must be an array' });
      }
      updates.business_hours_days = days;
    }

    for (const [key, value] of Object.entries(updates)) {
      await botSettingsService.setSetting(key, value);
    }

    res.json({
      success: true,
      message: 'Business hours updated',
      updates
    });
  } catch (error) {
    console.error('Error updating business hours:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Update out of office settings
 */
router.put('/bot/out-of-office', authenticateToken, async (req, res) => {
  try {
    const { enabled, message, useAI } = req.body;

    const updates = {};

    if (typeof enabled === 'boolean') {
      updates.out_of_office_enabled = enabled;
    }
    if (message) {
      updates.out_of_office_message = message;
    }
    if (typeof useAI === 'boolean') {
      updates.out_of_office_use_ai = useAI;
    }

    for (const [key, value] of Object.entries(updates)) {
      await botSettingsService.setSetting(key, value);
    }

    res.json({
      success: true,
      message: 'Out of office settings updated',
      updates
    });
  } catch (error) {
    console.error('Error updating out of office:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Update stop keywords
 */
router.put('/bot/stop-keywords', authenticateToken, async (req, res) => {
  try {
    const { keywords, stopMessage } = req.body;

    if (keywords && !Array.isArray(keywords)) {
      return res.status(400).json({ error: 'keywords must be an array' });
    }

    if (keywords) {
      await botSettingsService.setSetting('stop_keywords', keywords);
    }
    if (stopMessage) {
      await botSettingsService.setSetting('stop_message', stopMessage);
    }

    res.json({
      success: true,
      message: 'Stop keywords updated',
      keywords,
      stopMessage
    });
  } catch (error) {
    console.error('Error updating stop keywords:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Update require human keywords
 */
router.put('/bot/require-human-keywords', authenticateToken, async (req, res) => {
  try {
    const { keywords, message } = req.body;

    if (keywords && !Array.isArray(keywords)) {
      return res.status(400).json({ error: 'keywords must be an array' });
    }

    if (keywords) {
      await botSettingsService.setSetting('require_human_keywords', keywords);
    }
    if (message) {
      await botSettingsService.setSetting('require_human_message', message);
    }

    res.json({
      success: true,
      message: 'Require human keywords updated',
      keywords,
      responseMessage: message
    });
  } catch (error) {
    console.error('Error updating require human keywords:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Update reply limits
 */
router.put('/bot/reply-limits', authenticateToken, async (req, res) => {
  try {
    const { maxRepliesPerContact, maxConversationTurns } = req.body;

    const updates = {};

    if (typeof maxRepliesPerContact === 'number') {
      updates.max_replies_per_contact = maxRepliesPerContact;
    }
    if (typeof maxConversationTurns === 'number') {
      updates.max_conversation_turns = maxConversationTurns;
    }

    for (const [key, value] of Object.entries(updates)) {
      await botSettingsService.setSetting(key, value);
    }

    res.json({
      success: true,
      message: 'Reply limits updated',
      updates
    });
  } catch (error) {
    console.error('Error updating reply limits:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Stop contact (add to stopped list)
 */
router.post('/bot/contacts/:contactId/stop', authenticateToken, async (req, res) => {
  try {
    const { contactId } = req.params;
    
    await botSettingsService.stopContact(contactId);

    res.json({
      success: true,
      message: 'Contact stopped successfully',
      contactId
    });
  } catch (error) {
    console.error('Error stopping contact:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Start contact (remove from stopped list)
 */
router.post('/bot/contacts/:contactId/start', authenticateToken, async (req, res) => {
  try {
    const { contactId } = req.params;
    
    await botSettingsService.startContact(contactId);

    res.json({
      success: true,
      message: 'Contact started successfully',
      contactId
    });
  } catch (error) {
    console.error('Error starting contact:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Get stopped contacts
 */
router.get('/bot/stopped-contacts', authenticateToken, async (req, res) => {
  try {
    const stoppedContacts = await botSettingsService.getSetting('stopped_contacts') || [];
    
    res.json({
      success: true,
      total: stoppedContacts.length,
      contactIds: stoppedContacts
    });
  } catch (error) {
    console.error('Error getting stopped contacts:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Initialize default settings
 */
router.post('/bot/settings/initialize', authenticateToken, async (req, res) => {
  try {
    // Check if user is admin
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Only admin can initialize settings' });
    }

    await botSettingsService.initializeDefaults();

    res.json({
      success: true,
      message: 'Bot settings initialized with defaults'
    });
  } catch (error) {
    console.error('Error initializing settings:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;