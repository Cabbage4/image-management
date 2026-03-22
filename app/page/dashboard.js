import API_BASE_URL from './config.js';
import { requireAuth } from './auth.js';

if (!requireAuth()) {
    throw new Error('UNAUTHENTICATED');
}

const profileName = document.getElementById('profile-name');
const profileStatus = document.getElementById('profile-status');
const profileAvatar = document.getElementById('profile-avatar');
const profileAvatarImage = document.getElementById('profile-avatar-image');
const profileAvatarFallbackText = profileAvatar?.querySelector('.avatar-fallback-text');
const profileAvatarInput = document.getElementById('profile-avatar-input');
const sidebarEmail = document.getElementById('sidebar-email');
const sidebarLastLogin = document.getElementById('sidebar-last-login');
const statUploads = document.getElementById('stat-uploads');
const recentActivities = document.getElementById('recent-activities');
const logoutButton = document.getElementById('logout-button');
const profileMessage = document.getElementById('profile-message');
const profileForm = document.getElementById('profile-form');
const tabButtons = document.querySelectorAll('.tab-button');
const tabPanels = document.querySelectorAll('.tab-panel');

function setActiveTab(tabName) {
    tabButtons.forEach((button) => {
        button.classList.toggle('active', button.dataset.tab === tabName);
    });

    tabPanels.forEach((panel) => {
        panel.classList.toggle('active', panel.id === `tab-${tabName}`);
    });
}

function avatarSrc(user = {}) {
    if (user.avatarUrl) return `${API_BASE_URL}${user.avatarUrl}`;
    if (user.avatarDataUrl) return user.avatarDataUrl;
    return '';
}

function renderUser(user = {}) {
    const username = user.username || '示例用户';
    const email = user.email || 'example@example.com';
    const resolvedAvatar = avatarSrc(user);

    profileName.textContent = username;
    profileStatus.textContent = user.status === 'pending' ? '待验证账户' : '已验证账户';
    if (resolvedAvatar) {
        if (profileAvatarFallbackText) {
            profileAvatarFallbackText.textContent = username.charAt(0) || '用';
            profileAvatarFallbackText.style.display = 'none';
        }
        if (profileAvatarImage) {
            profileAvatarImage.src = resolvedAvatar;
            profileAvatarImage.classList.remove('hidden');
            profileAvatarImage.style.display = 'block';
        }
        profileAvatar.style.backgroundImage = 'none';
    } else {
        if (profileAvatarFallbackText) {
            profileAvatarFallbackText.textContent = username.charAt(0) || '用';
            profileAvatarFallbackText.style.display = 'block';
        }
        if (profileAvatarImage) {
            profileAvatarImage.removeAttribute('src');
            profileAvatarImage.classList.add('hidden');
            profileAvatarImage.style.display = 'none';
        }
        profileAvatar.style.backgroundImage = 'none';
    }
    sidebarEmail.textContent = email;
    sidebarLastLogin.textContent = user.lastLogin || '刚刚';

    const bioInput = document.getElementById('profile-bio');

    if (bioInput && user.bio) bioInput.value = user.bio;
}

function mergeUserState(baseUser = {}, incomingUser = {}) {
    return {
        ...baseUser,
        ...incomingUser,
        username: incomingUser.username || baseUser.username || '示例用户',
        email: incomingUser.email || baseUser.email || 'example@example.com',
        avatarUrl: incomingUser.avatarUrl || baseUser.avatarUrl || '',
        avatarDataUrl: incomingUser.avatarDataUrl || (!incomingUser.avatarUrl ? (baseUser.avatarDataUrl || '') : ''),
        bio: incomingUser.bio || baseUser.bio || '',
    };
}

function persistUser(user = {}) {
    localStorage.setItem('user', JSON.stringify(user));
}

