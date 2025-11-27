import dotenv from 'dotenv';

dotenv.config();

/**
 * Generate random delay to simulate human behavior
 */
export const randomDelay = (min = null, max = null) => {
  const minDelay = min || parseInt(process.env.RANDOM_DELAY_MIN) || 500;
  const maxDelay = max || parseInt(process.env.RANDOM_DELAY_MAX) || 2000;
  return Math.floor(Math.random() * (maxDelay - minDelay + 1)) + minDelay;
};

/**
 * Sleep function
 */
export const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Calculate typing time based on message length
 * Simulates human typing speed
 */
export const calculateTypingTime = (text) => {
  const minSpeed = parseInt(process.env.TYPING_SPEED_MIN) || 30;
  const maxSpeed = parseInt(process.env.TYPING_SPEED_MAX) || 80;
  
  // Characters per minute
  const typingSpeed = Math.floor(Math.random() * (maxSpeed - minSpeed + 1)) + minSpeed;
  
  // Convert to milliseconds
  const timePerChar = (60 / typingSpeed) * 1000;
  const baseTime = text.length * timePerChar;
  
  // Add some randomness (±20%)
  const variance = baseTime * 0.2;
  const finalTime = baseTime + (Math.random() * variance * 2 - variance);
  
  return Math.max(1000, Math.min(finalTime, 10000)); // Min 1s, max 10s
};

/**
 * Simulate human-like reading time
 */
export const calculateReadingTime = (text) => {
  // Average reading speed: 200-250 words per minute
  const words = text.split(/\s+/).length;
  const wordsPerMinute = 225;
  const readingTime = (words / wordsPerMinute) * 60 * 1000;
  
  // Add randomness
  const variance = readingTime * 0.3;
  const finalTime = readingTime + (Math.random() * variance * 2 - variance);
  
  return Math.max(500, Math.min(finalTime, 5000)); // Min 0.5s, max 5s
};

/**
 * Get random delay between messages
 */
export const getMessageDelay = () => {
  const min = parseInt(process.env.DELAY_BETWEEN_MESSAGES_MIN) || 1000;
  const max = parseInt(process.env.DELAY_BETWEEN_MESSAGES_MAX) || 3000;
  return Math.floor(Math.random() * (max - min + 1)) + min;
};

/**
 * Simulate typing indicator
 */
export const simulateTyping = async (chat, message) => {
  try {
    // Calculate realistic typing time
    const typingTime = calculateTypingTime(message);
    
    // Send typing indicator
    await chat.sendStateTyping();
    
    // Wait for typing duration
    await sleep(typingTime);
    
    // Stop typing
    await chat.clearState();
    
    // Small delay before sending message
    await sleep(randomDelay(300, 800));
  } catch (error) {
    console.error('Error simulating typing:', error);
  }
};

/**
 * Simulate message reading
 */
export const simulateReading = async (message) => {
  const readingTime = calculateReadingTime(message);
  await sleep(readingTime);
};

/**
 * Add human-like randomness to actions
 */
export const shouldAddExtraDelay = () => {
  // 30% chance to add extra delay (simulate distraction)
  return Math.random() < 0.3;
};

/**
 * Get extra delay when distracted
 */
export const getExtraDelay = () => {
  return randomDelay(2000, 5000);
};

/**
 * Simulate natural conversation flow
 */
export const simulateNaturalFlow = async (chat, messages) => {
  for (let i = 0; i < messages.length; i++) {
    const message = messages[i];
    
    // Read previous context if not first message
    if (i > 0) {
      await sleep(randomDelay(500, 1500));
    }
    
    // Simulate typing
    await simulateTyping(chat, message);
    
    // Send message
    await chat.sendMessage(message);
    
    // Add delay before next message if there are more
    if (i < messages.length - 1) {
      await sleep(getMessageDelay());
      
      // Sometimes add extra delay
      if (shouldAddExtraDelay()) {
        await sleep(getExtraDelay());
      }
    }
  }
};

/**
 * Chunk long message into natural parts
 */
export const chunkMessage = (text, maxLength = 500) => {
  if (text.length <= maxLength) {
    return [text];
  }
  
  const chunks = [];
  const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
  let currentChunk = '';
  
  for (const sentence of sentences) {
    if ((currentChunk + sentence).length <= maxLength) {
      currentChunk += sentence;
    } else {
      if (currentChunk) {
        chunks.push(currentChunk.trim());
      }
      currentChunk = sentence;
    }
  }
  
  if (currentChunk) {
    chunks.push(currentChunk.trim());
  }
  
  return chunks;
};

/**
 * Check if within business hours
 */
export const isBusinessHours = () => {
  const now = new Date();
  const hours = now.getHours();
  const minutes = now.getMinutes();
  const currentTime = hours * 60 + minutes;
  
  const [startHour, startMin] = (process.env.BUSINESS_HOURS_START || '09:00').split(':').map(Number);
  const [endHour, endMin] = (process.env.BUSINESS_HOURS_END || '17:00').split(':').map(Number);
  
  const startTime = startHour * 60 + startMin;
  const endTime = endHour * 60 + endMin;
  
  return currentTime >= startTime && currentTime <= endTime;
};

/**
 * Format phone number to WhatsApp format
 */
export const formatPhoneNumber = (phone) => {
  // Remove all non-numeric characters
  let formatted = phone.replace(/\D/g, '');
  
  // Add country code if not present
  if (!formatted.startsWith('62') && formatted.startsWith('0')) {
    formatted = '62' + formatted.substring(1);
  }
  
  return formatted + '@c.us';
};

/**
 * Extract phone number from WhatsApp ID
 */
export const extractPhoneNumber = (waId) => {
  return waId.split('@')[0];
};

export default {
  randomDelay,
  sleep,
  calculateTypingTime,
  calculateReadingTime,
  getMessageDelay,
  simulateTyping,
  simulateReading,
  simulateNaturalFlow,
  shouldAddExtraDelay,
  getExtraDelay,
  chunkMessage,
  isBusinessHours,
  formatPhoneNumber,
  extractPhoneNumber
};