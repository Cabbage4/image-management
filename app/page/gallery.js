import API_BASE_URL from './config.js';
import { initImageEditor } from './editor.js';

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
const galleryLoading = document.getElementById('gallery-loading');
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
const previewEditButton = document.getElementById('preview-edit');
const previewOpenEditorButton = document.getElementById('preview-open-editor');
const previewDownloadButton = document.getElementById('preview-download');
const batchToolbar = document.getElementById('batch-toolbar');
const selectAllCheckbox = document.getElementById('select-all-checkbox');
const selectedCount = document.getElementById('selected-count');
const batchFolderSelect = document.getElementById('batch-folder-select');
const batchDownloadButton = document.getElementById('batch-download-button');
const batchMoveButton = document.getElementById('batch-move-button');
const batchDeleteButton = document.getElementById('batch-delete-button');

let folders = [];
let images = [];
let selectedFolder = 'all';
let currentPreviewIndex = -1;
let currentPage = 1;
const pageSize = 8;
let selectedImages = new Set();

function getImageById(imageId) {
  return images.map(normalizedImage).find((image) => image.id === imageId) || null;
}

async function refreshCollections() {
  await Promise.all([loadFolders(), loadImages()]);
}

const imageEditor = initImageEditor({
  API_BASE_URL,
  populateFolderSelect,
  refreshCollections,
  getFolders: () => folders
});

function setMessage(el, text, type = 'success') {
  if (!el) return;
  el.textContent = text;
  el.className = type === 'success' ? 'status-message success' : 'error';
}

function setGalleryLoading(isLoading, text = '正在加载图片列表，请稍候...') {
  if (!galleryLoading) return;
  galleryLoading.textContent = text;
  galleryLoading.style.display = isLoading ? 'flex' : 'none';
}

function folderDisplayName(folder) {
  if (!folder) return '未分类';
  if (folder.id === 'all-assets') return '未分类';
  return folder.name;
}

function populateFolderSelect(selectEl, selectedValue = '') {
  if (!selectEl) return;
  selectEl.innerHTML = '';
  folders.forEach((folder) => {
    const option = document.createElement('option');
    option.value = folder.id;
    option.textContent = folderDisplayName(folder);
    option.selected = folder.id === selectedValue;
    selectEl.appendChild(option);
  });
}

function normalizedImage(image) {
  const knownFolder = folders.find((folder) => folder.id === image.folderId);
  return {
    ...image,
    folderId: knownFolder ? image.folderId : 'unclassified',
    folderName: knownFolder ? folderDisplayName(knownFolder) : '未分类',
    sizeLabel: image.size ? `${Math.ceil(image.size / 1024)} KB` : '--'
  };
}

function filteredImages() {
  const keyword = (searchInput?.value || '').trim().toLowerCase();
  return images
    .map(normalizedImage)
    .filter((image) => {
      const matchFolder = selectedFolder === 'all' || image.folderId === selectedFolder;
      const haystack = `${image.name || ''} ${image.description || ''} ${(image.tags || []).join(' ')}`.toLowerCase();
      return matchFolder && (!keyword || haystack.includes(keyword));
    });
}

function updateBatchToolbar() {
  if (!batchToolbar) return;
  const list = filteredImages();
  batchToolbar.classList.toggle('hidden', list.length === 0);
  selectedCount.textContent = `已选择 ${selectedImages.size} 张`;
  if (batchDownloadButton) batchDownloadButton.disabled = selectedImages.size === 0;
  if (batchMoveButton) batchMoveButton.disabled = selectedImages.size === 0;
  if (batchDeleteButton) batchDeleteButton.disabled = selectedImages.size === 0;
  if (selectAllCheckbox) {
    const visibleSelected = list.filter((image) => selectedImages.has(image.id)).length;
    selectAllCheckbox.checked = list.length > 0 && visibleSelected === list.length;
  }
}

