/* ═══════════════════════════════════════════════════════════════
   ASCII ART CAM PRO — Core Engine (Rendering + CV Pipeline)
   ═══════════════════════════════════════════════════════════════ */
'use strict';

// ─── CHARACTER SETS ────────────────────────────────────────
const CHARSETS = {
    standard: " `.-':_,^=;><+!rc*/z?sLTv)J7(|Fi{C}fI31tlu[neoZ5Yxjya]2ESwqkP6h9d4VpOGbUAKXHm8RD#$Bg0MNWQ%&@",
    block: ' ░▒▓█',
    minimal: ' .:+*#',
    dense: ' .:-=+*%#@',
    matrix: ' 01',
    binary: ' 01',
    braille: ' ⠁⠂⠃⠄⠅⠆⠇⡀⡁⡂⡃⡄⡅⡆⡇⠈⠉⠊⠋⠌⠍⠎⠏⡈⡉⡊⡋⡌⡍⡎⡏⠐⠑⠒⠓⠔⠕⠖⠗⡐⡑⡒⡓⡔⡕⡖⡗⠘⠙⠚⠛⠜⠝⠞⠟⡘⡙⡚⡛⡜⡝⡞⡟⠠⠡⠢⠣⠤⠥⠦⠧⡠⡡⡢⡣⡤⡥⡦⡧⠨⠩⠪⠫⠬⠭⠮⠯⡨⡩⡪⡫⡬⡭⡮⡯⠰⠱⠲⠳⠴⠵⠶⠷⡰⡱⡲⡳⡴⡵⡶⡷⠸⠹⠺⠻⠼⠽⠾⠿⡸⡹⡺⡻⡼⡽⡾⡿⢀⢁⢂⢃⢄⢅⢆⢇⣀⣁⣂⣃⣄⣅⣆⣇⢈⢉⢊⢋⢌⢍⢎⢏⣈⣉⣊⣋⣌⣍⣎⣏⢐⢑⢒⢓⢔⢕⢖⢗⣐⣑⣒⣓⣔⣕⣖⣗⢘⢙⢚⢛⢜⢝⢞⢟⣘⣙⣚⣛⣜⣝⣞⣟⢠⢡⢢⢣⢤⢥⢦⢧⣠⣡⣢⣣⣤⣥⣦⣧⢨⢩⢪⢫⢬⢭⢮⢯⣨⣩⣪⣫⣬⣭⣮⣯⢰⢱⢲⢳⢴⢵⢶⢷⣰⣱⣲⣳⣴⣵⣶⣷⢸⢹⢺⢻⢼⢽⢾⢿⣸⣹⣺⣻⣼⣽⣾⣿',
    emoji: '  ·•●◉◎○',
};

// ─── GLOBAL STATE ──────────────────────────────────────────
const S = {
    mode: 'color', mirror: false, charset: 'standard', customChars: ' .:-=+*#%@',
    monoColor: '#00ff41', fontSize: 10, lineSpacing: 100, bgOpacity: 100,
    scanlines: false, glow: false, zoom: 100,
    filters: { brightness: 100, contrast: 100, saturation: 100, hue: 0, blur: 0, sharpen: 0 },
    dithering: false, histEq: false, invert: false, autoLevel: false,
    posterize: 32, threshold: 0,
    edgeAlgo: 'sobel', edgeLow: 30, edgeHigh: 100,
    morphOp: 'none', morphSize: 1,
    faceDetect: false, motionHighlight: false, motionSens: 30,
    gaussRadius: 0, gaussSigma: 1.4,
    fpsLimit: 30, running: false, recording: false,
    imageMode: false,
};

// ─── REFS ──────────────────────────────────────────────────
let video, canvas, ctx, offscreen, offCtx, histCanvas, histCtx;
let prevFrame = null, prevLum = null;
let faceDetector = null;
let faceBoxes = [];
let matrixDrops = [];

// ─── INIT CANVASES ─────────────────────────────────────────
function initEngine(v, c, hc) {
    video = v; canvas = c; histCanvas = hc;
    ctx = canvas.getContext('2d', { willReadFrequently: false });
    histCtx = histCanvas.getContext('2d');
    offscreen = document.createElement('canvas');
    offCtx = offscreen.getContext('2d', { willReadFrequently: true });
    // Try to init face detector
    if ('FaceDetector' in window) {
        try { faceDetector = new FaceDetector({ fastMode: true, maxDetectedFaces: 5 }); } catch (e) { }
    }
}

