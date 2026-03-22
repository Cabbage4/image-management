let confirmPromise = null;

function ensureConfirmDialog() {
  if (document.getElementById('app-confirm-backdrop')) return;
  document.body.insertAdjacentHTML('beforeend', `
    <div class="modal-backdrop hidden" id="app-confirm-backdrop">
      <div class="modal-card modal-card-confirm">
        <div class="confirm-dialog">
          <div class="confirm-dialog-head">
            <h3 id="app-confirm-title">请确认操作</h3>
            <p id="app-confirm-message">确认继续吗？</p>
          </div>
          <div class="panel-actions confirm-dialog-actions">
            <button type="button" class="ghost-button" id="app-confirm-cancel">取消</button>
            <button type="button" class="primary-button" id="app-confirm-ok">确认</button>
          </div>
        </div>
      </div>
    </div>
  `);
}

export function confirmAction({ title = '请确认操作', message = '确认继续吗？', confirmText = '确认', cancelText = '取消', danger = false } = {}) {
  ensureConfirmDialog();
  const backdrop = document.getElementById('app-confirm-backdrop');
  const titleEl = document.getElementById('app-confirm-title');
  const messageEl = document.getElementById('app-confirm-message');
  const cancelBtn = document.getElementById('app-confirm-cancel');
  const okBtn = document.getElementById('app-confirm-ok');

  titleEl.textContent = title;
  messageEl.textContent = message;
  cancelBtn.textContent = cancelText;
  okBtn.textContent = confirmText;
  okBtn.classList.toggle('danger-btn', danger);
  backdrop.classList.remove('hidden');

  return new Promise((resolve) => {
    const cleanup = () => {
      backdrop.classList.add('hidden');
      cancelBtn.onclick = null;
      okBtn.onclick = null;
      backdrop.onclick = null;
      document.onkeydown = null;
    };
    cancelBtn.onclick = () => {
      cleanup();
      resolve(false);
    };
    okBtn.onclick = () => {
      cleanup();
      resolve(true);
    };
    backdrop.onclick = (event) => {
      if (event.target === backdrop) {
        cleanup();
        resolve(false);
      }
    };
    document.onkeydown = (event) => {
      if (event.key === 'Escape') {
        cleanup();
        resolve(false);
      }
    };
  });
}
