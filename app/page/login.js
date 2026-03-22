import API_BASE_URL from './config.js?v=2';
import { redirectIfAuthenticated } from './auth.js';

if (redirectIfAuthenticated()) {
    throw new Error('ALREADY_AUTHENTICATED');
}

const form = document.getElementById('login-form');
const errorMessage = document.getElementById('error-message');
const submitButton = form?.querySelector('button[type="submit"]');

function setMessage(text, type = 'error') {
    errorMessage.textContent = text;
    errorMessage.className = type === 'success' ? 'status-message success' : 'error';
}

form?.addEventListener('submit', async (e) => {
    e.preventDefault();

    const identifier = document.getElementById('identifier').value.trim();
    const password = document.getElementById('password').value;

    if (!identifier || !password) {
        setMessage('请输入用户名/邮箱和密码');
        return;
    }

    try {
        submitButton.disabled = true;
        submitButton.textContent = '登录中...';
        setMessage('');

        const response = await fetch(`${API_BASE_URL}/api/login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ identifier, password }),
        });

        let payload = {};
        try {
            payload = await response.json();
        } catch {
            payload = {};
        }

        if (response.ok) {
            setMessage('登录成功，正在进入用户中心...', 'success');
            localStorage.setItem('user', JSON.stringify(payload.user || {}));
            localStorage.setItem('userToken', payload.token || 'mock-token');
            setTimeout(() => {
                window.location.href = 'dashboard.html';
            }, 700);
            return;
        }

        setMessage(payload.message || '登录失败，请重试！');
    } catch (err) {
        setMessage('网络错误，请稍后再试！');
    } finally {
        submitButton.disabled = false;
        submitButton.textContent = '登录';
    }
});
