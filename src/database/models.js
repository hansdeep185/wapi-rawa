import { DataTypes } from 'sequelize';
import sequelize from './config.js';

// Contact Model
export const Contact = sequelize.define('Contact', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  phone: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true
  },
  name: {
    type: DataTypes.STRING,
    allowNull: true
  },
  pushname: {
    type: DataTypes.STRING,
    allowNull: true
  },
  isGroup: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  profilePicUrl: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  tags: {
    type: DataTypes.ARRAY(DataTypes.STRING),
    defaultValue: []
  },
  metadata: {
    type: DataTypes.JSONB,
    defaultValue: {}
  },
  lastInteraction: {
    type: DataTypes.DATE,
    allowNull: true
  },
  // AI Analysis fields
  aiAnalysis: {
    type: DataTypes.JSONB,
    defaultValue: {
      personality: null,
      interests: [],
      preferences: [],
      communicationStyle: null,
      leadScore: 0,
      sentiment: null,
      lastAnalyzedAt: null
    }
  },
  // Lead & Sales fields
  leadStatus: {
    type: DataTypes.ENUM('cold', 'warm', 'hot', 'customer', 'lost'),
    defaultValue: 'cold'
  },
  leadScore: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  // Custom fields
  customFields: {
    type: DataTypes.JSONB,
    defaultValue: {}
  },
  notes: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  // Assignment
  assignedTo: {
    type: DataTypes.UUID,
    allowNull: true,
    references: {
      model: 'users',
      key: 'id'
    }
  }
}, {
  tableName: 'contacts',
  timestamps: true
});

// Message Model
export const Message = sequelize.define('Message', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  contactId: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'contacts',
      key: 'id'
    }
  },
  chatId: {
    type: DataTypes.STRING,
    allowNull: false
  },
  chatName: {
    type: DataTypes.STRING,
    allowNull: true
  },
  messageId: {
    type: DataTypes.STRING,
    allowNull: true,
    unique: true
  },
  senderId: {
    type: DataTypes.STRING,
    allowNull: true
  },
  senderName: {
    type: DataTypes.STRING,
    allowNull: true
  },
  type: {
    type: DataTypes.ENUM(
      'text', 
      'image', 
      'document', 
      'audio', 
      'video', 
      'sticker', 
      'location', 
      'contact', 
      'chat',
      'e2e_notification',
      'gp2',
      'album',
      'unknown',
      'ptt',
      'poll',
      'call_log',
      'ciphertext',
      'revoked',
      'notification',
      'notification_template'
    ),
    defaultValue: 'text'
  },
  body: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  mediaUrl: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  isFromMe: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  isAiGenerated: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  timestamp: {
    type: DataTypes.DATE,
    allowNull: false
  },
  timestampBalasan: {
    type: DataTypes.DATE,
    allowNull: true
  },
  isGroup: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  hasMedia: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  hasQuotedMsg: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  quotedMsgId: {
    type: DataTypes.STRING,
    allowNull: true
  },
  quotedMessageBody: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  quotedSenderName: {
    type: DataTypes.STRING,
    allowNull: true
  }
}, {
  tableName: 'messages',
  timestamps: true
});

// Conversation Context Model
export const Conversation = sequelize.define('Conversation', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  contactId: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'contacts',
      key: 'id'
    }
  },
  summary: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  lastMessageAt: {
    type: DataTypes.DATE,
    allowNull: false
  },
  messageCount: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  status: {
    type: DataTypes.ENUM('active', 'archived', 'spam'),
    defaultValue: 'active'
  }
}, {
  tableName: 'conversations',
  timestamps: true
});

// AI Configuration Model
export const AIConfig = sequelize.define('AIConfig', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false
  },
  provider: {
    type: DataTypes.ENUM('gemini', 'openai', 'anthropic'),
    allowNull: false
  },
  model: {
    type: DataTypes.STRING,
    allowNull: false
  },
  apiKey: {
    type: DataTypes.STRING,
    allowNull: false
  },
  systemPrompt: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  temperature: {
    type: DataTypes.FLOAT,
    defaultValue: 0.7
  },
  maxTokens: {
    type: DataTypes.INTEGER,
    defaultValue: 1000
  },
  isActive: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  settings: {
    type: DataTypes.JSONB,
    defaultValue: {}
  }
}, {
  tableName: 'ai_configs',
  timestamps: true
});

// Knowledge Base Model
export const Knowledge = sequelize.define('Knowledge', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  title: {
    type: DataTypes.STRING,
    allowNull: false
  },
  content: {
    type: DataTypes.TEXT,
    allowNull: false
  },
  category: {
    type: DataTypes.STRING,
    allowNull: true
  },
  tags: {
    type: DataTypes.ARRAY(DataTypes.STRING),
    defaultValue: []
  },
  isActive: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  }
}, {
  tableName: 'knowledge',
  timestamps: true
});

// User Model (for dashboard authentication)
export const User = sequelize.define('User', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  username: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true
  },
  password: {
    type: DataTypes.STRING,
    allowNull: false
  },
  email: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true
  },
  role: {
    type: DataTypes.ENUM('admin', 'user'),
    defaultValue: 'user'
  }
}, {
  tableName: 'users',
  timestamps: true
});

// Message Template Model
export const MessageTemplate = sequelize.define('MessageTemplate', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false
  },
  content: {
    type: DataTypes.TEXT,
    allowNull: false
  },
  category: {
    type: DataTypes.ENUM('greeting', 'out_of_office', 'faq', 'general', 'custom'),
    defaultValue: 'general'
  },
  triggers: {
    type: DataTypes.ARRAY(DataTypes.STRING),
    defaultValue: []
  },
  isActive: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  useAI: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  priority: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  }
}, {
  tableName: 'message_templates',
  timestamps: true
});

// Bot Settings Model
export const BotSettings = sequelize.define('BotSettings', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  key: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true
  },
  value: {
    type: DataTypes.JSONB,
    allowNull: false
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true
  }
}, {
  tableName: 'bot_settings',
  timestamps: true
});

// Define relationships
Contact.hasMany(Message, { foreignKey: 'contactId', as: 'messages' });
Message.belongsTo(Contact, { foreignKey: 'contactId', as: 'contact' });

Contact.hasOne(Conversation, { foreignKey: 'contactId', as: 'conversation' });
Conversation.belongsTo(Contact, { foreignKey: 'contactId', as: 'contact' });

User.hasMany(Contact, { foreignKey: 'assignedTo', as: 'assignedContacts' });
Contact.belongsTo(User, { foreignKey: 'assignedTo', as: 'assignedUser' });

export const syncDatabase = async (force = false) => {
  try {
    await sequelize.sync({ force });
    console.log('✅ Database synchronized successfully');
  } catch (error) {
    console.error('❌ Error synchronizing database:', error);
    throw error;
  }
};

export default {
  Contact,
  Message,
  Conversation,
  AIConfig,
  Knowledge,
  User,
  MessageTemplate,
  BotSettings,
  syncDatabase
};