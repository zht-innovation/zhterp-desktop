<template>
    <span v-if="disabled" class="warehouse-readonly">{{ displayLabel }}</span>
    <div
        ref="cascaderRef"
        v-else
        class="inventory-warehouse-cascader"
        :class="{ open: isOpen }"
        @click.stop
    >
        <button
            class="warehouse-trigger"
            type="button"
            :aria-label="ariaLabel"
            @click="toggleMenu"
        >
            <span>{{ displayLabel }}</span>
            <Icon name="lucide:chevron-down" />
        </button>

        <div
            class="warehouse-menu"
            :class="{ 'single-column': menuColumnCount === 1 }"
            :style="menuStyle"
        >
            <div class="warehouse-search-row">
                <Icon name="lucide:search" />
                <input
                    v-model="searchText"
                    type="search"
                    placeholder="搜索仓库或仓位"
                    aria-label="搜索仓库或仓位"
                    @keydown.esc.stop.prevent="closeMenu"
                >
            </div>

            <template v-if="isSearching">
                <div class="warehouse-search-result-list">
                    <button
                        v-for="result in searchResultOptions"
                        :key="`${result.warehouseId}-${result.locationId}`"
                        class="warehouse-search-result-option"
                        type="button"
                        @click="selectSearchResult(result)"
                    >
                        <span>{{ result.label }}</span>
                    </button>

                    <div
                        v-if="searchResultOptions.length === 0"
                        class="warehouse-empty"
                    >
                        暂无匹配选项
                    </div>
                </div>
            </template>

            <template v-else>
                <div class="warehouse-primary-list">
                    <button
                        v-for="warehouse in filteredWarehouseOptions"
                        :key="warehouse.id"
                        class="warehouse-primary-option"
                        :class="{ active: activeWarehouseId === warehouse.id }"
                        type="button"
                        @click="selectWarehouse(warehouse.id)"
                        @mouseenter="setActiveWarehouse(warehouse.id)"
                    >
                        <span>{{ warehouse.name }}</span>
                        <Icon v-if="warehouse.children.length" name="lucide:chevron-right" />
                    </button>
                </div>

                <div
                    v-for="(locations, columnIndex) in locationColumns"
                    :key="columnIndex"
                    class="warehouse-secondary-list"
                >
                    <button
                        v-for="location in locations"
                        :key="location.id"
                        class="warehouse-secondary-option"
                        :class="{ active: activeLocationIds[columnIndex] === location.id }"
                        type="button"
                        @click="selectLocation(location, columnIndex)"
                        @mouseenter="setActiveLocation(location.id, columnIndex)"
                    >
                        <span>{{ location.name }}</span>
                        <Icon
                            v-if="location.children.length && hasMoreLevel(columnIndex)"
                            name="lucide:chevron-right"
                        />
                    </button>
                </div>

                <div
                    v-if="filteredWarehouseOptions.length === 0"
                    class="warehouse-empty"
                >
                    暂无匹配选项
                </div>
            </template>
        </div>
    </div>
</template>

<script setup lang="ts">
import {
    getInboundWarehouseSelection,
    type InboundLocationOption,
    type InboundWarehouseOption,
} from "~/utils/inventory/inboundFrontendMapping";

const props = withDefaults(defineProps<{
    warehouseOptions: InboundWarehouseOption[];
    warehouseId?: string;
    locationId?: string;
    label?: string;
    placeholder?: string;
    disabled?: boolean;
    ariaLabel?: string;
    maxLocationLevel?: number;
    allowWarehouseSelect?: boolean;
    allowNonLeafLocationSelect?: boolean;
}>(), {
    warehouseId: "",
    locationId: "",
    label: "",
    placeholder: "请选择",
    disabled: false,
    ariaLabel: "选择仓库",
    maxLocationLevel: 3,
    allowWarehouseSelect: false,
    allowNonLeafLocationSelect: false,
});

const emit = defineEmits<{
    select: [warehouseId: string, locationId: string, label: string];
}>();

type WarehouseSearchResult = {
    warehouseId: string;
    locationId: string;
    label: string;
};

const openEventName = "inventory-warehouse-cascader-open";
const instanceId = Math.random().toString(36).slice(2);

const isOpen = ref(false);
const activeWarehouseId = ref("");
const activeLocationIds = ref<string[]>([]);
const searchText = ref("");
const cascaderRef = ref<HTMLElement | null>(null);
const menuLeft = ref(0);
const menuTop = ref(0);

const selectedLabel = computed(() => {
    if (props.label && props.label !== "--") {
        return props.label;
    }

    const selection = getInboundWarehouseSelection(
        props.warehouseOptions,
        props.warehouseId,
        props.locationId,
    );

    return selection.label === "--" ? "" : selection.label;
});