// ─── HELPERS ───────────────────────────────────────────────
function getChars() { return S.charset === 'custom' ? S.customChars : (CHARSETS[S.charset] || CHARSETS.standard); }
function lum(r, g, b) { return .299 * r + .587 * g + .114 * b; }

function buildFilterString() {
    const f = S.filters;
    let s = `brightness(${f.brightness}%) contrast(${f.contrast}%) saturate(${f.saturation}%)`;
    if (f.hue) s += ` hue-rotate(${f.hue}deg)`;
    if (f.blur > 0) s += ` blur(${f.blur}px)`;
    if (S.invert) s += ' invert(1)';
    return s;
}

// ─── CV: HISTOGRAM EQUALIZATION ────────────────────────────
function histogramEqualize(lumBuf, len) {
    const hist = new Uint32Array(256);
    for (let i = 0; i < len; i++) hist[Math.min(255, Math.max(0, lumBuf[i] | 0))]++;
    const cdf = new Float32Array(256);
    cdf[0] = hist[0];
    for (let i = 1; i < 256; i++) cdf[i] = cdf[i - 1] + hist[i];
    const cdfMin = cdf.find(v => v > 0);
    const scale = 255 / (len - cdfMin);
    for (let i = 0; i < len; i++) {
        const v = Math.min(255, Math.max(0, lumBuf[i] | 0));
        lumBuf[i] = ((cdf[v] - cdfMin) * scale) | 0;
    }
}

// ─── CV: AUTO LEVELS ───────────────────────────────────────
function autoLevels(lumBuf, len) {
    let mn = 255, mx = 0;
    for (let i = 0; i < len; i++) { const v = lumBuf[i]; if (v < mn) mn = v; if (v > mx) mx = v; }
    if (mx <= mn) return;
    const scale = 255 / (mx - mn);
    for (let i = 0; i < len; i++) lumBuf[i] = (lumBuf[i] - mn) * scale;
}

// ─── CV: POSTERIZE ─────────────────────────────────────────
function posterize(lumBuf, len, levels) {
    if (levels >= 32) return;
    const step = 255 / (levels - 1);
    for (let i = 0; i < len; i++) {
        lumBuf[i] = Math.round(lumBuf[i] / step) * step;
    }
}

// ─── CV: THRESHOLD ─────────────────────────────────────────
function applyThreshold(lumBuf, len, t) {
    if (t <= 0) return;
    for (let i = 0; i < len; i++) lumBuf[i] = lumBuf[i] >= t ? 255 : 0;
}

// ─── CV: FLOYD-STEINBERG DITHERING ─────────────────────────
function dither(lumBuf, w, h) {
    const levels = getChars().length;
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            const i = y * w + x, old = lumBuf[i];
            const q = Math.round(old / 255 * (levels - 1)) / (levels - 1) * 255;
            lumBuf[i] = q;
            const err = old - q;
            if (x + 1 < w) lumBuf[i + 1] += err * 7 / 16;
            if (y + 1 < h && x - 1 >= 0) lumBuf[(y + 1) * w + x - 1] += err * 3 / 16;
            if (y + 1 < h) lumBuf[(y + 1) * w + x] += err * 5 / 16;
            if (y + 1 < h && x + 1 < w) lumBuf[(y + 1) * w + x + 1] += err / 16;
        }
    }
}

// ─── CV: GAUSSIAN BLUR ────────────────────────────────────
function gaussianBlur(lumBuf, w, h, radius, sigma) {
    if (radius <= 0) return;
    const size = radius * 2 + 1;
    const kernel = new Float32Array(size);
    let sum = 0;
    for (let i = 0; i < size; i++) { const x = i - radius; kernel[i] = Math.exp(-(x * x) / (2 * sigma * sigma)); sum += kernel[i]; }
    for (let i = 0; i < size; i++) kernel[i] /= sum;
    const tmp = new Float32Array(w * h);
    // Horizontal
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        let v = 0;
        for (let k = 0; k < size; k++) { const sx = Math.min(w - 1, Math.max(0, x + k - radius)); v += lumBuf[y * w + sx] * kernel[k]; }
        tmp[y * w + x] = v;
    }
    // Vertical
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        let v = 0;
        for (let k = 0; k < size; k++) { const sy = Math.min(h - 1, Math.max(0, y + k - radius)); v += tmp[sy * w + x] * kernel[k]; }
        lumBuf[y * w + x] = v;
    }
}

