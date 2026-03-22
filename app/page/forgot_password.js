import API_BASE_URL from './config.js';
import { redirectIfAuthenticated } from './auth.js';

if (redirectIfAuthenticated()) {
    throw new Error('ALREADY_AUTHENTICATED');
}

const form = document.getElementById('forgot-password-form');
const errorMessage = document.getElementById('error-message');
const submitButton = form?.querySelector('button[type="submit"]');

function setMessage(text, type = 'error') {
    errorMessage.textContent = text;
    errorMessage.className = type === 'success' ? 'status-message success' : 'error';
}

form?.addEventListener('submit', async (e) => {
    e.preventDefault();

    const identifier = document.getElementById('identifier').value.trim();
    const newPassword = document.getElementById('new-password').value;
    const confirmPassword = document.getElementById('confirm-password').value;

    if (!identifier || !newPassword || !confirmPassword) {
        setMessage('请完整填写重置信息');
        return;
    }

    if (newPassword !== confirmPassword) {
        setMessage('两次输入的新密码不一致');
        return;
    }

    try {
        submitButton.disabled = true;
        submitButton.textContent = '重置中...';
        setMessage('');

        const response = await fetch(`${API_BASE_URL}/api/password/forgot-reset`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ identifier, newPassword })
        });

        let payload = {};
        try {
            payload = await response.json();
        } catch {
            payload = {};
        }

        if (response.ok) {
            setMessage(payload.message || '密码已重置，正在返回登录页...', 'success');
            setTimeout(() => {
                window.location.href = 'login.html';
            }, 1000);
            return;
        }

        setMessage(payload.message || '密码重置失败，请重试');
    } catch (err) {
        setMessage('网络错误，请稍后再试');
    } finally {
        submitButton.disabled = false;
        submitButton.textContent = '重置密码';
    }
});
