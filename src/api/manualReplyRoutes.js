import express from 'express';
import jwt from 'jsonwebtoken';
import multer from 'multer';
import path from 'path';
import manualReplyService from '../services/manualReply.js';
import { Contact, Message } from '../database/models.js';

const router = express.Router();

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

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

// ============ Manual Reply Routes ============

/**
 * Send manual text message
 */
router.post('/manual-reply/send', authenticateToken, async (req, res) => {
  try {
    const { contactId, message } = req.body;

    if (!contactId || !message) {
      return res.status(400).json({ error: 'contactId and message are required' });
    }

    const result = await manualReplyService.sendManualReply(
      contactId,
      message,
      req.user.id
    );

    res.json(result);

  } catch (error) {
    console.error('Error sending manual reply:', error);
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});

/**
 * Send manual message with media
 */
router.post('/manual-reply/send-media', authenticateToken, upload.single('file'), async (req, res) => {
  try {
    const { contactId, caption } = req.body;

    if (!contactId) {
      return res.status(400).json({ error: 'contactId is required' });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'File is required' });
    }

    const result = await manualReplyService.sendManualReplyWithMedia(
      contactId,
      caption || '',
      req.file.path,
      req.user.id
    );

    res.json(result);

  } catch (error) {
    console.error('Error sending media:', error);
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});

/**
 * Takeover conversation (disable AI)
 */
router.post('/manual-reply/takeover/:contactId', authenticateToken, async (req, res) => {
  try {
    const { contactId } = req.params;

    const result = await manualReplyService.takeoverConversation(
      contactId,
      req.user.id
    );

    res.json(result);

  } catch (error) {
    console.error('Error taking over conversation:', error);
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});

/**
 * Release conversation back to AI
 */
router.post('/manual-reply/release/:contactId', authenticateToken, async (req, res) => {
  try {
    const { contactId } = req.params;

    const result = await manualReplyService.releaseConversation(
      contactId,
      req.user.id
    );

    res.json(result);

  } catch (error) {
    console.error('Error releasing conversation:', error);
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});

/**
 * Check if conversation is taken over
 */
router.get('/manual-reply/takeover-status/:contactId', authenticateToken, async (req, res) => {
  try {
    const { contactId } = req.params;

    const isTakenOver = await manualReplyService.isTakenOver(contactId);

    const contact = await Contact.findByPk(contactId);
    const metadata = contact?.metadata || {};

    res.json({
      success: true,
      contactId,
      isTakenOver,
      takenOverBy: metadata.humanTakeover?.userId || null,
      takenAt: metadata.humanTakeover?.takenAt || null
    });

  } catch (error) {
    console.error('Error checking takeover status:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Get all taken over conversations
 */
router.get('/manual-reply/taken-over', authenticateToken, async (req, res) => {
  try {
    const { myOnly } = req.query;

    const userId = myOnly === 'true' ? req.user.id : null;
    const contacts = await manualReplyService.getTakenOverConversations(userId);

    res.json({
      success: true,
      total: contacts.length,
      conversations: contacts.map(contact => ({
        contactId: contact.id,
        contactName: contact.name,
        phone: contact.phone,
        takenOverBy: contact.metadata?.humanTakeover?.userId,
        takenAt: contact.metadata?.humanTakeover?.takenAt,
        lastInteraction: contact.lastInteraction
      }))
    });

  } catch (error) {
    console.error('Error getting taken over conversations:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Send typing indicator
 */
router.post('/manual-reply/typing/:contactId', authenticateToken, async (req, res) => {
  try {
    const { contactId } = req.params;

    const result = await manualReplyService.sendTypingIndicator(contactId);

    res.json(result);

  } catch (error) {
    console.error('Error sending typing indicator:', error);
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});

/**
 * Mark messages as read
 */
router.post('/manual-reply/mark-read/:contactId', authenticateToken, async (req, res) => {
  try {
    const { contactId } = req.params;

    const result = await manualReplyService.markAsRead(contactId);

    res.json(result);

  } catch (error) {
    console.error('Error marking as read:', error);
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});

/**
 * Get unread message count
 */
router.get('/manual-reply/unread-count', authenticateToken, async (req, res) => {
  try {
    const unreadCount = await manualReplyService.getUnreadCount();

    res.json({
      success: true,
      unreadCount
    });

  } catch (error) {
    console.error('Error getting unread count:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Get active conversations (recent activity)
 */
router.get('/manual-reply/active-conversations', authenticateToken, async (req, res) => {
  try {
    const { limit = 20 } = req.query;

    // Get contacts with recent activity
    const contacts = await Contact.findAll({
      where: {
        lastInteraction: {
          [Op.ne]: null
        }
      },
      order: [['lastInteraction', 'DESC']],
      limit: parseInt(limit),
      include: [{
        model: Message,
        as: 'messages',
        limit: 1,
        order: [['timestamp', 'DESC']],
        required: false
      }]
    });

    res.json({
      success: true,
      total: contacts.length,
      conversations: contacts.map(contact => ({
        contactId: contact.id,
        contactName: contact.name,
        phone: contact.phone,
        isGroup: contact.isGroup,
        lastInteraction: contact.lastInteraction,
        lastMessage: contact.messages && contact.messages.length > 0 ? {
          body: contact.messages[0].body,
          timestamp: contact.messages[0].timestamp,
          isFromMe: contact.messages[0].isFromMe
        } : null,
        isTakenOver: contact.metadata?.humanTakeover?.enabled === true
      }))
    });

  } catch (error) {
    console.error('Error getting active conversations:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Search conversations
 */
router.get('/manual-reply/search', authenticateToken, async (req, res) => {
  try {
    const { query, limit = 20 } = req.query;

    if (!query) {
      return res.status(400).json({ error: 'query parameter is required' });
    }

    const contacts = await Contact.findAll({
      where: {
        [Op.or]: [
          { name: { [Op.iLike]: `%${query}%` } },
          { phone: { [Op.iLike]: `%${query}%` } }
        ]
      },
      limit: parseInt(limit),
      order: [['lastInteraction', 'DESC']]
    });

    res.json({
      success: true,
      query,
      total: contacts.length,
      contacts: contacts.map(contact => ({
        contactId: contact.id,
        contactName: contact.name,
        phone: contact.phone,
        lastInteraction: contact.lastInteraction,
        isTakenOver: contact.metadata?.humanTakeover?.enabled === true
      }))
    });

  } catch (error) {
    console.error('Error searching conversations:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;