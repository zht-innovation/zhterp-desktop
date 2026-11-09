interface UseInventoryPaginationOptions {
    pageSizeOptions?: number[];
    initialPageSize?: number;
    initialPage?: number;
}

export const getPaginationPageNumbers = (
    totalPages: number,
    currentPage: number,
) => {
    const normalizedTotal = Math.max(1, Math.trunc(totalPages));
    const normalizedCurrent = Math.min(
        Math.max(1, Math.trunc(currentPage)),
        normalizedTotal,
    );

    if (normalizedTotal <= 7) {
        return Array.from({ length: normalizedTotal }, (_, index) => index + 1);
    }

    if (normalizedCurrent <= 4) {
        return [1, 2, 3, 4, 5, normalizedTotal];
    }

    if (normalizedCurrent >= normalizedTotal - 3) {
        return [
            1,
            normalizedTotal - 4,
            normalizedTotal - 3,
            normalizedTotal - 2,
            normalizedTotal - 1,
            normalizedTotal,
        ];
    }

    return [
        1,
        normalizedCurrent - 1,
        normalizedCurrent,
        normalizedCurrent + 1,
        normalizedTotal,
    ];
};

export const useInventoryPagination = (options: UseInventoryPaginationOptions = {}) => {
    const pageSizeOptions = options.pageSizeOptions ?? [5, 10, 15];
    const pageSize = ref(options.initialPageSize ?? pageSizeOptions[1] ?? pageSizeOptions[0] ?? 10);
    const currentPage = ref(options.initialPage ?? 1);
    const jumpPageInput = ref(String(currentPage.value));
    const totalItems = ref(0);
    const totalPages = computed(() =>
        Math.max(1, Math.ceil(totalItems.value / pageSize.value)),
    );
    const pageNumbers = computed(() =>
        getPaginationPageNumbers(totalPages.value, currentPage.value),
    );

    const syncJumpInput = () => {
        jumpPageInput.value = String(currentPage.value);
    };

    const normalizePage = (page: number) => {
        if (!Number.isFinite(page)) {
            return currentPage.value;
        }

        return Math.min(Math.max(1, Math.trunc(page)), totalPages.value);
    };

    const goToPage = (page: number) => {
        currentPage.value = normalizePage(page);
        syncJumpInput();
    };

    const jumpToInputPage = () => {
        goToPage(Number(jumpPageInput.value.trim()));
    };

    const setTotalItems = (total: number) => {
        totalItems.value = Math.max(0, total);

        if (currentPage.value > totalPages.value) {
            currentPage.value = totalPages.value;
            syncJumpInput();
        }
    };

    const getPageItems = <T>(items: T[]) => {
        const start = (currentPage.value - 1) * pageSize.value;

        return items.slice(start, start + pageSize.value);
    };

    watch(pageSize, () => {
        currentPage.value = 1;
        syncJumpInput();
    });

    watch(totalPages, () => {
        if (currentPage.value > totalPages.value) {
            currentPage.value = totalPages.value;
            syncJumpInput();
        }
    });

    return {
        pageSizeOptions,
        pageSize,
        pageNumbers,
        totalPages,
        currentPage,
        jumpPageInput,
        totalItems,
        setTotalItems,
        getPageItems,
        goToPage,
        jumpToInputPage,
    };
};