// ─── CV: SHARPEN ──────────────────────────────────────────
function sharpen(lumBuf, w, h, amount) {
    if (amount <= 0) return;
    const a = amount / 100;
    const src = new Float32Array(lumBuf);
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
        const i = y * w + x;
        const lap = -src[i - w] - src[i - 1] + 4 * src[i] - src[i + 1] - src[i + w];
        lumBuf[i] = Math.max(0, Math.min(255, src[i] + lap * a));
    }
}

// ─── CV: MORPHOLOGICAL OPS ────────────────────────────────
function morphOp(lumBuf, w, h, op, size) {
    if (op === 'none') return;
    const doErode = () => {
        const src = new Float32Array(lumBuf);
        for (let y = size; y < h - size; y++) for (let x = size; x < w - size; x++) {
            let mn = 255;
            for (let dy = -size; dy <= size; dy++) for (let dx = -size; dx <= size; dx++) mn = Math.min(mn, src[(y + dy) * w + (x + dx)]);
            lumBuf[y * w + x] = mn;
        }
    };
    const doDilate = () => {
        const src = new Float32Array(lumBuf);
        for (let y = size; y < h - size; y++) for (let x = size; x < w - size; x++) {
            let mx = 0;
            for (let dy = -size; dy <= size; dy++) for (let dx = -size; dx <= size; dx++) mx = Math.max(mx, src[(y + dy) * w + (x + dx)]);
            lumBuf[y * w + x] = mx;
        }
    };
    if (op === 'erode') doErode();
    else if (op === 'dilate') doDilate();
    else if (op === 'open') { doErode(); doDilate(); }
    else if (op === 'close') { doDilate(); doErode(); }
}

// ─── CV: SOBEL ────────────────────────────────────────────
function sobelAt(lb, w, h, x, y) {
    const g = (dx, dy) => { const cx = Math.min(Math.max(x + dx, 0), w - 1), cy = Math.min(Math.max(y + dy, 0), h - 1); return lb[cy * w + cx]; };
    const gx = -g(-1, -1) - 2 * g(-1, 0) - g(-1, 1) + g(1, -1) + 2 * g(1, 0) + g(1, 1);
    const gy = -g(-1, -1) - 2 * g(0, -1) - g(1, -1) + g(-1, 1) + 2 * g(0, 1) + g(1, 1);
    return { mag: Math.sqrt(gx * gx + gy * gy), angle: Math.atan2(gy, gx) };
}

// ─── CV: LAPLACIAN ────────────────────────────────────────
function laplacianAt(lb, w, h, x, y) {
    if (x < 1 || y < 1 || x >= w - 1 || y >= h - 1) return 0;
    const i = y * w + x;
    return Math.abs(-lb[i - w] - lb[i - 1] + 4 * lb[i] - lb[i + 1] - lb[i + w]);
}

// ─── CV: CANNY EDGE ──────────────────────────────────────
function cannyEdges(lumBuf, w, h, lo, hi) {
    const mag = new Float32Array(w * h), dir = new Float32Array(w * h);
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
        const s = sobelAt(lumBuf, w, h, x, y);
        mag[y * w + x] = s.mag; dir[y * w + x] = s.angle;
    }
    // Non-maximum suppression
    const nms = new Float32Array(w * h);
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
        const i = y * w + x, a = ((dir[i] * 180 / Math.PI) + 180) % 180, m = mag[i];
        let n1 = 0, n2 = 0;
        if (a < 22.5 || a >= 157.5) { n1 = mag[i - 1]; n2 = mag[i + 1]; }
        else if (a < 67.5) { n1 = mag[(y - 1) * w + x + 1]; n2 = mag[(y + 1) * w + x - 1]; }
        else if (a < 112.5) { n1 = mag[(y - 1) * w + x]; n2 = mag[(y + 1) * w + x]; }
        else { n1 = mag[(y - 1) * w + x - 1]; n2 = mag[(y + 1) * w + x + 1]; }
        nms[i] = (m >= n1 && m >= n2) ? m : 0;
    }
    // Hysteresis
    const out = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) { if (nms[i] >= hi) out[i] = 2; else if (nms[i] >= lo) out[i] = 1; }
    let changed = true;
    while (changed) {
        changed = false;
        for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
            const i = y * w + x;
            if (out[i] !== 1) continue;
            for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
                if (out[(y + dy) * w + (x + dx)] === 2) { out[i] = 2; changed = true; break; }
            }
        }
    }
    return { edges: out, dirs: dir };
}

