import { Contact, Message, Conversation } from '../database/models.js';
import botSettingsService from './botSettings.js';

class ManualReplyService {
  constructor() {
    this.whatsappService = null;
  }

  /**
   * Set WhatsApp service instance
   */
  setWhatsappService(service) {
    this.whatsappService = service;
  }

  /**
   * Send manual reply from dashboard
   */
  async sendManualReply(contactId, message, userId) {
    try {
      if (!this.whatsappService) {
        throw new Error('WhatsApp service not initialized');
      }

      if (!this.whatsappService.isReady) {
        throw new Error('WhatsApp client is not ready');
      }

      // Get contact
      const contact = await Contact.findByPk(contactId);

      if (!contact) {
        throw new Error('Contact not found');
      }

      // Format phone to WhatsApp ID
      let chatId = contact.phone;
      if (!chatId.includes('@')) {
        chatId = `${chatId}@c.us`;
      }

      // Get chat
      const chat = await this.whatsappService.client.getChatById(chatId);

      // Send message (no human-like behavior for manual replies - send immediately)
      await chat.sendMessage(message);

      // Save message to database
      await Message.create({
        contactId: contact.id,
        chatId: chat.id._serialized,
        chatName: chat.name || contact.name,
        messageId: `manual_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        senderId: 'dashboard',
        senderName: `[Dashboard - User ${userId}]`,
        type: 'text',
        body: message,
        isFromMe: true,
        isAiGenerated: false,
        timestamp: new Date(),
        timestampBalasan: new Date(),
        isGroup: chat.isGroup || false,
        hasMedia: false,
        hasQuotedMsg: false
      });

      // Update contact's last interaction
      await contact.update({ lastInteraction: new Date() });

      // Update conversation
      await Conversation.increment('messageCount', {
        where: { contactId: contact.id }
      });
      await Conversation.update(
        { lastMessageAt: new Date() },
        { where: { contactId: contact.id } }
      );

      return {
        success: true,
        message: 'Message sent successfully',
        contact: {
          id: contact.id,
          name: contact.name,
          phone: contact.phone
        }
      };

    } catch (error) {
      console.error('Error sending manual reply:', error);
      throw error;
    }
  }

  /**
   * Send manual reply with media
   */
  async sendManualReplyWithMedia(contactId, caption, mediaPath, userId) {
    try {
      if (!this.whatsappService) {
        throw new Error('WhatsApp service not initialized');
      }

      if (!this.whatsappService.isReady) {
        throw new Error('WhatsApp client is not ready');
      }

      const contact = await Contact.findByPk(contactId);

      if (!contact) {
        throw new Error('Contact not found');
      }

      let chatId = contact.phone;
      if (!chatId.includes('@')) {
        chatId = `${chatId}@c.us`;
      }

      const chat = await this.whatsappService.client.getChatById(chatId);

      // Import MessageMedia
      const { MessageMedia } = await import('whatsapp-web.js');
      const media = MessageMedia.fromFilePath(mediaPath);

      await chat.sendMessage(media, { caption });

      // Save to database
      await Message.create({
        contactId: contact.id,
        chatId: chat.id._serialized,
        chatName: chat.name || contact.name,
        messageId: `manual_media_${Date.now()}`,
        senderId: 'dashboard',
        senderName: `[Dashboard - User ${userId}]`,
        type: 'image', // TODO: Detect media type
        body: caption || '[Media]',
        mediaUrl: mediaPath,
        isFromMe: true,
        isAiGenerated: false,
        timestamp: new Date(),
        timestampBalasan: new Date(),
        isGroup: chat.isGroup || false,
        hasMedia: true,
        hasQuotedMsg: false
      });

      await contact.update({ lastInteraction: new Date() });

      return {
        success: true,
        message: 'Media sent successfully'
      };

    } catch (error) {
      console.error('Error sending media:', error);
      throw error;
    }
  }

  /**
   * Take over conversation (disable AI for this contact)
   */
  async takeoverConversation(contactId, userId) {
    try {
      const contact = await Contact.findByPk(contactId);

      if (!contact) {
        throw new Error('Contact not found');
      }

      // Add to stopped contacts (AI won't reply)
      await botSettingsService.stopContact(contactId);

      // Update metadata to track takeover
      const metadata = contact.metadata || {};
      metadata.humanTakeover = {
        enabled: true,
        userId: userId,
        takenAt: new Date()
      };

      await contact.update({ metadata });

      // Send notification to contact (optional)
      const notificationEnabled = await botSettingsService.getSetting('human_takeover_enabled');
      if (notificationEnabled) {
        const notificationMessage = await botSettingsService.getSetting('human_takeover_notification');
        if (notificationMessage) {
          await this.sendManualReply(contactId, notificationMessage, userId);
        }
      }

      return {
        success: true,
        message: 'Conversation taken over successfully',
        contact: {
          id: contact.id,
          name: contact.name,
          phone: contact.phone
        }
      };

    } catch (error) {
      console.error('Error taking over conversation:', error);
      throw error;
    }
  }

  /**
   * Release conversation back to AI
   */
  async releaseConversation(contactId, userId) {
    try {
      const contact = await Contact.findByPk(contactId);

      if (!contact) {
        throw new Error('Contact not found');
      }

      // Remove from stopped contacts (AI can reply again)
      await botSettingsService.startContact(contactId);

      // Update metadata
      const metadata = contact.metadata || {};
      metadata.humanTakeover = {
        enabled: false,
        userId: userId,
        releasedAt: new Date()
      };

      await contact.update({ metadata });

      return {
        success: true,
        message: 'Conversation released to AI successfully',
        contact: {
          id: contact.id,
          name: contact.name,
          phone: contact.phone
        }
      };

    } catch (error) {
      console.error('Error releasing conversation:', error);
      throw error;
    }
  }

  /**
   * Check if conversation is under human takeover
   */
  async isTakenOver(contactId) {
    try {
      const contact = await Contact.findByPk(contactId);

      if (!contact) {
        return false;
      }

      const metadata = contact.metadata || {};
      return metadata.humanTakeover?.enabled === true;

    } catch (error) {
      console.error('Error checking takeover status:', error);
      return false;
    }
  }

  /**
   * Get taken over conversations
   */
  async getTakenOverConversations(userId = null) {
    try {
      const contacts = await Contact.findAll({
        where: {
          metadata: {
            humanTakeover: {
              enabled: true
            }
          }
        }
      });

      // Filter by userId if provided
      if (userId) {
        return contacts.filter(contact => 
          contact.metadata?.humanTakeover?.userId === userId
        );
      }

      return contacts;

    } catch (error) {
      console.error('Error getting taken over conversations:', error);
      return [];
    }
  }

  /**
   * Send typing indicator
   */
  async sendTypingIndicator(contactId) {
    try {
      if (!this.whatsappService || !this.whatsappService.isReady) {
        throw new Error('WhatsApp client is not ready');
      }

      const contact = await Contact.findByPk(contactId);

      if (!contact) {
        throw new Error('Contact not found');
      }

      let chatId = contact.phone;
      if (!chatId.includes('@')) {
        chatId = `${chatId}@c.us`;
      }

      const chat = await this.whatsappService.client.getChatById(chatId);

      // Send typing state
      await chat.sendStateTyping();

      // Auto clear after 3 seconds
      setTimeout(async () => {
        try {
          await chat.clearState();
        } catch (err) {
          // Ignore errors on clear
        }
      }, 3000);

      return { success: true, message: 'Typing indicator sent' };

    } catch (error) {
      console.error('Error sending typing indicator:', error);
      throw error;
    }
  }

  /**
   * Mark message as read
   */
  async markAsRead(contactId) {
    try {
      if (!this.whatsappService || !this.whatsappService.isReady) {
        throw new Error('WhatsApp client is not ready');
      }

      const contact = await Contact.findByPk(contactId);

      if (!contact) {
        throw new Error('Contact not found');
      }

      let chatId = contact.phone;
      if (!chatId.includes('@')) {
        chatId = `${chatId}@c.us`;
      }

      const chat = await this.whatsappService.client.getChatById(chatId);

      // Mark all messages as seen
      await chat.sendSeen();

      return { success: true, message: 'Messages marked as read' };

    } catch (error) {
      console.error('Error marking as read:', error);
      throw error;
    }
  }

  /**
   * Get unread message count
   */
  async getUnreadCount() {
    try {
      if (!this.whatsappService || !this.whatsappService.isReady) {
        return 0;
      }

      const chats = await this.whatsappService.client.getChats();
      const unreadCount = chats.reduce((total, chat) => total + chat.unreadCount, 0);

      return unreadCount;

    } catch (error) {
      console.error('Error getting unread count:', error);
      return 0;
    }
  }
}

export default new ManualReplyService();