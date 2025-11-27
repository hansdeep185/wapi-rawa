import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import { createServer } from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';

// Import services
import sequelize, { testConnection } from './database/config.js';
import { syncDatabase } from './database/models.js';
import whatsappService from './whatsapp/service.js';
import apiRoutes from './api/routes.js';
import MessageExtractor from './whatsapp/messageExtractor.js';
import groupRoutes from './api/groupRoutes.js';
import contactAnalysisRoutes from './api/contactAnalysisRoutes.js';
import botSettingsRoutes from './api/botSettingsRoutes.js';
import botSettingsService from './services/botSettings.js';
import messageTemplateService from './services/messageTemplates.js';
import messageTemplateRoutes from './api/messageTemplateRoutes.js';
import manualReplyService from './services/manualReply.js';
import manualReplyRoutes from './api/manualReplyRoutes.js';


// Load environment variables
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Create Express app
const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: process.env.FRONTEND_URL || '*',
    methods: ['GET', 'POST']
  }
});

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});
app.use('/api/', limiter);

// Static files
app.use('/uploads', express.static(process.env.UPLOAD_PATH || './uploads'));

// Middleware to inject whatsappService
app.use('/api', (req, res, next) => {
  req.whatsappService = whatsappService;
  next();
});

// API Routes
app.use('/api', apiRoutes);
app.use('/api', groupRoutes); 
app.use('/api', contactAnalysisRoutes);
app.use('/api', botSettingsRoutes);
app.use('/api', messageTemplateRoutes);
app.use('/api', manualReplyRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok',
    timestamp: new Date().toISOString(),
    whatsapp: whatsappService.getStatus()
  });
});

// Root route
app.get('/', (req, res) => {
  res.json({
    name: 'WhatsApp AI Bot API',
    version: '1.0.0',
    status: 'running',
    endpoints: {
      health: '/health',
      api: '/api',
      docs: '/api-docs'
    }
  });
});

// WebSocket for real-time updates
io.on('connection', (socket) => {
  console.log('📡 Client connected to WebSocket');

  socket.on('disconnect', () => {
    console.log('📡 Client disconnected from WebSocket');
  });
});

// Setup WhatsApp event broadcasting via WebSocket
const setupWhatsAppEvents = () => {
  whatsappService.on('qr', (qr) => {
    io.emit('whatsapp:qr', { qr });
  });

  whatsappService.on('ready', async () => {  // ← Tambah async di sini
    io.emit('whatsapp:ready', { status: 'connected' });
    
    // Extract all messages on first login
    try {
      console.log('\n🔄 Checking if need to extract messages...');
      
      // Import Message model
      const { Message } = await import('./database/models.js');
      const MessageExtractor = (await import('./whatsapp/messageExtractor.js')).default;
      
      const messageCount = await Message.count();
      
      if (messageCount === 0) {
        console.log('📊 No messages found in database, starting extraction...');
        const extractor = new MessageExtractor(whatsappService.client);
        await extractor.extractAllMessages();
        console.log('✅ Message extraction completed!');
      } else {
        console.log(`✅ Database has ${messageCount} messages, skipping extraction`);
      }
    } catch (error) {
      console.error('❌ Error in message extraction:', error);
    }

    // Initialize bot settings
    await botSettingsService.initializeDefaults();
    // Initialize message templates
    await messageTemplateService.initializeDefaults();
    // ✅ INJECT WHATSAPP SERVICE TO MANUAL REPLY SERVICE
    manualReplyService.setWhatsappService(whatsappService);
    console.log('✅ Manual reply service initialized');
  });

  whatsappService.on('authenticated', () => {
    io.emit('whatsapp:authenticated', { status: 'authenticated' });
  });

  whatsappService.on('auth_failure', (msg) => {
    io.emit('whatsapp:auth_failure', { error: msg });
  });

  whatsappService.on('disconnected', (reason) => {
    io.emit('whatsapp:disconnected', { reason });
  });
};

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('❌ Error:', err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal Server Error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not Found' });
});

// Initialize application
const initializeApp = async () => {
  try {
    console.log('🚀 Starting WhatsApp AI Bot...');
    console.log('📝 Environment:', process.env.NODE_ENV || 'development');

    // Test database connection
    console.log('📊 Connecting to database...');
    const dbConnected = await testConnection();
    
    if (!dbConnected) {
      throw new Error('Failed to connect to database');
    }

    // Sync database
    console.log('📊 Synchronizing database...');
    await syncDatabase(false); // Set to true to force sync (will drop tables!)

    // Initialize WhatsApp service
    console.log('📱 Initializing WhatsApp service...');
    setupWhatsAppEvents();
    await whatsappService.initialize();

    // Start server
    const PORT = process.env.PORT || 3000;
    httpServer.listen(PORT, () => {
      console.log('✅ Server is running');
      console.log(`🌐 API: http://localhost:${PORT}`);
      console.log(`📡 WebSocket: ws://localhost:${PORT}`);
      console.log('\n📱 Waiting for WhatsApp QR code...');
    });

  } catch (error) {
    console.error('❌ Failed to initialize application:', error);
    process.exit(1);
  }
};

// Handle graceful shutdown
const gracefulShutdown = async (signal) => {
  console.log(`\n⚠️  ${signal} received. Starting graceful shutdown...`);
  
  try {
    // Close WhatsApp client
    console.log('📱 Closing WhatsApp client...');
    await whatsappService.logout();
    
    // Close database connection
    console.log('📊 Closing database connection...');
    await sequelize.close();
    
    // Close HTTP server
    console.log('🌐 Closing HTTP server...');
    httpServer.close(() => {
      console.log('✅ Graceful shutdown completed');
      process.exit(0);
    });
    
    // Force exit after 10 seconds
    setTimeout(() => {
      console.error('❌ Forced shutdown after timeout');
      process.exit(1);
    }, 10000);
    
  } catch (error) {
    console.error('❌ Error during shutdown:', error);
    process.exit(1);
  }
};

// Listen for termination signals
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  gracefulShutdown('UNCAUGHT_EXCEPTION');
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
  gracefulShutdown('UNHANDLED_REJECTION');
});

// Start the application
initializeApp();

export { app, io };