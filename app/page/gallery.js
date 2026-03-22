import API_BASE_URL from './config.js';
import { requireAuth } from './auth.js';

if (!requireAuth()) {
  throw new Error('UNAUTHENTICATED');
}

const folderList = document.getElementById('folder-list');
const folderSelect = document.getElementById('image-folder');
const folderForm = document.getElementById('folder-form');
const folderSearchInput = document.getElementById('folder-search-input');
const folderMessage = document.getElementById('folder-message');
const uploadBackdrop = document.getElementById('upload-modal-backdrop');
const openUploadModalButton = document.getElementById('open-upload-modal');
const closeUploadModalButton = document.getElementById('close-upload-modal');
const uploadForm = document.getElementById('upload-form');
const uploadMessage = document.getElementById('upload-message');
const fileInput = document.getElementById('image-file');
const preview = document.getElementById('upload-preview');
const searchInput = document.getElementById('search-input');
const galleryGrid = document.getElementById('gallery-grid');
const gallerySummary = document.getElementById('gallery-summary');
const galleryPaginationInfo = document.getElementById('gallery-pagination-info');
const galleryPageIndicator = document.getElementById('gallery-page-indicator');
const galleryPrevPage = document.getElementById('gallery-prev-page');
const galleryNextPage = document.getElementById('gallery-next-page');
const editBackdrop = document.getElementById('edit-modal-backdrop');
const editForm = document.getElementById('edit-form');
const editMessage = document.getElementById('edit-message');
const closeEditModalButton = document.getElementById('close-edit-modal');
const editFolderSelect = document.getElementById('edit-image-folder');
const previewBackdrop = document.getElementById('preview-modal-backdrop');
const previewImage = document.getElementById('preview-full-image');
const previewTitle = document.getElementById('preview-title');
const previewDescription = document.getElementById('preview-description');
const previewFolder = document.getElementById('preview-folder');
const previewTime = document.getElementById('preview-time');
const previewSize = document.getElementById('preview-size');
const previewTags = document.getElementById('preview-tags');
const closePreviewModalButton = document.getElementById('close-preview-modal');
const previewPrevButton = document.getElementById('preview-prev');
const previewNextButton = document.getElementById('preview-next');
const previewDownloadButton = document.getElementById('preview-download');
const previewEditButton = document.getElementById('preview-edit');
const previewOpenEditorButton = document.getElementById('preview-open-editor');
const batchToolbar = document.getElementById('batch-toolbar');
const selectAllCheckbox = document.getElementById('select-all-checkbox');
const selectedCount = document.getElementById('selected-count');
const batchFolderSelect = document.getElementById('batch-folder-select');
const batchDownloadButton = document.getElementById('batch-download-button');
const batchMoveButton = document.getElementById('batch-move-button');
const batchDeleteButton = document.getElementById('batch-delete-button');
const editorBackdrop = document.getElementById('editor-modal-backdrop');
const closeEditorModalButton = document.getElementById('close-editor-modal');
const editorResetButton = document.getElementById('editor-reset');
const editorDownloadButton = document.getElementById('editor-download');
const editorApplyPreviewButton = document.getElementById('editor-apply-preview');
const editorSaveCopyButton = document.getElementById('editor-save-copy');
const editorCanvas = document.getElementById('editor-canvas');
const editorRotate = document.getElementById('editor-rotate');
const editorScale = document.getElementById('editor-scale');
const editorCropX = document.getElementById('editor-crop-x');
const editorCropY = document.getElementById('editor-crop-y');
const editorCropWidth = document.getElementById('editor-crop-width');
const editorCropHeight = document.getElementById('editor-crop-height');
const editorBrightness = document.getElementById('editor-brightness');
const editorContrast = document.getElementById('editor-contrast');
const editorSaturate = document.getElementById('editor-saturate');
const editorRotateValue = document.getElementById('editor-rotate-value');
const editorScaleValue = document.getElementById('editor-scale-value');
const editorCropXValue = document.getElementById('editor-crop-x-value');
const editorCropYValue = document.getElementById('editor-crop-y-value');
const editorCropWidthValue = document.getElementById('editor-crop-width-value');
const editorCropHeightValue = document.getElementById('editor-crop-height-value');
const editorBrightnessValue = document.getElementById('editor-brightness-value');
const editorContrastValue = document.getElementById('editor-contrast-value');
const editorSaturateValue = document.getElementById('editor-saturate-value');
const editorOutputName = document.getElementById('editor-output-name');
const editorOutputFolder = document.getElementById('editor-output-folder');
const editorMessage = document.getElementById('editor-message');

