import { invoke } from "@tauri-apps/api/core";
import { desktopFetch, isDesktop } from "./desktop";

const TokenKey = 'Token';
let credentialQueue = Promise.resolve();
let sessionRevision = 0;

const desktopToken = () => useState<string | null>("erp-desktop-token", () => null);

function updateDesktopCredential(command: string, args?: { token: string }) {
    const operation = credentialQueue.then(() => invoke(command, args)).then(() => true, () => false);
    credentialQueue = operation.then(() => undefined);
    return operation;
}

export function persistDesktopSession(token: string) {
    return updateDesktopCredential("save_desktop_session", { token });
}

export function cancelDesktopSessionRestore() {
    sessionRevision += 1;
}

export async function verifyDesktopSession(probe = false) {
    const session = desktopToken();
    const nuxtApp = useNuxtApp();
    const revision = sessionRevision;
    await credentialQueue;
    let candidate = session.value;
    if (!candidate) {
        candidate = await invoke<string | null>("restore_desktop_session").catch(() => null);
    }
    if (sessionRevision !== revision || (!candidate && !probe)) return false;

    const response = await desktopFetch("/admin/profile", {
        headers: candidate ? { Token: candidate } : undefined,
        timeout: 5000,
    });
    if (sessionRevision !== revision) return false;
    if (response.status === 401 && candidate) {
        if (session.value) {
            await nuxtApp.runWithContext(clearAdminSession);
        } else {
            await updateDesktopCredential("clear_desktop_session");
        }
        return false;
    }
    if (!candidate || !response.ok) return false;

    const profile = await response.json();
    if (sessionRevision !== revision || profile?.code !== 200 || !profile?.data?.user) return false;
    session.value = candidate;
    return true;
}

export function getToken() {
    if (isDesktop()) return desktopToken().value;
    const token = useCookie(TokenKey);
    return token.value;
}

export function setToken(token: string) {
    if (isDesktop()) {
        sessionRevision += 1;
        desktopToken().value = token;
        useState<boolean>('token_error', () => false).value = false;
        return token;
    }
    const tokenCookie = useCookie(TokenKey, { maxAge: 60 * 60 * 24 * 7, watch: true }); // 7 days
    tokenCookie.value = token;
    useState<boolean>('token_error', () => false).value = false;
    return tokenCookie.value;
}

export function removeToken() {
    if (isDesktop()) {
        const session = desktopToken();
        if (!session.value) return;
        session.value = null;
        sessionRevision += 1;
        return updateDesktopCredential("clear_desktop_session");
    }
    const token = useCookie(TokenKey);
    token.value = null;
}

export function clearAdminSession() {
    const cleared = removeToken();
    useState('admin_info', () => ({})).value = {};
    useState<string | null>('auth_token', () => null).value = null;
    useState<number>('admin_profile_synced_at', () => 0).value = 0;
    useState<boolean>('token_error', () => false).value = false;
    useState<string | null>('salesperson_id', () => null).value = null;
    useState<string | null>('salesperson_username', () => null).value = null;
    useState('salesperson_self_cache', () => null).value = null;
    return cleared;
}
