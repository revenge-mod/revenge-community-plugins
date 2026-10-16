import { gifEncoderSource } from './gif-encoder'
import { mediaRendererSource } from './media-renderer'
import type { QuotePayload } from './quote'

/**
 * Builds the HTML document rendered inside a hidden WebView. It draws the
 * quote on a <canvas> and posts the resulting image data URL back through
 * ReactNativeWebView.postMessage.
 *
 * The quote font is loaded from Google Fonts; rendering waits for it with a
 * timeout and gracefully falls back to sans-serif when offline.
 */
export function buildRendererHtml(payload: QuotePayload): string {
	const safePayload = JSON.stringify(payload).replace(
		/<\/script/gi,
		'<\\/script',
	)

	return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<style>
${payload.reply ? "@font-face { font-family: 'gg sans'; font-weight: 400; src: url('file:///android_asset/fonts/ggsans-Normal.ttf'); } @font-face { font-family: 'gg sans'; font-weight: 600; src: url('file:///android_asset/fonts/ggsans-Semibold.ttf'); }" : "@import url('https://fonts.googleapis.com/css2?family=M+PLUS+Rounded+1c:wght@300&display=swap');"}
html, body {
    margin: 0;
    padding: 0;
    width: 100%;
    height: 100%;
    background: #000;
    overflow: hidden;
}
canvas {
    width: 100%;
    height: 100%;
    display: block;
}
</style>
</head>
<body>
<canvas id="q" width="1200" height="600"></canvas>
<script>
const payload = ${safePayload};
${payload.media?.length || payload.reply?.media?.length ? `${gifEncoderSource}\n${mediaRendererSource}` : ''}

function post(data) {
    try {
        window.ReactNativeWebView.postMessage(JSON.stringify(data));
    } catch {}
}

async function waitForFonts(font) {
    try {
        await Promise.race([
            Promise.all([
                document.fonts.load("300 42px '" + font + "'"),
                document.fonts.load("italic 300 26px '" + font + "'"),
                document.fonts.ready,
            ]),
            new Promise(resolve => setTimeout(resolve, 4000)),
        ]);
    } catch {}
}

function calculateTextLines(ctx, text, fontSize, font, maxWidth, firstWidth = maxWidth) {
    ctx.font = "300 " + fontSize + "px '" + font + "', sans-serif";
    const lines = [];
    const segmenter = typeof Intl.Segmenter === "function" ? new Intl.Segmenter(undefined, { granularity: "grapheme" }) : null;
    for (const paragraph of String(text || "").split("\\n")) {
        let line = "";
        for (const word of paragraph.split(/\\s+/).filter(Boolean)) {
            const candidate = line ? line + " " + word : word;
            if (ctx.measureText(candidate).width <= (lines.length ? maxWidth : firstWidth)) { line = candidate; continue; }
            if (line) { lines.push(line); line = ""; }
            const units = segmenter ? Array.from(segmenter.segment(word), part => part.segment) : Array.from(word);
            for (const unit of units) {
                if (line && ctx.measureText(line + unit).width > (lines.length ? maxWidth : firstWidth)) { lines.push(line); line = ""; }
                line += unit;
            }
        }
        lines.push(line);
    }

    return lines;
}

function calculateFont(ctx, quote, font, cfg, fs, sp) {
    let fontSize = fs.initial;
    while (fontSize >= fs.minimum) {
        const lines = calculateTextLines(ctx, quote, fontSize, font, cfg.quoteAreaWidth);
        const lineHeight = fontSize * fs.lineHeightMultiplier;
        const authorFontSize = Math.max(fs.authorMinimum, fontSize * fs.authorMultiplier);
        const usernameFontSize = Math.max(fs.usernameMinimum, fontSize * fs.usernameMultiplier);
        const totalHeight = (lines.length * lineHeight) + sp.authorTop + authorFontSize + sp.username + usernameFontSize;
        if (totalHeight <= cfg.maxContentHeight) {
            return { lines, fontSize, lineHeight, authorFontSize, usernameFontSize, totalHeight };
        }
        fontSize -= fs.decrement;
    }

    const lines = calculateTextLines(ctx, quote, fs.minimum, font, cfg.quoteAreaWidth);
    const lineHeight = fs.minimum * fs.lineHeightMultiplier;
    return {
        lines,
        fontSize: fs.minimum,
        lineHeight,
        authorFontSize: fs.authorMinimum,
        usernameFontSize: fs.usernameMinimum,
        totalHeight: (lines.length * lineHeight) + sp.authorTop + fs.authorMinimum + sp.username + fs.usernameMinimum,
    };
}

async function loadAvatar(url) {
    // Time-cap the fetch so a stalled connection surfaces as an error
    // instead of leaving the preview stuck on "Generating..." forever.
    const response = await Promise.race([
        fetch(url),
        new Promise((_, reject) => setTimeout(() => reject(new Error("Avatar request timed out.")), 10000)),
    ]);
    if (!response.ok) throw new Error("Failed to fetch avatar image.");
    const blob = await response.blob();
    const blobUrl = URL.createObjectURL(blob);

    try {
        return await new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = () => reject(new Error("Failed to load avatar image."));
            img.src = blobUrl;
        });
    } finally {
        URL.revokeObjectURL(blobUrl);
    }
}

