let editorMarkupPromise = null;

async function ensureEditorMarkup() {
  if (document.getElementById('editor-modal-backdrop')) return;
  if (!editorMarkupPromise) {
    editorMarkupPromise = fetch('./editor_modal.html').then((r) => r.text());
  }
  const html = await editorMarkupPromise;
  if (!document.getElementById('editor-modal-backdrop')) {
    document.body.insertAdjacentHTML('beforeend', html);
  }
}

export function initImageEditor({ API_BASE_URL, populateFolderSelect, refreshCollections, getFolders }) {
  const MIXER_CHANNELS = [
    { key: 'red', label: '红色', hue: 0 },
    { key: 'yellow', label: '黄色', hue: 60 },
    { key: 'green', label: '绿色', hue: 120 },
    { key: 'cyan', label: '青色', hue: 180 },
    { key: 'blue', label: '蓝色', hue: 240 },
    { key: 'magenta', label: '洋红', hue: 300 }
  ];

  const state = {
    image: null,
    sourceImage: null,
    drawQueued: false,
    cropDrag: null,
    cropMode: false,
    flipX: 1,
    flipY: 1,
    mixer: Object.fromEntries(MIXER_CHANNELS.map((channel) => [channel.key, { hue: 0, saturation: 0, lightness: 0 }]))
  };

  let dom = null;

  function bindDom() {
    if (dom) return dom;
    dom = {
      backdrop: document.getElementById('editor-modal-backdrop'),
      closeButton: document.getElementById('close-editor-modal'),
      resetButton: document.getElementById('editor-reset'),
      downloadButton: document.getElementById('editor-download'),
      applyPreviewButton: document.getElementById('editor-apply-preview'),
      saveCopyButton: document.getElementById('editor-save-copy'),
      canvas: document.getElementById('editor-canvas'),
      flipHorizontalButton: document.getElementById('editor-flip-horizontal'),
      flipVerticalButton: document.getElementById('editor-flip-vertical'),
      scale: document.getElementById('editor-scale'),
      cropX: document.getElementById('editor-crop-x'),
      cropY: document.getElementById('editor-crop-y'),
      cropWidth: document.getElementById('editor-crop-width'),
      cropHeight: document.getElementById('editor-crop-height'),
      brightness: document.getElementById('editor-brightness'),
      contrast: document.getElementById('editor-contrast'),
      saturate: document.getElementById('editor-saturate'),
      rotateValue: document.getElementById('editor-rotate-value'),
      scaleValue: document.getElementById('editor-scale-value'),
      brightnessValue: document.getElementById('editor-brightness-value'),
      contrastValue: document.getElementById('editor-contrast-value'),
      saturateValue: document.getElementById('editor-saturate-value'),
      outputName: document.getElementById('editor-output-name'),
      outputFolder: document.getElementById('editor-output-folder'),
      toggleCropModeButton: document.getElementById('editor-toggle-crop-mode'),
      confirmCropButton: document.getElementById('editor-confirm-crop'),
      cropModeText: document.getElementById('editor-crop-mode-text'),
      histogramCanvas: document.getElementById('editor-histogram-canvas'),
      mixerControls: document.getElementById('editor-mixer-controls'),
      message: document.getElementById('editor-message')
    };
    return dom;
  }

  function setMessage(text, type = 'success') {
    const { message } = bindDom();
    if (!message) return;
    message.textContent = text;
    message.className = type === 'success' ? 'status-message success' : 'error';
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function syncLabels() {
    const d = bindDom();
    const flipLabels = [];
    if (state.flipX === -1) flipLabels.push('水平');
    if (state.flipY === -1) flipLabels.push('垂直');
    d.rotateValue.textContent = flipLabels.length ? `${flipLabels.join(' + ')}翻转` : '未翻转';
    d.scaleValue.textContent = `${d.scale.value}%`;
    d.brightnessValue.textContent = `${d.brightness.value}%`;
    d.contrastValue.textContent = `${d.contrast.value}%`;
    d.saturateValue.textContent = `${d.saturate.value}%`;
  }

  function rgbToHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    let h = 0, s = 0;
    const l = (max + min) / 2;
    const d = max - min;
    if (d !== 0) {
      s = d / (1 - Math.abs(2 * l - 1));
      switch (max) {
        case r: h = 60 * (((g - b) / d) % 6); break;
        case g: h = 60 * (((b - r) / d) + 2); break;
        default: h = 60 * (((r - g) / d) + 4); break;
      }
    }
    if (h < 0) h += 360;
    return { h, s, l };
  }

  function hslToRgb(h, s, l) {
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = l - c / 2;
    let r = 0, g = 0, b = 0;
    if (h < 60) [r, g, b] = [c, x, 0];
    else if (h < 120) [r, g, b] = [x, c, 0];
    else if (h < 180) [r, g, b] = [0, c, x];
    else if (h < 240) [r, g, b] = [0, x, c];
    else if (h < 300) [r, g, b] = [x, 0, c];
    else [r, g, b] = [c, 0, x];
    return { r: Math.round((r + m) * 255), g: Math.round((g + m) * 255), b: Math.round((b + m) * 255) };
  }

  function circularDistance(a, b) {
    const diff = Math.abs(a - b) % 360;
    return diff > 180 ? 360 - diff : diff;
  }

  function mixerWeight(pixelHue, targetHue, saturation) {
    if (saturation < 0.08) return 0;
    const distance = circularDistance(pixelHue, targetHue);
    const radius = 35;
    return distance >= radius ? 0 : (1 - distance / radius) * saturation;
  }

  function hasActiveMixerAdjustments() {
    return MIXER_CHANNELS.some((channel) => {
      const item = state.mixer[channel.key];
      return item.hue || item.saturation || item.lightness;
    });
  }

  function applyMixer(imageData) {
    if (!hasActiveMixerAdjustments()) return;
    const data = imageData.data;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] === 0) continue;
      let { h, s, l } = rgbToHsl(data[i], data[i + 1], data[i + 2]);
      let totalWeight = 0, hueShift = 0, satShift = 0, lightShift = 0;
      MIXER_CHANNELS.forEach((channel) => {
        const weight = mixerWeight(h, channel.hue, s);
        if (!weight) return;
        const item = state.mixer[channel.key];
        totalWeight += weight;
        hueShift += item.hue * weight;
        satShift += (item.saturation / 100) * weight;
        lightShift += (item.lightness / 100) * weight;
      });
      if (!totalWeight) continue;
      h = (h + hueShift / totalWeight + 360) % 360;
      s = clamp(s + satShift / totalWeight, 0, 1);
      l = clamp(l + lightShift / totalWeight, 0, 1);
      const rgb = hslToRgb(h, s, l);
      data[i] = rgb.r; data[i + 1] = rgb.g; data[i + 2] = rgb.b;
    }
  }

  function updateHistogram(sourceCanvas) {
    const { histogramCanvas } = bindDom();
    if (!histogramCanvas || !sourceCanvas) return;
    const ctx = histogramCanvas.getContext('2d');
    const width = histogramCanvas.width;
    const height = histogramCanvas.height;
    ctx.clearRect(0, 0, width, height);
    const sampleCanvas = document.createElement('canvas');
    const sampleCtx = sampleCanvas.getContext('2d');
    const scale = Math.min(1, 220 / sourceCanvas.width, 220 / sourceCanvas.height);
    sampleCanvas.width = Math.max(1, Math.floor(sourceCanvas.width * scale));
    sampleCanvas.height = Math.max(1, Math.floor(sourceCanvas.height * scale));
    sampleCtx.drawImage(sourceCanvas, 0, 0, sampleCanvas.width, sampleCanvas.height);
    const { data } = sampleCtx.getImageData(0, 0, sampleCanvas.width, sampleCanvas.height);
    const binsR = new Array(256).fill(0), binsG = new Array(256).fill(0), binsB = new Array(256).fill(0);
    for (let i = 0; i < data.length; i += 4) {
      binsR[data[i]]++; binsG[data[i + 1]]++; binsB[data[i + 2]]++;
    }
    const max = Math.max(...binsR, ...binsG, ...binsB, 1);
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(0, 0, width, height);
    [['rgba(239,68,68,0.92)', binsR], ['rgba(34,197,94,0.92)', binsG], ['rgba(59,130,246,0.92)', binsB]].forEach(([color, bins]) => {
      ctx.beginPath(); ctx.strokeStyle = color; ctx.lineWidth = 2;
      bins.forEach((value, index) => {
        const x = (index / 255) * width;
        const normalized = Math.pow(value / max, 0.28);
        const y = height - normalized * (height - 10);
        if (index === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      });
      ctx.stroke();
    });
  }

  function hueCss(deg, sat = 85, light = 58) {
    return `hsl(${(deg + 360) % 360} ${sat}% ${light}%)`;
  }

  function renderMixerControls() {
    const d = bindDom();
    if (!d.mixerControls || d.mixerControls.dataset.ready === '1') return;
    d.mixerControls.innerHTML = MIXER_CHANNELS.map((channel) => {
      const leftHue = hueCss(channel.hue - 45), centerHue = hueCss(channel.hue), rightHue = hueCss(channel.hue + 45);
      return `<section class="mixer-channel-card mixer-channel-${channel.key}" data-channel="${channel.key}">
        <div class="mixer-channel-head"><strong>${channel.label}</strong><span class="mixer-channel-meta">色相 / 饱和度 / 明度</span></div>
        <label>色相 <input class="mixer-range mixer-range-hue" style="background: linear-gradient(90deg, ${leftHue} 0%, ${centerHue} 50%, ${rightHue} 100%);" type="range" min="-100" max="100" value="0" data-mixer-channel="${channel.key}" data-mixer-prop="hue"></label>
        <label>饱和度 <input class="mixer-range mixer-range-saturation" style="background: linear-gradient(90deg, hsl(${channel.hue} 8% 60%) 0%, hsl(${channel.hue} 35% 56%) 35%, hsl(${channel.hue} 78% 52%) 100%);" type="range" min="-100" max="100" value="0" data-mixer-channel="${channel.key}" data-mixer-prop="saturation"></label>
        <label>明度 <input class="mixer-range mixer-range-lightness" style="background: linear-gradient(90deg, hsl(${channel.hue} 70% 16%) 0%, hsl(${channel.hue} 72% 50%) 55%, hsl(${channel.hue} 60% 85%) 100%);" type="range" min="-100" max="100" value="0" data-mixer-channel="${channel.key}" data-mixer-prop="lightness"></label>
      </section>`;
    }).join('');
    d.mixerControls.querySelectorAll('input[type="range"]').forEach((input) => {
      input.addEventListener('input', (event) => {
        const channel = event.target.dataset.mixerChannel;
        const prop = event.target.dataset.mixerProp;
        state.mixer[channel][prop] = Number(event.target.value);
        drawEditorCanvas();
      });
    });
    d.mixerControls.dataset.ready = '1';
  }

  function getEditorSnapshotCanvas({ preview = false, applyCrop = true } = {}) {
    const d = bindDom();
    if (!state.sourceImage) return null;
    const sourceW = state.sourceImage.naturalWidth || state.sourceImage.width;
    const sourceH = state.sourceImage.naturalHeight || state.sourceImage.height;
    const cropXRatio = Number(d.cropX.value) / 100;
    const cropYRatio = Number(d.cropY.value) / 100;
    const cropWRatio = Number(d.cropWidth.value) / 100;
    const cropHRatio = Number(d.cropHeight.value) / 100;
    const sx = applyCrop ? Math.floor(sourceW * cropXRatio) : 0;
    const sy = applyCrop ? Math.floor(sourceH * cropYRatio) : 0;
    const sw = applyCrop ? Math.max(1, Math.floor(sourceW * cropWRatio)) : sourceW;
    const sh = applyCrop ? Math.max(1, Math.floor(sourceH * cropHRatio)) : sourceH;
    const canvas = document.createElement('canvas');
    const previewScale = preview ? Math.min(1, 900 / sw, 900 / sh) : 1;
    canvas.width = Math.max(1, Math.floor(sw * previewScale));
    canvas.height = Math.max(1, Math.floor(sh * previewScale));
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.save();
    ctx.filter = `brightness(${d.brightness.value}%) contrast(${d.contrast.value}%) saturate(${d.saturate.value}%)`;
    ctx.translate(canvas.width / 2, canvas.height / 2);
    const scale = Number(d.scale.value) / 100;
    ctx.scale(scale * state.flipX, scale * state.flipY);
    ctx.drawImage(state.sourceImage, sx, sy, sw, sh, -canvas.width / 2, -canvas.height / 2, canvas.width, canvas.height);
    ctx.restore();
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    applyMixer(imageData);
    ctx.putImageData(imageData, 0, 0);
    return canvas;
  }

  function syncCropModeUI() {
    const d = bindDom();
    d.toggleCropModeButton.textContent = state.cropMode ? '取消裁剪' : '进入裁剪';
    d.toggleCropModeButton.classList.toggle('active', state.cropMode);
    d.confirmCropButton.hidden = !state.cropMode;
    d.confirmCropButton.style.display = state.cropMode ? '' : 'none';
    d.cropModeText.textContent = state.cropMode ? '已进入裁剪模式：请在左侧图片上拖拉选择保留区域，完成后点击“确认裁剪”。' : '当前未进入裁剪模式';
  }

  function drawCropOverlay(ctx, width, height) {
    if (!state.cropMode) return;
    const d = bindDom();
    const cropX = (Number(d.cropX.value) / 100) * width;
    const cropY = (Number(d.cropY.value) / 100) * height;
    const cropW = (Number(d.cropWidth.value) / 100) * width;
    const cropH = (Number(d.cropHeight.value) / 100) * height;
    ctx.save();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.strokeRect(cropX, cropY, cropW, cropH);
    ctx.setLineDash([6, 4]);
    ctx.strokeStyle = 'rgba(79, 110, 247, 0.95)';
    ctx.strokeRect(cropX, cropY, cropW, cropH);
    ctx.restore();
  }

  function pointerToCanvasPoint(event) {
    const d = bindDom();
    const rect = d.canvas.getBoundingClientRect();
    return {
      x: clamp(((event.clientX - rect.left) / rect.width) * d.canvas.width, 0, d.canvas.width),
      y: clamp(((event.clientY - rect.top) / rect.height) * d.canvas.height, 0, d.canvas.height),
    };
  }

  function updateCropFromDrag(start, current) {
    const d = bindDom();
    const minX = Math.min(start.x, current.x);
    const minY = Math.min(start.y, current.y);
    const width = Math.max(12, Math.abs(current.x - start.x));
    const height = Math.max(12, Math.abs(current.y - start.y));
    d.cropX.value = Math.round((minX / d.canvas.width) * 100);
    d.cropY.value = Math.round((minY / d.canvas.height) * 100);
    d.cropWidth.value = Math.round((width / d.canvas.width) * 100);
    d.cropHeight.value = Math.round((height / d.canvas.height) * 100);
  }

  function drawEditorCanvasNow() {
    state.drawQueued = false;
    const d = bindDom();
    if (!state.sourceImage || !d.canvas) return;
    syncLabels();
    const snapshot = getEditorSnapshotCanvas({ preview: true, applyCrop: !state.cropMode });
    if (!snapshot || snapshot.width <= 0 || snapshot.height <= 0) return;
    const maxW = 900, maxH = 620;
    const ratio = Math.min(maxW / snapshot.width, maxH / snapshot.height, 1);
    d.canvas.width = Math.max(1, Math.floor(snapshot.width * ratio));
    d.canvas.height = Math.max(1, Math.floor(snapshot.height * ratio));
    const ctx = d.canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, d.canvas.width, d.canvas.height);
    ctx.drawImage(snapshot, 0, 0, d.canvas.width, d.canvas.height);
    drawCropOverlay(ctx, d.canvas.width, d.canvas.height);
    updateHistogram(snapshot);
  }

  function drawEditorCanvas() {
    if (state.drawQueued) return;
    state.drawQueued = true;
    requestAnimationFrame(drawEditorCanvasNow);
  }

  function resetEditorControls() {
    const d = bindDom();
    state.flipX = 1; state.flipY = 1; state.cropMode = false;
    d.scale.value = 100; d.cropX.value = 0; d.cropY.value = 0; d.cropWidth.value = 100; d.cropHeight.value = 100;
    d.brightness.value = 100; d.contrast.value = 100; d.saturate.value = 100;
    MIXER_CHANNELS.forEach((channel) => { state.mixer[channel.key] = { hue: 0, saturation: 0, lightness: 0 }; });
    d.mixerControls?.querySelectorAll('input[type="range"]').forEach((input) => { input.value = 0; });
    syncCropModeUI();
    drawEditorCanvas();
  }

  async function openEditorModal(image) {
    await ensureEditorMarkup();
    bindDom();
    renderMixerControls();
    state.image = image;
    state.sourceImage = new Image();
    state.sourceImage.crossOrigin = 'anonymous';
    state.sourceImage.onload = () => {
      const d = bindDom();
      d.outputName.value = `${(image.name || 'edited-image').replace(/\.[^.]+$/, '')}-edited.png`;
      populateFolderSelect(d.outputFolder, image.folderId);
      setMessage('');
      d.backdrop.classList.remove('hidden');
      requestAnimationFrame(() => {
        resetEditorControls();
        drawEditorCanvas();
      });
    };
    state.sourceImage.onerror = () => {
      bindDom().backdrop.classList.remove('hidden');
      setMessage('原图加载失败，请关闭后重试。', 'error');
    };
    state.sourceImage.src = `${API_BASE_URL}${image.url}`;
  }

  function closeEditorModal() {
    const d = bindDom();
    d.backdrop.classList.add('hidden');
    state.cropDrag = null;
    state.cropMode = false;
  }

  function downloadEditedImage() {
    if (!state.image) return;
    const snapshot = getEditorSnapshotCanvas();
    if (!snapshot) return;
    const d = bindDom();
    const link = document.createElement('a');
    link.href = snapshot.toDataURL('image/png');
    link.download = `${(d.outputName.value || state.image.name || 'edited-image').replace(/\s+/g, '-')}`;
    link.click();
  }

  async function saveEditedCopy() {
    if (!state.image) return;
    const snapshot = getEditorSnapshotCanvas();
    if (!snapshot) return;
    const d = bindDom();
    const fileName = (d.outputName.value || `${state.image.name || 'edited-image'}-copy.png`).trim();
    const folderId = d.outputFolder.value || state.image.folderId;
    const blob = await new Promise((resolve) => snapshot.toBlob(resolve, 'image/png'));
    if (!blob) return setMessage('导出图片失败', 'error');
    const formData = new FormData();
    formData.append('image', blob, fileName);
    formData.append('folderId', folderId);
    formData.append('tags', (state.image.tags || []).join(','));
    formData.append('description', `编辑副本：${state.image.description || state.image.name || ''}`);
    const response = await fetch(`${API_BASE_URL}/api/images/upload`, { method: 'POST', body: formData });
    const data = await response.json();
    if (!response.ok) return setMessage(data.message || '保存副本失败', 'error');
    setMessage('编辑结果已保存为新图片');
    await refreshCollections();
  }

  function bindEvents() {
    const d = bindDom();
    if (d.backdrop.dataset.bound === '1') return;
    [d.scale, d.cropX, d.cropY, d.cropWidth, d.cropHeight, d.brightness, d.contrast, d.saturate].forEach((input) => input?.addEventListener('input', drawEditorCanvas));
    d.flipHorizontalButton?.addEventListener('click', () => { state.flipX *= -1; drawEditorCanvas(); });
    d.flipVerticalButton?.addEventListener('click', () => { state.flipY *= -1; drawEditorCanvas(); });
    d.toggleCropModeButton?.addEventListener('click', () => { state.cropMode = !state.cropMode; state.cropDrag = null; if (state.cropMode) setMessage('请在左侧图片上拖拉选择保留区域。'); syncCropModeUI(); drawEditorCanvas(); });
    d.confirmCropButton?.addEventListener('click', () => { state.cropMode = false; state.cropDrag = null; syncCropModeUI(); setMessage('裁剪区域已确认。'); drawEditorCanvas(); });
    d.closeButton?.addEventListener('click', closeEditorModal);
    d.backdrop?.addEventListener('click', (event) => { if (event.target === d.backdrop) closeEditorModal(); });
    d.resetButton?.addEventListener('click', resetEditorControls);
    d.applyPreviewButton?.addEventListener('click', drawEditorCanvas);
    d.downloadButton?.addEventListener('click', downloadEditedImage);
    d.saveCopyButton?.addEventListener('click', saveEditedCopy);
    d.canvas?.addEventListener('mousedown', (event) => {
      if (!state.sourceImage || !state.cropMode) return;
      const point = pointerToCanvasPoint(event);
      state.cropDrag = { start: point };
      updateCropFromDrag(point, point);
      drawEditorCanvas();
    });
    d.canvas?.addEventListener('mousemove', (event) => {
      if (!state.cropDrag || !state.cropMode) return;
      const point = pointerToCanvasPoint(event);
      updateCropFromDrag(state.cropDrag.start, point);
      drawEditorCanvas();
    });
    window.addEventListener('mouseup', (event) => {
      if (!state.cropDrag || !state.cropMode) return;
      const point = pointerToCanvasPoint(event);
      updateCropFromDrag(state.cropDrag.start, point);
      state.cropDrag = null;
      drawEditorCanvas();
    });
    d.backdrop.dataset.bound = '1';
  }

  return {
    async openEditorModal(image) {
      await ensureEditorMarkup();
      bindDom();
      bindEvents();
      return openEditorModal(image);
    },
    closeEditorModal
  };
}