function renderFolders() {
  if (!folderList) return;
  populateFolderSelect(folderSelect, folderSelect?.value || '');
  populateFolderSelect(editFolderSelect, editFolderSelect?.value || '');
  populateFolderSelect(batchFolderSelect, batchFolderSelect?.value || '');

  const folderKeyword = (folderSearchInput?.value || '').trim().toLowerCase();
  const normalizedCounts = images.map(normalizedImage).reduce((acc, image) => {
    acc[image.folderId] = (acc[image.folderId] || 0) + 1;
    return acc;
  }, {});

  const rows = [
    `<div class="folder-item-row"><button type="button" class="folder-item ${selectedFolder === 'all' ? 'active' : ''}" data-folder-id="all">全部图片</button><span class="folder-item-placeholder"></span></div>`,
    ...folders
      .filter((folder) => folder.id !== 'all-assets')
      .map((folder) => ({ ...folder, imageCount: normalizedCounts[folder.id] ?? folder.imageCount ?? 0 }))
      .filter((folder) => !folderKeyword || folderDisplayName(folder).toLowerCase().includes(folderKeyword))
      .map((folder) => `
        <div class="folder-item-row">
          <button type="button" class="folder-item ${selectedFolder === folder.id ? 'active' : ''}" data-folder-id="${folder.id}">${folderDisplayName(folder)} · ${folder.imageCount ?? 0}</button>
          <div class="folder-item-actions">
            <button type="button" class="ghost-button tiny-btn folder-download-btn" data-action="download" data-folder-id="${folder.id}" title="下载文件夹">下载</button>
            <button type="button" class="ghost-button tiny-btn danger-btn folder-delete-btn" data-action="delete" data-folder-id="${folder.id}" title="删除文件夹">删除</button>
          </div>
        </div>
      `)
  ];

  folderList.innerHTML = rows.join('');
  if (rows.length === 1) {
    folderList.insertAdjacentHTML('beforeend', '<div class="empty-state">当前没有可展示的文件夹</div>');
  }
}

function fillPreview(image) {
  previewImage.src = `${API_BASE_URL}${image.url}`;
  previewImage.alt = image.name || '图片';
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
  previewBackdrop?.classList.remove('hidden');
}

function closePreviewModal() {
  previewBackdrop?.classList.add('hidden');
}

function movePreview(step) {
  const list = filteredImages();
  if (!list.length) return;
  currentPreviewIndex = (currentPreviewIndex + step + list.length) % list.length;
  fillPreview(list[currentPreviewIndex]);
}

function renderImages() {
  if (!galleryGrid) return;
  const list = filteredImages();
  const totalPages = Math.max(1, Math.ceil(list.length / pageSize));
  if (currentPage > totalPages) currentPage = totalPages;
  const pageList = list.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  galleryGrid.innerHTML = '';
  galleryPaginationInfo.textContent = `共 ${list.length} 张图片 · 每页 8 张`;
  galleryPageIndicator.textContent = `第 ${currentPage} / ${totalPages} 页`;
  galleryPrevPage.disabled = currentPage <= 1;
  galleryNextPage.disabled = currentPage >= totalPages;

  if (!pageList.length) {
    galleryGrid.innerHTML = '<div class="empty-state">当前条件下还没有图片。</div>';
    updateBatchToolbar();
    return;
  }

  pageList.forEach((image) => {
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
          <span>${image.folderName}</span>
          <span>${image.sizeLabel}</span>
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
    card.querySelector('.image-select-checkbox')?.addEventListener('change', (event) => {
      if (event.target.checked) selectedImages.add(image.id);
      else selectedImages.delete(image.id);
      updateBatchToolbar();
    });
    card.querySelector('.preview-btn')?.addEventListener('click', () => openPreviewModal(image.id));
    card.querySelector('.image-clickable-zone')?.addEventListener('click', () => openPreviewModal(image.id));
    card.querySelector('.download-btn')?.addEventListener('click', () => {
      const link = document.createElement('a');
      link.href = `${API_BASE_URL}/api/images/${image.id}/download`;
      link.click();
    });
    card.querySelector('.editor-btn')?.addEventListener('click', async () => {
      const target = getImageById(image.id);
      if (!target) return;
      await imageEditor.openEditorModal(target);
    });
    card.querySelector('.edit-btn')?.addEventListener('click', () => openEditModal(image));
    card.querySelector('.delete-btn')?.addEventListener('click', () => deleteImage(image.id));
    galleryGrid.appendChild(card);
  });
  updateBatchToolbar();
}

