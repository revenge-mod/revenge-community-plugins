// Executed in the renderer WebView, alongside the bundled GIF encoder.
export const mediaRendererSource = `
async function fetchMedia(url) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000);
    try {
        const response = await fetch(url, { signal: controller.signal });
        if (!response.ok) throw new Error("Could not download quote media.");
        const blob = await response.blob();
        if (blob.size > 30 * 1024 * 1024) throw new Error("This media is too large to quote (30 MB maximum).");
        return blob;
    } finally { clearTimeout(timer); }
}
function mediaEvent(target, event, action) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => finish(new Error("Media decoding timed out.")), 15000);
        const success = () => finish();
        const error = () => finish(new Error("Could not decode quote media."));
        function finish(failure) {
            clearTimeout(timer);
            target.removeEventListener(event, success);
            target.removeEventListener('error', error);
            failure ? reject(failure) : resolve();
        }
        target.addEventListener(event, success, { once: true });
        target.addEventListener('error', error, { once: true });
        action();
    });
}
async function loadMedia(item) {
    const blob = await fetchMedia(item.url);
    if (item.kind === 'video') {
        const url = URL.createObjectURL(blob);
        const video = document.createElement('video');
        video.muted = true;
        video.preload = 'auto';
        video.playsInline = true;
        try {
            await mediaEvent(video, 'loadeddata', () => { video.src = url; video.load(); });
            const duration = video.duration * 1000;
            if (!Number.isFinite(duration) || duration <= 0 || duration > 30000) throw new Error("Animated quotes support clips up to 30 seconds.");
            return {
                width: video.videoWidth, height: video.videoHeight, duration,
                boundaries: Array.from({ length: Math.ceil(duration / 50) }, (_, i) => i * 50),
                async frameAt(time) {
                    const target = Math.min((time % duration) / 1000, video.duration - 0.001);
                    if (Math.abs(video.currentTime - target) > 0.001) await mediaEvent(video, 'seeked', () => { video.currentTime = target; });
                    return { image: video, close() {} };
                },
                close() { video.removeAttribute('src'); video.load(); URL.revokeObjectURL(url); },
            };
        } catch (error) { video.removeAttribute('src'); video.load(); URL.revokeObjectURL(url); throw error; }
    }
    const bytes = await blob.arrayBuffer();
    const signature = new Uint8Array(bytes, 0, Math.min(bytes.byteLength, 12));
    const type = signature[0] === 71 && signature[1] === 73 && signature[2] === 70 ? 'image/gif'
        : signature[0] === 82 && signature[8] === 87 ? 'image/webp'
        : blob.type.split(';')[0];
    if (typeof ImageDecoder !== 'undefined' && await ImageDecoder.isTypeSupported(type)) {
        const decoder = new ImageDecoder({ data: bytes, type, preferAnimation: true });
        try {
            await decoder.tracks.ready;
            await decoder.completed;
            const count = decoder.tracks.selectedTrack.frameCount;
            if (count > 600) throw new Error("This animation has too many frames to quote (600 maximum).");
            const boundaries = [];
            let duration = 0, width = 0, height = 0;
            for (let i = 0; i < count; i++) {
                const { image } = await decoder.decode({ frameIndex: i });
                width = image.displayWidth; height = image.displayHeight;
                boundaries.push(duration);
                duration += Math.max(20, (image.duration || 100000) / 1000);
                image.close();
            }
            if (count > 1 && duration > 30000) throw new Error("Animated quotes support clips up to 30 seconds.");
            return {
                width, height, duration: count > 1 ? duration : 0, boundaries,
                async frameAt(time) {
                    const local = time % duration;
                    let index = 0;
                    while (index + 1 < count && boundaries[index + 1] <= local) index++;
                    const { image } = await decoder.decode({ frameIndex: index });
                    return { image, close() { image.close(); } };
                },
                close() { decoder.close(); },
            };
        } catch (error) { decoder.close(); throw error; }
    }
    if (type === 'image/gif' || type === 'image/webp') throw new Error("Update Android System WebView to quote animated images.");
    const url = URL.createObjectURL(blob);
    try {
        const image = new Image();
        await mediaEvent(image, 'load', () => { image.src = url; });
        return { width: image.naturalWidth, height: image.naturalHeight, duration: 0, boundaries: [0], async frameAt() { return { image, close() {} }; }, close() {} };
    } finally { URL.revokeObjectURL(url); }
}
async function exportMedia(canvas, media, rectangles, renderId) {
    const ctx = canvas.getContext('2d');
    const duration = Math.max(0, ...media.map(item => item.duration));
    const times = new Set([0]);
    for (const item of media) {
        if (!item.duration) continue;
        for (let loop = 0; loop < duration; loop += item.duration) {
            for (const boundary of item.boundaries) if (loop + boundary < duration) times.add(loop + boundary);
        }
    }
    const timeline = Array.from(times).sort((a, b) => a - b);
    if (timeline.length > 600) throw new Error("Combined animation exceeds 600 frames. Quote fewer animated attachments.");
    const gif = duration ? GIF.GIFEncoder() : null;
    let palette;
    let indexed;
    const lastFrames = media.map(() => -1);
    const frameCaches = media.map(() => new Map());
    let cachedBytes = 0;
    if (gif) {
        await Promise.all(media.map(async (item, m) => {
            const frame = await item.frameAt(0);
            const rect = rectangles[m];
            try {
                ctx.fillStyle = '#000';
                ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
                ctx.drawImage(frame.image, rect.x, rect.y, rect.width, rect.height);
            } finally { frame.close(); }
        }));
        post({ type: 'preview', renderId, dataUrl: canvas.toDataURL('image/png'), width: canvas.width, height: canvas.height });
        // One palette for the entire GIF keeps all static pixels identical between frames.
        const sample = document.createElement('canvas');
        sample.width = sample.height = 128;
        const sampleContext = sample.getContext('2d');
        sampleContext.drawImage(canvas, 0, 0, 128, 128);
        const chunks = [sampleContext.getImageData(0, 0, 128, 128).data];
        sample.width = sample.height = 32;
        const sampleCount = Math.min(12, timeline.length);
        for (let index = 0; index < sampleCount; index++) {
            const time = timeline[Math.round(index * (timeline.length - 1) / Math.max(1, sampleCount - 1))];
            await Promise.all(media.map(async item => {
                if (!item.duration && index) return;
                const frame = await item.frameAt(time);
                try {
                    sampleContext.fillStyle = '#000';
                    sampleContext.fillRect(0, 0, 32, 32);
                    sampleContext.drawImage(frame.image, 0, 0, 32, 32);
                    chunks.push(sampleContext.getImageData(0, 0, 32, 32).data);
                } finally { frame.close(); }
            }));
            post({ type: 'progress', renderId, message: 'Preparing animation ' + Math.round((index + 1) / sampleCount * 100) + '%' });
            await new Promise(resolve => setTimeout(resolve, 0));
        }
        const samples = new Uint8Array(chunks.reduce((size, chunk) => size + chunk.length, 0));
        let offset = 0;
        for (const chunk of chunks) { samples.set(chunk, offset); offset += chunk.length; }
        palette = GIF.quantize(samples, 256);
    }
    for (let index = 0; index < timeline.length; index++) {
        const changed = [];
        await Promise.all(media.map(async (item, m) => {
            const local = item.duration ? timeline[index] % item.duration : 0;
            let frameIndex = 0;
            while (frameIndex + 1 < item.boundaries.length && item.boundaries[frameIndex + 1] <= local) frameIndex++;
            if (gif && index === 0) { lastFrames[m] = frameIndex; changed.push(m); return; }
            if (lastFrames[m] === frameIndex) return;
            lastFrames[m] = frameIndex;
            changed.push(m);
            if (frameCaches[m].has(frameIndex)) return;
            const rect = rectangles[m];
            const frame = await item.frameAt(item.boundaries[frameIndex]);
            try {
                ctx.fillStyle = '#000';
                ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
                ctx.drawImage(frame.image, rect.x, rect.y, rect.width, rect.height);
            } finally { frame.close(); }
        }));
        if (gif) {
            const firstFrame = !indexed;
            if (firstFrame) indexed = GIF.applyPalette(ctx.getImageData(0, 0, canvas.width, canvas.height).data, palette);
            for (const m of changed) {
                if (!media[m].duration) continue;
                const rect = rectangles[m];
                let pixels = frameCaches[m].get(lastFrames[m]);
                if (!pixels) {
                    if (firstFrame) {
                        pixels = new Uint8Array(rect.width * rect.height);
                        for (let row = 0; row < rect.height; row++) {
                            const start = (rect.y + row) * canvas.width + rect.x;
                            pixels.set(indexed.subarray(start, start + rect.width), row * rect.width);
                        }
                    } else {
                        pixels = GIF.applyPalette(ctx.getImageData(rect.x, rect.y, rect.width, rect.height).data, palette);
                    }
                    // Bound memory while reusing frames when a shorter animation loops.
                    if (cachedBytes + pixels.byteLength <= 32 * 1024 * 1024) {
                        frameCaches[m].set(lastFrames[m], pixels);
                        cachedBytes += pixels.byteLength;
                    }
                }
                for (let row = 0; row < rect.height; row++) {
                    indexed.set(pixels.subarray(row * rect.width, (row + 1) * rect.width), (rect.y + row) * canvas.width + rect.x);
                }
            }
            let framePixels = indexed, x = 0, y = 0, width = canvas.width, height = canvas.height;
            if (index) {
                const regions = changed.map(m => rectangles[m]);
                x = regions.length ? Math.min(...regions.map(rect => rect.x)) : 0;
                y = regions.length ? Math.min(...regions.map(rect => rect.y)) : 0;
                width = regions.length ? Math.max(...regions.map(rect => rect.x + rect.width)) - x : 1;
                height = regions.length ? Math.max(...regions.map(rect => rect.y + rect.height)) - y : 1;
                framePixels = new Uint8Array(width * height);
                for (let row = 0; row < height; row++) {
                    const start = (y + row) * canvas.width + x;
                    framePixels.set(indexed.subarray(start, start + width), row * width);
                }
            }
            gif.writeFrame(framePixels, width, height, { x, y, dispose: 1, palette: index ? undefined : palette, delay: (timeline[index + 1] ?? duration) - timeline[index], repeat: 0 });
            if (gif.bytesView().length > 25 * 1024 * 1024) throw new Error("The animated quote exceeds 25 MB. Try fewer attachments or less text.");
            post({ type: 'progress', renderId, message: 'Rendering animation ' + Math.round((index + 1) / timeline.length * 100) + '%' });
            await new Promise(resolve => setTimeout(resolve, 0));
        }
    }
    if (!gif) return canvas.toDataURL('image/png');
    gif.finish();
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error('Could not export animated quote.'));
        reader.readAsDataURL(new Blob([gif.bytes()], { type: 'image/gif' }));
    });
}
`
