import express from 'express';
import jwt from 'jsonwebtoken';
import { Contact, Message, User } from '../database/models.js';
import { Op } from 'sequelize';
import contactAnalysisService from '../ai/contactAnalysis.js';

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

// ============ Contact Analysis Routes ============

/**
 * Analyze contact with AI
 */
router.post('/contacts/:id/analyze', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    console.log(`📊 Starting analysis for contact: ${id}`);

    const result = await contactAnalysisService.analyzeContact(id);

    res.json({
      success: true,
      data: result
    });

  } catch (error) {
    console.error('Error analyzing contact:', error);
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});

/**
 * Get contact analysis (from saved data)
 */
router.get('/contacts/:id/analysis', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    const contact = await Contact.findByPk(id);

    if (!contact) {
      return res.status(404).json({ error: 'Contact not found' });
    }

    // Get conversation summary
    const summary = await contactAnalysisService.getConversationSummary(id);

    res.json({
      contactId: contact.id,
      name: contact.name,
      phone: contact.phone,
      leadStatus: contact.leadStatus,
      leadScore: contact.leadScore,
      tags: contact.tags,
      notes: contact.notes,
      customFields: contact.customFields,
      aiAnalysis: contact.aiAnalysis,
      conversationSummary: summary,
      lastInteraction: contact.lastInteraction
    });

  } catch (error) {
    console.error('Error getting contact analysis:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Batch analyze contacts
 */
router.post('/contacts/batch-analyze', authenticateToken, async (req, res) => {
  try {
    const { contactIds } = req.body;

    if (!contactIds || !Array.isArray(contactIds) || contactIds.length === 0) {
      return res.status(400).json({ error: 'contactIds array is required' });
    }

    if (contactIds.length > 10) {
      return res.status(400).json({ 
        error: 'Maximum 10 contacts per batch. Use multiple batches for more.' 
      });
    }

    console.log(`📊 Starting batch analysis for ${contactIds.length} contacts`);

    // Start batch analysis (this will take time)
    const results = await contactAnalysisService.batchAnalyze(contactIds);

    res.json({
      success: true,
      total: contactIds.length,
      results
    });

  } catch (error) {
    console.error('Error in batch analysis:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Update contact details
 */
router.put('/contacts/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const contact = await Contact.findByPk(id);

    if (!contact) {
      return res.status(404).json({ error: 'Contact not found' });
    }

    // Allow updating specific fields
    const allowedFields = [
      'name', 'tags', 'notes', 'customFields', 
      'leadStatus', 'leadScore', 'assignedTo'
    ];

    const updateData = {};
    allowedFields.forEach(field => {
      if (updates[field] !== undefined) {
        updateData[field] = updates[field];
      }
    });

    await contact.update(updateData);

    res.json({
      success: true,
      contact
    });

  } catch (error) {
    console.error('Error updating contact:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Add note to contact
 */
router.post('/contacts/:id/notes', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { note } = req.body;

    if (!note) {
      return res.status(400).json({ error: 'Note is required' });
    }

    const contact = await Contact.findByPk(id);

    if (!contact) {
      return res.status(404).json({ error: 'Contact not found' });
    }

    const timestamp = new Date().toISOString();
    const username = req.user.username;
    const newNote = `[${timestamp}] ${username}: ${note}`;

    const updatedNotes = contact.notes 
      ? `${contact.notes}\n\n${newNote}` 
      : newNote;

    await contact.update({ notes: updatedNotes });

    res.json({
      success: true,
      notes: updatedNotes
    });

  } catch (error) {
    console.error('Error adding note:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Update custom fields
 */
router.put('/contacts/:id/custom-fields', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { fields } = req.body;

    const contact = await Contact.findByPk(id);

    if (!contact) {
      return res.status(404).json({ error: 'Contact not found' });
    }

    // Merge with existing custom fields
    const updatedFields = {
      ...contact.customFields,
      ...fields
    };

    await contact.update({ customFields: updatedFields });

    res.json({
      success: true,
      customFields: updatedFields
    });

  } catch (error) {
    console.error('Error updating custom fields:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Assign contact to user
 */
router.post('/contacts/:id/assign', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { userId } = req.body;

    const contact = await Contact.findByPk(id);

    if (!contact) {
      return res.status(404).json({ error: 'Contact not found' });
    }

    // Verify user exists
    if (userId) {
      const user = await User.findByPk(userId);
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }
    }

    await contact.update({ assignedTo: userId || null });

    res.json({
      success: true,
      message: userId ? 'Contact assigned successfully' : 'Contact unassigned',
      assignedTo: userId
    });

  } catch (error) {
    console.error('Error assigning contact:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Get contacts with filters
 */
router.get('/contacts/filter', authenticateToken, async (req, res) => {
  try {
    const { 
      leadStatus, 
      leadScoreMin, 
      leadScoreMax,
      assignedTo,
      tags,
      search,
      page = 1, 
      limit = 20 
    } = req.query;

    const offset = (page - 1) * limit;
    const where = { isGroup: false }; // Only individual contacts

    // Apply filters
    if (leadStatus) {
      where.leadStatus = leadStatus;
    }

    if (leadScoreMin || leadScoreMax) {
      where.leadScore = {};
      if (leadScoreMin) where.leadScore[Op.gte] = parseInt(leadScoreMin);
      if (leadScoreMax) where.leadScore[Op.lte] = parseInt(leadScoreMax);
    }

    if (assignedTo) {
      where.assignedTo = assignedTo;
    }

    if (tags) {
      where.tags = { [Op.contains]: Array.isArray(tags) ? tags : [tags] };
    }

    if (search) {
      where[Op.or] = [
        { name: { [Op.iLike]: `%${search}%` } },
        { phone: { [Op.iLike]: `%${search}%` } }
      ];
    }

    const { count, rows } = await Contact.findAndCountAll({
      where,
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [['leadScore', 'DESC'], ['lastInteraction', 'DESC']],
      include: [{
        model: User,
        as: 'assignedUser',
        attributes: ['id', 'username', 'email']
      }]
    });

    res.json({
      contacts: rows,
      total: count,
      page: parseInt(page),
      totalPages: Math.ceil(count / limit)
    });

  } catch (error) {
    console.error('Error filtering contacts:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Get top leads
 */
router.get('/contacts/top-leads', authenticateToken, async (req, res) => {
  try {
    const { limit = 10 } = req.query;

    const contacts = await Contact.findAll({
      where: {
        isGroup: false,
        leadScore: { [Op.gte]: 50 }
      },
      order: [['leadScore', 'DESC']],
      limit: parseInt(limit),
      include: [{
        model: User,
        as: 'assignedUser',
        attributes: ['id', 'username']
      }]
    });

    res.json({
      total: contacts.length,
      contacts
    });

  } catch (error) {
    console.error('Error getting top leads:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Get contact conversation history
 */
router.get('/contacts/:id/conversation', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { limit = 50, offset = 0 } = req.query;

    const contact = await Contact.findByPk(id);

    if (!contact) {
      return res.status(404).json({ error: 'Contact not found' });
    }

    const messages = await Message.findAll({
      where: { contactId: id },
      order: [['timestamp', 'DESC']],
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

    const total = await Message.count({ where: { contactId: id } });

    res.json({
      contactId: id,
      contactName: contact.name,
      messages: messages.reverse(), // Return in chronological order
      total,
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

  } catch (error) {
    console.error('Error getting conversation history:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;