function openEditModal(image) {
  document.getElementById('edit-image-id').value = image.id;
  document.getElementById('edit-image-name').value = image.name || '';
  document.getElementById('edit-image-tags').value = (image.tags || []).join(', ');
  document.getElementById('edit-image-description').value = image.description || '';
  populateFolderSelect(editFolderSelect, image.folderId);
  editMessage.textContent = '';
  editBackdrop?.classList.remove('hidden');
}

function closeEditModal() {
  editBackdrop?.classList.add('hidden');
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

async function batchDownloadImages() {
  if (selectedImages.size === 0) return;
  const response = await fetch(`${API_BASE_URL}/api/images/download-batch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids: Array.from(selectedImages) })
  });
  if (!response.ok) return alert('批量下载失败');
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'selected-images.zip';
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function openUploadModal() { uploadBackdrop?.classList.remove('hidden'); }
function closeUploadModal() { uploadBackdrop?.classList.add('hidden'); }

function renderPreview() {
  const files = Array.from(fileInput.files || []);
  if (!files.length) {
    preview.innerHTML = '<div class="empty-state">选择图片后会在这里展示预览。</div>';
    return;
  }
  preview.innerHTML = `<div class="empty-state">本次已选择 ${files.length} 张图片。</div>` + files.slice(0, 6).map((file) => {
    const url = URL.createObjectURL(file);
    return `<div class="preview-card"><img src="${url}" alt="预览图" class="preview-image"><div class="preview-meta"><strong>${file.name}</strong><span>${Math.ceil(file.size / 1024)} KB</span></div></div>`;
  }).join('');
}

folderForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const folderName = document.getElementById('folder-name').value.trim();
  if (!folderName) return setMessage(folderMessage, '请输入文件夹名称', 'error');
  const response = await fetch(`${API_BASE_URL}/api/folders`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: folderName })
  });
  const data = await response.json();
  if (!response.ok) return setMessage(folderMessage, data.message || '创建文件夹失败', 'error');
  document.getElementById('folder-name').value = '';
  setMessage(folderMessage, '文件夹已创建');
  await loadFolders();
});

uploadForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const files = Array.from(fileInput.files || []);
  if (!files.length) return setMessage(uploadMessage, '请先选择图片文件', 'error');
  const formData = new FormData();
  files.forEach((file) => formData.append('images', file));
  formData.append('folderId', folderSelect.value);
  formData.append('tags', document.getElementById('image-tags').value);
  formData.append('description', document.getElementById('image-description').value);
  setMessage(uploadMessage, `正在批量上传 ${files.length} 张图片...`);
  const response = await fetch(`${API_BASE_URL}/api/images/upload-batch`, { method: 'POST', body: formData });
  const data = await response.json();
  if (!response.ok) return setMessage(uploadMessage, data.message || '批量上传失败', 'error');
  uploadForm.reset();
  renderPreview();
  await Promise.all([loadFolders(), loadImages()]);
  setMessage(uploadMessage, data.message || '上传完成');
  closeUploadModal();
});

editForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const imageId = document.getElementById('edit-image-id').value;
  const payload = {
    name: document.getElementById('edit-image-name').value.trim(),
    folderId: document.getElementById('edit-image-folder').value,
    tags: document.getElementById('edit-image-tags').value,
    description: document.getElementById('edit-image-description').value.trim()
  };
  const response = await fetch(`${API_BASE_URL}/api/images/${imageId}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
  });
  const data = await response.json();
  if (!response.ok) return setMessage(editMessage, data.message || '保存失败', 'error');
  setMessage(editMessage, '修改已保存');
  await Promise.all([loadFolders(), loadImages()]);
  closeEditModal();
});