let folders = [];
let images = [];
let selectedFolder = 'all';
let currentPreviewIndex = -1;
let currentPage = 1;
const pageSize = 9;
let selectedImages = new Set();
let editorImage = null;
let editorSourceImage = null;

function setMessage(el, text, type = 'success') {
  el.textContent = text;
  el.className = type === 'success' ? 'status-message success' : 'error';
}

function folderDisplayName(folder) {
  if (!folder) return '未分类';
  if (folder.id === 'all-assets') return '未分类';
  return folder.name;
}

function populateFolderSelect(selectEl, selectedValue = '') {
  selectEl.innerHTML = '';
  folders.forEach((folder) => {
    const option = document.createElement('option');
    option.value = folder.id;
    option.textContent = folderDisplayName(folder);
    option.selected = folder.id === selectedValue;
    selectEl.appendChild(option);
  });
}

function renderFolders() {
  folderList.innerHTML = '';
  populateFolderSelect(folderSelect, folderSelect.value);
  populateFolderSelect(editFolderSelect, editFolderSelect.value);
  populateFolderSelect(batchFolderSelect, batchFolderSelect.value);
  populateFolderSelect(editorOutputFolder, editorOutputFolder.value);

  const folderKeyword = (folderSearchInput?.value || '').trim().toLowerCase();

  const allWrap = document.createElement('div');
  allWrap.className = 'folder-item-row';
  allWrap.innerHTML = `
    <button type="button" class="folder-item ${selectedFolder === 'all' ? 'active' : ''}">全部图片</button>
    <span class="folder-item-placeholder"></span>
  `;
  allWrap.querySelector('.folder-item').addEventListener('click', () => {
    selectedFolder = 'all';
    if (folderSelect) folderSelect.value = 'all-assets';
    renderFolders();
    renderImages();
  });
  folderList.appendChild(allWrap);

  const normalizedCounts = images
    .map(normalizedImage)
    .reduce((acc, image) => {
      acc[image.folderId] = (acc[image.folderId] || 0) + 1;
      return acc;
    }, {});

  folders
    .filter((folder) => folder.id !== 'all-assets')
    .map((folder) => ({ ...folder, imageCount: normalizedCounts[folder.id] ?? folder.imageCount ?? 0 }))
    .filter((folder) => !folderKeyword || folderDisplayName(folder).toLowerCase().includes(folderKeyword))
    .forEach((folder) => {
      const wrap = document.createElement('div');
      wrap.className = 'folder-item-row';
      wrap.innerHTML = `
        <button type="button" class="folder-item ${selectedFolder === folder.id ? 'active' : ''}">${folderDisplayName(folder)} · ${folder.imageCount ?? 0}</button>
        ${folder.id !== 'all-assets' ? '<div class="folder-item-side-actions"><button type="button" class="folder-download-btn" title="下载文件夹">⬇</button><button type="button" class="folder-delete-btn" title="删除文件夹">🗑</button></div>' : '<span class="folder-item-placeholder"></span>'}
      `;
      wrap.querySelector('.folder-item').addEventListener('click', () => {
        selectedFolder = folder.id;
        if (folderSelect) folderSelect.value = folder.id;
        renderFolders();
        renderImages();
      });
      const downloadBtn = wrap.querySelector('.folder-download-btn');
      if (downloadBtn) {
        downloadBtn.addEventListener('click', (event) => {
          event.stopPropagation();
          downloadFolder(folder.id);
        });
      }
      const deleteBtn = wrap.querySelector('.folder-delete-btn');
      if (deleteBtn) {
        deleteBtn.addEventListener('click', async (event) => {
          event.stopPropagation();
          const hasImages = (folder.imageCount ?? 0) > 0;
          const ok = confirm(
            hasImages
              ? `文件夹“${folder.name}”中还有 ${folder.imageCount} 张图片。删除后文件夹会进入回收站，但图片会保留。确认继续？`
              : `确认删除文件夹“${folder.name}”吗？删除后会进入回收站。`
          );
          if (!ok) return;
          const response = await fetch(`${API_BASE_URL}/api/folders/${folder.id}`, { method: 'DELETE' });
          const data = await response.json();
          if (!response.ok) return setMessage(folderMessage, data.message || '删除文件夹失败', 'error');
          setMessage(folderMessage, '文件夹已移入回收站');
          if (selectedFolder === folder.id) selectedFolder = 'all';
          await Promise.all([loadFolders(), loadImages()]);
        });
      }
      folderList.appendChild(wrap);
    });
}

