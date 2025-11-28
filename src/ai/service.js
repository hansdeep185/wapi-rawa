import { GoogleGenerativeAI } from '@google/generative-ai';
import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { AIConfig, Knowledge, Message } from '../database/models.js';
import { Op } from 'sequelize';

class AIService {
  constructor() {
    this.clients = {};
  }

  /**
   * Get active AI configuration
   */
  async getActiveConfig() {
    try {
      const config = await AIConfig.findOne({
        where: { isActive: true }
      });

      if (!config) {
        throw new Error('No active AI configuration found');
      }

      return config;
    } catch (error) {
      console.error('Error getting active config:', error);
      throw error;
    }
  }

  /**
   * Initialize AI client based on provider
   */
  async initClient(config) {
    const provider = config.provider;

    if (this.clients[provider]) {
      return this.clients[provider];
    }

    switch (provider) {
      case 'gemini':
        this.clients[provider] = new GoogleGenerativeAI(config.apiKey);
        break;
      case 'openai':
        this.clients[provider] = new OpenAI({ apiKey: config.apiKey });
        break;
      case 'anthropic':
        this.clients[provider] = new Anthropic({ apiKey: config.apiKey });
        break;
      default:
        throw new Error(`Unsupported AI provider: ${provider}`);
    }

    return this.clients[provider];
  }

  /**
   * Get conversation history for context
   */
  async getConversationHistory(contactId, limit = 10) {
    try {
      const messages = await Message.findAll({
        where: { contactId },
        order: [['timestamp', 'DESC']],
        limit: limit,
        attributes: ['body', 'isFromMe', 'timestamp', 'isAiGenerated']
      });

      // Reverse to get chronological order
      return messages.reverse().map(msg => ({
        role: msg.isFromMe ? 'assistant' : 'user',
        content: msg.body,
        timestamp: msg.timestamp
      }));
    } catch (error) {
      console.error('Error getting conversation history:', error);
      return [];
    }
  }

  /**
   * Get relevant knowledge from knowledge base
   */
  async getRelevantKnowledge(prompt, limit = 3) {
    try {
      // Simple keyword matching - you can enhance this with vector search
      const keywords = prompt.toLowerCase().split(' ').filter(word => word.length > 3);
      
      if (keywords.length === 0) return [];

      const knowledge = await Knowledge.findAll({
        where: {
          isActive: true,
          [Op.or]: keywords.map(keyword => ({
            [Op.or]: [
              { title: { [Op.iLike]: `%${keyword}%` } },
              { content: { [Op.iLike]: `%${keyword}%` } },
              { tags: { [Op.contains]: [keyword] } }
            ]
          }))
        },
        limit: limit,
        order: [['updatedAt', 'DESC']]
      });

      return knowledge.map(k => ({
        title: k.title,
        content: k.content,
        category: k.category
      }));
    } catch (error) {
      console.error('Error getting relevant knowledge:', error);
      return [];
    }
  }

  /**
   * Build context-aware prompt
   */
  async buildContextualPrompt(config, prompt, contactName, contactId) {
    let contextualPrompt = '';

    // 1. System Prompt
    if (config.systemPrompt) {
      contextualPrompt += `=== SYSTEM INSTRUCTIONS ===\n${config.systemPrompt}\n\n`;
    }

    // 2. Knowledge Base
    if (config.settings?.useKnowledgeBase) {
      const knowledgeItems = await this.getRelevantKnowledge(prompt);
      
      if (knowledgeItems.length > 0) {
        contextualPrompt += '=== KNOWLEDGE BASE (Gunakan info ini untuk menjawab) ===\n';
        knowledgeItems.forEach(k => {
          contextualPrompt += `[${k.category}] ${k.title}:\n${k.content}\n\n`;
        });
      }
    }

    // 3. Conversation History
    if (config.settings?.useConversationHistory && contactId) {
      const history = await this.getConversationHistory(contactId, 10);
      
      if (history.length > 0) {
        contextualPrompt += '=== RIWAYAT PERCAKAPAN (Context untuk jawaban) ===\n';
        history.forEach(msg => {
          const role = msg.role === 'user' ? 'Customer' : 'You (AI Assistant)';
          contextualPrompt += `${role}: ${msg.content}\n`;
        });
        contextualPrompt += '\n';
      }
    }

    // 4. Current Context
    if (contactName) {
      contextualPrompt += `=== KONTEKS SAAT INI ===\n`;
      contextualPrompt += `Nama Customer: ${contactName}\n`;
      contextualPrompt += `Waktu: ${new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })}\n\n`;
    }

    // 5. Current Message
    contextualPrompt += `=== PESAN CUSTOMER SEKARANG ===\n${prompt}\n\n`;
    contextualPrompt += `=== TUGAS ANDA ===\nBerikan jawaban yang relevan, personal, dan sesuai konteks percakapan. Gunakan riwayat chat dan knowledge base yang tersedia.\n\n`;
    contextualPrompt += `JAWABAN ANDA:\n`;

    return contextualPrompt;
  }

  /**
   * Generate AI response using Gemini with context
   */
  async generateWithGemini(config, prompt, contactName = null, contactId = null) {
    try {
      const genAI = new GoogleGenerativeAI(config.apiKey);
      
      // Use stable model
      const modelName = config.model || 'gemini-1.5-flash';
      console.log(`🤖 Using Gemini model: ${modelName}`);

      // Create model
      const model = genAI.getGenerativeModel({ 
        model: modelName,
        generationConfig: {
          temperature: config.temperature || 0.7,
          maxOutputTokens: config.maxTokens || 1000
        }
      });

      // Build contextual prompt with history and knowledge
      console.log('📚 Building contextual prompt with history & knowledge...');
      const contextualPrompt = await this.buildContextualPrompt(
        config, 
        prompt, 
        contactName, 
        contactId
      );

      console.log('📤 Sending prompt to Gemini...');

      // Generate content
      const result = await model.generateContent(contextualPrompt);
      const response = result.response;
      const text = response.text();

      console.log('✅ Gemini response received');

      return text.trim();

    } catch (error) {
      console.error('❌ Error generating with Gemini:', error.message);
      throw error;
    }
  }

