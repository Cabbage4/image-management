import API_BASE_URL from './config.js';
import { redirectIfAuthenticated } from './auth.js';

if (redirectIfAuthenticated()) {
    throw new Error('ALREADY_AUTHENTICATED');
}

const form = document.getElementById('register-form');
const errorMessage = document.getElementById('error-message');
const submitButton = form?.querySelector('button[type="submit"]');

function setMessage(text, type = 'error') {
    errorMessage.textContent = text;
    errorMessage.className = type === 'success' ? 'status-message success' : 'error';
}

form?.addEventListener('submit', async (e) => {
    e.preventDefault();

    const email = document.getElementById('email').value.trim();
    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value;

    if (!email || !username || !password) {
        setMessage('请完整填写注册信息');
        return;
    }

    try {
        submitButton.disabled = true;
        submitButton.textContent = '注册中...';
        setMessage('');

        const response = await fetch(`${API_BASE_URL}/api/register`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ email, username, password }),
        });

        let payload = {};
        try {
            payload = await response.json();
        } catch {
            payload = {};
        }

        if (response.ok) {
            if (payload.user) {
                localStorage.setItem('user', JSON.stringify(payload.user));
            }
            setMessage(payload.message || '注册成功，正在跳转登录页...', 'success');
            setTimeout(() => {
                window.location.href = 'login.html';
            }, 900);
            return;
        }

        setMessage(payload.message || '注册失败，请重试！');
    } catch (err) {
        setMessage('网络错误，请稍后再试！');
    } finally {
        submitButton.disabled = false;
        submitButton.textContent = '创建账号';
    }
});