function edgeChar(a) {
    const d = ((a * 180 / Math.PI) + 180) % 180;
    if (d < 22.5 || d >= 157.5) return '─';
    if (d < 67.5) return '/';
    if (d < 112.5) return '│';
    return '\\';
}

// ─── THERMAL COLOR RAMP ──────────────────────────────────
function thermalColor(t) {
    const stops = [[0, 0, 0, 128], [.25, 0, 200, 255], [.5, 0, 220, 50], [.75, 255, 220, 0], [1, 255, 30, 0]];
    for (let i = 0; i < stops.length - 1; i++) {
        const [t0, r0, g0, b0] = stops[i], [t1, r1, g1, b1] = stops[i + 1];
        if (t >= t0 && t <= t1) { const p = (t - t0) / (t1 - t0); return `rgb(${r0 + (r1 - r0) * p | 0},${g0 + (g1 - g0) * p | 0},${b0 + (b1 - b0) * p | 0})`; }
    }
    return 'rgb(255,30,0)';
}

// ─── DRAW HISTOGRAM ───────────────────────────────────────
function drawHistogram(lumBuf, len) {
    const hist = new Uint32Array(256);
    for (let i = 0; i < len; i++) hist[Math.min(255, Math.max(0, lumBuf[i] | 0))]++;
    let mx = 0; for (let i = 0; i < 256; i++) if (hist[i] > mx) mx = hist[i];
    const w = histCanvas.width, h = histCanvas.height;
    histCtx.clearRect(0, 0, w, h);
    histCtx.fillStyle = 'rgba(123,111,240,.3)';
    for (let i = 0; i < 256; i++) {
        const bh = (hist[i] / mx) * h;
        histCtx.fillRect(i * (w / 256), h - bh, Math.ceil(w / 256), bh);
    }
}

// ─── FACE DETECTION ───────────────────────────────────────
let faceDetectTimer = 0;
async function detectFaces(timestamp) {
    if (!S.faceDetect || !faceDetector || !video.videoWidth) return;
    if (timestamp - faceDetectTimer < 500) return; // throttle to 2Hz
    faceDetectTimer = timestamp;
    try { faceBoxes = await faceDetector.detect(video); } catch (e) { faceBoxes = []; }
}

function drawFaceBoxes(cols, rows, cw, ch) {
    if (!faceBoxes.length || !video.videoWidth) return;
    const sx = cols / video.videoWidth, sy = rows / video.videoHeight;
    ctx.strokeStyle = '#00ff41'; ctx.lineWidth = 2; ctx.shadowColor = '#00ff41'; ctx.shadowBlur = 8;
    ctx.font = '10px Inter, sans-serif'; ctx.fillStyle = '#00ff41';
    faceBoxes.forEach((f, i) => {
        const bb = f.boundingBox;
        const x = (S.mirror ? cols - (bb.x + bb.width) * sx : bb.x * sx) * cw;
        const y = bb.y * sy * ch, w = bb.width * sx * cw, h = bb.height * sy * ch;
        ctx.strokeRect(x, y, w, h);
        ctx.fillText(`Face ${i + 1}`, x + 4, y - 4);
    });
    ctx.shadowBlur = 0;
}

// ─── RENDERERS ────────────────────────────────────────────
function renderColor(px, lb, chars, cols, rows, cw, ch) {
    const len = chars.length;
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
        const i = y * cols + x, pi = i * 4, l = Math.max(0, Math.min(255, lb[i]));
        const ci = Math.floor((l / 255) * (len - 1)), c = chars[ci]; if (c === ' ') continue;
        ctx.fillStyle = `rgb(${px[pi]},${px[pi + 1]},${px[pi + 2]})`; ctx.fillText(c, x * cw, y * ch);
    }
}