const displayLabel = computed(() =>
    selectedLabel.value || (props.disabled ? "--" : props.placeholder),
);

const isSearching = computed(() => Boolean(searchText.value.trim()));

const filterLocations = (
    locations: InboundLocationOption[],
    keyword: string,
): InboundLocationOption[] => {
    return locations
        .map((location) => {
            const matched = location.name.toLowerCase().includes(keyword)
                || (location.code || "").toLowerCase().includes(keyword);
            const children = filterLocations(location.children, keyword);

            if (matched) {
                return location;
            }

            if (children.length) {
                return {
                    ...location,
                    children,
                };
            }

            return null;
        })
        .filter((location): location is InboundLocationOption => Boolean(location));
};

const filteredWarehouseOptions = computed(() => {
    const keyword = searchText.value.trim().toLowerCase();

    if (!keyword) {
        return props.warehouseOptions;
    }

    return props.warehouseOptions
        .map((warehouse) => {
            const warehouseMatched = warehouse.name.toLowerCase().includes(keyword)
                || (warehouse.code || "").toLowerCase().includes(keyword);
            const matchedChildren = filterLocations(warehouse.children, keyword);

            if (warehouseMatched) {
                return warehouse;
            }

            if (matchedChildren.length) {
                return {
                    ...warehouse,
                    children: matchedChildren,
                };
            }

            return null;
        })
        .filter((warehouse): warehouse is InboundWarehouseOption => Boolean(warehouse));
});

const activeWarehouse = computed(() =>
    filteredWarehouseOptions.value.find((item) => item.id === activeWarehouseId.value),
);

const locationColumns = computed(() => {
    const columns: InboundLocationOption[][] = [];
    let options = activeWarehouse.value?.children || [];
    let level = 0;

    while (options.length && level < props.maxLocationLevel) {
        columns.push(options);
        const active = options.find((item) => item.id === activeLocationIds.value[level]);
        options = active?.children || [];
        level += 1;
    }

    return columns;
});

const searchResultOptions = computed<WarehouseSearchResult[]>(() => {
    const keyword = searchText.value.trim().toLowerCase();

    if (!keyword) {
        return [];
    }

    const results: WarehouseSearchResult[] = [];

    const addWarehouseResult = (warehouse: InboundWarehouseOption) => {
        const warehouseText = [
            warehouse.name,
            warehouse.code || "",
        ].join(" ").toLowerCase();

        const canSelectWarehouse = props.allowWarehouseSelect
            || !warehouse.children.length;

        if (canSelectWarehouse && warehouseText.includes(keyword)) {
            results.push({
                warehouseId: warehouse.id,
                locationId: "",
                label: warehouse.name,
            });
        }
    };

    const addLocationResults = (
        warehouse: InboundWarehouseOption,
        locations: InboundLocationOption[],
        parentNames: string[],
        level: number,
    ) => {
        locations.forEach((location) => {
            const label = [warehouse.name, ...parentNames, location.name].join(" / ");
            const text = [
                label,
                warehouse.code || "",
                location.code || "",
            ].join(" ").toLowerCase();

            const atMaxLevel = level >= props.maxLocationLevel;
            const canSelectLocation = props.allowNonLeafLocationSelect
                || location.children.length === 0
                || atMaxLevel;

            if (canSelectLocation && text.includes(keyword)) {
                results.push({
                    warehouseId: warehouse.id,
                    locationId: location.id,
                    label,
                });
            }

            if (location.children.length && !atMaxLevel) {
                addLocationResults(
                    warehouse,
                    location.children,
                    [...parentNames, location.name],
                    level + 1,
                );
            }
        });
    };

    props.warehouseOptions.forEach((warehouse) => {
        addWarehouseResult(warehouse);
        addLocationResults(warehouse, warehouse.children, [], 1);
    });

    return results.slice(0, 50);
});

const menuColumnCount = computed(() => {
    if (isSearching.value) {
        return 2;
    }

    return 1 + locationColumns.value.length;
});

const primaryColumnWidth = 174;
const secondaryColumnWidth = 200;
const menuBorderWidth = 2;

const menuGridColumns = computed(() => {
    if (menuColumnCount.value === 1) {
        return `${primaryColumnWidth}px`;
    }

    return `${primaryColumnWidth}px repeat(${menuColumnCount.value - 1}, ${secondaryColumnWidth}px)`;
});

const getNaturalMenuWidth = () =>
    primaryColumnWidth
    + secondaryColumnWidth * Math.max(menuColumnCount.value - 1, 0)
    + menuBorderWidth;

const getMenuWidth = () => {
    if (typeof window === "undefined") {
        return getNaturalMenuWidth();
    }

    return Math.min(getNaturalMenuWidth(), window.innerWidth - 48);
};

