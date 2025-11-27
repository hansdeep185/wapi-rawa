import { Contact, Message } from '../database/models.js';
import aiService from './service.js';

class ContactAnalysisService {
  /**
   * Analyze contact using AI
   */
  async analyzeContact(contactId) {
    try {
      console.log(`🔍 Starting AI analysis for contact: ${contactId}`);

      // Get contact with messages
      const contact = await Contact.findByPk(contactId, {
        include: [{
          model: Message,
          as: 'messages',
          limit: 100,
          order: [['timestamp', 'DESC']]
        }]
      });

      if (!contact) {
        throw new Error('Contact not found');
      }

      if (!contact.messages || contact.messages.length === 0) {
        throw new Error('No messages found for this contact');
      }

      // Prepare conversation history for AI analysis
      const conversationText = this.prepareConversationForAnalysis(contact.messages);

      // Generate analysis using AI
      const analysis = await this.generateAIAnalysis(conversationText, contact);

      // Save analysis to contact
      await contact.update({
        aiAnalysis: {
          ...analysis,
          lastAnalyzedAt: new Date()
        },
        leadScore: analysis.leadScore || 0
      });

      console.log(`✅ Analysis completed for contact: ${contact.name}`);

      return {
        contactId: contact.id,
        contactName: contact.name,
        phone: contact.phone,
        analysis
      };

    } catch (error) {
      console.error('❌ Error analyzing contact:', error);
      throw error;
    }
  }

  /**
   * Prepare conversation for analysis
   */
  prepareConversationForAnalysis(messages) {
    // Get last 100 messages
    const recentMessages = messages.slice(0, 100).reverse();

    let conversationText = '';
    
    recentMessages.forEach(msg => {
      const sender = msg.isFromMe ? 'Bot' : 'Customer';
      const timestamp = new Date(msg.timestamp).toLocaleDateString();
      conversationText += `[${timestamp}] ${sender}: ${msg.body}\n`;
    });

    return conversationText;
  }

  /**
   * Generate AI analysis
   */
  async generateAIAnalysis(conversationText, contact) {
    try {
      // Get active AI config
      const config = await aiService.getActiveConfig();
      const client = await aiService.initClient(config);

      // Create analysis prompt
      const analysisPrompt = `Analisa percakapan WhatsApp berikut dan berikan insight mendalam tentang customer:

PERCAKAPAN:
${conversationText}

TUGAS:
Analisa customer dan berikan hasil dalam format JSON berikut:

{
  "personality": {
    "type": "string (contoh: Friendly, Professional, Direct, Analytical, dll)",
    "traits": ["trait1", "trait2", "trait3"],
    "description": "deskripsi singkat kepribadian"
  },
  "interests": ["minat1", "minat2", "minat3"],
  "preferences": {
    "communicationStyle": "style preference (formal/casual/friendly)",
    "responseTime": "preferensi waktu respon (fast/normal/flexible)",
    "topics": ["topik yang sering dibahas"]
  },
  "communicationStyle": "Overall communication style",
  "sentiment": "positive/neutral/negative",
  "leadScore": number (0-100, based on engagement and intent),
  "leadQuality": "hot/warm/cold",
  "buyingSignals": ["signal1", "signal2"],
  "painPoints": ["pain point 1", "pain point 2"],
  "opportunities": ["opportunity 1", "opportunity 2"],
  "recommendedActions": ["action 1", "action 2", "action 3"],
  "summary": "Ringkasan lengkap tentang customer ini"
}

PENTING: 
- Berikan analisa yang objektif dan detail
- Lead score 0-100 berdasarkan: engagement, buying intent, response quality
- Identifikasi pain points dan opportunities untuk sales
- Berikan rekomendasi actionable
- Response harus valid JSON saja, tanpa text tambahan`;

      let analysisResult;

      if (config.provider === 'gemini') {
        const model = client.getGenerativeModel({ 
          model: config.model || 'gemini-2.5-pro'
        });

        const result = await model.generateContent(analysisPrompt);
        const response = await result.response;
        let text = response.text();
        
        // Clean response - remove markdown code blocks if any
        text = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        
        analysisResult = JSON.parse(text);

      } else if (config.provider === 'openai') {
        const response = await client.chat.completions.create({
          model: config.model || 'gpt-3.5-turbo',
          messages: [
            { 
              role: 'system', 
              content: 'You are a customer analysis expert. Always respond with valid JSON only.' 
            },
            { role: 'user', content: analysisPrompt }
          ],
          temperature: 0.7,
          response_format: { type: "json_object" }
        });

        analysisResult = JSON.parse(response.choices[0].message.content);

      } else if (config.provider === 'anthropic') {
        const response = await client.messages.create({
          model: config.model || 'claude-3-sonnet-20240229',
          max_tokens: 2000,
          temperature: 0.7,
          messages: [{
            role: 'user',
            content: analysisPrompt
          }]
        });

        let text = response.content[0].text;
        text = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        analysisResult = JSON.parse(text);
      }

      // Validate and structure the result
      return {
        personality: analysisResult.personality || {},
        interests: analysisResult.interests || [],
        preferences: analysisResult.preferences || {},
        communicationStyle: analysisResult.communicationStyle || 'Unknown',
        sentiment: analysisResult.sentiment || 'neutral',
        leadScore: Math.min(100, Math.max(0, analysisResult.leadScore || 0)),
        leadQuality: analysisResult.leadQuality || 'cold',
        buyingSignals: analysisResult.buyingSignals || [],
        painPoints: analysisResult.painPoints || [],
        opportunities: analysisResult.opportunities || [],
        recommendedActions: analysisResult.recommendedActions || [],
        summary: analysisResult.summary || '',
        analyzedAt: new Date()
      };

    } catch (error) {
      console.error('Error in AI analysis:', error);
      
      // Return basic analysis if AI fails
      return {
        personality: { type: 'Unknown', traits: [], description: 'AI analysis failed' },
        interests: [],
        preferences: {},
        communicationStyle: 'Unknown',
        sentiment: 'neutral',
        leadScore: 0,
        leadQuality: 'cold',
        buyingSignals: [],
        painPoints: [],
        opportunities: [],
        recommendedActions: ['Re-run analysis with valid AI configuration'],
        summary: 'Analysis could not be completed. Error: ' + error.message,
        analyzedAt: new Date(),
        error: error.message
      };
    }
  }

