import { clearAdminSession, getToken } from "~/utils/auth";
import { desktopFetch, getDesktopErpOrigin, initializeDesktop } from "~/utils/desktop";

export default defineNuxtPlugin(async (nuxtApp) => {
    const { startLoading, stopLoading, setSlow, state } = useGlobalLoading()
    const router = useRouter()
    const desktop = useRuntimeConfig().public.erpDesktop === true
    if (desktop) {
        const connectionMessage = useState("erp-desktop-connection", () => "")
        await initializeDesktop(message => { connectionMessage.value = message })
    }
    const originalFetch = desktop ? $fetch.create({ retry: 0 }, { fetch: desktopFetch }) : $fetch
    let slowTimer: ReturnType<typeof setTimeout> | null = null

    const clearSlowTimer = () => {
        if (slowTimer) {
            clearTimeout(slowTimer)
            slowTimer = null
        }
    }

    const start = () => {
        if (state.value.count === 0) {
            setSlow(false)
            clearSlowTimer()
            slowTimer = setTimeout(() => {
                setSlow(true)
            }, 10000)
        }
        startLoading()
    }

    const stop = () => {
        stopLoading()
        if (state.value.count === 0) {
            clearSlowTimer()
            setSlow(false)
        }
    }

    const wrapped = (async (request: any, options?: any) => {
        const skipLoading = options?.headers?.['x-skip-loading'] === '1'
        if (!skipLoading) {
            start()
        }
        try {
            return await originalFetch(request, options)
        } catch (error: any) {
            const requestToken = new Headers(options?.headers ?? (request instanceof Request ? request.headers : undefined)).get('Token')
            const requestOrigin = desktop ? getDesktopErpOrigin() : window.location.origin
            const requestUrl = requestOrigin
                ? new URL(request instanceof Request ? request.url : String(request), requestOrigin)
                : null
            if (error?.statusCode === 401 && requestToken && requestUrl?.origin === requestOrigin) {
                await nuxtApp.runWithContext(async () => {
                    // An old in-flight request must not clear a newly signed-in account.
                    if (getToken() !== requestToken) return
                    const route = router.currentRoute.value
                    const cleared = clearAdminSession()
                    if (route.path.startsWith('/configuration')) {
                        await navigateTo('/admin?redirect=' + encodeURIComponent(route.fullPath))
                    }
                    await cleared
                })
            }
            throw error
        } finally {
            if (!skipLoading) {
                stop()
            }
        }
    }) as typeof $fetch

    Object.assign(wrapped, originalFetch)
    wrapped.raw = originalFetch.raw
    wrapped.create = originalFetch.create

    // Replace global $fetch so existing calls are covered
    ;(globalThis as any).$fetch = wrapped
})
