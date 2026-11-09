// 跟踪业务 Promise，而不是 HTTP close：客户端断开后，数据库查询可能仍在执行。
export const createRequestDrain = () => {
    let activeCount = 0;
    const idleWaiters = new Set<() => void>();

    const run = async <T>(operation: () => T | Promise<T>): Promise<T> => {
        activeCount += 1;
        try {
            return await operation();
        } finally {
            activeCount -= 1;
            if (activeCount === 0) {
                for (const notify of idleWaiters) notify();
            }
        }
    };

    const waitForIdle = (timeoutMs: number): Promise<boolean> => {
        if (activeCount === 0) return Promise.resolve(true);
        return new Promise((resolve) => {
            const finish = (drained: boolean) => {
                clearTimeout(timer);
                idleWaiters.delete(onIdle);
                resolve(drained);
            };
            const onIdle = () => finish(true);
            const timer = setTimeout(() => finish(false), timeoutMs);
            idleWaiters.add(onIdle);
        });
    };

    return { run, waitForIdle, get activeCount() { return activeCount; } };
};