  /**
   * Get conversation summary for contact
   */
  async getConversationSummary(contactId) {
    try {
      const contact = await Contact.findByPk(contactId, {
        include: [{
          model: Message,
          as: 'messages',
          limit: 50,
          order: [['timestamp', 'DESC']]
        }]
      });

      if (!contact) {
        throw new Error('Contact not found');
      }

      const totalMessages = await Message.count({ where: { contactId } });
      const messagesFromMe = await Message.count({ 
        where: { contactId, isFromMe: true } 
      });
      const aiMessages = await Message.count({ 
        where: { contactId, isAiGenerated: true } 
      });

      // Get first and last message
      const firstMessage = await Message.findOne({
        where: { contactId },
        order: [['timestamp', 'ASC']]
      });

      const lastMessage = await Message.findOne({
        where: { contactId },
        order: [['timestamp', 'DESC']]
      });

      // Calculate average response time (simplified)
      const avgResponseTime = await this.calculateAverageResponseTime(contactId);

      return {
        totalMessages,
        messagesFromMe,
        messagesFromCustomer: totalMessages - messagesFromMe,
        aiMessages,
        humanMessages: messagesFromMe - aiMessages,
        firstMessageDate: firstMessage?.timestamp,
        lastMessageDate: lastMessage?.timestamp,
        averageResponseTime: avgResponseTime,
        messageFrequency: this.calculateMessageFrequency(firstMessage, lastMessage, totalMessages)
      };

    } catch (error) {
      console.error('Error getting conversation summary:', error);
      throw error;
    }
  }

  /**
   * Calculate average response time
   */
  async calculateAverageResponseTime(contactId) {
    try {
      const messages = await Message.findAll({
        where: { contactId },
        order: [['timestamp', 'ASC']],
        limit: 100
      });

      if (messages.length < 2) return null;

      let responseTimes = [];
      
      for (let i = 1; i < messages.length; i++) {
        const prev = messages[i - 1];
        const curr = messages[i];
        
        // If previous is from customer and current is from bot
        if (!prev.isFromMe && curr.isFromMe) {
          const diff = new Date(curr.timestamp) - new Date(prev.timestamp);
          responseTimes.push(diff);
        }
      }

      if (responseTimes.length === 0) return null;

      const avgMs = responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length;
      const avgMinutes = Math.round(avgMs / 60000);

      return {
        milliseconds: avgMs,
        minutes: avgMinutes,
        formatted: this.formatDuration(avgMs)
      };

    } catch (error) {
      console.error('Error calculating response time:', error);
      return null;
    }
  }

  /**
   * Calculate message frequency
   */
  calculateMessageFrequency(firstMessage, lastMessage, totalMessages) {
    if (!firstMessage || !lastMessage || totalMessages < 2) {
      return 'Unknown';
    }

    const firstDate = new Date(firstMessage.timestamp);
    const lastDate = new Date(lastMessage.timestamp);
    const daysDiff = (lastDate - firstDate) / (1000 * 60 * 60 * 24);

    if (daysDiff < 1) return 'Very Active (multiple times today)';
    
    const messagesPerDay = totalMessages / daysDiff;

    if (messagesPerDay >= 5) return 'Very Active (5+ msg/day)';
    if (messagesPerDay >= 2) return 'Active (2-5 msg/day)';
    if (messagesPerDay >= 0.5) return 'Moderate (few times/week)';
    if (messagesPerDay >= 0.1) return 'Low (few times/month)';
    return 'Rare (occasional)';
  }

  /**
   * Format duration
   */
  formatDuration(ms) {
    const minutes = Math.floor(ms / 60000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days} day${days > 1 ? 's' : ''}`;
    if (hours > 0) return `${hours} hour${hours > 1 ? 's' : ''}`;
    if (minutes > 0) return `${minutes} min${minutes > 1 ? 's' : ''}`;
    return 'Less than 1 min';
  }

  /**
   * Batch analyze multiple contacts
   */
  async batchAnalyze(contactIds) {
    const results = [];
    
    for (const contactId of contactIds) {
      try {
        const result = await this.analyzeContact(contactId);
        results.push({ contactId, success: true, data: result });
      } catch (error) {
        results.push({ contactId, success: false, error: error.message });
      }
      
      // Small delay between analyses to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    return results;
  }
}

export default new ContactAnalysisService();