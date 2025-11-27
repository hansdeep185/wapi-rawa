import { Contact, Message, Conversation } from '../database/models.js';
import { extractPhoneNumber } from '../utils/humanBehavior.js';

class MessageExtractor {
  constructor(client) {
    this.client = client;
  }

  /**
   * Extract all messages from WhatsApp
   */
  async extractAllMessages() {
    try {
      console.log('\n🔄 Starting message extraction...');
      
      // Get all chats
      const chats = await this.client.getChats();
      console.log(`📊 Total chats found: ${chats.length}\n`);
      
      let totalMessages = 0;
      let totalSaved = 0;
      let totalErrors = 0;
      let processedChats = 0;
      
      // Loop through each chat
      for (let i = 0; i < chats.length; i++) {
        const chat = chats[i];
        const chatName = chat.name || chat.id._serialized;
        console.log(`\n[${i + 1}/${chats.length}] Processing: ${chatName}`);
        
        try {
          // Fetch messages in batches
          let allMessages = [];
          let batchCount = 0;
          
          console.log(`  🔄 Loading messages...`);
          
          while (true) {
            batchCount++;
            
            const messages = await chat.fetchMessages({ limit: 1000 });
            
            if (messages.length === 0) {
              break;
            }
            
            // Filter duplicates
            const existingIds = new Set(allMessages.map(m => m.id._serialized));
            const newMessages = messages.filter(m => !existingIds.has(m.id._serialized));
            
            if (newMessages.length === 0) {
              break;
            }
            
            allMessages = allMessages.concat(newMessages);
            
            console.log(`  📦 Batch ${batchCount}: +${newMessages.length} messages (Total: ${allMessages.length})`);
            
            if (messages.length < 1000) {
              break;
            }
            
            // Small delay between batches
            await new Promise(resolve => setTimeout(resolve, 300));
          }
          
          const messages = allMessages;
          console.log(`  📨 Total messages found: ${messages.length}`);
          
          if (messages.length === 0) {
            console.log(`  ⚠️  Empty chat, skipping...`);
            continue;
          }
          
          totalMessages += messages.length;
          let savedInThisChat = 0;
          let errorsInThisChat = 0;
          
          // Get or create contact for this chat
          const chatPhone = extractPhoneNumber(chat.id._serialized);
          let contact = await Contact.findOne({ where: { phone: chatPhone } });
          
          // Get proper chat name
          let properChatName = chatName;
          if (chat.isGroup) {
            // For groups, use group name
            properChatName = chat.name || chatName;
          } else {
            // For individual chats, try to get contact name
            try {
              const contactInfo = await chat.getContact();
              properChatName = contactInfo.name || contactInfo.pushname || contactInfo.verifiedName || chatName;
            } catch (err) {
              // If can't get contact, use existing name
              properChatName = chat.name || chatName;
            }
          }
          
          if (!contact) {
            contact = await Contact.create({
              phone: chatPhone,
              name: properChatName,
              isGroup: chat.isGroup,
              lastInteraction: new Date()
            });
            
            await Conversation.create({
              contactId: contact.id,
              lastMessageAt: new Date(),
              messageCount: messages.length
            });
          } else {
            // Update contact name if we got better name
            if (properChatName && properChatName !== chatPhone) {
              await contact.update({ name: properChatName });
            }
          }
          
          // Process each message
          for (let j = 0; j < messages.length; j++) {
            const msg = messages[j];
            
            try {
              await this.saveMessageFromExtraction(msg, chat, contact);
              totalSaved++;
              savedInThisChat++;
            } catch (msgError) {
              errorsInThisChat++;
              totalErrors++;
              
              if (errorsInThisChat <= 3) {
                console.error(`  ❌ Error processing message ${j + 1}: ${msgError.message}`);
              }
            }
          }
          
          console.log(`  ✅ Saved: ${savedInThisChat}/${messages.length} messages`);
          if (errorsInThisChat > 3) {
            console.log(`  ⚠️  Total errors: ${errorsInThisChat}`);
          }
          processedChats++;
          
        } catch (chatError) {
          console.error(`  ❌ Error fetching messages from chat: ${chatError.message}`);
          console.log(`  ⏭️  Skip this chat and continue...`);
        }
        
        // Delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 500));
      }
      
      console.log('\n' + '='.repeat(60));
      console.log('✅ EXTRACTION COMPLETE!');
      console.log('='.repeat(60));
      console.log(`📊 Total chats found: ${chats.length}`);
      console.log(`✅ Chats processed: ${processedChats}`);
      console.log(`📨 Total messages found: ${totalMessages}`);
      console.log(`💾 Total messages saved: ${totalSaved}`);
      console.log(`❌ Total errors: ${totalErrors}`);
      console.log(`📈 Success rate: ${totalMessages > 0 ? ((totalSaved/totalMessages)*100).toFixed(2) : 0}%`);
      console.log('='.repeat(60));
      
    } catch (error) {
      console.error('❌ Error during extraction:', error);
      throw error;
    }
  }