const menuStyle = computed(() => ({
    gridTemplateColumns: menuGridColumns.value,
    width: `${getMenuWidth()}px`,
    left: `${menuLeft.value}px`,
    top: `${menuTop.value}px`,
}));

const updateMenuPosition = () => {
    if (!cascaderRef.value || typeof window === "undefined") {
        return;
    }

    const rect = cascaderRef.value.getBoundingClientRect();
    const width = getMenuWidth();
    const maxLeft = Math.max(12, window.innerWidth - width - 12);

    menuLeft.value = Math.min(Math.max(12, rect.left), maxLeft);
    menuTop.value = rect.bottom + 4;
};

const closeMenu = () => {
    isOpen.value = false;
    searchText.value = "";
    activeLocationIds.value = [];
};

const setActiveWarehouse = (warehouseId: string) => {
    activeWarehouseId.value = warehouseId;
    activeLocationIds.value = [];
};

const setActiveLocation = (locationId: string, columnIndex: number) => {
    activeLocationIds.value = [
        ...activeLocationIds.value.slice(0, columnIndex),
        locationId,
    ];
};

const hasMoreLevel = (columnIndex: number) =>
    columnIndex + 1 < props.maxLocationLevel;

const toggleMenu = () => {
    if (props.disabled) {
        return;
    }

    if (isOpen.value) {
        closeMenu();
        return;
    }

    window.dispatchEvent(new CustomEvent(openEventName, { detail: instanceId }));
    isOpen.value = true;
    activeWarehouseId.value = props.warehouseId || props.warehouseOptions[0]?.id || "";
    activeLocationIds.value = [];
    nextTick(updateMenuPosition);
};

watch(menuColumnCount, () => {
    if (isOpen.value) {
        nextTick(updateMenuPosition);
    }
});

watch(filteredWarehouseOptions, (options) => {
    if (!isOpen.value || isSearching.value) {
        return;
    }

    if (!options.some((warehouse) => warehouse.id === activeWarehouseId.value)) {
        activeWarehouseId.value = options[0]?.id || "";
        activeLocationIds.value = [];
    }
});

const selectWarehouse = (warehouseId: string) => {
    setActiveWarehouse(warehouseId);

    const warehouse = props.warehouseOptions.find((item) => item.id === warehouseId);

    if (warehouse?.children.length && !props.allowWarehouseSelect) {
        return;
    }

    const selection = getInboundWarehouseSelection(props.warehouseOptions, warehouseId);

    emit("select", selection.warehouseId, selection.locationId, selection.label);
    closeMenu();
};

const selectLocation = (location: InboundLocationOption, columnIndex: number) => {
    setActiveLocation(location.id, columnIndex);

    const atMaxLevel = !hasMoreLevel(columnIndex);

    if (location.children.length && !atMaxLevel && !props.allowNonLeafLocationSelect) {
        return;
    }

    const selection = getInboundWarehouseSelection(
        props.warehouseOptions,
        activeWarehouseId.value,
        location.id,
    );

    if (!selection.isLeaf && !atMaxLevel && !props.allowNonLeafLocationSelect) {
        return;
    }

    emit("select", selection.warehouseId, selection.locationId, selection.label);
    closeMenu();
};

const selectSearchResult = (result: WarehouseSearchResult) => {
    emit("select", result.warehouseId, result.locationId, result.label);
    closeMenu();
};

const closeOtherMenu = (event: Event) => {
    const customEvent = event as CustomEvent<string>;

    if (customEvent.detail !== instanceId) {
        closeMenu();
    }
};

onMounted(() => {
    document.addEventListener("click", closeMenu);
    window.addEventListener("resize", updateMenuPosition);
    window.addEventListener("scroll", updateMenuPosition, true);
    window.addEventListener(openEventName, closeOtherMenu);
});

onBeforeUnmount(() => {
    document.removeEventListener("click", closeMenu);
    window.removeEventListener("resize", updateMenuPosition);
    window.removeEventListener("scroll", updateMenuPosition, true);
    window.removeEventListener(openEventName, closeOtherMenu);
});
</script>

<style scoped>
.warehouse-readonly {
    min-width: 0;
    overflow: hidden;
    color: var(--erp-color-text-primary);
    font-size: var(--erp-typography-content1-font-size);
    line-height: var(--erp-typography-content1-line-height);
    text-overflow: ellipsis;
    white-space: nowrap;
}

.inventory-warehouse-cascader {
    position: relative;
    width: 100%;
    min-width: 150px;
}

.warehouse-trigger {
    width: 100%;
    height: var(
        --inventory-warehouse-cascader-height,
        var(--erp-size-control-height-sm)
    );
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--erp-spacing-8);
    box-sizing: border-box;
    padding: 0 var(--erp-spacing-8);
    border: 1px solid var(--erp-color-border-default);
    border-radius: var(--erp-radius-control-default);
    color: var(
        --inventory-warehouse-cascader-text,
        var(--erp-color-text-primary)
    );
    background: var(--erp-color-fill-default);
    font-size: var(--erp-typography-content1-font-size);
    line-height: var(--erp-typography-content1-line-height);
    cursor: pointer;
}

