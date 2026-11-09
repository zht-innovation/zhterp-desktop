import path from 'node:path'

export default defineEventHandler((event) => {
    // 1. 获取请求的 URL 路径
    const url = getRequestURL(event)
    const pathname = url.pathname

    // 2. 检查请求是否是以 `/main/` 开头
    if (pathname.startsWith('/main/')) {

        // 3. 为所有 /main/ 下的资源设置 cache-control 头
        // setResponseHeader 是 Nitro 提供的设置响应头的辅助函数
        setResponseHeader(event, 'cache-control', 'public, max-age=0, must-revalidate')

        // 4. 实现强制下载的逻辑
        const ext = path.extname(pathname).toLowerCase()
        const forceDownloadTypes = ['.pdf'] // 在这里定义需要强制下载的文件类型

        if (forceDownloadTypes.includes(ext)) {
            // 从路径中获取文件名
            const filename = path.basename(pathname)

            // 设置 Content-Disposition 头
            // 告诉浏览器应该下载文件，而不是试图在标签页中打开它
            setResponseHeader(
                event,
                'Content-Disposition',
                `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`
            )
        }
    }
})
