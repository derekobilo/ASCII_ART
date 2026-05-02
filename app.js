/* ═══════════════════════════════════════════════════════════════
   ASCII ART CAM PRO — UI Controller & App Logic
   Depends on engine.js (must be loaded first via index.html)
   ═══════════════════════════════════════════════════════════════ */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const video = $('camera-video');
  const canvas = $('ascii-canvas');
  const histCanvas = $('histogram-canvas');
  let mediaRecorder = null, recordedChunks = [];
  let sourceImage = null; // for image-mode (drag/drop or file load)

  // ─── TOAST SYSTEM ──────────────────────────────────────────
  function toast(msg, icon = '✅') {
    const el = document.createElement('div');
    el.className = 'toast';
    el.innerHTML = `<span class="toast-icon">${icon}</span><span>${msg}</span>`;
    $('toast-container').appendChild(el);
    setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 300); }, 2500);
  }

  // ─── CAMERA ────────────────────────────────────────────────
  async function enumerateCameras() {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const sel = $('camera-select');
    sel.innerHTML = '';
    devices.filter(d => d.kind === 'videoinput').forEach((d, i) => {
      const opt = document.createElement('option');
      opt.value = d.deviceId;
      opt.textContent = d.label || `Camera ${i + 1}`;
      sel.appendChild(opt);
    });
  }

  async function startCamera(deviceId) {
    try {
      if (video.srcObject) video.srcObject.getTracks().forEach(t => t.stop());
      video.srcObject = await navigator.mediaDevices.getUserMedia({
        video: { deviceId: deviceId ? { exact: deviceId } : undefined, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      await video.play();
      S.running = true; S.imageMode = false;
      $('onboarding').classList.add('hidden');
      await enumerateCameras();
      toast('Camera connected', '📷');
      requestAnimationFrame(loop);
    } catch (err) {
      console.error('Camera error:', err);
      toast('Camera error: ' + err.message, '❌');
    }
  }

  // ─── IMAGE MODE (drag/drop, file load) ─────────────────────
  function loadImage(file) {
    const img = new Image();
    img.onload = () => {
      sourceImage = img;
      S.imageMode = true; S.running = true;
      $('onboarding').classList.add('hidden');
      toast('Image loaded', '🖼️');
      requestAnimationFrame(loop);
    };
    img.src = URL.createObjectURL(file);
  }

  // ─── RENDER LOOP ──────────────────────────────────────────
  function loop(timestamp) {
    if (!S.running) return;
    requestAnimationFrame(loop);
    const src = S.imageMode ? sourceImage : video;
    if (!src) return;
    renderFrame(timestamp, src, {
      onFps: fps => { $('fps-display').textContent = `${fps} FPS`; },
      onRes: res => { $('resolution-display').textContent = res; },
    });
    $('mode-display').textContent = S.mode.toUpperCase();
    canvas.classList.toggle('scanlines', S.scanlines);
  }

  // ─── EXPORTS ──────────────────────────────────────────────
  function exportPNG() {
    const link = document.createElement('a');
    link.download = `ascii-${S.mode}-${Date.now()}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
    toast('PNG saved', '📸');
  }

  function exportTxtFile() {
    const text = exportTXT();
    if (!text) return toast('Nothing to export', '⚠️');
    const blob = new Blob([text], { type: 'text/plain' });
    const link = document.createElement('a');
    link.download = `ascii-${S.mode}-${Date.now()}.txt`;
    link.href = URL.createObjectURL(blob);
    link.click();
    URL.revokeObjectURL(link.href);
    toast('TXT exported', '📄');
  }

  function toggleRecording() {
    if (S.recording) {
      mediaRecorder.stop(); S.recording = false;
      $('btn-record').classList.remove('recording');
      $('record-indicator').classList.add('hidden');
      toast('Recording saved', '🎬');
      return;
    }
    recordedChunks = [];
    const stream = canvas.captureStream(30);
    mediaRecorder = new MediaRecorder(stream, {
      mimeType: MediaRecorder.isTypeSupported('video/webm;codecs=vp9') ? 'video/webm;codecs=vp9' : 'video/webm',
    });
    mediaRecorder.ondataavailable = e => { if (e.data.size > 0) recordedChunks.push(e.data); };
    mediaRecorder.onstop = () => {
      const blob = new Blob(recordedChunks, { type: 'video/webm' });
      const link = document.createElement('a');
      link.download = `ascii-${Date.now()}.webm`;
      link.href = URL.createObjectURL(blob);
      link.click();
      URL.revokeObjectURL(link.href);
    };
    mediaRecorder.start();
    S.recording = true;
    $('btn-record').classList.add('recording');
    $('record-indicator').classList.remove('hidden');
    toast('Recording started…', '⏺');
  }

  function toggleFullscreen() {
    if (document.fullscreenElement) document.exitFullscreen();
    else canvas.requestFullscreen();
  }

  async function togglePiP() {
    try {
      if (document.pictureInPictureElement) await document.exitPictureInPicture();
      else await video.requestPictureInPicture();
      toast('PiP toggled', '🖼️');
    } catch (e) { toast('PiP not available', '⚠️'); }
  }

  function toggleSidebar() {
    document.body.classList.toggle('sidebar-open');
    $('btn-sidebar-toggle').classList.toggle('active');
  }

  // ─── PRESETS ──────────────────────────────────────────────
  const PRESETS = {
    default: { mode: 'color', charset: 'standard', monoColor: '#00ff41', fontSize: 10, filters: { brightness: 100, contrast: 100, saturation: 100, hue: 0, blur: 0, sharpen: 0 }, dithering: false, histEq: false, invert: false, scanlines: false, glow: false, edgeAlgo: 'sobel', bgOpacity: 100, lineSpacing: 100, zoom: 100, posterize: 32, threshold: 0, gaussRadius: 0 },
    retro: { mode: 'mono', charset: 'standard', monoColor: '#00ff41', fontSize: 8, filters: { brightness: 110, contrast: 130, saturation: 0, hue: 0, blur: 0, sharpen: 0 }, dithering: false, histEq: false, invert: false, scanlines: true, glow: true, bgOpacity: 100, lineSpacing: 100, zoom: 100, posterize: 32, threshold: 0, gaussRadius: 0 },
    hacker: { mode: 'mono', charset: 'matrix', monoColor: '#00ff41', fontSize: 6, filters: { brightness: 90, contrast: 150, saturation: 0, hue: 0, blur: 0, sharpen: 30 }, dithering: false, histEq: true, invert: false, scanlines: true, glow: true, bgOpacity: 100, lineSpacing: 90, zoom: 100, posterize: 32, threshold: 0, gaussRadius: 0 },
    neon: { mode: 'color', charset: 'dense', monoColor: '#e040fb', fontSize: 8, filters: { brightness: 120, contrast: 160, saturation: 250, hue: 0, blur: 0, sharpen: 20 }, dithering: false, histEq: false, invert: false, scanlines: false, glow: true, bgOpacity: 100, lineSpacing: 100, zoom: 100, posterize: 32, threshold: 0, gaussRadius: 0 },
    blueprint: { mode: 'mono', charset: 'standard', monoColor: '#00e5ff', fontSize: 9, filters: { brightness: 100, contrast: 120, saturation: 0, hue: 0, blur: 0, sharpen: 0 }, dithering: true, histEq: false, invert: true, scanlines: false, glow: true, bgOpacity: 100, lineSpacing: 100, zoom: 100, posterize: 32, threshold: 0, gaussRadius: 1 },
    surveillance: { mode: 'mono', charset: 'standard', monoColor: '#ffffff', fontSize: 7, filters: { brightness: 80, contrast: 140, saturation: 0, hue: 0, blur: 0, sharpen: 0 }, dithering: false, histEq: true, invert: false, scanlines: true, glow: false, bgOpacity: 100, lineSpacing: 95, zoom: 100, posterize: 32, threshold: 0, gaussRadius: 0 },
    'thermal-pro': { mode: 'thermal', charset: 'block', monoColor: '#00ff41', fontSize: 10, filters: { brightness: 100, contrast: 120, saturation: 100, hue: 0, blur: 0, sharpen: 0 }, dithering: false, histEq: false, invert: false, scanlines: false, glow: false, bgOpacity: 100, lineSpacing: 100, zoom: 100, posterize: 32, threshold: 0, gaussRadius: 1 },
    sketch: { mode: 'edge', charset: 'standard', monoColor: '#ffffff', fontSize: 8, edgeAlgo: 'canny', filters: { brightness: 100, contrast: 100, saturation: 0, hue: 0, blur: 0, sharpen: 0 }, dithering: false, histEq: false, invert: false, scanlines: false, glow: false, bgOpacity: 100, lineSpacing: 100, zoom: 100, posterize: 32, threshold: 0, gaussRadius: 1 },
  };

  function applyPreset(name) {
    const p = PRESETS[name] || PRESETS.default;
    Object.assign(S, JSON.parse(JSON.stringify(p)));
    // Sync all UI controls
    syncUIFromState();
    toast(`Preset: ${name}`, '🎨');
  }

  function syncUIFromState() {
    // Mode buttons
    document.querySelectorAll('.mode-btn').forEach(b => b.classList.toggle('active', b.dataset.mode === S.mode));
    // Filters
    $('filter-brightness').value = S.filters.brightness; $('val-brightness').textContent = S.filters.brightness;
    $('filter-contrast').value = S.filters.contrast; $('val-contrast').textContent = S.filters.contrast;
    $('filter-saturation').value = S.filters.saturation; $('val-saturation').textContent = S.filters.saturation;
    $('filter-hue').value = S.filters.hue; $('val-hue').textContent = S.filters.hue + '°';
    $('filter-blur').value = S.filters.blur; $('val-blur').textContent = S.filters.blur;
    $('filter-sharpen').value = S.filters.sharpen; $('val-sharpen').textContent = S.filters.sharpen;
    // Toggles
    $('toggle-dithering').checked = S.dithering;
    $('toggle-histeq').checked = S.histEq;
    $('toggle-invert').checked = S.invert;
    $('toggle-autolevel').checked = S.autoLevel;
    $('toggle-scanlines').checked = S.scanlines;
    $('toggle-glow').checked = S.glow;
    // Others
    $('font-size').value = S.fontSize; $('val-fontsize').textContent = S.fontSize;
    $('line-spacing').value = S.lineSpacing; $('val-linespacing').textContent = S.lineSpacing + '%';
    $('bg-opacity').value = S.bgOpacity; $('val-bgopacity').textContent = S.bgOpacity + '%';
    $('zoom').value = S.zoom; $('val-zoom').textContent = S.zoom + '%';
    $('posterize').value = S.posterize; $('val-posterize').textContent = S.posterize >= 32 ? 'Off' : S.posterize;
    $('threshold').value = S.threshold; $('val-threshold').textContent = S.threshold <= 0 ? 'Off' : S.threshold;
    $('charset-select').value = S.charset;
    $('gauss-radius').value = S.gaussRadius; $('val-gauss').textContent = S.gaussRadius;
    if (S.edgeAlgo) $('edge-algo').value = S.edgeAlgo;
    // Color chips
    document.querySelectorAll('.color-chip').forEach(c => c.classList.toggle('active', c.dataset.color === S.monoColor));
    // Charset preview
    updateCharsetPreview();
  }

  function updateCharsetPreview() {
    $('charset-preview').textContent = getChars();
  }

  // ─── CUSTOM PRESET SAVE/LOAD ──────────────────────────────
  function saveCustomPreset() {
    const name = prompt('Preset name:');
    if (!name) return;
    const saved = JSON.parse(localStorage.getItem('asciiCamPresets') || '{}');
    const snap = {};
    for (const k of Object.keys(PRESETS.default)) snap[k] = typeof S[k] === 'object' ? JSON.parse(JSON.stringify(S[k])) : S[k];
    saved[name] = snap;
    localStorage.setItem('asciiCamPresets', JSON.stringify(saved));
    renderCustomPresets();
    toast(`Preset "${name}" saved`, '💾');
  }

  function renderCustomPresets() {
    const list = $('custom-presets-list');
    const saved = JSON.parse(localStorage.getItem('asciiCamPresets') || '{}');
    list.innerHTML = '';
    Object.keys(saved).forEach(name => {
      const item = document.createElement('div');
      item.className = 'preset-item';
      item.innerHTML = `<span style="cursor:pointer;flex:1">${name}</span><button title="Delete">×</button>`;
      item.querySelector('span').onclick = () => { Object.assign(S, JSON.parse(JSON.stringify(saved[name]))); syncUIFromState(); toast(`Loaded "${name}"`, '📂'); };
      item.querySelector('button').onclick = () => { delete saved[name]; localStorage.setItem('asciiCamPresets', JSON.stringify(saved)); renderCustomPresets(); toast(`Deleted "${name}"`, '🗑️'); };
      list.appendChild(item);
    });
  }

  // ─── MODAL ────────────────────────────────────────────────
  function toggleModal(show) {
    $('shortcuts-modal').classList.toggle('hidden', !show);
  }

  // ─── WIRE UI ──────────────────────────────────────────────
  function initUI() {
    // Mode buttons
    document.querySelectorAll('.mode-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active'); S.mode = btn.dataset.mode;
      });
    });

    // Sidebar tabs
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
        btn.classList.add('active');
        $(btn.dataset.tab).classList.add('active');
      });
    });

    // Camera select
    $('camera-select').addEventListener('change', e => startCamera(e.target.value));

    // Range sliders — generic wiring
    const wire = (id, stateKey, valId, fmt) => {
      $(id).addEventListener('input', e => {
        const v = +e.target.value;
        if (typeof stateKey === 'function') stateKey(v);
        else if (stateKey.includes('.')) { const [a, b] = stateKey.split('.'); S[a][b] = v; }
        else S[stateKey] = v;
        $(valId).textContent = fmt ? fmt(v) : v;
      });
    };

    wire('fps-limit', 'fpsLimit', 'fps-limit-val');
    wire('zoom', 'zoom', 'val-zoom', v => v + '%');
    wire('font-size', 'fontSize', 'val-fontsize');
    wire('line-spacing', 'lineSpacing', 'val-linespacing', v => v + '%');
    wire('bg-opacity', 'bgOpacity', 'val-bgopacity', v => v + '%');
    wire('filter-brightness', 'filters.brightness', 'val-brightness');
    wire('filter-contrast', 'filters.contrast', 'val-contrast');
    wire('filter-saturation', 'filters.saturation', 'val-saturation');
    wire('filter-hue', 'filters.hue', 'val-hue', v => v + '°');
    wire('filter-blur', 'filters.blur', 'val-blur');
    wire('filter-sharpen', 'filters.sharpen', 'val-sharpen');
    wire('posterize', 'posterize', 'val-posterize', v => v >= 32 ? 'Off' : v);
    wire('threshold', 'threshold', 'val-threshold', v => v <= 0 ? 'Off' : v);
    wire('edge-low', 'edgeLow', 'val-edge-low');
    wire('edge-high', 'edgeHigh', 'val-edge-high');
    wire('morph-size', 'morphSize', 'val-morph-size');
    wire('gauss-radius', 'gaussRadius', 'val-gauss');
    wire('gauss-sigma', v => { S.gaussSigma = v / 10; }, 'val-sigma', v => (v / 10).toFixed(1));
    wire('motion-sens', 'motionSens', 'val-motion-sens');

    // Toggles
    const wireToggle = (id, key) => $(id).addEventListener('change', e => { S[key] = e.target.checked; });
    wireToggle('toggle-dithering', 'dithering');
    wireToggle('toggle-histeq', 'histEq');
    wireToggle('toggle-invert', 'invert');
    wireToggle('toggle-autolevel', 'autoLevel');
    wireToggle('toggle-scanlines', 'scanlines');
    wireToggle('toggle-glow', 'glow');
    wireToggle('toggle-face', 'faceDetect');
    wireToggle('toggle-motion-highlight', 'motionHighlight');

    // Selects
    $('edge-algo').addEventListener('change', e => S.edgeAlgo = e.target.value);
    $('morph-op').addEventListener('change', e => S.morphOp = e.target.value);

    // Charset
    $('charset-select').addEventListener('change', e => {
      S.charset = e.target.value;
      $('custom-charset-row').classList.toggle('hidden', e.target.value !== 'custom');
      updateCharsetPreview();
    });
    $('custom-charset').addEventListener('input', e => { S.customChars = e.target.value || ' '; updateCharsetPreview(); });

    // Color chips
    document.querySelectorAll('.color-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        document.querySelectorAll('.color-chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active'); S.monoColor = chip.dataset.color;
      });
    });

    // Toolbar actions
    $('btn-screenshot').addEventListener('click', exportPNG);
    $('btn-record').addEventListener('click', toggleRecording);
    $('btn-txt').addEventListener('click', exportTxtFile);
    $('btn-mirror').addEventListener('click', () => { S.mirror = !S.mirror; $('btn-mirror').classList.toggle('active', S.mirror); toast(S.mirror ? 'Mirror on' : 'Mirror off', '🪞'); });
    $('btn-pip').addEventListener('click', togglePiP);
    $('btn-fullscreen').addEventListener('click', toggleFullscreen);
    $('btn-sidebar-toggle').addEventListener('click', toggleSidebar);
    $('btn-close-sidebar').addEventListener('click', toggleSidebar);
    $('btn-help').addEventListener('click', () => toggleModal(true));
    $('btn-close-modal').addEventListener('click', () => toggleModal(false));
    $('shortcuts-modal').querySelector('.modal-backdrop').addEventListener('click', () => toggleModal(false));

    // Reset filters
    $('btn-reset-filters').addEventListener('click', () => {
      S.filters = { brightness: 100, contrast: 100, saturation: 100, hue: 0, blur: 0, sharpen: 0 };
      S.dithering = false; S.histEq = false; S.invert = false; S.autoLevel = false; S.posterize = 32; S.threshold = 0;
      syncUIFromState();
      toast('Filters reset', '🔄');
    });

    // Presets
    document.querySelectorAll('.preset-btn').forEach(btn => {
      btn.addEventListener('click', () => applyPreset(btn.dataset.preset));
    });
    $('btn-save-preset').addEventListener('click', saveCustomPreset);
    renderCustomPresets();

    // Onboarding buttons
    $('btn-start-camera').addEventListener('click', () => startCamera());
    $('file-input').addEventListener('change', e => { if (e.target.files[0]) loadImage(e.target.files[0]); });

    // Open sidebar by default
    document.body.classList.add('sidebar-open');
    $('btn-sidebar-toggle').classList.add('active');

    // Initial charset preview
    updateCharsetPreview();
  }

  // ─── DRAG & DROP ──────────────────────────────────────────
  function initDragDrop() {
    const app = $('app'), dz = $('drop-zone');
    let dragCounter = 0;
    app.addEventListener('dragenter', e => { e.preventDefault(); dragCounter++; dz.classList.remove('hidden'); });
    app.addEventListener('dragleave', e => { e.preventDefault(); dragCounter--; if (dragCounter <= 0) { dz.classList.add('hidden'); dragCounter = 0; } });
    app.addEventListener('dragover', e => e.preventDefault());
    app.addEventListener('drop', e => {
      e.preventDefault(); dragCounter = 0; dz.classList.add('hidden');
      const file = e.dataTransfer.files[0];
      if (file && file.type.startsWith('image/')) loadImage(file);
      else toast('Please drop an image file', '⚠️');
    });
  }

  // ─── KEYBOARD SHORTCUTS ───────────────────────────────────
  function initShortcuts() {
    document.addEventListener('keydown', e => {
      if (['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName)) return;
      const modal = !$('shortcuts-modal').classList.contains('hidden');
      if (e.key === 'Escape') { if (modal) toggleModal(false); return; }
      if (modal) return;
      switch (e.key) {
        case ' ': e.preventDefault(); exportPNG(); break;
        case 'r': case 'R': toggleRecording(); break;
        case 't': case 'T': exportTxtFile(); break;
        case 'f': case 'F': toggleFullscreen(); break;
        case 'm': case 'M': S.mirror = !S.mirror; $('btn-mirror').classList.toggle('active', S.mirror); toast(S.mirror ? 'Mirror on' : 'Mirror off', '🪞'); break;
        case 'p': case 'P': togglePiP(); break;
        case 'i': case 'I': toggleSidebar(); break;
        case 'n': case 'N': S.invert = !S.invert; $('toggle-invert').checked = S.invert; toast(S.invert ? 'Inverted' : 'Normal', '🔄'); break;
        case 'd': case 'D': S.dithering = !S.dithering; $('toggle-dithering').checked = S.dithering; toast(S.dithering ? 'Dithering on' : 'Dithering off', '🎨'); break;
        case 'g': case 'G': S.glow = !S.glow; $('toggle-glow').checked = S.glow; toast(S.glow ? 'Glow on' : 'Glow off', '✨'); break;
        case '?': toggleModal(true); break;
        case '1': case '2': case '3': case '4': case '5': case '6': case '7': case '8':
          const modes = ['color', 'mono', 'edge', 'thermal', 'matrix', 'braille', 'halftone', 'motion'];
          const m = modes[+e.key - 1]; if (m) { S.mode = m; document.querySelectorAll('.mode-btn').forEach(b => b.classList.toggle('active', b.dataset.mode === m)); }
          break;
      }
    });
  }

  // ─── INIT ─────────────────────────────────────────────────
  initEngine(video, canvas, histCanvas);
  initUI();
  initDragDrop();
  initShortcuts();
})();
