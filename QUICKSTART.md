# Quick Start Guide

## 🚀 Getting Started in 5 Minutes

### 1. Install & Setup

```bash
# Clone project
git clone <your-repo-url>
cd whatsapp-ai-bot

# Install dependencies
npm install

# Copy environment file
cp .env.example .env

# Edit .env - minimal configuration
nano .env
```

**Minimal .env setup:**
```env
# Database
DB_NAME=whatsapp_ai_bot
DB_USER=postgres
DB_PASSWORD=your_password

# JWT Secret
JWT_SECRET=your_random_secret_key_here

# AI (pick one)
GEMINI_API_KEY=your_gemini_api_key
```

### 2. Setup Database

```bash
# Create database
createdb whatsapp_ai_bot

# Run migrations & seed
npm run seed
```

Default credentials:
- Username: `admin`
- Password: `admin123` (⚠️ Change this immediately!)

### 3. Start Application

```bash
# Development
npm run dev

# Production
npm start
```

### 4. Connect WhatsApp

1. Open terminal dan tunggu QR code muncul
2. Buka WhatsApp di HP → Settings → Linked Devices
3. Scan QR code yang muncul di terminal
4. Tunggu sampai muncul "WhatsApp client is ready!"

✅ Done! Bot sudah aktif.

---

## 📱 Testing the Bot

### Test Manual (Via WhatsApp)

1. Kirim pesan ke nomor WA yang sudah di-scan
2. Bot akan auto-reply dengan AI response
3. Check terminal untuk melihat logs

### Test via API

**1. Login & Get Token**
```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "username": "admin",
    "password": "admin123"
  }'
```

Response:
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {...}
}
```

**2. Send Message**
```bash
curl -X POST http://localhost:3000/api/whatsapp/send \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "phone": "6281234567890",
    "message": "Hello from API!"
  }'
```

**3. Check Status**
```bash
curl http://localhost:3000/api/whatsapp/status \
  -H "Authorization: Bearer YOUR_TOKEN"
```

---

## 🤖 Configuring AI

### Via API

**Create AI Configuration**
```bash
curl -X POST http://localhost:3000/api/ai/configs \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Customer Service Bot",
    "provider": "gemini",
    "model": "gemini-pro",
    "apiKey": "your_api_key",
    "systemPrompt": "Anda adalah CS yang ramah. Selalu bantu customer dengan baik.",
    "temperature": 0.7,
    "maxTokens": 1000,
    "isActive": true
  }'
```

**Test AI Configuration**
```bash
curl -X POST http://localhost:3000/api/ai/configs/{config_id}/test \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Supported AI Providers

1. **Google Gemini** (Recommended)
   - Model: `gemini-pro`
   - Get API key: https://makersuite.google.com/app/apikey
   - Free tier available

2. **OpenAI**
   - Model: `gpt-3.5-turbo` atau `gpt-4`
   - Get API key: https://platform.openai.com/api-keys
   - Paid service

3. **Anthropic Claude**
   - Model: `claude-3-sonnet-20240229`
   - Get API key: https://console.anthropic.com/
   - Paid service

---

## 📚 Adding Knowledge Base

```bash
curl -X POST http://localhost:3000/api/knowledge \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Product Pricing",
    "content": "Produk A: Rp 100.000, Produk B: Rp 150.000, Produk C: Rp 200.000",
    "category": "pricing",
    "tags": ["harga", "produk"],
    "isActive": true
  }'
```

Knowledge base akan otomatis digunakan oleh AI saat menjawab pertanyaan.

---

## 🎨 Customizing Bot Behavior

Edit `.env` file:

```env
# Typing speed (characters per minute)
TYPING_SPEED_MIN=30
TYPING_SPEED_MAX=80

# Delay between messages (milliseconds)
DELAY_BETWEEN_MESSAGES_MIN=1000
DELAY_BETWEEN_MESSAGES_MAX=3000

# Random delay (milliseconds)
RANDOM_DELAY_MIN=500
RANDOM_DELAY_MAX=2000

# Auto reply settings
AUTO_REPLY_ENABLED=true
AUTO_REPLY_BUSINESS_HOURS_ONLY=false
BUSINESS_HOURS_START=09:00
BUSINESS_HOURS_END=17:00
```

**Tips:**
- Nilai lebih rendah = response lebih cepat (tapi lebih risiko terdeteksi bot)
- Nilai lebih tinggi = lebih natural tapi response lambat
- Default values sudah optimal

---

## 🔧 Common Tasks

### Disable Auto Reply
```bash
# Edit .env
AUTO_REPLY_ENABLED=false

# Restart app
pm2 restart whatsapp-bot
```

### View Logs
```bash
# Real-time logs
pm2 logs whatsapp-bot

# Check error logs
pm2 logs whatsapp-bot --err

# View specific number of lines
pm2 logs whatsapp-bot --lines 100
```

### Restart Bot
```bash
pm2 restart whatsapp-bot
```

### Reset WhatsApp Session
```bash
# Stop bot
pm2 stop whatsapp-bot

# Remove session
rm -rf wa-session/*

# Start bot and scan QR again
pm2 start whatsapp-bot
```

### Backup Database
```bash
pg_dump whatsapp_ai_bot > backup_$(date +%Y%m%d).sql
```

### Restore Database
```bash
psql whatsapp_ai_bot < backup_20240101.sql
```

---

## 🐛 Troubleshooting

### Bot tidak auto reply
1. Check `AUTO_REPLY_ENABLED=true` di .env
2. Check AI configuration aktif: `GET /api/ai/configs`
3. Check logs: `pm2 logs whatsapp-bot`

### QR Code tidak muncul
1. Check Chromium installed: `which chromium-browser`
2. Check logs: `pm2 logs whatsapp-bot --err`
3. Try reset session: `rm -rf wa-session/*`

### AI response error
1. Test AI config: `POST /api/ai/configs/{id}/test`
2. Check API key valid
3. Check API quota/credits

### Database connection error
```bash
# Check PostgreSQL running
sudo systemctl status postgresql

# Restart PostgreSQL
sudo systemctl restart postgresql

# Check credentials di .env
```

---

## 📊 Monitoring

### Check App Status
```bash
pm2 status
```

### Check Memory Usage
```bash
pm2 monit
```

### View Dashboard
```bash
pm2 web
# Opens on http://localhost:9615
```

### Setup Monitoring (Optional)
```bash
# Install PM2 metrics
pm2 install pm2-metrics

# View metrics
pm2 metrics
```

---

## 🚀 Production Deployment

### Using PM2 Ecosystem File
```bash
# Start with ecosystem config
pm2 start ecosystem.config.cjs

# Monitor
pm2 monit

# Save configuration
pm2 save

# Setup auto-start
pm2 startup
```

### Using Docker (Optional)
```dockerfile
# Create Dockerfile
FROM node:18-alpine

# Install Chromium
RUN apk add --no-cache chromium

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .

ENV WA_CHROMIUM_PATH=/usr/bin/chromium-browser

EXPOSE 3000

CMD ["node", "src/index.js"]
```

```bash
# Build
docker build -t whatsapp-ai-bot .

# Run
docker run -d \
  --name whatsapp-bot \
  -p 3000:3000 \
  -v $(pwd)/wa-session:/app/wa-session \
  -v $(pwd)/uploads:/app/uploads \
  --env-file .env \
  whatsapp-ai-bot
```

---

## 📞 Need Help?

- Check [README.md](README.md) for detailed documentation
- Check [API Documentation](#) for complete API reference
- Open issue di repository untuk bug reports
- Join Discord/Telegram community (jika ada)

Happy automating! 🤖💬