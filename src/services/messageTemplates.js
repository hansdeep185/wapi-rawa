import { MessageTemplate } from '../database/models.js';
import { Op } from 'sequelize';

class MessageTemplateService {
  /**
   * Create new template
   */
  async createTemplate(data) {
    try {
      const template = await MessageTemplate.create({
        name: data.name,
        content: data.content,
        category: data.category || 'general',
        triggers: data.triggers || [],
        isActive: data.isActive !== undefined ? data.isActive : true,
        useAI: data.useAI || false,
        priority: data.priority || 0
      });

      return template;
    } catch (error) {
      console.error('Error creating template:', error);
      throw error;
    }
  }

  /**
   * Get all templates
   */
  async getAllTemplates(filters = {}) {
    try {
      const where = {};

      if (filters.category) {
        where.category = filters.category;
      }

      if (filters.isActive !== undefined) {
        where.isActive = filters.isActive;
      }

      if (filters.search) {
        where[Op.or] = [
          { name: { [Op.iLike]: `%${filters.search}%` } },
          { content: { [Op.iLike]: `%${filters.search}%` } }
        ];
      }

      const templates = await MessageTemplate.findAll({
        where,
        order: [['priority', 'DESC'], ['createdAt', 'DESC']]
      });

      return templates;
    } catch (error) {
      console.error('Error getting templates:', error);
      throw error;
    }
  }

  /**
   * Get template by ID
   */
  async getTemplateById(id) {
    try {
      const template = await MessageTemplate.findByPk(id);
      return template;
    } catch (error) {
      console.error('Error getting template:', error);
      throw error;
    }
  }

  /**
   * Update template
   */
  async updateTemplate(id, data) {
    try {
      const template = await MessageTemplate.findByPk(id);

      if (!template) {
        throw new Error('Template not found');
      }

      const updates = {};
      const allowedFields = ['name', 'content', 'category', 'triggers', 'isActive', 'useAI', 'priority'];

      allowedFields.forEach(field => {
        if (data[field] !== undefined) {
          updates[field] = data[field];
        }
      });

      await template.update(updates);

      return template;
    } catch (error) {
      console.error('Error updating template:', error);
      throw error;
    }
  }

  /**
   * Delete template
   */
  async deleteTemplate(id) {
    try {
      const template = await MessageTemplate.findByPk(id);

      if (!template) {
        throw new Error('Template not found');
      }

      await template.destroy();

      return { success: true, message: 'Template deleted' };
    } catch (error) {
      console.error('Error deleting template:', error);
      throw error;
    }
  }

  /**
   * Find template by trigger keyword
   */
  async findByTrigger(keyword) {
    try {
      const templates = await MessageTemplate.findAll({
        where: {
          isActive: true,
          triggers: {
            [Op.contains]: [keyword.toLowerCase()]
          }
        },
        order: [['priority', 'DESC']]
      });

      return templates.length > 0 ? templates[0] : null;
    } catch (error) {
      console.error('Error finding template by trigger:', error);
      return null;
    }
  }

  /**
   * Find template by category
   */
  async findByCategory(category) {
    try {
      const templates = await MessageTemplate.findAll({
        where: {
          category,
          isActive: true
        },
        order: [['priority', 'DESC']]
      });

      return templates;
    } catch (error) {
      console.error('Error finding templates by category:', error);
      return [];
    }
  }

  /**
   * Get template for out of office
   */
  async getOutOfOfficeTemplate() {
    try {
      const template = await MessageTemplate.findOne({
        where: {
          category: 'out_of_office',
          isActive: true
        },
        order: [['priority', 'DESC']]
      });

      return template;
    } catch (error) {
      console.error('Error getting out of office template:', error);
      return null;
    }
  }

  /**
   * Get greeting template
   */
  async getGreetingTemplate() {
    try {
      const template = await MessageTemplate.findOne({
        where: {
          category: 'greeting',
          isActive: true
        },
        order: [['priority', 'DESC']]
      });

      return template;
    } catch (error) {
      console.error('Error getting greeting template:', error);
      return null;
    }
  }

