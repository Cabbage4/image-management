import API_BASE_URL from './config.js';
import { requireAuth } from './auth.js';

if (!requireAuth()) {
  throw new Error('UNAUTHENTICATED');
}

const logoutBtn = document.getElementById('logout-button');
const tbody = document.getElementById('trash-table-body');
const totalCount = document.getElementById('trash-total-count');
const cleanupNote = document.getElementById('trash-cleanup-note');
const selectedCount = document.getElementById('trash-selected-count');
const selectAll = document.getElementById('trash-select-all');
const restoreSelectedBtn = document.getElementById('trash-restore-selected');
const clearAllBtn = document.getElementById('trash-clear-all');
const cleanupMinutesInput = document.getElementById('trash-cleanup-minutes');
const saveTrashConfigBtn = document.getElementById('save-trash-config');
const trashConfigMessage = document.getElementById('trash-config-message');

let items = [];
let selected = new Set();

function cleanupDateText(deletedAt, minutes) {
  if (!deletedAt) return '--';
  const date = new Date(deletedAt.replace(' ', 'T'));
  if (Number.isNaN(date.getTime())) return '--';
  date.setMinutes(date.getMinutes() + Number(minutes || 60));
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')} ${String(date.getHours()).padStart(2,'0')}:${String(date.getMinutes()).padStart(2,'0')}`;
}

function refreshSelectedUI() {
  selectedCount.textContent = `已选中 ${selected.size} 项`;
  restoreSelectedBtn.disabled = selected.size === 0;
  clearAllBtn.disabled = items.length === 0;
  selectAll.checked = items.length > 0 && selected.size === items.length;
}

async function loadTrash() {
  const res = await fetch(`${API_BASE_URL}/api/trash`);
  const data = await res.json();
  const cleanupMinutes = data.cleanupMinutes || 60;
  if (cleanupMinutesInput) cleanupMinutesInput.value = cleanupMinutes;
  const images = (data.images || []).map(item => ({
    ...item,
    type: '图片'
  }));
  const folders = (data.folders || []).map(item => ({
    ...item,
    type: '文件夹',
    originalName: item.name,
    name: item.name,
    deletedAt: item.deletedAt,
    folderName: '文件夹',
    sizeLabel: `${item.containedImages || 0} 张图片`
  }));
  items = [...images, ...folders].sort((a, b) => String(b.deletedAt || '').localeCompare(String(a.deletedAt || '')));
  totalCount.textContent = `共 ${items.length} 条回收记录`;
  cleanupNote.textContent = `系统将按设定周期自动清空回收站（当前 ${cleanupMinutes} 分钟，可配置）`;
  selected.clear();
  render(cleanupMinutes);
}

function render(cleanupMinutes) {
  tbody.innerHTML = '';
  if (!items.length) {
    tbody.innerHTML = '<tr><td colspan="6"><div class="empty-state">回收站当前为空。</div></td></tr>';
    refreshSelectedUI();
    return;
  }

  items.forEach(item => {
    const tr = document.createElement('tr');
    const thumb = item.type === '图片' ? `<img class="trash-thumb" src="${API_BASE_URL}${item.url}" alt="${item.name}">` : `<div class="trash-thumb"></div>`;
    tr.innerHTML = `
      <td><input type="checkbox" class="trash-row-check"></td>
      <td>
        <div class="trash-thumb-cell">
          ${thumb}
          <div>
            <div class="item-title">${item.name || '未命名'}</div>
            <div class="item-subtitle">${item.type === '图片' ? (item.folderName || '未分类') : `含 ${item.containedImages || 0} 张图片`}</div>
          </div>
        </div>
      </td>
      <td>${item.deletedAt || '--'}</td>
      <td>${cleanupDateText(item.deletedAt, cleanupMinutes)}</td>
      <td>${item.type}</td>
      <td>
        <div class="trash-actions-cell">
          <button type="button" class="secondary-button restore-btn">恢复</button>
        </div>
      </td>
    `;
    tr.querySelector('.trash-row-check').checked = selected.has(item.id);
    tr.querySelector('.trash-row-check').addEventListener('change', (e) => {
      if (e.target.checked) selected.add(item.id); else selected.delete(item.id);
      refreshSelectedUI();
    });
    tr.querySelector('.restore-btn').addEventListener('click', async () => {
      if (item.type === '图片') {
        await fetch(`${API_BASE_URL}/api/images/restore`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: item.id })
        });
      } else {
        await fetch(`${API_BASE_URL}/api/folders/restore`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: item.id })
        });
      }
      await loadTrash();
    });
    tbody.appendChild(tr);
  });
  refreshSelectedUI();
}

restoreSelectedBtn.addEventListener('click', async () => {
  const restoreList = items.filter(item => selected.has(item.id));
  for (const item of restoreList) {
    if (item.type === '图片') {
      await fetch(`${API_BASE_URL}/api/images/restore`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: item.id })
      });
    } else {
      await fetch(`${API_BASE_URL}/api/folders/restore`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: item.id })
      });
    }
  }
  await loadTrash();
});

clearAllBtn.addEventListener('click', async () => {
  const ok = confirm('确认清空回收站吗？该操作会永久删除回收站中的内容。');
  if (!ok) return;
  const res = await fetch(`${API_BASE_URL}/api/trash/clear`, {
    method: 'POST'
  });
  const data = await res.json();
  if (!res.ok) {
    alert(data.message || '清空回收站失败');
    return;
  }
  await loadTrash();
});

saveTrashConfigBtn?.addEventListener('click', async () => {
  const cleanupIntervalMinutes = Number(cleanupMinutesInput?.value || 0);
  if (!cleanupIntervalMinutes || cleanupIntervalMinutes <= 0) {
    trashConfigMessage.textContent = '请输入大于 0 的回收时间。';
    trashConfigMessage.className = 'error';
    return;
  }
  const res = await fetch(`${API_BASE_URL}/api/trash/config`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cleanupIntervalMinutes })
  });
  const data = await res.json();
  if (!res.ok) {
    trashConfigMessage.textContent = data.message || '回收时间保存失败';
    trashConfigMessage.className = 'error';
    return;
  }
  trashConfigMessage.textContent = data.message || '回收时间已更新';
  trashConfigMessage.className = 'status-message success';
  await loadTrash();
});

selectAll.addEventListener('change', (e) => {
  if (e.target.checked) items.forEach(item => selected.add(item.id));
  else selected.clear();
  Array.from(document.querySelectorAll('.trash-row-check')).forEach(el => { el.checked = e.target.checked; });
  refreshSelectedUI();
});

logoutBtn?.addEventListener('click', () => {
  localStorage.removeItem('userToken');
  window.location.href = 'login.html';
});

document.addEventListener('DOMContentLoaded', loadTrash);