openUploadModalButton?.addEventListener('click', openUploadModal);
closeUploadModalButton?.addEventListener('click', closeUploadModal);
uploadBackdrop?.addEventListener('click', (event) => { if (event.target === uploadBackdrop) closeUploadModal(); });
closeEditModalButton?.addEventListener('click', closeEditModal);
editBackdrop?.addEventListener('click', (event) => { if (event.target === editBackdrop) closeEditModal(); });
closePreviewModalButton?.addEventListener('click', closePreviewModal);
previewBackdrop?.addEventListener('click', (event) => { if (event.target === previewBackdrop) closePreviewModal(); });
previewPrevButton?.addEventListener('click', () => movePreview(-1));
previewNextButton?.addEventListener('click', () => movePreview(1));
previewEditButton?.addEventListener('click', () => {
  const list = filteredImages();
  if (currentPreviewIndex < 0 || !list[currentPreviewIndex]) return;
  closePreviewModal();
  openEditModal(list[currentPreviewIndex]);
});
previewOpenEditorButton?.addEventListener('click', async () => {
  const list = filteredImages();
  if (currentPreviewIndex < 0 || !list[currentPreviewIndex]) return;
  closePreviewModal();
  await imageEditor.openEditorModal(list[currentPreviewIndex]);
});
previewDownloadButton?.addEventListener('click', () => {
  const list = filteredImages();
  if (currentPreviewIndex < 0 || !list[currentPreviewIndex]) return;
  const link = document.createElement('a');
  link.href = `${API_BASE_URL}/api/images/${list[currentPreviewIndex].id}/download`;
  link.click();
});

fileInput?.addEventListener('change', renderPreview);
searchInput?.addEventListener('input', () => { currentPage = 1; renderImages(); });
folderSearchInput?.addEventListener('input', renderFolders);
async function deleteFolder(folderId) {
  if (!folderId) return;
  const folder = folders.find((item) => item.id === folderId);
  const ok = confirm(`确认删除文件夹「${folderDisplayName(folder)}」吗？该文件夹会进入回收站。`);
  if (!ok) return;
  const response = await fetch(`${API_BASE_URL}/api/folders/${folderId}`, { method: 'DELETE' });
  const data = await response.json();
  if (!response.ok) return alert(data.message || '删除文件夹失败');
  if (selectedFolder === folderId) selectedFolder = 'all';
  await Promise.all([loadFolders(), loadImages()]);
}

function downloadFolder(folderId) {
  if (!folderId) return;
  const link = document.createElement('a');
  link.href = `${API_BASE_URL}/api/folders/${folderId}/download`;
  link.click();
}

folderList?.addEventListener('click', async (event) => {
  const actionButton = event.target.closest('[data-action]');
  if (actionButton) {
    const action = actionButton.dataset.action;
    const folderId = actionButton.dataset.folderId;
    if (action === 'download') {
      downloadFolder(folderId);
      return;
    }
    if (action === 'delete') {
      await deleteFolder(folderId);
      return;
    }
  }

  const button = event.target.closest('.folder-item');
  if (!button) return;
  const folderId = button.dataset.folderId;
  if (!folderId || folderId === 'all') {
    selectedFolder = 'all';
    if (folderSelect) folderSelect.value = 'all-assets';
  } else {
    selectedFolder = folderId;
    if (folderSelect) folderSelect.value = folderId;
  }
  renderFolders();
  renderImages();
});

galleryPrevPage?.addEventListener('click', () => { if (currentPage > 1) { currentPage -= 1; renderImages(); } });
galleryNextPage?.addEventListener('click', () => { currentPage += 1; renderImages(); });
selectAllCheckbox?.addEventListener('change', (event) => {
  const list = filteredImages();
  list.forEach((image) => event.target.checked ? selectedImages.add(image.id) : selectedImages.delete(image.id));
  renderImages();
});
batchDownloadButton?.addEventListener('click', batchDownloadImages);
batchMoveButton?.addEventListener('click', batchMoveImages);
batchDeleteButton?.addEventListener('click', batchDeleteImages);

document.addEventListener('DOMContentLoaded', async () => {
  setGalleryLoading(true);
  try {
    await loadFolders();
    await loadImages();
  } catch (error) {
    console.error('gallery init failed', error);
  }
  updateBatchToolbar();
  setGalleryLoading(false);
});