.warehouse-trigger span {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.warehouse-trigger :deep(svg) {
    width: 12px;
    height: 12px;
    flex: 0 0 auto;
    color: var(--erp-color-icon-secondary);
}

.warehouse-menu {
    position: fixed;
    z-index: 30;
    display: none;
    min-height: 124px;
    max-width: calc(100vw - 48px);
    border: 1px solid var(--erp-color-border-muted);
    border-radius: var(--erp-radius-surface-default);
    background: var(--erp-color-fill-default);
    box-shadow: 0 8px 22px rgb(0 0 0 / 10%);
    overflow-x: auto;
    overflow-y: hidden;
}

.inventory-warehouse-cascader.open .warehouse-menu {
    display: grid;
}

.warehouse-search-row {
    grid-column: 1 / -1;
    height: 38px;
    display: flex;
    align-items: center;
    gap: 6px;
    padding: var(--erp-spacing-4) var(--erp-spacing-10);
    border-bottom: 1px solid var(--erp-color-divider-subtle);
    color: var(--erp-color-icon-secondary);
    background: var(--erp-color-fill-default);
}

.warehouse-search-row :deep(svg) {
    width: 15px;
    height: 15px;
    flex: 0 0 auto;
}

.warehouse-search-row input {
    min-width: 0;
    flex: 1;
    border: 0;
    outline: 0;
    color: var(
        --inventory-warehouse-cascader-text,
        var(--erp-color-text-primary)
    );
    background: transparent;
    font-size: var(--erp-typography-content1-font-size);
    line-height: var(--erp-typography-content1-line-height);
}

.warehouse-search-row input::placeholder {
    color: var(--erp-color-text-placeholder);
}

.warehouse-primary-list,
.warehouse-secondary-list {
    max-height: 280px;
    overflow: auto;
    padding: var(--erp-spacing-4) 6px;
}

.warehouse-primary-list {
    border-right: 1px solid var(--erp-color-divider-subtle);
}

.warehouse-menu.single-column .warehouse-primary-list {
    border-right-color: transparent;
}

.warehouse-secondary-list + .warehouse-secondary-list {
    border-left: 1px solid var(--erp-color-divider-subtle);
}

.warehouse-primary-option,
.warehouse-secondary-option {
    width: 100%;
    height: var(--erp-size-control-height-sm);
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--erp-spacing-8);
    padding: 0 var(--erp-spacing-10);
    border: 0;
    border-radius: var(--erp-radius-control-default);
    color: var(
        --inventory-warehouse-cascader-text,
        var(--erp-color-text-primary)
    );
    background: transparent;
    font-size: var(--erp-typography-content1-font-size);
    line-height: var(--erp-typography-content1-line-height);
    text-align: left;
    cursor: pointer;
}

.warehouse-primary-option span,
.warehouse-secondary-option span {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.warehouse-primary-option:hover,
.warehouse-primary-option.active,
.warehouse-secondary-option:hover,
.warehouse-secondary-option.active {
    background: var(
        --inventory-warehouse-cascader-active-bg,
        var(--erp-color-fill-hover)
    );
}

.warehouse-primary-option :deep(svg),
.warehouse-secondary-option :deep(svg) {
    width: 18px;
    height: 18px;
    flex: 0 0 auto;
    color: var(--erp-color-icon-secondary);
}

.warehouse-search-result-list {
    grid-column: 1 / -1;
    max-height: 300px;
    overflow: auto;
    padding: 6px;
}

.warehouse-search-result-option {
    width: 100%;
    height: var(--erp-size-control-height-sm);
    display: flex;
    align-items: center;
    padding: 0 var(--erp-spacing-10);
    border: 0;
    border-radius: var(--erp-radius-control-default);
    color: var(
        --inventory-warehouse-cascader-text,
        var(--erp-color-text-primary)
    );
    background: transparent;
    font-size: var(--erp-typography-content1-font-size);
    line-height: var(--erp-typography-content1-line-height);
    text-align: left;
    cursor: pointer;
}

.warehouse-search-result-option:hover {
    background: var(
        --inventory-warehouse-cascader-active-bg,
        var(--erp-color-fill-hover)
    );
}

.warehouse-search-result-option span {
    word-break: break-all;
}

.warehouse-empty {
    grid-column: 1 / -1;
    min-height: 86px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--erp-color-text-tertiary);
    font-size: var(--erp-typography-content1-font-size);
    line-height: var(--erp-typography-content1-line-height);
}
</style>