function renderMono(lb, chars, cols, rows, cw, ch) {
    const len = chars.length;
    ctx.fillStyle = S.monoColor;
    if (S.glow) { ctx.shadowColor = S.monoColor; ctx.shadowBlur = 3; }
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
        const l = Math.max(0, Math.min(255, lb[y * cols + x]));
        const ci = Math.floor((l / 255) * (len - 1)), c = chars[ci]; if (c === ' ') continue;
        ctx.globalAlpha = .35 + .65 * (l / 255); ctx.fillText(c, x * cw, y * ch);
    }
    ctx.globalAlpha = 1; ctx.shadowBlur = 0;
}

function renderEdge(lb, cols, rows, cw, ch) {
    const algo = S.edgeAlgo;
    ctx.fillStyle = '#00ff41'; if (S.glow) { ctx.shadowColor = '#00ff41'; ctx.shadowBlur = 2; }
    if (algo === 'canny') {
        const { edges, dirs } = cannyEdges(lb, cols, rows, S.edgeLow, S.edgeHigh);
        for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
            if (edges[y * cols + x] < 2) continue;
            ctx.globalAlpha = .9; ctx.fillText(edgeChar(dirs[y * cols + x]), x * cw, y * ch);
        }
    } else if (algo === 'laplacian') {
        for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
            const m = laplacianAt(lb, cols, rows, x, y); if (m < S.edgeLow) continue;
            ctx.globalAlpha = Math.min(1, m / 200); ctx.fillText('+', x * cw, y * ch);
        }
    } else {
        for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
            const { mag, angle } = sobelAt(lb, cols, rows, x, y); if (mag < S.edgeLow) continue;
            ctx.globalAlpha = Math.min(1, mag / 200); ctx.fillText(edgeChar(angle), x * cw, y * ch);
        }
    }
    ctx.globalAlpha = 1; ctx.shadowBlur = 0;
}

function renderThermal(lb, chars, cols, rows, cw, ch) {
    const len = chars.length;
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
        const l = Math.max(0, Math.min(255, lb[y * cols + x])), t = l / 255;
        const ci = Math.floor(t * (len - 1)), c = chars[ci]; if (c === ' ') continue;
        ctx.fillStyle = thermalColor(t); ctx.fillText(c, x * cw, y * ch);
    }
}

// ─── MATRIX RAIN ──────────────────────────────────────────
function renderMatrix(lb, cols, rows, cw, ch) {
    if (!matrixDrops.length || matrixDrops.length !== cols) {
        matrixDrops = Array.from({ length: cols }, () => Math.random() * rows | 0);
    }
    const matChars = 'アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン0123456789ABCDEF';
    // Fade effect on background
    ctx.fillStyle = 'rgba(0,0,0,0.08)'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    for (let x = 0; x < cols; x++) {
        const y = matrixDrops[x];
        const l = lb[Math.min(rows - 1, y) * cols + x] || 128;
        const brightness = l / 255;
        if (brightness > .15) {
            const c = matChars[Math.random() * matChars.length | 0];
            ctx.fillStyle = `rgba(0,255,65,${.5 + .5 * brightness})`; ctx.fillText(c, x * cw, y * ch);
            // bright head
            ctx.fillStyle = 'rgba(180,255,180,.9)'; ctx.fillText(c, x * cw, y * ch);
        }
        matrixDrops[x] += .5 + Math.random();
        if (matrixDrops[x] * ch > canvas.height && Math.random() > .975) matrixDrops[x] = 0;
    }
}

