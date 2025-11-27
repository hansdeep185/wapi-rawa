import express from 'express';
import whatsappService from '../whatsapp/service.js';
import aiService from '../ai/service.js';
import { Contact, Message, Conversation, AIConfig, Knowledge, User } from '../database/models.js';
import { Op } from 'sequelize';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import multer from 'multer';
import path from 'path';
import fs from 'fs';

const router = express.Router();

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = process.env.UPLOAD_PATH || './uploads';
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage,
  limits: { fileSize: parseInt(process.env.MAX_FILE_SIZE) || 10485760 } // 10MB default
});

// ============ Authentication Middleware ============
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

// ============ Auth Routes ============
router.post('/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    const user = await User.findOne({ where: { username } });
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/auth/register', async (req, res) => {
  try {
    const { username, email, password, role = 'user' } = req.body;

    // Check if user exists
    const existingUser = await User.findOne({
      where: {
        [Op.or]: [{ username }, { email }]
      }
    });

    if (existingUser) {
      return res.status(400).json({ error: 'Username or email already exists' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user
    const user = await User.create({
      username,
      email,
      password: hashedPassword,
      role
    });

    res.status(201).json({
      message: 'User created successfully',
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============ WhatsApp Routes ============
router.get('/whatsapp/status', authenticateToken, (req, res) => {
  const status = whatsappService.getStatus();
  res.json(status);
});

router.post('/whatsapp/send', authenticateToken, async (req, res) => {
  try {
    const { phone, message } = req.body;

    if (!phone || !message) {
      return res.status(400).json({ error: 'Phone and message are required' });
    }

    const result = await whatsappService.sendMessage(phone, message);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/whatsapp/send-media', authenticateToken, upload.single('file'), async (req, res) => {
  try {
    const { phone, caption } = req.body;
    const file = req.file;

    if (!phone || !file) {
      return res.status(400).json({ error: 'Phone and file are required' });
    }

    const result = await whatsappService.sendMedia(phone, file.path, caption);
    
    // Clean up uploaded file
    fs.unlinkSync(file.path);
    
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/whatsapp/logout', authenticateToken, async (req, res) => {
  try {
    await whatsappService.logout();
    res.json({ message: 'Logged out successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============ Contact Routes ============
router.get('/contacts', authenticateToken, async (req, res) => {
  try {
    const { page = 1, limit = 20, search = '' } = req.query;
    const offset = (page - 1) * limit;

    const where = search ? {
      [Op.or]: [
        { name: { [Op.iLike]: `%${search}%` } },
        { phone: { [Op.iLike]: `%${search}%` } },
        { pushname: { [Op.iLike]: `%${search}%` } }
      ]
    } : {};

    const { count, rows } = await Contact.findAndCountAll({
      where,
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [['lastInteraction', 'DESC']],
      include: [{
        model: Conversation,
        as: 'conversation'
      }]
    });

    res.json({
      contacts: rows,
      total: count,
      page: parseInt(page),
      totalPages: Math.ceil(count / limit)
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/contacts/:id', authenticateToken, async (req, res) => {
  try {
    const contact = await Contact.findByPk(req.params.id, {
      include: [{
        model: Conversation,
        as: 'conversation'
      }]
    });

    if (!contact) {
      return res.status(404).json({ error: 'Contact not found' });
    }

    res.json(contact);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/contacts/:id', authenticateToken, async (req, res) => {
  try {
    const contact = await Contact.findByPk(req.params.id);
    
    if (!contact) {
      return res.status(404).json({ error: 'Contact not found' });
    }

    await contact.update(req.body);
    res.json(contact);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============ Message Routes ============
router.get('/messages', authenticateToken, async (req, res) => {
  try {
    const { contactId, page = 1, limit = 50 } = req.query;
    const offset = (page - 1) * limit;

    const where = contactId ? { contactId } : {};

    const { count, rows } = await Message.findAndCountAll({
      where,
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [['timestamp', 'DESC']],
      include: [{
        model: Contact,
        as: 'contact'
      }]
    });

    res.json({
      messages: rows.reverse(),
      total: count,
      page: parseInt(page),
      totalPages: Math.ceil(count / limit)
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/messages/contact/:contactId', authenticateToken, async (req, res) => {
  try {
    const { page = 1, limit = 50 } = req.query;
    const offset = (page - 1) * limit;

    const { count, rows } = await Message.findAndCountAll({
      where: { contactId: req.params.contactId },
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [['timestamp', 'ASC']]
    });

    res.json({
      messages: rows,
      total: count,
      page: parseInt(page),
      totalPages: Math.ceil(count / limit)
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============ Conversation Routes ============
router.get('/conversations', authenticateToken, async (req, res) => {
  try {
    const { status = 'active', page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    const { count, rows } = await Conversation.findAndCountAll({
      where: { status },
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [['lastMessageAt', 'DESC']],
      include: [{
        model: Contact,
        as: 'contact'
      }]
    });

    res.json({
      conversations: rows,
      total: count,
      page: parseInt(page),
      totalPages: Math.ceil(count / limit)
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============ AI Config Routes ============
router.get('/ai/configs', authenticateToken, async (req, res) => {
  try {
    const configs = await AIConfig.findAll({
      order: [['createdAt', 'DESC']]
    });
    res.json(configs);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/ai/configs/:id', authenticateToken, async (req, res) => {
  try {
    const config = await AIConfig.findByPk(req.params.id);
    if (!config) {
      return res.status(404).json({ error: 'Configuration not found' });
    }
    res.json(config);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/ai/configs', authenticateToken, async (req, res) => {
  try {
    const config = await AIConfig.create(req.body);
    res.status(201).json(config);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/ai/configs/:id', authenticateToken, async (req, res) => {
  try {
    const config = await AIConfig.findByPk(req.params.id);
    if (!config) {
      return res.status(404).json({ error: 'Configuration not found' });
    }
    await config.update(req.body);
    res.json(config);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.delete('/ai/configs/:id', authenticateToken, async (req, res) => {
  try {
    const config = await AIConfig.findByPk(req.params.id);
    if (!config) {
      return res.status(404).json({ error: 'Configuration not found' });
    }
    await config.destroy();
    res.json({ message: 'Configuration deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/ai/configs/:id/activate', authenticateToken, async (req, res) => {
  try {
    // Deactivate all configs
    await AIConfig.update({ isActive: false }, { where: {} });
    
    // Activate selected config
    const config = await AIConfig.findByPk(req.params.id);
    if (!config) {
      return res.status(404).json({ error: 'Configuration not found' });
    }
    
    await config.update({ isActive: true });
    res.json(config);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/ai/configs/:id/test', authenticateToken, async (req, res) => {
  try {
    const result = await aiService.testConfig(req.params.id);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============ Knowledge Base Routes ============
router.get('/knowledge', authenticateToken, async (req, res) => {
  try {
    const { page = 1, limit = 20, search = '', category = '' } = req.query;
    const offset = (page - 1) * limit;

    const where = {};
    if (search) {
      where[Op.or] = [
        { title: { [Op.iLike]: `%${search}%` } },
        { content: { [Op.iLike]: `%${search}%` } }
      ];
    }
    if (category) {
      where.category = category;
    }

    const { count, rows } = await Knowledge.findAndCountAll({
      where,
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [['createdAt', 'DESC']]
    });

    res.json({
      knowledge: rows,
      total: count,
      page: parseInt(page),
      totalPages: Math.ceil(count / limit)
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/knowledge/:id', authenticateToken, async (req, res) => {
  try {
    const knowledge = await Knowledge.findByPk(req.params.id);
    if (!knowledge) {
      return res.status(404).json({ error: 'Knowledge not found' });
    }
    res.json(knowledge);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/knowledge', authenticateToken, async (req, res) => {
  try {
    const knowledge = await Knowledge.create(req.body);
    res.status(201).json(knowledge);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/knowledge/:id', authenticateToken, async (req, res) => {
  try {
    const knowledge = await Knowledge.findByPk(req.params.id);
    if (!knowledge) {
      return res.status(404).json({ error: 'Knowledge not found' });
    }
    await knowledge.update(req.body);
    res.json(knowledge);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.delete('/knowledge/:id', authenticateToken, async (req, res) => {
  try {
    const knowledge = await Knowledge.findByPk(req.params.id);
    if (!knowledge) {
      return res.status(404).json({ error: 'Knowledge not found' });
    }
    await knowledge.destroy();
    res.json({ message: 'Knowledge deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============ Dashboard Stats ============
router.get('/stats/dashboard', authenticateToken, async (req, res) => {
  try {
    const totalContacts = await Contact.count();
    const totalMessages = await Message.count();
    const totalConversations = await Conversation.count({
      where: { status: 'active' }
    });
    const aiMessages = await Message.count({
      where: { isAiGenerated: true }
    });

    // Messages today
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const messagesToday = await Message.count({
      where: {
        timestamp: {
          [Op.gte]: today
        }
      }
    });

    // Recent contacts
    const recentContacts = await Contact.findAll({
      limit: 5,
      order: [['lastInteraction', 'DESC']],
      include: [{
        model: Conversation,
        as: 'conversation'
      }]
    });

    res.json({
      totalContacts,
      totalMessages,
      totalConversations,
      aiMessages,
      messagesToday,
      recentContacts
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;