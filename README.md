# wapi-rawa
wapi by rahman

# WhatsApp AI Bot

WhatsApp bot dengan integrasi AI (Gemini, OpenAI, Anthropic) yang mendukung auto-reply, CRM, dan dashboard management. Bot ini dirancang dengan perilaku human-like untuk menghindari deteksi sebagai bot.

## ✨ Fitur

- 🤖 **AI Integration**: Support multi-provider (Gemini, OpenAI, Anthropic)
- 💬 **Auto Reply**: Balasan otomatis dengan context awareness
- 📊 **CRM System**: Manajemen kontak dan percakapan
- 📝 **Knowledge Base**: Training AI dengan data custom
- 🕐 **Human-like Behavior**: Typing indicator, delay variatif, reading simulation
- 📨 **Message API**: Kirim text & media via REST API
- 📈 **Dashboard**: Web dashboard untuk monitoring & management
- 🔐 **Authentication**: Sistem login untuk keamanan
- 🔄 **Real-time Updates**: WebSocket untuk notifikasi real-time
- 💾 **Database Logging**: Semua chat tersimpan untuk CRM

## 🏗️ Arsitektur

```
whatsapp-ai-bot/
├── src/
│   ├── whatsapp/        # WhatsApp engine (wweb.js)
│   ├── ai/              # AI service layer
│   ├── api/             # REST API endpoints
│   ├── database/        # Database models & config
│   └── utils/           # Helper functions
├── config/
├── uploads/             # Media uploads
├── wa-session/          # WhatsApp session data
└── logs/                # Application logs
```

## 📋 Requirements

- Node.js >= 18
- PostgreSQL >= 12
- Chromium/Chrome (untuk Ubuntu server)
- RAM minimal 2GB
- Storage minimal 5GB

## 🚀 Installation

### Development (Mac/Windows)

1. **Clone repository**
```bash
git clone <repo-url>
cd whatsapp-ai-bot
```

2. **Install dependencies**
```bash
npm install
```

3. **Setup database**
```bash
# Install PostgreSQL
# Mac: brew install postgresql
# Windows: Download dari postgresql.org

# Create database
createdb whatsapp_ai_bot

# Update .env dengan credentials database
```

4. **Configure environment**
```bash
cp .env.example .env
# Edit .env dengan konfigurasi Anda
```

5. **Run application**
```bash
# Development
npm run dev

# Production
npm start
```

### Production (Ubuntu Server)

1. **Run setup script**
```bash
chmod +x setup-ubuntu.sh
./setup-ubuntu.sh
```

2. **Configure environment**
```bash
cp .env.example .env
nano .env  # Edit configuration

# IMPORTANT: Set WA_CHROMIUM_PATH
WA_CHROMIUM_PATH=/usr/bin/chromium-browser
```

3. **Setup database**
```bash
# Create database
sudo -u postgres createdb whatsapp_ai_bot

# Create user (if needed)
sudo -u postgres createuser your_username -P

# Grant privileges
sudo -u postgres psql
GRANT ALL PRIVILEGES ON DATABASE whatsapp_ai_bot TO your_username;
\q
```

4. **Run with PM2**
```bash
# Start application
pm2 start src/index.js --name whatsapp-bot

# Save PM2 configuration
pm2 save

# Setup auto-start on reboot
pm2 startup

# Monitor logs
pm2 logs whatsapp-bot
```

## ⚙️ Configuration

### Environment Variables

```env
# Application
NODE_ENV=production
PORT=3000

# Database
DB_HOST=localhost
DB_PORT=5432
DB_NAME=whatsapp_ai_bot
DB_USER=your_username
DB_PASSWORD=your_password

# JWT
JWT_SECRET=your_secret_key

# AI Provider
DEFAULT_AI_PROVIDER=gemini
GEMINI_API_KEY=your_api_key
OPENAI_API_KEY=your_api_key
ANTHROPIC_API_KEY=your_api_key

# WhatsApp
WA_CHROMIUM_PATH=/usr/bin/chromium-browser  # For Ubuntu

# Human Behavior (milliseconds)
TYPING_SPEED_MIN=30              # Karakter per menit (min)
TYPING_SPEED_MAX=80              # Karakter per menit (max)
DELAY_BETWEEN_MESSAGES_MIN=1000  # Delay antar pesan (min)
DELAY_BETWEEN_MESSAGES_MAX=3000  # Delay antar pesan (max)
RANDOM_DELAY_MIN=500             # Random delay (min)
RANDOM_DELAY_MAX=2000            # Random delay (max)

# Auto Reply
AUTO_REPLY_ENABLED=true
AUTO_REPLY_BUSINESS_HOURS_ONLY=false
BUSINESS_HOURS_START=09:00
BUSINESS_HOURS_END=17:00
```

## 📡 API Documentation

### Authentication

**Login**
```bash
POST /api/auth/login
Content-Type: application/json

{
  "username": "admin",
  "password": "your_password"
}

Response:
{
  "token": "jwt_token",
  "user": {
    "id": "uuid",
    "username": "admin",
    "role": "admin"
  }
}
```

**Register**
```bash
POST /api/auth/register
Content-Type: application/json

{
  "username": "user",
  "email": "user@example.com",
  "password": "password",
  "role": "user"
}
```

### WhatsApp Operations

**Send Message**
```bash
POST /api/whatsapp/send
Authorization: Bearer <token>
Content-Type: application/json

{
  "phone": "6281234567890",
  "message": "Hello from bot!"
}
```

**Send Media**
```bash
POST /api/whatsapp/send-media
Authorization: Bearer <token>
Content-Type: multipart/form-data

phone: 6281234567890
caption: Image caption
file: <file>
```