// ─── BRAILLE RENDER ───────────────────────────────────────
function renderBraille(lb, cols, rows, cw, ch) {
    // Braille: 2x4 pixel blocks → 1 braille character
    ctx.fillStyle = S.monoColor;
    if (S.glow) { ctx.shadowColor = S.monoColor; ctx.shadowBlur = 2; }
    const bw = Math.floor(cols / 2), bh = Math.floor(rows / 4);
    const brailleW = cw * 2, brailleH = ch * 4;
    const mid = 128;
    for (let by = 0; by < bh; by++) for (let bx = 0; bx < bw; bx++) {
        let code = 0x2800;
        const ox = bx * 2, oy = by * 4;
        // Braille dot positions: col0=[0,1,2,6], col1=[3,4,5,7]
        const dots = [[0, 0, 0], [1, 0, 1], [2, 0, 2], [0, 1, 3], [1, 1, 4], [2, 1, 5], [3, 0, 6], [3, 1, 7]];
        for (const [dy, dx, bit] of dots) {
            const sy = oy + dy, sx = ox + dx;
            if (sy < rows && sx < cols && lb[sy * cols + sx] > mid) code |= (1 << bit);
        }
        ctx.fillText(String.fromCharCode(code), bx * brailleW, by * brailleH);
    }
    ctx.shadowBlur = 0;
}

// ─── HALFTONE RENDER ──────────────────────────────────────
function renderHalftone(px, lb, cols, rows, cw, ch) {
    const dotSize = cw * 1.2;
    for (let y = 0; y < rows; y += 2) for (let x = 0; x < cols; x += 2) {
        const i = y * cols + x, pi = i * 4;
        const l = Math.max(0, Math.min(255, lb[i]));
        const r = dotSize * (l / 255) * .9;
        if (r < .5) continue;
        ctx.beginPath();
        ctx.fillStyle = `rgb(${px[pi]},${px[pi + 1]},${px[pi + 2]})`;
        ctx.arc(x * cw + cw, y * ch + ch, r, 0, Math.PI * 2);
        ctx.fill();
    }
}

// ─── MOTION DETECTION ─────────────────────────────────────
function renderMotion(px, lb, chars, cols, rows, cw, ch) {
    const len = chars.length;
    if (!prevLum || prevLum.length !== lb.length) { prevLum = new Float32Array(lb); return; }
    const sens = S.motionSens;
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
        const i = y * cols + x, pi = i * 4;
        const diff = Math.abs(lb[i] - prevLum[i]);
        if (diff < sens) continue;
        const ci = Math.floor((diff / 255) * (len - 1)), c = chars[Math.min(ci, len - 1)]; if (c === ' ') continue;
        ctx.fillStyle = `rgb(${Math.min(255, diff * 3 | 0)},${Math.min(255, 255 - diff | 0)},${px[pi + 2]})`;
        ctx.fillText(c, x * cw, y * ch);
    }
    prevLum.set(lb);
}

// ─── MAIN FRAME RENDER ───────────────────────────────────
let lastRenderTime = 0, frameCount = 0, lastFpsTime = performance.now();

