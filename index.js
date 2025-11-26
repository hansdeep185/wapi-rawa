// ===== index.js =====
const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const express = require('express');
const fs = require('fs');
const path = require('path');

// Cek apakah development (Mac) atau production (server)
const isDev = process.env.NODE_ENV !== 'production';

// Konfigurasi WhatsApp
const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
        // Kalau di Mac → pakai Chrome yang sudah ada
        executablePath: isDev 
            ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
            : undefined  // di server otomatis pakai Chromium dari Puppeteer
    }
});

// Tampilkan QR di terminal atau simpan ke file
client.on('qr', (qr) => {
    console.log('\n\nSCAN QR CODE DI BAWAH INI DENGAN WHATSAPP KAMU!\n');
    qrcode.generate(qr, { small: true });

    // Kalau di server, simpan QR sebagai gambar biar bisa dibuka di HP
    if (!isDev) {
        const qrPath = path.join(__dirname, 'sessions', 'qr.png');
        require('qr-image').image(qr, { type: 'png' }).pipe(fs.createWriteStream(qrPath));
        console.log(`QR juga disimpan di: ${qrPath}`);
        console.log(`Buka file qr.png dengan HP kamu → scan`);
    }
});

client.on('ready', () => {
    console.log('✅ WhatsApp Bot SIAP PAKAI!');
});

client.on('authenticated', () => {
    console.log('✅ Login berhasil, session tersimpan!');
});

// ================== FITUR KIRIM PESAN VIA API ==================
const app = express();
app.use(express.json({ limit: '10mb' })); // biar bisa kirim gambar besar

// Endpoint: Kirim pesan teks
app.post('/send', async (req, res) => {
    const { number, message } = req.body; // contoh: 628123456789@c.us
    if (!number || (!message && !req.body.image && !req.body.file)) {
        return res.status(400).json({ error: 'number dan message/image/file wajib diisi' });
    }

    try {
        // Simulasi manusia: jeda + typing
        const chat = await client.getChatById(number);
        await chat.sendSeen();
        await delay(1000 + Math.random() * 3000);
        await chat.sendStateTyping();
        await delay(2000 + Math.random() * 4000);

        if (req.body.image) {
            const media = MessageMedia.fromFilePath(req.body.image); // path file lokal
            await client.sendMessage(number, media, { caption: req.body.caption || '' });
        } else if (req.body.file) {
            const media = MessageMedia.fromFilePath(req.body.file);
            await client.sendMessage(number, media, { sendMediaAsDocument: true });
        } else {
            await client.sendMessage(number, message);
        }

        res.json({ success: true, sent_to: number });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Endpoint: Cek status bot
app.get('/', (req, res) => {
    res.send(`
        <h1>WhatsApp Bot RAWA aktif!</h1>
        <p>Gunakan POST /send untuk kirim pesan</p>
        <pre>
{
  "number": "628123456789@c.us",
  "message": "Halo dari bot!"
}
        </pre>
    `);
});

app.listen(3000, () => {
    console.log('🚀 API berjalan di http://localhost:3000');
});

// ================== FUNGSI BANTUAN ==================
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Mulai bot
client.initialize();