**Get Status**
```bash
GET /api/whatsapp/status
Authorization: Bearer <token>

Response:
{
  "status": "connected",
  "isReady": true,
  "qrCode": null
}
```

### Contacts

**List Contacts**
```bash
GET /api/contacts?page=1&limit=20&search=john
Authorization: Bearer <token>
```

**Get Contact**
```bash
GET /api/contacts/:id
Authorization: Bearer <token>
```

**Update Contact**
```bash
PUT /api/contacts/:id
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "John Doe",
  "tags": ["customer", "vip"],
  "metadata": {
    "company": "ABC Corp"
  }
}
```

### Messages

**List Messages**
```bash
GET /api/messages?contactId=uuid&page=1&limit=50
Authorization: Bearer <token>
```

**Get Messages by Contact**
```bash
GET /api/messages/contact/:contactId?page=1&limit=50
Authorization: Bearer <token>
```

### AI Configuration

**List AI Configs**
```bash
GET /api/ai/configs
Authorization: Bearer <token>
```

**Create AI Config**
```bash
POST /api/ai/configs
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "Gemini Pro",
  "provider": "gemini",
  "model": "gemini-pro",
  "apiKey": "your_api_key",
  "systemPrompt": "You are a helpful assistant...",
  "temperature": 0.7,
  "maxTokens": 1000,
  "isActive": true
}
```

**Update AI Config**
```bash
PUT /api/ai/configs/:id
Authorization: Bearer <token>
Content-Type: application/json

{
  "systemPrompt": "Updated prompt...",
  "temperature": 0.8
}
```

**Activate AI Config**
```bash
POST /api/ai/configs/:id/activate
Authorization: Bearer <token>
```

**Test AI Config**
```bash
POST /api/ai/configs/:id/test
Authorization: Bearer <token>

Response:
{
  "success": true,
  "response": "AI response here..."
}
```

### Knowledge Base

**List Knowledge**
```bash
GET /api/knowledge?page=1&limit=20&search=product&category=faq
Authorization: Bearer <token>
```

**Create Knowledge**
```bash
POST /api/knowledge
Authorization: Bearer <token>
Content-Type: application/json

{
  "title": "Product Info",
  "content": "Detailed product information...",
  "category": "faq",
  "tags": ["product", "info"],
  "isActive": true
}
```

**Update Knowledge**
```bash
PUT /api/knowledge/:id
Authorization: Bearer <token>
Content-Type: application/json
```

**Delete Knowledge**
```bash
DELETE /api/knowledge/:id
Authorization: Bearer <token>
```

### Dashboard Stats

**Get Dashboard Statistics**
```bash
GET /api/stats/dashboard
Authorization: Bearer <token>

Response:
{
  "totalContacts": 150,
  "totalMessages": 2500,
  "totalConversations": 120,
  "aiMessages": 1200,
  "messagesToday": 45,
  "recentContacts": [...]
}
```

## 🔌 WebSocket Events

Connect to `ws://localhost:3000`

**Events:**
- `whatsapp:qr` - QR code untuk scan
- `whatsapp:ready` - WhatsApp siap
- `whatsapp:authenticated` - Authentication sukses
- `whatsapp:auth_failure` - Authentication gagal
- `whatsapp:disconnected` - WhatsApp terputus

## 🤖 Human-like Behavior

Bot dirancang untuk meniru perilaku manusia:

1. **Typing Indicator**: Menampilkan "typing..." sebelum kirim pesan
2. **Variable Delays**: Jeda acak antar pesan (1-3 detik)
3. **Reading Simulation**: Simulasi waktu baca pesan sebelum balas
4. **Typing Speed**: Kecepatan ketik realistis (30-80 CPM)
5. **Message Chunking**: Pesan panjang dipecah jadi beberapa bagian
6. **Random Pauses**: 30% chance ada jeda ekstra (simulasi distraksi)
7. **Business Hours**: Optional, hanya balas di jam kerja

## 🔐 Security Best Practices

1. **Environment Variables**: Jangan commit file `.env`
2. **JWT Secret**: Gunakan secret key yang kuat
3. **Rate Limiting**: Sudah built-in untuk API
4. **HTTPS**: Gunakan reverse proxy (nginx) dengan SSL
5. **Database**: Gunakan strong password
6. **API Keys**: Simpan di environment variables
7. **CORS**: Configure sesuai domain frontend Anda

## 📊 Database Schema

### Tables:
- `contacts` - Data kontak/customer
- `messages` - Log semua pesan
- `conversations` - Summary percakapan
- `ai_configs` - Konfigurasi AI
- `knowledge` - Knowledge base
- `users` - User dashboard

## 🐛 Troubleshooting

### WhatsApp tidak connect
```bash
# Hapus session dan restart
rm -rf wa-session/*
pm2 restart whatsapp-bot
```

### Chromium error di Ubuntu
```bash
# Install ulang dependencies
sudo apt-get install -y chromium-browser chromium-codecs-ffmpeg
```

### Database connection error
```bash
# Check PostgreSQL service
sudo systemctl status postgresql

# Restart PostgreSQL
sudo systemctl restart postgresql
```

### Memory issues
```bash
# Increase Node.js memory
node --max-old-space-size=4096 src/index.js
```

## 📝 TODO / Roadmap

- [ ] Frontend dashboard (React/Vue)
- [ ] Vector embeddings untuk knowledge base
- [ ] Multi-device support
- [ ] Scheduled messages
- [ ] Broadcast to groups
- [ ] Analytics & reporting
- [ ] Export conversation history
- [ ] Webhook integrations
- [ ] Template messages
- [ ] Media management

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 📄 License

MIT License

## 📞 Support

Untuk support dan pertanyaan, silakan buka issue di repository ini.

---

Dibuat dengan ❤️ untuk automasi WhatsApp business