function openUploadModal() {
  uploadBackdrop?.classList.remove('hidden');
}

function closeUploadModal() {
  uploadBackdrop?.classList.add('hidden');
}

function renderPreview() {
  const file = fileInput.files?.[0];
  if (!file) {
    preview.innerHTML = '<div class="empty-state">选择图片后会在这里展示预览。</div>';
    return;
  }
  const url = URL.createObjectURL(file);
  preview.innerHTML = `
    <div class="preview-card">
      <img src="${url}" alt="预览图" class="preview-image">
      <div class="preview-meta">
        <strong>${file.name}</strong>
        <span>${Math.ceil(file.size / 1024)} KB</span>
      </div>
    </div>
  `;
}

function normalizedImage(image) {
  const knownFolder = folders.find((folder) => folder.id === image.folderId);
  if (knownFolder) {
    return {
      ...image,
      folderName: image.folderName || folderDisplayName(knownFolder),
      folderId: image.folderId,
    };
  }
  return {
    ...image,
    folderId: 'unclassified',
    folderName: image.folderName || '未分类',
  };
}

function filteredImages() {
  const keyword = searchInput.value.trim().toLowerCase();
  return images
    .map(normalizedImage)
    .filter((image) => {
      const matchFolder = selectedFolder === 'all' || image.folderId === selectedFolder;
      const haystack = `${image.name} ${image.description || ''} ${(image.tags || []).join(' ')}`.toLowerCase();
      const matchKeyword = !keyword || haystack.includes(keyword);
      return matchFolder && matchKeyword;
    });
}

function updateBatchToolbar() {
  const list = filteredImages();
  const visibleSelectedCount = list.filter((image) => selectedImages.has(image.id)).length;
  batchToolbar.classList.toggle('hidden', list.length === 0);
  selectedCount.textContent = `已选择 ${selectedImages.size} 张`;
  selectAllCheckbox.checked = list.length > 0 && visibleSelectedCount === list.length;
  if (batchDownloadButton) batchDownloadButton.disabled = selectedImages.size === 0;
  batchMoveButton.disabled = selectedImages.size === 0;
  batchDeleteButton.disabled = selectedImages.size === 0;
}

function toggleImageSelection(imageId, checked) {
  if (checked) selectedImages.add(imageId);
  else selectedImages.delete(imageId);
  updateBatchToolbar();
}

function openEditModal(image) {
  document.getElementById('edit-image-id').value = image.id;
  document.getElementById('edit-image-name').value = image.name || '';
  document.getElementById('edit-image-tags').value = (image.tags || []).join(', ');
  document.getElementById('edit-image-description').value = image.description || '';
  populateFolderSelect(editFolderSelect, image.folderId);
  editMessage.textContent = '';
  editBackdrop.classList.remove('hidden');
}

