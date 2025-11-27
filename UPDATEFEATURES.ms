# WhatsApp AI Bot - Update Features

## 🆕 New Features

### 1. **Message Extraction on First Login**
Bot akan otomatis extract semua pesan saat pertama kali login dan menyimpannya ke database.

### 2. **Complete Message Structure**
Database sekarang menyimpan:
- ✅ Chat ID & Chat Name
- ✅ Sender ID & Sender Name  
- ✅ Message Body & Timestamp
- ✅ Is Group (true/false)
- ✅ Has Media
- ✅ Reply Info (quoted message details)
- ✅ Is From Me (pesan dari bot/owner)
- ✅ Timestamp Balasan

### 3. **Group Operations**
- Get all groups
- Search group by name
- Send message to group
- Get group details

---

## 📊 Updated Database Schema

### messages table:
```sql
- id (UUID)
- contactId (UUID, FK)
- chatId (String) -- NEW
- chatName (String) -- NEW
- messageId (String, unique)
- senderId (String) -- NEW
- senderName (String) -- NEW
- type (ENUM)
- body (Text)
- mediaUrl (Text)
- isFromMe (Boolean)
- isAiGenerated (Boolean)
- timestamp (Date) -- timestamp_sender
- timestampBalasan (Date) -- NEW
- isGroup (Boolean) -- NEW
- hasMedia (Boolean) -- NEW
- hasQuotedMsg (Boolean) -- is_reply
- quotedMsgId (String) -- reply_to_message_id
- quotedMessageBody (Text) -- NEW
- quotedSenderName (String) -- NEW
- createdAt, updatedAt
```

---

## 🚀 How to Use

### 1. Drop & Recreate Database (karena schema berubah)

```bash
# Stop app
# Ctrl+C

# Drop database
dropdb whatsapp_ai_bot

# Create new database
createdb whatsapp_ai_bot

# Run seed
npm run seed

# Start app
npm run dev
```

### 2. First Login - Auto Extract Messages

Saat pertama kali scan QR dan login, bot akan otomatis:
1. Scan semua chat
2. Extract semua pesan
3. Simpan ke database
4. Show progress di terminal

**Output Example:**
```
✅ WhatsApp client is ready!
🔄 Starting message extraction...
📊 Total chats found: 50

[1/50] Processing: John Doe
  🔄 Loading messages...
  📦 Batch 1: +1000 messages (Total: 1000)
  📦 Batch 2: +543 messages (Total: 1543)
  📨 Total messages found: 1543
  ✅ Saved: 1543/1543 messages

...

✅ EXTRACTION COMPLETE!
📊 Total chats found: 50
✅ Chats processed: 50
📨 Total messages found: 15234
💾 Total messages saved: 15234
```

---

## 📡 New API Endpoints

### Get All Groups

```bash
GET /api/whatsapp/groups
Authorization: Bearer {token}
```

**Response:**
```json
{
  "total": 5,
  "groups": [
    {
      "id": "120363411346494368@g.us",
      "name": "Team IT",
      "participantsCount": 15,
      "lastMessage": {
        "body": "Hello team",
        "timestamp": 1732675849
      }
    }
  ]
}
```

### Search Group by Name

```bash
GET /api/whatsapp/groups/search?name=IT
Authorization: Bearer {token}
```

**Response:**
```json
{
  "total": 2,
  "groups": [
    {
      "id": "120363411346494368@g.us",
      "name": "Team IT",
      "participantsCount": 15
    },
    {
      "id": "120363411346494369@g.us",
      "name": "IT Support",
      "participantsCount": 8
    }
  ]
}
```

### Send Message to Group

```bash
POST /api/whatsapp/send-to-group
Authorization: Bearer {token}
Content-Type: application/json

{
  "groupId": "120363411346494368@g.us",
  "message": "Hello team! Meeting at 2pm."
}
```

**Response:**
```json
{
  "success": true,
  "message": "Message sent to group successfully",
  "group": {
    "id": "120363411346494368@g.us",
    "name": "Team IT"
  }
}
```

### Get Group Details

```bash
GET /api/whatsapp/groups/{groupId}
Authorization: Bearer {token}
```

**Response:**
```json
{
  "id": "120363411346494368@g.us",
  "name": "Team IT",
  "participantsCount": 15,
  "participants": [
    {
      "id": "6281234567890@c.us",
      "isAdmin": true,
      "isSuperAdmin": false
    }
  ],
  "createdAt": 1632675849,
  "description": "IT Team Discussion"
}
```

---

## 🧪 Testing Flow

### 1. First Login & Extract

```bash
npm run dev
# Scan QR
# Wait for extraction to complete
```

### 2. Check Messages in Database

```sql
psql -U postgres -d whatsapp_ai_bot

-- Count messages
SELECT COUNT(*) FROM messages;

-- Check recent messages
SELECT 
  chat_name, 
  sender_name, 
  LEFT(body, 50) as message_preview,
  is_from_me,
  is_group,
  timestamp
FROM messages 
ORDER BY timestamp DESC 
LIMIT 10;

-- Check group messages only
SELECT * FROM messages WHERE is_group = true LIMIT 10;

-- Check bot's messages
SELECT * FROM messages WHERE is_from_me = true LIMIT 10;
```

### 3. Test Group APIs

**Get Groups:**
```bash
curl http://localhost:3000/api/whatsapp/groups \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Search Group:**
```bash
curl "http://localhost:3000/api/whatsapp/groups/search?name=IT" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Send to Group:**
```bash
curl -X POST http://localhost:3000/api/whatsapp/send-to-group \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "groupId": "120363411346494368@g.us",
    "message": "Test message to group"
  }'
```

---

## 🔧 Files Changed/Added

### New Files:
1. `src/whatsapp/messageExtractor.js` - Extract all messages
2. `src/api/groupRoutes.js` - Group operations API

### Updated Files:
1. `src/database/models.js` - Updated Message schema
2. `src/whatsapp/service.js` - Fixed getOrCreateContact
3. `src/index.js` - Integrate message extraction

---

## 📝 Important Notes

1. **First Login**: Message extraction bisa memakan waktu 5-30 menit tergantung jumlah chat
2. **Rate Limiting**: Ada delay antar chat untuk avoid WhatsApp rate limit
3. **Group ID**: Simpan group ID dari API `/groups` untuk send message
4. **Database**: Schema berubah, harus drop & recreate database

---

## 🐛 Troubleshooting

### Error: `invalid input value for enum`
**Solution:** Drop database dan recreate:
```bash
dropdb whatsapp_ai_bot
createdb whatsapp_ai_bot
npm run seed
npm run dev
```

### Error: `getIsMyContact is not a function`
**Solution:** Already fixed in updated `getOrCreateContact` method

### Extraction Stuck
**Solution:** Check terminal for errors. Extraction akan skip chat yang error dan lanjut ke chat berikutnya.

---

Siap digunakan! 🚀