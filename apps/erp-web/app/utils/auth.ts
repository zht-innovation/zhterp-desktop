const TokenKey = 'Token';

export function getToken() {
    const token = useCookie(TokenKey);
    return token.value;
}

export function setToken(token: string) {
    const tokenCookie = useCookie(TokenKey, { maxAge: 60 * 60 * 24 * 7, watch: true }); // 7 days
    tokenCookie.value = token;
    useState<boolean>('token_error', () => false).value = false;
    return tokenCookie.value;
}

export function removeToken() {
    const token = useCookie(TokenKey);
    token.value = null;
}

export function clearAdminSession() {
    removeToken();
    useState('admin_info', () => ({})).value = {};
    useState<string | null>('auth_token', () => null).value = null;
    useState<number>('admin_profile_synced_at', () => 0).value = 0;
    useState<boolean>('token_error', () => false).value = false;
    useState<string | null>('salesperson_id', () => null).value = null;
    useState<string | null>('salesperson_username', () => null).value = null;
    useState('salesperson_self_cache', () => null).value = null;
}