function closeEditModal() { editBackdrop.classList.add('hidden'); }

function fillPreview(image) {
  previewImage.src = `${API_BASE_URL}${image.url}`;
  previewImage.alt = image.name;
  previewTitle.textContent = image.name || '未命名图片';
  previewDescription.textContent = image.description || '暂无图片说明';
  previewFolder.textContent = image.folderName || '未分类';
  previewTime.textContent = image.uploadedAt || '--';
  previewSize.textContent = image.sizeLabel || '--';
  previewTags.innerHTML = (image.tags || []).length
    ? image.tags.map((tag) => `<span class="tag">#${tag}</span>`).join('')
    : '<span class="tag muted-tag">暂无标签</span>';
}

function openPreviewModal(imageId) {
  const list = filteredImages();
  currentPreviewIndex = list.findIndex((image) => image.id === imageId);
  if (currentPreviewIndex < 0) return;
  fillPreview(list[currentPreviewIndex]);
  previewBackdrop.classList.remove('hidden');
}

function closePreviewModal() { previewBackdrop.classList.add('hidden'); }

function movePreview(step) {
  const list = filteredImages();
  if (!list.length) return;
  currentPreviewIndex = (currentPreviewIndex + step + list.length) % list.length;
  fillPreview(list[currentPreviewIndex]);
}

function syncEditorLabels() {
  editorRotateValue.textContent = `${editorRotate.value}°`;
  editorScaleValue.textContent = `${editorScale.value}%`;
  editorCropXValue.textContent = `${editorCropX.value}%`;
  editorCropYValue.textContent = `${editorCropY.value}%`;
  editorCropWidthValue.textContent = `${editorCropWidth.value}%`;
  editorCropHeightValue.textContent = `${editorCropHeight.value}%`;
  editorBrightnessValue.textContent = `${editorBrightness.value}%`;
  editorContrastValue.textContent = `${editorContrast.value}%`;
  editorSaturateValue.textContent = `${editorSaturate.value}%`;
}

function getEditorSnapshotCanvas() {
  if (!editorSourceImage) return null;
  const sourceW = editorSourceImage.naturalWidth || editorSourceImage.width;
  const sourceH = editorSourceImage.naturalHeight || editorSourceImage.height;
  const cropXRatio = Number(editorCropX.value) / 100;
  const cropYRatio = Number(editorCropY.value) / 100;
  const cropWRatio = Number(editorCropWidth.value) / 100;
  const cropHRatio = Number(editorCropHeight.value) / 100;
  const sx = Math.floor(sourceW * cropXRatio);
  const sy = Math.floor(sourceH * cropYRatio);
  const sw = Math.max(1, Math.floor(sourceW * cropWRatio));
  const sh = Math.max(1, Math.floor(sourceH * cropHRatio));
  const canvas = document.createElement('canvas');
  canvas.width = sw;
  canvas.height = sh;
  const ctx = canvas.getContext('2d');
  ctx.save();
  ctx.filter = `brightness(${editorBrightness.value}%) contrast(${editorContrast.value}%) saturate(${editorSaturate.value}%)`;
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate((Number(editorRotate.value) * Math.PI) / 180);
  const scale = Number(editorScale.value) / 100;
  ctx.scale(scale, scale);
  ctx.drawImage(editorSourceImage, sx, sy, sw, sh, -canvas.width / 2, -canvas.height / 2, canvas.width, canvas.height);
  ctx.restore();
  return canvas;
}

function drawEditorCanvas() {
  if (!editorSourceImage) return;
  syncEditorLabels();
  const snapshot = getEditorSnapshotCanvas();
  if (!snapshot) return;
  const maxW = 760;
  const maxH = 520;
  const ratio = Math.min(maxW / snapshot.width, maxH / snapshot.height, 1);
  editorCanvas.width = Math.max(1, Math.floor(snapshot.width * ratio));
  editorCanvas.height = Math.max(1, Math.floor(snapshot.height * ratio));
  const ctx = editorCanvas.getContext('2d');
  ctx.clearRect(0, 0, editorCanvas.width, editorCanvas.height);
  ctx.drawImage(snapshot, 0, 0, editorCanvas.width, editorCanvas.height);
}