  /**
   * Save message from extraction
   */
  async saveMessageFromExtraction(msg, chat, contact) {
    try {
      // Get sender info
      let senderName = 'Unknown';
      let senderId = msg.from || msg.author || chat.id._serialized;
      
      const isFromMe = msg.fromMe || false;
      
      // Get sender name
      if (msg._data && msg._data.notifyName) {
        senderName = msg._data.notifyName;
      } else if (chat.isGroup && msg.author) {
        senderName = msg.author.split('@')[0];
        senderId = msg.author;
      } else if (chat.name) {
        senderName = chat.name;
      } else {
        senderName = senderId.split('@')[0];
      }
      
      if (isFromMe) {
        senderName = '[BOT] ' + senderName;
      }
      
      // Get proper chat name
      let properChatName = chat.name;
      if (!properChatName || properChatName === chat.id._serialized) {
        // Try to get better name
        if (chat.isGroup) {
          properChatName = chat.name || chat.id._serialized;
        } else {
          try {
            const contactInfo = await chat.getContact();
            properChatName = contactInfo.name || contactInfo.pushname || contactInfo.verifiedName || chat.id._serialized;
          } catch (err) {
            properChatName = contact.name || chat.id._serialized;
          }
        }
      }
      
      // Prepare message data
      const messageData = {
        contactId: contact.id,
        chatId: chat.id._serialized,
        chatName: properChatName, // Use proper chat name
        messageId: msg.id._serialized,
        senderId: senderId,
        senderName: senderName,
        type: msg.type || 'text',
        body: msg.body || '[Media/Empty Message]',
        isFromMe: isFromMe,
        isAiGenerated: false,
        timestamp: new Date(msg.timestamp * 1000),
        timestampBalasan: isFromMe ? new Date(msg.timestamp * 1000) : null,
        isGroup: chat.isGroup,
        hasMedia: msg.hasMedia,
        hasQuotedMsg: msg.hasQuotedMsg,
        quotedMsgId: null,
        quotedMessageBody: null,
        quotedSenderName: null
      };
      
      // If reply, get quoted message
      if (msg.hasQuotedMsg) {
        try {
          const quotedMsg = await msg.getQuotedMessage();
          if (quotedMsg && quotedMsg.id) {
            messageData.quotedMsgId = quotedMsg.id._serialized;
            messageData.quotedMessageBody = quotedMsg.body || '[Media/Empty Message]';
            
            if (quotedMsg._data && quotedMsg._data.notifyName) {
              messageData.quotedSenderName = quotedMsg._data.notifyName;
            } else if (quotedMsg.author) {
              messageData.quotedSenderName = quotedMsg.author.split('@')[0];
            } else {
              messageData.quotedSenderName = 'Unknown';
            }
            
            if (quotedMsg.fromMe) {
              messageData.quotedSenderName = '[BOT] ' + messageData.quotedSenderName;
            }
          }
        } catch (err) {
          // Ignore quoted message errors
        }
      }
      
      // Save to database (ignore duplicates)
      await Message.create(messageData).catch(err => {
        if (!err.message.includes('unique constraint')) {
          throw err;
        }
      });
      
    } catch (error) {
      throw error;
    }
  }
}

export default MessageExtractor;