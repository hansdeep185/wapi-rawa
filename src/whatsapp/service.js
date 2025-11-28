import pkg from 'whatsapp-web.js';
const { Client, LocalAuth, MessageMedia } = pkg;
import qrcode from 'qrcode-terminal';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Contact, Message, Conversation } from '../database/models.js';
import aiService from '../ai/service.js';
import botSettingsService from '../services/botSettings.js';
import {
  simulateTyping,
  simulateReading,
  simulateNaturalFlow,
  sleep,
  randomDelay,
  extractPhoneNumber,
  isBusinessHours,
  chunkMessage
} from '../utils/humanBehavior.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class WhatsAppService {
  constructor() {
    this.client = null;
    this.isReady = false;
    this.qrCode = null;
    this.status = 'disconnected';
    this.eventHandlers = [];
  }

  /**
   * Initialize WhatsApp client
   */
  async initialize() {
    try {
      console.log('🚀 Initializing WhatsApp client...');
      
      const sessionPath = process.env.WA_SESSION_PATH || './wa-session';
      
      // Client configuration
      const clientOptions = {
        authStrategy: new LocalAuth({
          clientId: 'whatsapp-ai-bot',
          dataPath: sessionPath
        }),
        puppeteer: {
          headless: true,
          args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--single-process',
            '--disable-gpu'
          ]
        }
      };

      // Add chromium path for production/Ubuntu
      if (process.env.WA_CHROMIUM_PATH) {
        clientOptions.puppeteer.executablePath = process.env.WA_CHROMIUM_PATH;
      }

      this.client = new Client(clientOptions);

      // Setup event handlers
      this.setupEventHandlers();

      // Initialize client
      await this.client.initialize();
      
      console.log('✅ WhatsApp client initialized');
    } catch (error) {
      console.error('❌ Error initializing WhatsApp client:', error);
      throw error;
    }
  }

  /**
   * Setup all event handlers
   */
  setupEventHandlers() {
    // QR Code event
    this.client.on('qr', (qr) => {
      console.log('📱 QR Code received, scan with WhatsApp app:');
      qrcode.generate(qr, { small: true });
      this.qrCode = qr;
      this.status = 'qr_ready';
      this.emit('qr', qr);
    });

    // Ready event
    this.client.on('ready', () => {
      console.log('✅ WhatsApp client is ready!');
      this.isReady = true;
      this.status = 'connected';
      this.qrCode = null;
      this.emit('ready');
    });

    // Authenticated event
    this.client.on('authenticated', () => {
      console.log('✅ WhatsApp authenticated');
      this.status = 'authenticated';
      this.emit('authenticated');
    });

    // Auth failure event
    this.client.on('auth_failure', (msg) => {
      console.error('❌ Authentication failed:', msg);
      this.status = 'auth_failed';
      this.emit('auth_failure', msg);
    });

    // Disconnected event
    this.client.on('disconnected', (reason) => {
      console.log('⚠️  WhatsApp client disconnected:', reason);
      this.isReady = false;
      this.status = 'disconnected';
      this.emit('disconnected', reason);
    });

    // Message received event
    this.client.on('message', async (message) => {
      await this.handleIncomingMessage(message);
    });

    // Message create event (for sent messages)
    this.client.on('message_create', async (message) => {
      if (message.fromMe) {
        await this.saveMessage(message);
      }
    });
  }

  /**
   * Handle incoming message
   */
  async handleIncomingMessage(message) {
    try {
      // Skip if message is from me or from status
      if (message.fromMe || message.isStatus) {
        return;
      }

      console.log(`📨 Message from ${message.from}: ${message.body}`);

      // Get or create contact
      const contact = await this.getOrCreateContact(message);
      
      // Save incoming message
      await this.saveMessage(message, contact.id);

      // ✅ FIX: Check auto-reply using botSettingsService
      const autoReplyEnabled = await botSettingsService.isAutoReplyEnabled();
      
      console.log(`🔍 Auto-reply status: ${autoReplyEnabled ? 'ENABLED ✅' : 'DISABLED ❌'}`);
      
      if (!autoReplyEnabled) {
        console.log('ℹ️  Auto-reply is disabled');
        return;
      }

      // Check business hours if enabled
      const businessHoursEnabled = await botSettingsService.getSetting('business_hours_enabled');
      if (businessHoursEnabled) {
        const isInBusinessHours = await botSettingsService.checkBusinessHours();
        if (!isInBusinessHours) {
          console.log('ℹ️  Outside business hours');
          
          // Send out of office message if enabled
          const outOfOfficeEnabled = await botSettingsService.getSetting('out_of_office_enabled');
          if (outOfOfficeEnabled) {
            const { message: oooMessage } = await botSettingsService.getOutOfOfficeMessage();
            const chat = await message.getChat();
            await chat.sendMessage(oooMessage);
            await this.saveAIMessage(contact.id, oooMessage, message.from);
          }
          return;
        }
      }

      // Check if should reply to this contact
      const shouldReply = await botSettingsService.shouldReplyToContact(contact);
      if (!shouldReply.should) {
        console.log(`ℹ️  Skipping reply: ${shouldReply.reason}`);
        return;
      }

      // Check stop keywords
      const isStopKeyword = await botSettingsService.checkStopKeyword(message.body || '');
      if (isStopKeyword) {
        const stopMessage = await botSettingsService.getSetting('stop_message');
        const chat = await message.getChat();
        await chat.sendMessage(stopMessage);
        await this.saveAIMessage(contact.id, stopMessage, message.from);
        await botSettingsService.stopContact(contact.id);
        console.log('🛑 Contact stopped auto-reply');
        return;
      }

      // Check require human keywords
      const requiresHuman = await botSettingsService.checkRequireHuman(message.body || '');
      if (requiresHuman) {
        const humanMessage = await botSettingsService.getSetting('require_human_message');
        const chat = await message.getChat();
        await chat.sendMessage(humanMessage);
        await this.saveAIMessage(contact.id, humanMessage, message.from);
        await botSettingsService.stopContact(contact.id);
        console.log('👨‍💼 Human takeover requested');
        return;
      }

      console.log('✅ All checks passed, generating AI response...');

      // Simulate reading the message
      await simulateReading(message.body);
      await sleep(randomDelay(1000, 2000));

      // Generate AI response
      const aiResponse = await aiService.generateResponse(
        contact.id,
        message.body,
        contact.name || contact.pushname
      );

      if (!aiResponse || aiResponse.trim().length === 0) {
        console.log('⚠️  No AI response generated or empty response');
        console.log('Response value:', aiResponse);
        return;
      }
      console.log(`✅ AI Response ready (${aiResponse.length} chars)`);

      // Get chat
      const chat = await message.getChat();

      // Get reply delay settings
      const delaySettings = await botSettingsService.getSetting('auto_reply_delay') || { min: 2000, max: 5000 };
      await sleep(randomDelay(delaySettings.min, delaySettings.max));

      // Split long messages into chunks
      const messageChunks = chunkMessage(aiResponse, 500);

      // Send response with human-like behavior
      if (messageChunks.length === 1) {
        await simulateTyping(chat, aiResponse);
        await chat.sendMessage(aiResponse);
      } else {
        await simulateNaturalFlow(chat, messageChunks);
      }

      // Save AI response
      await this.saveAIMessage(contact.id, aiResponse, message.from);

      console.log('✅ AI response sent successfully');
    } catch (error) {
      console.error('❌ Error handling incoming message:', error);
    }
  }

  /**
   * Get or create contact in database
   */
  async getOrCreateContact(message) {
    try {
      const phone = extractPhoneNumber(message.from);
      
      let contact = await Contact.findOne({ where: { phone } });

      if (!contact) {
        // Simplified - don't use getContactById
        contact = await Contact.create({
          phone,
          name: message._data?.notifyName || phone,
          pushname: message._data?.notifyName || phone,
          isGroup: message.from.endsWith('@g.us'),
          lastInteraction: new Date()
        });

        await Conversation.create({
          contactId: contact.id,
          lastMessageAt: new Date(),
          messageCount: 1
        });
      } else {
        await contact.update({
          lastInteraction: new Date(),
          name: message._data?.notifyName || contact.name,
          pushname: message._data?.notifyName || contact.pushname
        });

        await Conversation.increment('messageCount', {
          where: { contactId: contact.id }
        });
        await Conversation.update(
          { lastMessageAt: new Date() },
          { where: { contactId: contact.id } }
        );
      }

      return contact;
    } catch (error) {
      console.error('Error in getOrCreateContact:', error);
      throw error;
    }
  }

  /**
   * Save message to database
   */
  async saveMessage(message, contactId = null) {
    try {
      if (!contactId && !message.fromMe) {
        const contact = await this.getOrCreateContact(message);
        contactId = contact.id;
      } else if (!contactId && message.fromMe) {
        const phone = extractPhoneNumber(message.to);
        const contact = await Contact.findOne({ where: { phone } });
        if (contact) {
          contactId = contact.id;
        } else {
          // Create contact if doesn't exist
          const newContact = await Contact.create({
            phone: phone,
            name: phone,
            lastInteraction: new Date()
          });
          contactId = newContact.id;
        }
      }

      if (!contactId) {
        console.warn('⚠️  Could not determine contact for message');
        return;
      }

      // Get chat info
      const chat = await message.getChat();
      
      // Get proper chat name
      let chatName = chat.name || chat.id._serialized;
      if (!chat.isGroup) {
        try {
          const contactInfo = await chat.getContact();
          chatName = contactInfo.name || contactInfo.pushname || contactInfo.verifiedName || chatName;
        } catch (err) {
          // Use existing name
        }
      }

      const messageData = {
        contactId,
        chatId: chat.id._serialized,
        chatName: chatName,
        messageId: message.id._serialized,
        senderId: message.from || message.author,
        senderName: message._data?.notifyName || 'Unknown',
        type: message.type || 'text',
        body: message.body,
        isFromMe: message.fromMe,
        isAiGenerated: false,
        timestamp: new Date(message.timestamp * 1000),
        timestampBalasan: null,
        isGroup: chat.isGroup,
        hasMedia: message.hasMedia,
        hasQuotedMsg: message.hasQuotedMsg,
        quotedMsgId: null,
        quotedMessageBody: null,
        quotedSenderName: null
      };

      // Handle media
      if (message.hasMedia) {
        messageData.mediaUrl = `media_${message.id._serialized}`;
      }

      await Message.create(messageData);
    } catch (error) {
      console.error('❌ Error saving message:', error);
    }
  }

  /**
   * Save AI-generated message
   */
  async saveAIMessage(contactId, content, recipient) {
    try {
      // Get chat info
      const chatId = recipient.includes('@c.us') ? recipient : `${recipient}@c.us`;
      const chat = await this.client.getChatById(chatId);
      
      // Get proper chat name
      let chatName = chat.name || chat.id._serialized;
      if (!chat.isGroup) {
        try {
          const contactInfo = await chat.getContact();
          chatName = contactInfo.name || contactInfo.pushname || contactInfo.verifiedName || chatName;
        } catch (err) {
          // Use existing name
        }
      }
      
      await Message.create({
        contactId,
        chatId: chat.id._serialized,
        chatName: chatName,
        messageId: `ai_${Date.now()}`,
        senderId: 'bot',
        senderName: '[BOT]',
        type: 'text',
        body: content,
        isFromMe: true,
        isAiGenerated: true,
        timestamp: new Date(),
        timestampBalasan: new Date(),
        isGroup: chat.isGroup,
        hasMedia: false,
        hasQuotedMsg: false,
        quotedMsgId: null,
        quotedMessageBody: null,
        quotedSenderName: null
      });
    } catch (error) {
      console.error('❌ Error saving AI message:', error);
    }
  }

  /**
   * Send text message
   */
  async sendMessage(phone, message) {
    try {
      if (!this.isReady) {
        throw new Error('WhatsApp client is not ready');
      }

      // Format phone number dengan benar
      let chatId = phone;
      
      // Hapus semua karakter non-numeric
      chatId = chatId.replace(/\D/g, '');
      
      // Tambah country code jika belum ada (Indonesia)
      if (chatId.startsWith('0')) {
        chatId = '62' + chatId.substring(1);
      } else if (!chatId.startsWith('62')) {
        chatId = '62' + chatId;
      }
      
      // Tambahkan @c.us
      chatId = chatId + '@c.us';
      
      console.log('📱 Sending to:', chatId);

      // Check if number is registered on WhatsApp
      try {
        const isRegistered = await this.client.isRegisteredUser(chatId);
        if (!isRegistered) {
          throw new Error('Phone number is not registered on WhatsApp');
        }
      } catch (error) {
        console.error('❌ Number validation error:', error.message);
        throw new Error('Invalid WhatsApp number or number not registered');
      }

      // Get chat - dengan retry mechanism
      let chat;
      try {
        chat = await this.client.getChatById(chatId);
      } catch (error) {
        // Jika getChatById gagal, coba kirim langsung
        console.log('⚠️  getChatById failed, trying direct send...');
        await this.client.sendMessage(chatId, message);
        
        // Save to database
        const contactPhone = extractPhoneNumber(chatId);
        let contact = await Contact.findOne({ where: { phone: contactPhone } });
        
        if (!contact) {
          contact = await Contact.create({
            phone: contactPhone,
            name: contactPhone,
            lastInteraction: new Date()
          });
        }
        
        await this.saveAIMessage(contact.id, message, chatId);
        
        return { success: true, message: 'Message sent successfully' };
      }
      
      // Get or create contact
      const contactPhone = extractPhoneNumber(chatId);
      let contact = await Contact.findOne({ where: { phone: contactPhone } });
      
      if (!contact) {
        try {
          const contactInfo = await this.client.getContactById(chatId);
          contact = await Contact.create({
            phone: contactPhone,
            name: contactInfo.name || contactInfo.pushname || contactPhone,
            pushname: contactInfo.pushname,
            lastInteraction: new Date()
          });
        } catch (error) {
          // Fallback: create contact with phone only
          contact = await Contact.create({
            phone: contactPhone,
            name: contactPhone,
            lastInteraction: new Date()
          });
        }
      }

      // Split message if too long
      const chunks = chunkMessage(message, 500);

      // Send with human-like behavior
      if (chunks.length === 1) {
        await simulateTyping(chat, message);
        await chat.sendMessage(message);
      } else {
        await simulateNaturalFlow(chat, chunks);
      }

      // Save to database
      await this.saveAIMessage(contact.id, message, chatId);

      return { success: true, message: 'Message sent successfully' };
    } catch (error) {
      console.error('❌ Error sending message:', error);
      throw error;
    }
  }

  /**
   * Send media message
   */
  async sendMedia(phone, filePath, caption = '') {
    try {
      if (!this.isReady) {
        throw new Error('WhatsApp client is not ready');
      }

      const chatId = phone.includes('@c.us') ? phone : `${phone}@c.us`;
      const chat = await this.client.getChatById(chatId);

      // Create media from file
      const media = MessageMedia.fromFilePath(filePath);

      // Add slight delay before sending
      await sleep(randomDelay());

      // Send typing if caption exists
      if (caption) {
        await simulateTyping(chat, caption);
      }

      await chat.sendMessage(media, { caption });

      return { success: true, message: 'Media sent successfully' };
    } catch (error) {
      console.error('❌ Error sending media:', error);
      throw error;
    }
  }

  /**
   * Send message with human-like behavior (for manual replies)
   */
  async sendMessageWithHumanBehavior(chatId, message, contactId) {
    try {
      const chat = await this.client.getChatById(chatId);
      
      // Get delay settings
      const delaySettings = await botSettingsService.getSetting('auto_reply_delay') || { min: 2000, max: 5000 };
      await sleep(randomDelay(delaySettings.min, delaySettings.max));

      // Split long messages
      const chunks = chunkMessage(message, 500);

      // Send with typing simulation
      if (chunks.length === 1) {
        await simulateTyping(chat, message);
        await chat.sendMessage(message);
      } else {
        await simulateNaturalFlow(chat, chunks);
      }

      // Save to database
      await this.saveAIMessage(contactId, message, chatId);

      return { success: true };
    } catch (error) {
      console.error('Error sending message with human behavior:', error);
      throw error;
    }
  }

  /**
   * Get client status
   */
  getStatus() {
    return {
      status: this.status,
      isReady: this.isReady,
      qrCode: this.qrCode
    };
  }

  /**
   * Event emitter
   */
  on(event, handler) {
    this.eventHandlers.push({ event, handler });
  }

  emit(event, data) {
    this.eventHandlers
      .filter(h => h.event === event)
      .forEach(h => h.handler(data));
  }

  /**
   * Logout and destroy session
   */
  async logout() {
    try {
      if (this.client) {
        await this.client.logout();
        await this.client.destroy();
        this.isReady = false;
        this.status = 'disconnected';
        console.log('✅ WhatsApp client logged out');
      }
    } catch (error) {
      console.error('❌ Error during logout:', error);
      throw error;
    }
  }
}

export default new WhatsAppService();