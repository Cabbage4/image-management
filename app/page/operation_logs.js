import API_BASE_URL from './config.js';
import { requireAuth } from './auth.js';

if (!requireAuth()) {
  throw new Error('UNAUTHENTICATED');
}

const tbody = document.getElementById('log-table-body');
const countEl = document.getElementById('log-count');
const searchInput = document.getElementById('log-search');
const actionFilter = document.getElementById('log-action-filter');
const timeFilter = document.getElementById('log-time-filter');
const resetBtn = document.getElementById('reset-log-filters');
const exportBtn = document.getElementById('export-logs');
const logoutBtn = document.getElementById('logout-button');
const retentionNote = document.getElementById('log-retention-note');
const prevPageBtn = document.getElementById('log-prev-page');
const nextPageBtn = document.getElementById('log-next-page');
const pageIndicator = document.getElementById('log-page-indicator');

let activities = [];
let currentPage = 1;
const pageSize = 10;

function actionStatus(action = '') {
  if (action.includes('删除')) return '警告';
  if (action.includes('恢复')) return '成功';
  if (action.includes('更新')) return '成功';
  return '成功';
}

function withinTimeRange(timestamp, filter) {
  if (!filter) return true;
  const t = new Date(timestamp.replace(' ', 'T'));
  const now = new Date();
  const diff = now - t;
  if (filter === 'today') return diff <= 24 * 60 * 60 * 1000;
  if (filter === '3d') return diff <= 3 * 24 * 60 * 60 * 1000;
  if (filter === '7d') return diff <= 7 * 24 * 60 * 60 * 1000;
  return true;
}

function filtered() {
  const q = searchInput.value.trim().toLowerCase();
  const act = actionFilter.value;
  const tf = timeFilter.value;
  return activities.filter(item => {
    const text = `${item.action || ''} ${item.details || ''}`.toLowerCase();
    const mq = !q || text.includes(q);
    const ma = !act || item.action === act;
    const mt = withinTimeRange(item.timestamp || '', tf);
    return mq && ma && mt;
  });
}

function render() {
  const rows = filtered();
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  if (currentPage > totalPages) currentPage = totalPages;
  const pageRows = rows.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  tbody.innerHTML = '';
  if (!pageRows.length) {
    tbody.innerHTML = '<tr><td colspan="6"><div class="empty-state">当前筛选条件下暂无日志记录。</div></td></tr>';
    countEl.textContent = '共 0 条记录';
    if (pageIndicator) pageIndicator.textContent = '第 1 / 1 页';
    if (prevPageBtn) prevPageBtn.disabled = true;
    if (nextPageBtn) nextPageBtn.disabled = true;
    return;
  }
  pageRows.forEach(item => {
    const status = actionStatus(item.action);
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${item.timestamp || '--'}</td>
      <td>${item.action || '系统操作'}</td>
      <td>${item.ip || '系统'}</td>
      <td>${item.ipCity || '系统'}</td>
      <td>${item.details || '无详细信息'}</td>
      <td><span class="log-status ${status === '成功' ? 'success' : 'warn'}">${status}</span></td>
    `;
    tbody.appendChild(tr);
  });
  countEl.textContent = `共 ${rows.length} 条记录`;
  if (pageIndicator) pageIndicator.textContent = `第 ${currentPage} / ${totalPages} 页`;
  if (prevPageBtn) prevPageBtn.disabled = currentPage <= 1;
  if (nextPageBtn) nextPageBtn.disabled = currentPage >= totalPages;
}

async function load() {
  const res = await fetch(`${API_BASE_URL}/api/activities`);
  const data = await res.json();
  activities = data.activities || [];
  const retentionDays = data.retentionDays || 183;
  if (retentionNote) {
    const monthText = retentionDays >= 180 ? '近 6 个月' : `${retentionDays} 天`;
    retentionNote.textContent = data.cleanupApplied
      ? `系统默认仅保留${monthText}的操作日志，本次已自动清理 ${data.cleanupRemoved || 0} 条超期记录。`
      : `系统默认仅保留${monthText}的操作日志，超期记录会自动清空。`;
  }
  render();
}

searchInput.addEventListener('input', () => {
  currentPage = 1;
  render();
});
actionFilter.addEventListener('change', () => {
  currentPage = 1;
  render();
});
timeFilter.addEventListener('change', () => {
  currentPage = 1;
  render();
});
resetBtn.addEventListener('click', () => {
  searchInput.value = '';
  actionFilter.value = '';
  timeFilter.value = '';
  currentPage = 1;
  render();
});
exportBtn.addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(filtered(), null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'operation-logs.json';
  a.click();
  URL.revokeObjectURL(url);
});
prevPageBtn?.addEventListener('click', () => {
  if (currentPage > 1) {
    currentPage -= 1;
    render();
  }
});
nextPageBtn?.addEventListener('click', () => {
  currentPage += 1;
  render();
});
logoutBtn?.addEventListener('click', () => {
  localStorage.removeItem('userToken');
  window.location.href = 'login.html';
});

document.addEventListener('DOMContentLoaded', load);
