import { clearAdminSession, getToken } from "~/utils/auth";

export default defineNuxtPlugin((nuxtApp) => {
    const { startLoading, stopLoading, setSlow, state } = useGlobalLoading()
    const router = useRouter()
    const originalFetch = $fetch
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
            const requestUrl = new URL(request instanceof Request ? request.url : String(request), window.location.origin)
            if (error?.statusCode === 401 && requestToken && requestUrl.origin === window.location.origin) {
                await nuxtApp.runWithContext(async () => {
                    // An old in-flight request must not clear a newly signed-in account.
                    if (getToken() !== requestToken) return
                    const route = router.currentRoute.value
                    clearAdminSession()
                    if (route.path.startsWith('/configuration')) {
                        await navigateTo('/admin?redirect=' + encodeURIComponent(route.fullPath))
                    }
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
