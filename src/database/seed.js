import bcrypt from 'bcryptjs';
import { User, AIConfig } from './models.js';
import dotenv from 'dotenv';

dotenv.config();

async function seedDatabase() {
  try {
    console.log('🌱 Seeding database...');

    // Create default admin user
    const adminExists = await User.findOne({ where: { username: 'admin' } });
    
    if (!adminExists) {
      const hashedPassword = await bcrypt.hash('admin123', 10);
      await User.create({
        username: 'admin',
        email: 'admin@example.com',
        password: hashedPassword,
        role: 'admin'
      });
      console.log('✅ Admin user created (username: admin, password: admin123)');
      console.log('⚠️  IMPORTANT: Change the default password after first login!');
    } else {
      console.log('ℹ️  Admin user already exists');
    }

    // Create default AI configuration if Gemini API key exists
    const aiConfigExists = await AIConfig.findOne();
    
    if (!aiConfigExists && process.env.GEMINI_API_KEY) {
      await AIConfig.create({
        name: 'Gemini Pro (Default)',
        provider: 'gemini',
        model: 'gemini-2.5-pro',
        apiKey: process.env.GEMINI_API_KEY,
        systemPrompt: `Anda adalah asisten WhatsApp bisnis yang membantu dan profesional.

Pedoman:
- Selalu ramah dan sopan
- Jawab dengan jelas dan ringkas
- Gunakan bahasa Indonesia yang natural
- Jika tidak tahu jawabannya, katakan dengan jujur
- Prioritaskan kepuasan customer`,
        temperature: 0.7,
        maxTokens: 1000,
        isActive: true,
        settings: {
          useKnowledgeBase: true,
          useConversationHistory: true,
          maxHistoryMessages: 10
        }
      });
      console.log('✅ Default AI configuration created (Gemini Pro)');
    } else if (!aiConfigExists) {
      console.log('ℹ️  No AI API key found, skipping AI configuration');
    } else {
      console.log('ℹ️  AI configuration already exists');
    }

    console.log('✅ Database seeding completed');
  } catch (error) {
    console.error('❌ Error seeding database:', error);
    throw error;
  }
}

// Run seed if called directly
const isMainModule = import.meta.url.endsWith(process.argv[1]);
const isRunDirectly = process.argv[1] && process.argv[1].includes('seed.js');

if (isMainModule || isRunDirectly) {
  (async () => {
    try {
      const sequelize = (await import('./config.js')).default;
      const { syncDatabase } = await import('./models.js');
      
      console.log('🔌 Connecting to database...');
      await sequelize.authenticate();
      console.log('✅ Database connected');
      
      console.log('📊 Synchronizing database schema...');
      await syncDatabase(false); // false = don't drop existing tables
      console.log('✅ Database schema synchronized');
      
      await seedDatabase();
      
      await sequelize.close();
      console.log('✅ Database connection closed');
      process.exit(0);
    } catch (error) {
      console.error('❌ Seeding failed:', error);
      process.exit(1);
    }
  })();
}

export default seedDatabase;