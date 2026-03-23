export function buildFolderRowHtml(folder, selectedFolder, folderDisplayName) {
  return `
    <div class="folder-item-row" data-folder-row="${folder.id}" draggable="true">
      <button type="button" class="folder-item ${selectedFolder === folder.id ? 'active' : ''}" data-folder-id="${folder.id}">
        <span class="folder-item-main">
          <span class="folder-item-icon">☰</span>
          <span class="folder-item-name">${folderDisplayName(folder)}</span>
          <span class="folder-item-count">${folder.imageCount ?? 0}</span>
        </span>
      </button>
      <div class="folder-item-actions">
        <button type="button" class="ghost-button tiny-btn folder-download-btn" data-action="download" data-folder-id="${folder.id}" title="下载文件夹">下载</button>
        <button type="button" class="ghost-button tiny-btn danger-btn folder-delete-btn" data-action="delete" data-folder-id="${folder.id}" title="删除文件夹">删除</button>
      </div>
    </div>
  `;
}

export function buildImageCardHtml(image, API_BASE_URL, isSelected) {
  return `
    <article class="image-card" data-image-id="${image.id}">
      <div class="image-card-check">
        <label class="checkbox-line">
          <input type="checkbox" class="image-select-checkbox" data-image-id="${image.id}" ${isSelected ? 'checked' : ''}>
          <span>选择</span>
        </label>
      </div>
      <div class="image-thumb-wrap image-clickable-zone" data-action="preview" data-image-id="${image.id}">
        <img src="${API_BASE_URL}${image.thumbSmallUrl || image.thumbUrl || image.url}" alt="${image.name}" class="image-thumb" loading="lazy" decoding="async">
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
          <button type="button" class="ghost-button image-action-btn" data-action="preview" data-image-id="${image.id}">预览</button>
          <button type="button" class="ghost-button image-action-btn" data-action="download" data-image-id="${image.id}">下载原图</button>
          <button type="button" class="ghost-button image-action-btn" data-action="editor" data-image-id="${image.id}">编辑器</button>
          <button type="button" class="ghost-button image-action-btn" data-action="edit" data-image-id="${image.id}">信息</button>
          <button type="button" class="ghost-button image-action-btn danger-btn" data-action="delete" data-image-id="${image.id}">删除</button>
        </div>
      </div>
    </article>
  `;
}
