import express from 'express';
import jwt from 'jsonwebtoken';
import messageTemplateService from '../services/messageTemplates.js';

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

// ============ Message Template Routes ============

/**
 * Initialize default templates
 */
router.post('/templates/initialize', authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Only admin can initialize templates' });
    }

    await messageTemplateService.initializeDefaults();

    res.json({
      success: true,
      message: 'Templates initialized with defaults'
    });
  } catch (error) {
    console.error('Error initializing templates:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Get all templates
 */
router.get('/templates', authenticateToken, async (req, res) => {
  try {
    const { category, isActive, search } = req.query;

    const filters = {};
    if (category) filters.category = category;
    if (isActive !== undefined) filters.isActive = isActive === 'true';
    if (search) filters.search = search;

    const templates = await messageTemplateService.getAllTemplates(filters);

    res.json({
      success: true,
      total: templates.length,
      templates
    });
  } catch (error) {
    console.error('Error getting templates:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Get template by ID
 */
router.get('/templates/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    const template = await messageTemplateService.getTemplateById(id);

    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }

    res.json({
      success: true,
      template
    });
  } catch (error) {
    console.error('Error getting template:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Create template
 */
router.post('/templates', authenticateToken, async (req, res) => {
  try {
    const { name, content, category, triggers, isActive, useAI, priority } = req.body;

    if (!name || !content) {
      return res.status(400).json({ error: 'name and content are required' });
    }

    const template = await messageTemplateService.createTemplate({
      name,
      content,
      category,
      triggers,
      isActive,
      useAI,
      priority
    });

    res.status(201).json({
      success: true,
      message: 'Template created successfully',
      template
    });
  } catch (error) {
    console.error('Error creating template:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Update template
 */
router.put('/templates/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const template = await messageTemplateService.updateTemplate(id, updates);

    res.json({
      success: true,
      message: 'Template updated successfully',
      template
    });
  } catch (error) {
    console.error('Error updating template:', error);
    
    if (error.message === 'Template not found') {
      return res.status(404).json({ error: error.message });
    }
    
    res.status(500).json({ error: error.message });
  }
});

/**
 * Delete template
 */
router.delete('/templates/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    await messageTemplateService.deleteTemplate(id);

    res.json({
      success: true,
      message: 'Template deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting template:', error);
    
    if (error.message === 'Template not found') {
      return res.status(404).json({ error: error.message });
    }
    
    res.status(500).json({ error: error.message });
  }
});

/**
 * Get templates by category
 */
router.get('/templates/category/:category', authenticateToken, async (req, res) => {
  try {
    const { category } = req.params;

    const templates = await messageTemplateService.findByCategory(category);

    res.json({
      success: true,
      category,
      total: templates.length,
      templates
    });
  } catch (error) {
    console.error('Error getting templates by category:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Find template by trigger keyword
 */
router.get('/templates/search/trigger', authenticateToken, async (req, res) => {
  try {
    const { keyword } = req.query;

    if (!keyword) {
      return res.status(400).json({ error: 'keyword is required' });
    }

    const template = await messageTemplateService.findByTrigger(keyword);

    if (!template) {
      return res.status(404).json({ 
        success: false,
        message: 'No template found for this trigger' 
      });
    }

    res.json({
      success: true,
      template
    });
  } catch (error) {
    console.error('Error finding template by trigger:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Process template with variables
 */
router.post('/templates/:id/process', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { variables } = req.body;

    const template = await messageTemplateService.getTemplateById(id);

    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }

    const processedContent = messageTemplateService.processTemplate(
      template.content,
      variables || {}
    );

    res.json({
      success: true,
      template: {
        id: template.id,
        name: template.name,
        originalContent: template.content,
        processedContent
      }
    });
  } catch (error) {
    console.error('Error processing template:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Get template statistics
 */
router.get('/templates/stats/summary', authenticateToken, async (req, res) => {
  try {
    const stats = await messageTemplateService.getStatistics();

    res.json({
      success: true,
      statistics: stats
    });
  } catch (error) {
    console.error('Error getting template statistics:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Duplicate template
 */
router.post('/templates/:id/duplicate', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    const original = await messageTemplateService.getTemplateById(id);

    if (!original) {
      return res.status(404).json({ error: 'Template not found' });
    }

    const duplicate = await messageTemplateService.createTemplate({
      name: `${original.name} (Copy)`,
      content: original.content,
      category: original.category,
      triggers: original.triggers,
      isActive: false, // Duplicates are inactive by default
      useAI: original.useAI,
      priority: original.priority
    });

    res.status(201).json({
      success: true,
      message: 'Template duplicated successfully',
      template: duplicate
    });
  } catch (error) {
    console.error('Error duplicating template:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Bulk update templates (activate/deactivate)
 */
router.post('/templates/bulk-update', authenticateToken, async (req, res) => {
  try {
    const { templateIds, updates } = req.body;

    if (!templateIds || !Array.isArray(templateIds) || templateIds.length === 0) {
      return res.status(400).json({ error: 'templateIds array is required' });
    }

    if (!updates || typeof updates !== 'object') {
      return res.status(400).json({ error: 'updates object is required' });
    }

    const results = [];

    for (const id of templateIds) {
      try {
        const template = await messageTemplateService.updateTemplate(id, updates);
        results.push({ id, success: true, template });
      } catch (error) {
        results.push({ id, success: false, error: error.message });
      }
    }

    res.json({
      success: true,
      message: 'Bulk update completed',
      results
    });
  } catch (error) {
    console.error('Error bulk updating templates:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Test template (send to specific contact)
 */
router.post('/templates/:id/test', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { phone, variables } = req.body;

    if (!phone) {
      return res.status(400).json({ error: 'phone is required' });
    }

    const template = await messageTemplateService.getTemplateById(id);

    if (!template) {
      return res.status(404).json({ error: 'Template not found' });
    }

    const processedContent = messageTemplateService.processTemplate(
      template.content,
      variables || {}
    );

    // TODO: Integrate with WhatsApp service to actually send
    // For now, just return the processed content

    res.json({
      success: true,
      message: 'Template test prepared (integration pending)',
      template: {
        name: template.name,
        processedContent
      },
      recipient: phone
    });
  } catch (error) {
    console.error('Error testing template:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;