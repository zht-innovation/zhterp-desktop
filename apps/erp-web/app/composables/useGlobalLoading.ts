type GlobalLoadingState = {
    count: number
    slow: boolean
}

export const useGlobalLoading = () => {
    const state = useState<GlobalLoadingState>('global_loading', () => ({
        count: 0,
        slow: false,
    }))

    const startLoading = () => {
        state.value.count += 1
    }

    const stopLoading = () => {
        state.value.count = Math.max(0, state.value.count - 1)
        if (state.value.count === 0) {
            state.value.slow = false
        }
    }

    const setSlow = (val: boolean) => {
        state.value.slow = val
    }

    return {
        state,
        startLoading,
        stopLoading,
        setSlow,
    }
}