  /**
   * Process template variables
   */
  processTemplate(template, variables = {}) {
    let content = template;

    // Default variables
    const defaultVars = {
      name: variables.name || 'Customer',
      date: new Date().toLocaleDateString('id-ID'),
      time: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
      day: new Date().toLocaleDateString('id-ID', { weekday: 'long' })
    };

    // Merge with provided variables
    const allVars = { ...defaultVars, ...variables };

    // Replace variables in template
    Object.keys(allVars).forEach(key => {
      const regex = new RegExp(`{{${key}}}`, 'g');
      content = content.replace(regex, allVars[key]);
    });

    return content;
  }

  /**
   * Get template statistics
   */
  async getStatistics() {
    try {
      const total = await MessageTemplate.count();
      const active = await MessageTemplate.count({ where: { isActive: true } });
      const inactive = total - active;

      const byCategory = await MessageTemplate.findAll({
        attributes: [
          'category',
          [sequelize.fn('COUNT', sequelize.col('id')), 'count']
        ],
        group: ['category']
      });

      return {
        total,
        active,
        inactive,
        byCategory: byCategory.map(item => ({
          category: item.category,
          count: parseInt(item.get('count'))
        }))
      };
    } catch (error) {
      console.error('Error getting template statistics:', error);
      return {
        total: 0,
        active: 0,
        inactive: 0,
        byCategory: []
      };
    }
  }

  /**
   * Initialize default templates
   */
  async initializeDefaults() {
    const defaults = [
      {
        name: 'Greeting - First Contact',
        content: 'Halo {{name}}! 👋 Terima kasih telah menghubungi kami. Ada yang bisa saya bantu?',
        category: 'greeting',
        triggers: [],
        isActive: true,
        useAI: false,
        priority: 10
      },
      {
        name: 'Out of Office',
        content: 'Terima kasih atas pesan Anda. Kami sedang di luar jam kerja ({{time}}). Kami akan membalas Anda pada jam kerja berikutnya (Senin-Jumat, 09:00-17:00 WIB). 🕐',
        category: 'out_of_office',
        triggers: [],
        isActive: true,
        useAI: false,
        priority: 10
      },
      {
        name: 'FAQ - Jam Operasional',
        content: 'Jam operasional kami:\n- Senin-Jumat: 09:00 - 17:00 WIB\n- Sabtu: 09:00 - 13:00 WIB\n- Minggu: Libur',
        category: 'faq',
        triggers: ['jam', 'buka', 'operasional', 'jadwal'],
        isActive: true,
        useAI: false,
        priority: 5
      },
      {
        name: 'FAQ - Cara Pemesanan',
        content: 'Untuk melakukan pemesanan, silakan:\n1. Pilih produk yang diinginkan\n2. Kirimkan nama produk dan jumlah\n3. Konfirmasi alamat pengiriman\n4. Kami akan kirimkan invoice untuk pembayaran',
        category: 'faq',
        triggers: ['pesan', 'order', 'beli', 'pemesanan'],
        isActive: true,
        useAI: false,
        priority: 5
      },
      {
        name: 'FAQ - Cara Pembayaran',
        content: 'Metode pembayaran yang tersedia:\n✅ Transfer Bank (BCA, Mandiri, BNI)\n✅ E-wallet (GoPay, OVO, Dana)\n✅ QRIS\n\nSilakan pilih metode yang Anda inginkan.',
        category: 'faq',
        triggers: ['bayar', 'pembayaran', 'transfer', 'payment'],
        isActive: true,
        useAI: false,
        priority: 5
      },
      {
        name: 'Thank You',
        content: 'Terima kasih {{name}}! 🙏 Jika ada pertanyaan lain, jangan ragu untuk menghubungi kami.',
        category: 'general',
        triggers: ['terima kasih', 'thanks', 'thank you'],
        isActive: true,
        useAI: false,
        priority: 3
      },
      {
        name: 'Connecting to Human',
        content: 'Baik, saya akan menghubungkan Anda dengan tim customer service kami. Mohon tunggu sebentar... 👨‍💼',
        category: 'general',
        triggers: [],
        isActive: true,
        useAI: false,
        priority: 8
      }
    ];

    for (const template of defaults) {
      const exists = await MessageTemplate.findOne({
        where: { name: template.name }
      });

      if (!exists) {
        await MessageTemplate.create(template);
      }
    }

    console.log('✅ Message templates initialized');
  }
}

export default new MessageTemplateService();