function renderActivities(activities = []) {
    recentActivities.innerHTML = '';

    if (!activities.length) {
        recentActivities.innerHTML = `
            <div class="empty-state">暂无活动记录，等你完成第一次上传或权限操作后，这里会出现时间流。</div>
        `;
        return;
    }

    activities.forEach((activity) => {
        const item = document.createElement('article');
        item.className = 'activity-item';
        item.innerHTML = `
            <div class="activity-meta">
                <span class="item-title">${activity.action || '操作记录'}</span>
                <span class="item-subtitle">${activity.details || '已完成一项系统操作'}</span>
            </div>
            <span class="item-time">${activity.timestamp || '刚刚'}</span>
        `;
        recentActivities.appendChild(item);
    });
}

async function loadDashboard() {
    const localUser = JSON.parse(localStorage.getItem('user') || '{}');
    renderUser(localUser);
    renderActivities([
        { timestamp: '2026-03-21 09:30', action: '更新资料', details: '修改了用户信息与头像设置' },
        { timestamp: '2026-03-20 18:18', action: '上传素材', details: '上传图片 banner_mock_01.png' }
    ]);
    statUploads.textContent = localUser.uploadCount || 18;

    try {
        const response = await fetch(`${API_BASE_URL}/api/dashboard`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${localStorage.getItem('userToken')}`,
            },
        });

        if (!response.ok) return;

        const data = await response.json();
        const mergedUser = mergeUserState(localUser, data.user || {});
        persistUser(mergedUser);
        renderUser(mergedUser);
        renderActivities((data.activities || []).filter((activity) => activity.action !== '团队协作' && !(activity.details || '').includes('团队')));
        statUploads.textContent = data.stats?.uploads ?? statUploads.textContent;
    } catch (err) {
        console.error('无法加载远程仪表盘数据，已回退本地数据', err);
    }
}

tabButtons.forEach((button) => {
    button.addEventListener('click', () => setActiveTab(button.dataset.tab));
});

profileForm?.addEventListener('submit', (event) => {
    event.preventDefault();
    const currentUser = JSON.parse(localStorage.getItem('user') || '{}');
    const updatedUser = {
        ...currentUser,
        username: currentUser.username || '示例用户',
        displayName: currentUser.username || '示例用户',
        email: currentUser.email || 'example@example.com',
        avatarUrl: currentUser.avatarUrl || '',
        avatarDataUrl: currentUser.avatarDataUrl || '',
        bio: document.getElementById('profile-bio')?.value || ''
    };

    persistUser(updatedUser);
    renderUser(updatedUser);
    profileMessage.textContent = '资料已保存到本地演示状态。';
    profileMessage.className = 'status-message success';
});

profileAvatarInput?.addEventListener('change', async () => {
    const file = profileAvatarInput.files?.[0];
    if (!file) return;

    profileMessage.textContent = '正在保存头像...';
    profileMessage.className = 'status-message success';

    try {
        const formData = new FormData();
        formData.append('avatar', file);
        const response = await fetch(`${API_BASE_URL}/api/profile/avatar`, {
            method: 'POST',
            body: formData
        });
        const data = await response.json();
        if (!response.ok) {
            profileMessage.textContent = data.message || '头像保存失败';
            profileMessage.className = 'error';
            return;
        }
        const currentUser = JSON.parse(localStorage.getItem('user') || '{}');
        const mergedUser = mergeUserState(currentUser, data.user || {});
        persistUser(mergedUser);
        renderUser(mergedUser);
        profileAvatar?.classList.add('avatar-updated');
        setTimeout(() => profileAvatar?.classList.remove('avatar-updated'), 1200);
        profileMessage.textContent = data.message || '头像已保存';
        profileMessage.className = 'status-message success';
    } catch (error) {
        profileMessage.textContent = error?.message || '头像保存失败';
        profileMessage.className = 'error';
    } finally {
        profileAvatarInput.value = '';
    }
});

logoutButton?.addEventListener('click', () => {
    localStorage.removeItem('userToken');
    window.location.href = 'login.html';
});

document.addEventListener('DOMContentLoaded', loadDashboard);
