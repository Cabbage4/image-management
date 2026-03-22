export function folderDisplayName(folder) {
  if (!folder) return '未分类';
  if (folder.id === 'all-assets') return '未分类';
  return folder.name;
}

export function populateFolderSelect(selectEl, folders, selectedValue = '') {
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

export function renderFolderList({
  folderList,
  folders,
  images,
  selectedFolder,
  folderKeyword,
  normalizedImage,
  onSelectAll,
  onSelectFolder,
  onDownloadFolder,
  onDeleteFolder,
}) {
  if (!folderList) return;
  folderList.innerHTML = '';

  const allWrap = document.createElement('div');
  allWrap.className = 'folder-item-row';
  allWrap.innerHTML = `
    <button type="button" class="folder-item ${selectedFolder === 'all' ? 'active' : ''}">全部图片</button>
    <span class="folder-item-placeholder"></span>
  `;
  allWrap.querySelector('.folder-item')?.addEventListener('click', onSelectAll);
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
        <div class="folder-item-side-actions">
          <button type="button" class="folder-download-btn" title="下载文件夹">⬇</button>
          <button type="button" class="folder-delete-btn" title="删除文件夹">🗑</button>
        </div>
      `;
      wrap.querySelector('.folder-item')?.addEventListener('click', () => onSelectFolder(folder));
      wrap.querySelector('.folder-download-btn')?.addEventListener('click', (event) => {
        event.stopPropagation();
        onDownloadFolder(folder);
      });
      wrap.querySelector('.folder-delete-btn')?.addEventListener('click', (event) => {
        event.stopPropagation();
        onDeleteFolder(folder);
      });
      folderList.appendChild(wrap);
    });
}