function renderFrame(timestamp, sourceEl, callbacks) {
    const minInterval = 1000 / S.fpsLimit;
    if (timestamp - lastRenderTime < minInterval) return;
    lastRenderTime = timestamp;

    const vw = sourceEl.videoWidth || sourceEl.naturalWidth || sourceEl.width;
    const vh = sourceEl.videoHeight || sourceEl.naturalHeight || sourceEl.height;
    if (!vw || !vh) return;

    const chars = getChars(), fontSize = S.fontSize;
    const cellW = fontSize * .6, cellH = fontSize * (S.lineSpacing / 100);
    const appEl = document.getElementById('app');
    const sidebarOpen = document.body.classList.contains('sidebar-open');
    const availW = window.innerWidth - (sidebarOpen ? 300 : 0);
    const availH = window.innerHeight - 52;
    const cols = Math.floor(availW / cellW), rows = Math.floor(availH / cellH);
    if (cols < 2 || rows < 2) return;

    canvas.width = cols * cellW; canvas.height = rows * cellH;

    // Zoom offset calc
    const z = S.zoom / 100;
    const srcW = vw / z, srcH = vh / z;
    const srcX = (vw - srcW) / 2, srcY = (vh - srcH) / 2;

    offscreen.width = cols; offscreen.height = rows;
    offCtx.filter = buildFilterString();
    if (S.mirror) { offCtx.save(); offCtx.scale(-1, 1); offCtx.drawImage(sourceEl, srcX, srcY, srcW, srcH, -cols, 0, cols, rows); offCtx.restore(); }
    else offCtx.drawImage(sourceEl, srcX, srcY, srcW, srcH, 0, 0, cols, rows);
    offCtx.filter = 'none';

    const imageData = offCtx.getImageData(0, 0, cols, rows), px = imageData.data;
    const lb = new Float32Array(cols * rows);
    for (let i = 0; i < cols * rows; i++) { const p = i * 4; lb[i] = lum(px[p], px[p + 1], px[p + 2]); }

    // ── CV Pipeline ──
    gaussianBlur(lb, cols, rows, S.gaussRadius, S.gaussSigma);
    sharpen(lb, cols, rows, S.filters.sharpen);
    morphOp(lb, cols, rows, S.morphOp, S.morphSize);
    if (S.histEq) histogramEqualize(lb, cols * rows);
    if (S.autoLevel) autoLevels(lb, cols * rows);
    posterize(lb, cols * rows, S.posterize);
    applyThreshold(lb, cols * rows, S.threshold);
    if (S.dithering && S.mode !== 'matrix') dither(lb, cols, rows);

    // Histogram
    drawHistogram(lb, cols * rows);

    // Clear
    const bgA = S.bgOpacity / 100;
    ctx.fillStyle = `rgba(0,0,0,${bgA})`; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.font = `${fontSize}px "JetBrains Mono",Consolas,monospace`; ctx.textBaseline = 'top';

    // Dispatch
    switch (S.mode) {
        case 'color': renderColor(px, lb, chars, cols, rows, cellW, cellH); break;
        case 'mono': renderMono(lb, chars, cols, rows, cellW, cellH); break;
        case 'edge': renderEdge(lb, cols, rows, cellW, cellH); break;
        case 'thermal': renderThermal(lb, chars, cols, rows, cellW, cellH); break;
        case 'matrix': renderMatrix(lb, cols, rows, cellW, cellH); break;
        case 'braille': renderBraille(lb, cols, rows, cellW, cellH); break;
        case 'halftone': renderHalftone(px, lb, cols, rows, cellW, cellH); break;
        case 'motion': renderMotion(px, lb, chars, cols, rows, cellW, cellH); break;
    }

    // Face detection overlay
    detectFaces(timestamp);
    if (S.faceDetect) drawFaceBoxes(cols, rows, cellW, cellH);

    // Motion highlight overlay
    if (S.motionHighlight && prevFrame && S.mode !== 'motion') {
        ctx.globalAlpha = .25; ctx.fillStyle = '#ff0';
        for (let i = 0; i < cols * rows; i++) {
            if (Math.abs(lb[i] - (prevFrame[i] || 0)) > S.motionSens) {
                const x = i % cols, y = i / cols | 0;
                ctx.fillRect(x * cellW, y * cellH, cellW, cellH);
            }
        }
        ctx.globalAlpha = 1;
    }
    prevFrame = new Float32Array(lb);

    // FPS
    frameCount++;
    if (timestamp - lastFpsTime >= 1000) {
        if (callbacks.onFps) callbacks.onFps(frameCount);
        frameCount = 0; lastFpsTime = timestamp;
    }
    if (callbacks.onRes) callbacks.onRes(`${cols}×${rows}`);
}

// ─── EXPORT: TXT ──────────────────────────────────────────
function exportTXT() {
    const chars = getChars(), len = chars.length, cols = offscreen.width, rows = offscreen.height;
    if (!cols || !rows) return '';
    const imageData = offCtx.getImageData(0, 0, cols, rows), px = imageData.data;
    const lb = new Float32Array(cols * rows);
    for (let i = 0; i < cols * rows; i++) { const p = i * 4; lb[i] = lum(px[p], px[p + 1], px[p + 2]); }
    let text = '';
    for (let y = 0; y < rows; y++) {
        let row = '';
        for (let x = 0; x < cols; x++) {
            const l = Math.max(0, Math.min(255, lb[y * cols + x]));
            if (S.mode === 'edge') {
                const { mag, angle } = sobelAt(lb, cols, rows, x, y);
                row += mag < S.edgeLow ? ' ' : edgeChar(angle);
            } else { row += chars[Math.floor((l / 255) * (len - 1))]; }
        }
        text += row + '\n';
    }
    return text;
}