function resetEditorControls() {
  editorRotate.value = 0;
  editorScale.value = 100;
  editorCropX.value = 0;
  editorCropY.value = 0;
  editorCropWidth.value = 100;
  editorCropHeight.value = 100;
  editorBrightness.value = 100;
  editorContrast.value = 100;
  editorSaturate.value = 100;
  drawEditorCanvas();
}

function openEditorModal(image) {
  editorImage = image;
  editorSourceImage = new Image();
  editorSourceImage.crossOrigin = 'anonymous';
  editorSourceImage.onload = () => {
    editorOutputName.value = `${(image.name || 'edited-image').replace(/\.[^.]+$/, '')}-edited.png`;
    populateFolderSelect(editorOutputFolder, image.folderId);
    resetEditorControls();
    editorMessage.textContent = '';
    editorBackdrop.classList.remove('hidden');
  };
  editorSourceImage.src = `${API_BASE_URL}${image.url}`;
}

function closeEditorModal() { editorBackdrop.classList.add('hidden'); }

function downloadEditedImage() {
  if (!editorImage) return;
  const snapshot = getEditorSnapshotCanvas();
  if (!snapshot) return;
  const link = document.createElement('a');
  link.href = snapshot.toDataURL('image/png');
  link.download = `${(editorOutputName.value || editorImage.name || 'edited-image').replace(/\s+/g, '-')}`;
  link.click();
}

async function saveEditedCopy() {
  if (!editorImage) return;
  const snapshot = getEditorSnapshotCanvas();
  if (!snapshot) return;
  const fileName = (editorOutputName.value || `${editorImage.name || 'edited-image'}-copy.png`).trim();
  const folderId = editorOutputFolder.value || editorImage.folderId;
  const blob = await new Promise((resolve) => snapshot.toBlob(resolve, 'image/png'));
  if (!blob) return setMessage(editorMessage, '导出图片失败', 'error');
  const formData = new FormData();
  formData.append('image', blob, fileName);
  formData.append('folderId', folderId);
  formData.append('tags', (editorImage.tags || []).join(','));
  formData.append('description', `编辑副本：${editorImage.description || editorImage.name || ''}`);
  const response = await fetch(`${API_BASE_URL}/api/images/upload`, { method: 'POST', body: formData });
  const data = await response.json();
  if (!response.ok) return setMessage(editorMessage, data.message || '保存副本失败', 'error');
  setMessage(editorMessage, '编辑结果已保存为新图片');
  await Promise.all([loadFolders(), loadImages()]);
}

async function deleteImage(imageId) {
  const ok = confirm('确认删除这张图片吗？删除后会进入回收站，你可以恢复。');
  if (!ok) return;
  const response = await fetch(`${API_BASE_URL}/api/images/${imageId}`, { method: 'DELETE' });
  const data = await response.json();
  if (!response.ok) return alert(data.message || '删除失败');
  selectedImages.delete(imageId);
  closePreviewModal();
  await Promise.all([loadFolders(), loadImages()]);
}