  /**
   * Generate AI response using OpenAI with context
   */
  async generateWithOpenAI(config, prompt, contactName = null, contactId = null) {
    try {
      const client = await this.initClient(config);

      console.log(`🤖 Using OpenAI model: ${config.model}`);

      // Get conversation history
      const history = await this.getConversationHistory(contactId, 10);
      
      // Build messages array
      const messages = [];

      // System message with context
      let systemMessage = config.systemPrompt || 'You are a helpful assistant.';
      
      if (contactName) {
        systemMessage += `\n\nYou are currently talking with: ${contactName}`;
      }

      // Add knowledge base if enabled
      if (config.settings?.useKnowledgeBase) {
        const knowledgeItems = await this.getRelevantKnowledge(prompt);
        if (knowledgeItems.length > 0) {
          systemMessage += '\n\nKnowledge Base:\n';
          knowledgeItems.forEach(k => {
            systemMessage += `- [${k.category}] ${k.title}: ${k.content}\n`;
          });
        }
      }

      messages.push({
        role: 'system',
        content: systemMessage
      });

      // Add conversation history
      if (config.settings?.useConversationHistory && history.length > 0) {
        history.forEach(msg => {
          messages.push({
            role: msg.role,
            content: msg.content
          });
        });
      }

      // Add current message
      messages.push({
        role: 'user',
        content: prompt
      });

      console.log('📤 Sending to OpenAI...');

      // Generate response
      const response = await client.chat.completions.create({
        model: config.model || 'gpt-3.5-turbo',
        messages: messages,
        temperature: config.temperature || 0.7,
        max_tokens: config.maxTokens || 1000
      });

      console.log('✅ OpenAI response received');

      return response.choices[0].message.content.trim();

    } catch (error) {
      console.error('❌ Error generating with OpenAI:', error.message);
      throw error;
    }
  }

  /**
   * Generate AI response using Anthropic Claude with context
   */
  async generateWithAnthropic(config, prompt, contactName = null, contactId = null) {
    try {
      const client = await this.initClient(config);

      console.log(`🤖 Using Claude model: ${config.model}`);

      // Build system prompt with context
      let systemPrompt = config.systemPrompt || 'You are a helpful assistant.';
      
      if (contactName) {
        systemPrompt += `\n\nYou are currently talking with: ${contactName}`;
      }

      // Add knowledge base
      if (config.settings?.useKnowledgeBase) {
        const knowledgeItems = await this.getRelevantKnowledge(prompt);
        if (knowledgeItems.length > 0) {
          systemPrompt += '\n\nKnowledge Base:\n';
          knowledgeItems.forEach(k => {
            systemPrompt += `- [${k.category}] ${k.title}: ${k.content}\n`;
          });
        }
      }

      // Build messages array with history
      const messages = [];

      // Add conversation history
      if (config.settings?.useConversationHistory && contactId) {
        const history = await this.getConversationHistory(contactId, 10);
        history.forEach(msg => {
          messages.push({
            role: msg.role,
            content: msg.content
          });
        });
      }

      // Add current message
      messages.push({
        role: 'user',
        content: prompt
      });

      console.log('📤 Sending to Claude...');

      // Generate response
      const response = await client.messages.create({
        model: config.model || 'claude-3-sonnet-20240229',
        max_tokens: config.maxTokens || 1000,
        temperature: config.temperature || 0.7,
        system: systemPrompt,
        messages: messages
      });

      console.log('✅ Claude response received');

      return response.content[0].text.trim();

    } catch (error) {
      console.error('❌ Error generating with Claude:', error.message);
      throw error;
    }
  }

  /**
   * Main method to generate response
   */
  async generateResponse(contactId, message, contactName = null) {
    try {
      console.log('🤖 Generating AI response...');
      console.log('📝 Input:', { contactId, message, contactName });

      const config = await this.getActiveConfig();

      let response;

      switch (config.provider) {
        case 'gemini':
          response = await this.generateWithGemini(config, message, contactName, contactId);
          break;
        case 'openai':
          response = await this.generateWithOpenAI(config, message, contactName, contactId);
          break;
        case 'anthropic':
          response = await this.generateWithAnthropic(config, message, contactName, contactId);
          break;
        default:
          throw new Error(`Unsupported provider: ${config.provider}`);
      }
      // DEBUG: Check response
      console.log('📤 AI Response:', response);
      console.log('📏 Response length:', response?.length);
      console.log('🔍 Response type:', typeof response);
      console.log('✅ AI response generated successfully');

      return response;
    } catch (error) {
      console.error('Error generating AI response:', error);
      throw error;
    }
  }

  /**
   * Test AI configuration
   */
  async testConfig(configId) {
    try {
      const config = await AIConfig.findByPk(configId);

      if (!config) {
        throw new Error('Configuration not found');
      }

      const testPrompt = 'Hello! Please respond with "AI is working correctly" to confirm the connection.';
      
      let response;

      switch (config.provider) {
        case 'gemini':
          response = await this.generateWithGemini(config, testPrompt);
          break;
        case 'openai':
          response = await this.generateWithOpenAI(config, testPrompt);
          break;
        case 'anthropic':
          response = await this.generateWithAnthropic(config, testPrompt);
          break;
      }

      return {
        success: true,
        response,
        config: {
          provider: config.provider,
          model: config.model
        }
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }
}

export default new AIService();