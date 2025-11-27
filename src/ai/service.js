import { GoogleGenerativeAI } from '@google/generative-ai';
import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { AIConfig, Knowledge, Message, Contact } from '../database/models.js';

class AIService {
  constructor() {
    this.clients = {};
  }

  /**
   * Initialize AI client based on provider
   */
  async initClient(config) {
    const cacheKey = `${config.provider}-${config.id}`;
    
    if (this.clients[cacheKey]) {
      return this.clients[cacheKey];
    }

    let client;
    
    switch (config.provider) {
      case 'gemini':
        client = new GoogleGenerativeAI(config.apiKey);
        break;
      case 'openai':
        client = new OpenAI({ apiKey: config.apiKey });
        break;
      case 'anthropic':
        client = new Anthropic({ apiKey: config.apiKey });
        break;
      default:
        throw new Error(`Unsupported AI provider: ${config.provider}`);
    }
    
    this.clients[cacheKey] = client;
    return client;
  }

  /**
   * Get active AI configuration
   */
  async getActiveConfig() {
    const config = await AIConfig.findOne({
      where: { isActive: true },
      order: [['updatedAt', 'DESC']]
    });
    
    if (!config) {
      throw new Error('No active AI configuration found');
    }
    
    return config;
  }

  /**
   * Get conversation context for a contact
   */
  async getConversationContext(contactId, limit = 10) {
    const messages = await Message.findAll({
      where: { contactId },
      order: [['timestamp', 'DESC']],
      limit,
      include: [{
        model: Contact,
        as: 'contact'
      }]
    });
    
    return messages.reverse().map(msg => ({
      role: msg.isFromMe ? 'assistant' : 'user',
      content: msg.body,
      timestamp: msg.timestamp
    }));
  }

  /**
   * Get relevant knowledge base entries
   */
  async getRelevantKnowledge(query, limit = 5) {
    // Simple keyword matching for now
    // TODO: Implement vector embeddings for better semantic search
    const knowledge = await Knowledge.findAll({
      where: {
        isActive: true
      },
      limit
    });
    
    return knowledge.map(k => ({
      title: k.title,
      content: k.content,
      category: k.category
    }));
  }

  /**
   * Build system prompt with knowledge and context
   */
  async buildSystemPrompt(config, contactName) {
    let systemPrompt = config.systemPrompt || 
      'Anda adalah asisten WhatsApp yang membantu dan ramah. Jawab dengan bahasa yang natural dan sesuai konteks.';
    
    // Add knowledge base
    const knowledge = await this.getRelevantKnowledge('', 5);
    if (knowledge.length > 0) {
      systemPrompt += '\n\nKnowledge Base:\n';
      knowledge.forEach(k => {
        systemPrompt += `\n- ${k.title}: ${k.content}`;
      });
    }
    
    // Add context about contact
    if (contactName) {
      systemPrompt += `\n\nAnda sedang berbicara dengan: ${contactName}`;
    }
    
    return systemPrompt;
  }

  /**
   * Generate AI response using Gemini
   */
  async generateWithGemini(config, prompt, contactName = null) {
    try {
      const genAI = new GoogleGenerativeAI(config.apiKey);
      
      // Use stable model
      const modelName = config.model || 'gemini-2.5-flash';
      console.log(`🤖 Using Gemini model: ${modelName}`);

      // Create model
      const model = genAI.getGenerativeModel({ 
        model: modelName
      });

      // Build complete prompt (include system instruction in prompt)
      let fullPrompt = '';
      
      if (config.systemPrompt) {
        fullPrompt += config.systemPrompt + '\n\n';
      }
      
      if (contactName) {
        fullPrompt += `[Context: Anda sedang berbicara dengan ${contactName}]\n\n`;
      }
      
      fullPrompt += prompt;

      console.log('📤 Sending prompt to Gemini...');

      // Generate content directly (no chat session)
      const result = await model.generateContent(fullPrompt);
      const response = result.response;
      const text = response.text();

      console.log('✅ Gemini response received');

      return text;

    } catch (error) {
      console.error('❌ Error generating with Gemini:', error.message);
      throw error;
    }
  }

  /**
   * Generate AI response using OpenAI
   */
  async generateWithOpenAI(client, config, messages, systemPrompt) {
    const formattedMessages = [
      { role: 'system', content: systemPrompt },
      ...messages
    ];

    const response = await client.chat.completions.create({
      model: config.model || 'gpt-3.5-turbo',
      messages: formattedMessages,
      temperature: config.temperature,
      max_tokens: config.maxTokens,
    });

    return response.choices[0].message.content;
  }

  /**
   * Generate AI response using Anthropic
   */
  async generateWithAnthropic(client, config, messages, systemPrompt) {
    const response = await client.messages.create({
      model: config.model || 'claude-3-sonnet-20240229',
      max_tokens: config.maxTokens,
      temperature: config.temperature,
      system: systemPrompt,
      messages: messages
    });

    return response.content[0].text;
  }

  /**
   * Generate AI response (main method)
   */
  async generateResponse(contactId, userMessage, contactName = null) {
    try {
      // Get active AI configuration
      const config = await this.getActiveConfig();
      
      // Initialize client
      const client = await this.initClient(config);
      
      // Get conversation context
      const context = await this.getConversationContext(contactId);
      
      // Add current message to context
      const messages = [
        ...context,
        { role: 'user', content: userMessage }
      ];
      
      // Build system prompt
      const systemPrompt = await this.buildSystemPrompt(config, contactName);
      
      // Generate response based on provider
      let response;
      switch (config.provider) {
        case 'gemini':
          response = await this.generateWithGemini(client, config, messages, systemPrompt);
          break;
        case 'openai':
          response = await this.generateWithOpenAI(client, config, messages, systemPrompt);
          break;
        case 'anthropic':
          response = await this.generateWithAnthropic(client, config, messages, systemPrompt);
          break;
        default:
          throw new Error(`Unsupported provider: ${config.provider}`);
      }
      
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

      const client = await this.initClient(config);
      const testMessage = 'Halo, ini adalah test message.';
      
      let response;
      const systemPrompt = 'You are a helpful assistant. Reply briefly.';
      const messages = [{ role: 'user', content: testMessage }];
      
      switch (config.provider) {
        case 'gemini':
          response = await this.generateWithGemini(client, config, messages, systemPrompt);
          break;
        case 'openai':
          response = await this.generateWithOpenAI(client, config, messages, systemPrompt);
          break;
        case 'anthropic':
          response = await this.generateWithAnthropic(client, config, messages, systemPrompt);
          break;
      }
      
      return {
        success: true,
        response
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