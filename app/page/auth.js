export function hasToken() {
    return Boolean(localStorage.getItem('userToken'));
}

export function requireAuth(redirectTo = 'login.html') {
    if (!hasToken()) {
        window.location.href = redirectTo;
        return false;
    }
    return true;
}

export function redirectIfAuthenticated(target = 'dashboard.html') {
    if (hasToken()) {
        window.location.href = target;
        return true;
    }
    return false;
}
