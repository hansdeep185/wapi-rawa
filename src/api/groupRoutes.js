import express from 'express';

const router = express.Router();

/**
 * Get all groups
 */
router.get('/whatsapp/groups', async (req, res) => {
  try {
    if (!req.whatsappService.isReady) {
      return res.status(503).json({ error: 'WhatsApp client is not ready' });
    }

    const chats = await req.whatsappService.client.getChats();
    const groups = chats
      .filter(chat => chat.isGroup)
      .map(group => ({
        id: group.id._serialized,
        name: group.name,
        participantsCount: group.participants ? group.participants.length : 0,
        lastMessage: group.lastMessage ? {
          body: group.lastMessage.body,
          timestamp: group.lastMessage.timestamp
        } : null
      }));

    res.json({
      total: groups.length,
      groups
    });
  } catch (error) {
    console.error('Error fetching groups:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Search group by name
 */
router.get('/whatsapp/groups/search', async (req, res) => {
  try {
    const { name } = req.query;

    if (!name) {
      return res.status(400).json({ error: 'Name parameter is required' });
    }

    if (!req.whatsappService.isReady) {
      return res.status(503).json({ error: 'WhatsApp client is not ready' });
    }

    const chats = await req.whatsappService.client.getChats();
    const groups = chats
      .filter(chat => chat.isGroup && chat.name && chat.name.toLowerCase().includes(name.toLowerCase()))
      .map(group => ({
        id: group.id._serialized,
        name: group.name,
        participantsCount: group.participants ? group.participants.length : 0
      }));

    res.json({
      total: groups.length,
      groups
    });
  } catch (error) {
    console.error('Error searching groups:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Send message to group
 */
router.post('/whatsapp/send-to-group', async (req, res) => {
  try {
    const { groupId, message } = req.body;

    if (!groupId || !message) {
      return res.status(400).json({ error: 'groupId and message are required' });
    }

    if (!req.whatsappService.isReady) {
      return res.status(503).json({ error: 'WhatsApp client is not ready' });
    }

    // Get chat by group ID
    const chat = await req.whatsappService.client.getChatById(groupId);
    
    if (!chat.isGroup) {
      return res.status(400).json({ error: 'Provided ID is not a group' });
    }

    // Import human behavior functions
    const { simulateTyping } = await import('../utils/humanBehavior.js');
    
    // Send with typing simulation
    await simulateTyping(chat, message);
    await chat.sendMessage(message);

    res.json({
      success: true,
      message: 'Message sent to group successfully',
      group: {
        id: chat.id._serialized,
        name: chat.name
      }
    });
  } catch (error) {
    console.error('Error sending message to group:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Get group info
 */
router.get('/whatsapp/groups/:groupId', async (req, res) => {
  try {
    const { groupId } = req.params;

    if (!req.whatsappService.isReady) {
      return res.status(503).json({ error: 'WhatsApp client is not ready' });
    }

    const chat = await req.whatsappService.client.getChatById(groupId);
    
    if (!chat.isGroup) {
      return res.status(400).json({ error: 'Provided ID is not a group' });
    }

    res.json({
      id: chat.id._serialized,
      name: chat.name,
      participantsCount: chat.participants ? chat.participants.length : 0,
      participants: chat.participants ? chat.participants.map(p => ({
        id: p.id._serialized,
        isAdmin: p.isAdmin,
        isSuperAdmin: p.isSuperAdmin
      })) : [],
      createdAt: chat.createdAt,
      description: chat.description || null
    });
  } catch (error) {
    console.error('Error fetching group info:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;