async function render() {
    const media = [];
    try {
    const replyMediaCount = payload.reply?.media?.length || 0;
    const loaded = await Promise.allSettled([...(payload.reply?.media || []), ...(payload.media || [])].map(item => loadMedia(item)));
    for (const result of loaded) if (result.status === 'fulfilled') media.push(result.value);
    const failure = loaded.find(result => result.status === 'rejected');
    if (failure) throw failure.reason;
    const cfg = payload.reply ? { ...payload.canvas, width: 1200 } : payload.canvas;
    const fs = payload.fonts;
    const sp = payload.spacing;
    const quoteFont = payload.reply ? "gg sans" : payload.quoteFont || "M PLUS Rounded 1c";

    if (payload.reply) await Promise.all([document.fonts.load("400 32px 'gg sans'"), document.fonts.load("600 30px 'gg sans'")]);
    else await waitForFonts(quoteFont);

    const canvas = document.getElementById("q");
    canvas.width = cfg.width;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas context unavailable.");
    const quote = String(payload.quote || " ");
    const reply = payload.reply;
    const areaX = reply ? 24 : cfg.quoteAreaX;
    let areaWidth = reply ? cfg.width - 48 : cfg.quoteAreaWidth;
    let blockWidth = areaWidth;
    if (reply) {
        ctx.font = "400 32px 'gg sans', sans-serif";
        const bodyWidth = Math.max(...quote.split('\\n').map(line => ctx.measureText(line).width)) + 108;
        ctx.font = "600 24px 'gg sans', sans-serif";
        const referenceNameWidth = ctx.measureText(reply.displayName).width;
        ctx.font = "400 24px 'gg sans', sans-serif";
        const referenceHeaderWidth = referenceNameWidth + 158 + (reply.timestamp ? ctx.measureText(reply.timestamp).width + 18 : 0);
        const referenceWidth = referenceHeaderWidth + Math.max(...reply.text.split('\\n').map(line => ctx.measureText(line).width));
        ctx.font = "600 30px 'gg sans', sans-serif";
        const headerWidth = ctx.measureText(payload.displayName).width + 108 + (payload.isBot ? 190 : 120);
        blockWidth = Math.max(headerWidth, referenceHeaderWidth + 120, Math.min(areaWidth, Math.max(bodyWidth, referenceWidth)));
        areaWidth = blockWidth;
    }
    if (reply) {
        cfg.width = Math.ceil(blockWidth + areaX * 2);
        canvas.width = cfg.width;
    }
    const blockX = reply ? areaX : areaX + (areaWidth - blockWidth) / 2;
    const contentWidth = blockWidth - (reply ? 108 : 0);
    const calculation = calculateFont(ctx, quote, quoteFont, cfg, fs, sp);
    const messageLines = reply ? (quote.trim() ? calculateTextLines(ctx, quote, 32, 'gg sans', contentWidth) : []) : calculation.lines;
    ctx.font = "600 24px 'gg sans', sans-serif";
    const replyNameWidth = reply ? ctx.measureText(reply.displayName).width : 0;
    ctx.font = "400 24px 'gg sans', sans-serif";
    const replyTimestampWidth = reply?.timestamp ? ctx.measureText(reply.timestamp).width + 18 : 0;
    const replyFirstWidth = blockWidth - 158 - replyNameWidth - replyTimestampWidth;
    const replyLines = reply ? calculateTextLines(ctx, reply.text, 24, 'gg sans', contentWidth, replyFirstWidth) : [];
    let replyHeight = reply ? replyLines.length * 30 + 22 : 0;
    const rectangles = media.map((item, index) => {
        const ratio = Math.min(contentWidth / item.width, (index < replyMediaCount ? 240 : 360) / item.height);
        return { width: Math.round(item.width * ratio), height: Math.round(item.height * ratio), x: 0, y: 0 };
    });
    const replyRectangles = rectangles.slice(0, replyMediaCount);
    replyHeight += replyRectangles.reduce((sum, rect) => sum + rect.height + 24, 0);
    const messageRectangles = rectangles.slice(replyMediaCount);
    const mediaHeight = messageRectangles.reduce((sum, rect) => sum + rect.height + 24, 0);
    const totalHeight = reply ? replyHeight + 42 + messageLines.length * 42 + mediaHeight : calculation.totalHeight + mediaHeight;
    const height = reply ? Math.ceil(totalHeight + 80) : Math.max(cfg.height, Math.ceil(totalHeight + 120));
    if (height > 16384) throw new Error("This quote is too tall for one image. Choose a shorter message.");
    canvas.height = height;

    ctx.fillStyle = reply ? "#1c1d22" : "#000";
    ctx.fillRect(0, 0, cfg.width, height);

    if (!reply) {
        const avatar = await loadAvatar(payload.avatarUrl);
        ctx.drawImage(avatar, 0, (height - cfg.height) / 2, cfg.height, cfg.height);
        if (payload.grayscale) {
            ctx.globalCompositeOperation = 'saturation';
            ctx.fillStyle = '#fff';
            ctx.fillRect(0, 0, cfg.width, height);
            ctx.globalCompositeOperation = 'source-over';
        }
        const gradient = ctx.createLinearGradient(cfg.height - sp.gradientWidth, 0, cfg.height, 0);
        gradient.addColorStop(0, 'rgba(0, 0, 0, 0)');
        gradient.addColorStop(1, 'rgba(0, 0, 0, 1)');
        ctx.fillStyle = gradient;
        ctx.fillRect(cfg.height - sp.gradientWidth, 0, sp.gradientWidth, height);
    }

    ctx.save();
    ctx.beginPath();
    ctx.rect(areaX, 40, areaWidth, height - 80);
    ctx.clip();
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    const centerX = cfg.quoteAreaX + cfg.quoteAreaWidth / 2;
    ctx.fillStyle = "#fff";
    ctx.font = "300 " + calculation.fontSize + "px '" + quoteFont + "', sans-serif";
    let quoteY = (height - totalHeight) / 2;
    if (reply) {
        const x = blockX;
        const avatar = await loadAvatar(payload.avatarUrl);
        const replyAvatar = await loadAvatar(reply.avatarUrl);
        ctx.strokeStyle = '#4e5058'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(x + 42, quoteY + replyHeight - 8);
        ctx.lineTo(x + 42, quoteY + 24);
        ctx.quadraticCurveTo(x + 42, quoteY + 14, x + 52, quoteY + 14);
        ctx.lineTo(x + 92, quoteY + 14); ctx.stroke();
        ctx.save(); ctx.beginPath(); ctx.arc(x + 122, quoteY + 14, 14, 0, Math.PI * 2); ctx.clip();
        ctx.drawImage(replyAvatar, x + 108, quoteY, 28, 28); ctx.restore();
        ctx.textAlign = 'left';
        ctx.fillStyle = reply.color;
        ctx.font = "600 24px 'gg sans', sans-serif";
        ctx.fillText(reply.displayName, x + 144, quoteY, replyNameWidth);
        ctx.fillStyle = '#949ba4';
        ctx.font = "400 24px 'gg sans', sans-serif";
        if (reply.timestamp) ctx.fillText(reply.timestamp, x + 158 + replyNameWidth, quoteY, replyTimestampWidth - 18);
        ctx.fillStyle = '#b5bac1';
        replyLines.forEach((line, index) => ctx.fillText(line, index ? x + 108 : x + 158 + replyNameWidth + replyTimestampWidth, quoteY + index * 30, index ? contentWidth : replyFirstWidth));
        let replyMediaY = quoteY + replyLines.length * 30 + 12;
        for (const rect of replyRectangles) {
            rect.x = Math.round(x + 108);
            rect.y = Math.round(replyMediaY);
            replyMediaY += rect.height + 24;
        }
        quoteY += replyHeight;
        ctx.save(); ctx.beginPath(); ctx.arc(x + 42, quoteY + 42, 42, 0, Math.PI * 2); ctx.clip();
        ctx.drawImage(avatar, x, quoteY, 84, 84); ctx.restore();
        ctx.fillStyle = payload.authorColor || '#f2f3f5';
        ctx.font = "600 30px 'gg sans', sans-serif";
        const nameWidth = ctx.measureText(payload.displayName).width;
        ctx.fillText(payload.displayName, x + 108, quoteY, nameWidth);
        let headerX = x + 108 + nameWidth + 18;
        if (payload.isBot) {
            ctx.fillStyle = '#5865f2';
            ctx.fillRect(headerX, quoteY + 3, 60, 32);
            ctx.fillStyle = '#fff'; ctx.font = "600 22px 'gg sans', sans-serif";
            ctx.fillText('APP', headerX + 6, quoteY + 7, 48);
            headerX += 74;
        }
        ctx.fillStyle = '#949ba4'; ctx.font = "400 24px 'gg sans', sans-serif";
        ctx.fillText(payload.timestamp || '', headerX, quoteY + 9, blockX + blockWidth - headerX);
        quoteY += 42;
        ctx.fillStyle = '#dbdee1';
        ctx.font = "400 32px 'gg sans', sans-serif";
    }
    for (const line of messageLines) {
        ctx.fillText(line, reply ? blockX + 108 : centerX, quoteY, contentWidth);
        quoteY += reply ? 42 : calculation.lineHeight;
    }
    for (const rect of messageRectangles) {
        rect.x = Math.round(reply ? blockX + 108 : centerX - rect.width / 2);
        rect.y = Math.round(quoteY + 24);
        quoteY += rect.height + 24;
    }
    if (!reply) {
    ctx.font = "italic 300 " + calculation.authorFontSize + "px '" + quoteFont + "', sans-serif";
    const authorY = quoteY + sp.authorTop;
    ctx.fillText("- " + String(payload.displayName || "Unknown"), centerX, authorY, cfg.quoteAreaWidth);
    ctx.font = "300 " + calculation.usernameFontSize + "px '" + quoteFont + "', sans-serif";
    ctx.fillStyle = "#888";
    const usernameY = authorY + calculation.authorFontSize + sp.username;
    ctx.fillText(String(payload.username || "@unknown"), centerX, usernameY, cfg.quoteAreaWidth);
    }
    ctx.restore();

    if (payload.showWatermark && payload.watermark) {
        const watermarkText = String(payload.watermark).slice(0, 32);
        ctx.fillStyle = "#888";
        ctx.font = "300 " + fs.watermark + "px '" + quoteFont + "', sans-serif";
        ctx.textAlign = reply ? "left" : "right";
        ctx.textBaseline = "alphabetic";
        const watermarkX = reply ? blockX + 108 : cfg.width - sp.watermarkPadding;
        const watermarkY = reply ? quoteY + 24 : height - sp.watermarkPadding;
        ctx.fillText(watermarkText, watermarkX, watermarkY, reply ? contentWidth : cfg.quoteAreaWidth);
    }

    const dataUrl = media.length ? await exportMedia(canvas, media, rectangles, payload.renderId) : canvas.toDataURL("image/png");
    post({ type: "result", dataUrl, width: cfg.width, height, renderId: payload.renderId });
    } finally { for (const item of media) item.close(); }
}

render().catch(error => {
    post({
        type: "error",
        renderId: payload.renderId,
        message: String(error && error.message ? error.message : error),
    });
});
</script>
</body>
</html>`
}