async function batchDeleteImages() {
  if (selectedImages.size === 0) return;
  const ok = confirm(`确认批量删除这 ${selectedImages.size} 张图片吗？它们会先进入回收站。`);
  if (!ok) return;
  const response = await fetch(`${API_BASE_URL}/api/images/batch-delete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids: Array.from(selectedImages) })
  });
  const data = await response.json();
  if (!response.ok) return alert(data.message || '批量删除失败');
  selectedImages.clear();
  await Promise.all([loadFolders(), loadImages()]);
}

async function batchMoveImages() {
  if (selectedImages.size === 0) return;
  const response = await fetch(`${API_BASE_URL}/api/images/batch-move`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids: Array.from(selectedImages), folderId: batchFolderSelect.value })
  });
  const data = await response.json();
  if (!response.ok) return alert(data.message || '批量移动失败');
  await Promise.all([loadFolders(), loadImages()]);
}

function triggerDownload(url) {
  const link = document.createElement('a');
  link.href = url;
  link.target = '_blank';
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  link.remove();
}

function downloadImage(imageId) {
  triggerDownload(`${API_BASE_URL}/api/images/${imageId}/download`);
}

function downloadFolder(folderId) {
  if (!folderId || folderId === 'all' || folderId === 'all-assets') {
    alert('请选择具体文件夹后再下载。');
    return;
  }
  triggerDownload(`${API_BASE_URL}/api/folders/${folderId}/download`);
}

async function batchDownloadImages() {
  if (selectedImages.size === 0) return;
  const response = await fetch(`${API_BASE_URL}/api/images/download-batch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids: Array.from(selectedImages) })
  });
  if (!response.ok) {
    let message = '批量下载失败';
    try {
      const data = await response.json();
      message = data.message || message;
    } catch (_) {}
    alert(message);
    return;
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'selected-images.zip';
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function renderImages() {
  const list = filteredImages();
  const totalPages = Math.max(1, Math.ceil(list.length / pageSize));
  if (currentPage > totalPages) currentPage = totalPages;
  const pagedList = list.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  galleryGrid.innerHTML = '';
  if (gallerySummary) gallerySummary.textContent = `${list.length} 张图片`;
  if (galleryPaginationInfo) galleryPaginationInfo.textContent = `共 ${list.length} 张图片`;
  if (galleryPageIndicator) galleryPageIndicator.textContent = `第 ${currentPage} / ${totalPages} 页`;
  if (galleryPrevPage) galleryPrevPage.disabled = currentPage <= 1;
  if (galleryNextPage) galleryNextPage.disabled = currentPage >= totalPages;

  if (!pagedList.length) {
    galleryGrid.innerHTML = '<div class="empty-state">当前条件下还没有图片，先上传一张试试。</div>';
    updateBatchToolbar();
    return;
  }
  pagedList.forEach((image) => {
    const card = document.createElement('article');
    card.className = 'image-card';
    card.innerHTML = `
      <div class="image-card-check">
        <label class="checkbox-line">
          <input type="checkbox" class="image-select-checkbox" ${selectedImages.has(image.id) ? 'checked' : ''}>
          <span>选择</span>
        </label>
      </div>
      <div class="image-thumb-wrap image-clickable-zone">
        <img src="${API_BASE_URL}${image.url}" alt="${image.name}" class="image-thumb">
      </div>
      <div class="image-card-body">
        <div>
          <h4>${image.name}</h4>
          <p>${image.description || '暂无图片说明'}</p>
        </div>
        <div class="image-card-meta">
          <span>${image.folderName || '未分类'}</span>
          <span>${image.sizeLabel || ''}</span>
          <span>${image.uploadedAt || ''}</span>
        </div>
        <div class="tag-list">${(image.tags || []).map((tag) => `<span class="tag">#${tag}</span>`).join('')}</div>
        <div class="image-actions">
          <button type="button" class="ghost-button image-action-btn preview-btn">预览</button>
          <button type="button" class="ghost-button image-action-btn download-btn">下载</button>
          <button type="button" class="ghost-button image-action-btn editor-btn">编辑器</button>
          <button type="button" class="ghost-button image-action-btn edit-btn">信息</button>
          <button type="button" class="ghost-button image-action-btn danger-btn delete-btn">删除</button>
        </div>
      </div>
    `;
    card.querySelector('.image-select-checkbox').addEventListener('change', (event) => toggleImageSelection(image.id, event.target.checked));
    card.querySelector('.preview-btn').addEventListener('click', () => openPreviewModal(image.id));
    card.querySelector('.download-btn').addEventListener('click', () => downloadImage(image.id));
    card.querySelector('.editor-btn').addEventListener('click', () => openEditorModal(image));
    card.querySelector('.image-clickable-zone').addEventListener('click', () => openPreviewModal(image.id));
    card.querySelector('.edit-btn').addEventListener('click', () => openEditModal(image));
    card.querySelector('.delete-btn').addEventListener('click', () => deleteImage(image.id));
    galleryGrid.appendChild(card);
  });
  updateBatchToolbar();
}

async function loadFolders() {
  const response = await fetch(`${API_BASE_URL}/api/folders`);
  const data = await response.json();
  folders = data.folders || [];
  renderFolders();
}

async function loadImages() {
  const response = await fetch(`${API_BASE_URL}/api/images`);
  const data = await response.json();
  images = data.images || [];
  renderImages();
}

folderForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const folderName = document.getElementById('folder-name').value.trim();
  if (!folderName) return setMessage(folderMessage, '请输入文件夹名称', 'error');
  const response = await fetch(`${API_BASE_URL}/api/folders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: folderName })
  });
  const data = await response.json();
  if (!response.ok) return setMessage(folderMessage, data.message || '创建文件夹失败', 'error');
  document.getElementById('folder-name').value = '';
  setMessage(folderMessage, '文件夹已创建');
  await loadFolders();
});

uploadForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const file = fileInput.files?.[0];
  if (!file) return setMessage(uploadMessage, '请先选择图片文件', 'error');
  const formData = new FormData();
  formData.append('image', file);
  formData.append('folderId', folderSelect.value);
  formData.append('tags', document.getElementById('image-tags').value);
  formData.append('description', document.getElementById('image-description').value);
  const targetFolderId = folderSelect.value;
  const validFolder = folders.find((folder) => folder.id === targetFolderId);
  if (!validFolder && targetFolderId !== 'all-assets') {
    return setMessage(uploadMessage, '当前选择的文件夹不存在或已失效，请重新选择后再上传。', 'error');
  }
  const response = await fetch(`${API_BASE_URL}/api/images/upload`, { method: 'POST', body: formData });
  const data = await response.json();
  if (!response.ok) return setMessage(uploadMessage, data.message || '上传失败', 'error');
  uploadForm.reset();
  renderPreview();
  selectedFolder = targetFolderId || 'all';
  setMessage(uploadMessage, targetFolderId ? '图片已上传，并切换到对应文件夹。' : '图片已上传到图库');
  await Promise.all([loadFolders(), loadImages()]);
  closeUploadModal();
});

editForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const submitButton = editForm.querySelector('button[type="submit"]');
  const imageId = document.getElementById('edit-image-id').value;
  const payload = {
    name: document.getElementById('edit-image-name').value.trim(),
    folderId: document.getElementById('edit-image-folder').value,
    tags: document.getElementById('edit-image-tags').value,
    description: document.getElementById('edit-image-description').value.trim()
  };

  if (!imageId) {
    return setMessage(editMessage, '未找到要保存的图片，请重新打开编辑弹窗。', 'error');
  }

  if (submitButton) submitButton.disabled = true;
  setMessage(editMessage, '正在保存...', 'success');

  try {
    const response = await fetch(`${API_BASE_URL}/api/images/${imageId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    let data = {};
    try {
      data = await response.json();
    } catch (_) {}

    if (!response.ok) {
      return setMessage(editMessage, data.message || '保存失败', 'error');
    }

    setMessage(editMessage, '修改已保存');
    await Promise.all([loadFolders(), loadImages()]);
    setTimeout(() => {
      closeEditModal();
      const latestImage = images.find((image) => image.id === imageId);
      if (latestImage) {
        fillPreview(normalizedImage(latestImage));
        currentPreviewIndex = filteredImages().findIndex((image) => image.id === imageId);
        previewBackdrop?.classList.remove('hidden');
      }
    }, 700);
  } catch (error) {
    setMessage(editMessage, error?.message || '保存失败，请稍后重试', 'error');
  } finally {
    if (submitButton) submitButton.disabled = false;
  }
});

selectAllCheckbox?.addEventListener('change', (event) => {
  const list = filteredImages();
  list.forEach((image) => event.target.checked ? selectedImages.add(image.id) : selectedImages.delete(image.id));
  renderImages();
});

[editorRotate, editorScale, editorCropX, editorCropY, editorCropWidth, editorCropHeight, editorBrightness, editorContrast, editorSaturate].forEach((input) => {
  input?.addEventListener('input', drawEditorCanvas);
});

openUploadModalButton?.addEventListener('click', openUploadModal);
closeUploadModalButton?.addEventListener('click', closeUploadModal);
uploadBackdrop?.addEventListener('click', (event) => {
  if (event.target === uploadBackdrop) closeUploadModal();
});

batchDownloadButton?.addEventListener('click', batchDownloadImages);
batchMoveButton?.addEventListener('click', batchMoveImages);
batchDeleteButton?.addEventListener('click', batchDeleteImages);
closeEditModalButton?.addEventListener('click', closeEditModal);
editBackdrop?.addEventListener('click', (event) => { if (event.target === editBackdrop) closeEditModal(); });
closePreviewModalButton?.addEventListener('click', closePreviewModal);
previewBackdrop?.addEventListener('click', (event) => { if (event.target === previewBackdrop) closePreviewModal(); });
previewPrevButton?.addEventListener('click', () => movePreview(-1));
previewNextButton?.addEventListener('click', () => movePreview(1));
previewDownloadButton?.addEventListener('click', () => {
  const list = filteredImages();
  if (currentPreviewIndex < 0 || !list[currentPreviewIndex]) return;
  downloadImage(list[currentPreviewIndex].id);
});
previewEditButton?.addEventListener('click', () => {
  const list = filteredImages();
  if (currentPreviewIndex < 0 || !list[currentPreviewIndex]) return;
  closePreviewModal();
  openEditModal(list[currentPreviewIndex]);
});
previewOpenEditorButton?.addEventListener('click', () => {
  const list = filteredImages();
  if (currentPreviewIndex < 0 || !list[currentPreviewIndex]) return;
  closePreviewModal();
  openEditorModal(list[currentPreviewIndex]);
});
closeEditorModalButton?.addEventListener('click', closeEditorModal);
editorBackdrop?.addEventListener('click', (event) => { if (event.target === editorBackdrop) closeEditorModal(); });
editorResetButton?.addEventListener('click', resetEditorControls);
editorApplyPreviewButton?.addEventListener('click', drawEditorCanvas);
editorDownloadButton?.addEventListener('click', downloadEditedImage);
editorSaveCopyButton?.addEventListener('click', saveEditedCopy);
fileInput?.addEventListener('change', renderPreview);
searchInput?.addEventListener('input', () => {
  currentPage = 1;
  renderImages();
});
folderSearchInput?.addEventListener('input', renderFolders);

galleryPrevPage?.addEventListener('click', () => {
  if (currentPage > 1) {
    currentPage -= 1;
    renderImages();
  }
});

galleryNextPage?.addEventListener('click', () => {
  currentPage += 1;
  renderImages();
});

document.addEventListener('keydown', (event) => {
  if (previewBackdrop && !previewBackdrop.classList.contains('hidden')) {
    if (event.key === 'Escape') closePreviewModal();
    if (event.key === 'ArrowLeft') movePreview(-1);
    if (event.key === 'ArrowRight') movePreview(1);
  }
  if (editorBackdrop && !editorBackdrop.classList.contains('hidden') && event.key === 'Escape') closeEditorModal();
});

document.addEventListener('DOMContentLoaded', async () => {
  await Promise.all([loadFolders(), loadImages()]);
  updateBatchToolbar();
  syncEditorLabels();
});
