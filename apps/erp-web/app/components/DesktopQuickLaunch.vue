<template>
    <el-dialog
        v-model="visible"
        title="快捷入口"
        width="min(640px, calc(100vw - 32px))"
        append-to-body
        align-center
        :close-on-click-modal="false"
        :close-on-press-escape="!composing"
        @open-auto-focus="focusSearchAfterTrap"
        @close="close"
        @closed="composing = false"
    >
        <div class="quick-launch" :aria-busy="busy">
            <div class="quick-launch-search">
                <Icon name="lucide:search" aria-hidden="true" />
                <input
                    ref="searchInput"
                    v-model="query"
                    type="text"
                    role="combobox"
                    aria-label="搜索功能入口"
                    aria-autocomplete="list"
                    aria-haspopup="listbox"
                    :aria-expanded="visible && available"
                    :aria-controls="available ? listboxId : undefined"
                    :aria-activedescendant="activeOptionId"
                    :aria-disabled="!available"
                    :readonly="busy || !available"
                    autocomplete="off"
                    spellcheck="false"
                    placeholder="搜索模块或菜单，例如：采购、库存、审批"
                    @keydown="handleSearchKeydown"
                >
                <kbd>{{ shortcutLabel }}</kbd>
            </div>

            <p v-if="notice" class="quick-launch-notice" role="status">{{ notice }}</p>
            <p v-if="!available" class="quick-launch-empty" role="status">请先登录，再使用快捷入口。</p>

            <div v-else ref="resultsContainer" class="quick-launch-results" @keydown="handleResultsKeydown">
                <div :id="listboxId" class="quick-launch-options" role="listbox" aria-label="可访问的功能入口">
                    <button
                        v-for="(item, index) in results"
                        :id="optionId(index)"
                        :key="item.id"
                        class="quick-launch-option"
                        :class="{ 'is-active': item.id === activeId }"
                        :data-result-index="index"
                        type="button"
                        role="option"
                        tabindex="-1"
                        :aria-selected="item.id === activeId"
                        :aria-label="`${item.label}，${item.moduleLabel}，${item.sourceLabel}`"
                        :disabled="busy"
                        @mouseenter="activeId = item.id"
                        @focus="activeId = item.id"
                        @mousedown.prevent
                        @click="enterResult(item.id)"
                    >
                        <Icon :name="item.icon || 'lucide:folder'" class="quick-launch-item-icon" aria-hidden="true" />
                        <span class="quick-launch-item-text">
                            <strong>{{ item.label }}</strong>
                            <span>{{ item.moduleLabel }}</span>
                        </span>
                        <span class="quick-launch-source">{{ item.sourceLabel }}</span>
                    </button>
                </div>

                <!-- 收藏按钮与 listbox 并列，避免在选项或导航按钮中嵌套交互控件。 -->
                <div v-if="results.length" class="quick-launch-favorites" role="group" aria-label="收藏功能入口">
                    <div v-for="(item, index) in results" :key="item.id" class="quick-launch-favorite-slot">
                        <button
                            class="quick-launch-favorite"
                            :class="{ 'is-favorite': isFavorite(item.id) }"
                            :data-favorite-index="index"
                            type="button"
                            :aria-label="`${isFavorite(item.id) ? '取消收藏' : '收藏'}${item.label}`"
                            :aria-pressed="isFavorite(item.id)"
                            :title="isFavorite(item.id) ? '取消收藏' : '收藏'"
                            :disabled="busy"
                            @focus="activeId = item.id"
                            @click="toggleResultFavorite(item.id)"
                        >
                            <Icon name="lucide:star" aria-hidden="true" />
                        </button>
                    </div>
                </div>
                <p v-if="!results.length" class="quick-launch-empty" role="status">
                    {{ query.trim() ? '没有匹配的功能入口，请尝试其他关键词。' : '当前没有可访问的功能入口。' }}
                </p>
            </div>
        </div>

        <template #footer>
            <div class="quick-launch-footer">
                <span><kbd>↑</kbd><kbd>↓</kbd> 选择 <kbd>Enter</kbd> 进入 <kbd>Esc</kbd> 关闭</span>
                <span role="status">{{ busy ? '正在打开…' : '点击星标收藏常用入口' }}</span>
            </div>
        </template>
    </el-dialog>
</template>

<script setup lang="ts">
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { useDesktopQuickLaunch } from "~/composables/useDesktopQuickLaunch";

const { visible, query, results, available, busy, notice, open, close, activate, toggleFavorite, isFavorite } = useDesktopQuickLaunch();
const searchInput = ref<HTMLInputElement | null>(null);
const resultsContainer = ref<HTMLElement | null>(null);
const activeId = ref("");
const composing = ref(false);
const isMac = ref(false);
const listboxId = "desktop-quick-launch-results";
const shortcutLabel = computed(() => isMac.value ? "⌘ K" : "Ctrl K");
const activeIndex = computed(() => results.value.findIndex(item => item.id === activeId.value));
const optionId = (index: number) => `${listboxId}-option-${index}`;
const activeOptionId = computed(() => available.value && activeIndex.value >= 0 ? optionId(activeIndex.value) : undefined);

let unlisten: UnlistenFn | undefined;
let disposed = false;

function focusSearch() {
    if (visible.value) searchInput.value?.focus({ preventScroll: true });
}

async function focusSearchAfterTrap() {
    // Element Plus 会在下一次更新中聚焦弹窗容器，完成后再聚焦搜索框。
    await nextTick();
    await nextTick();
    if (!disposed) focusSearch();
}

function openQuickLaunch() {
    if (disposed || visible.value || composing.value) return;
    open();
}

function startComposition() {
    composing.value = true;
}

function endComposition() {
    composing.value = false;
}

function isComposing(event: KeyboardEvent) {
    return composing.value || event.isComposing || event.keyCode === 229;
}

function moveSelection(direction: number) {
    if (!results.value.length || busy.value || !available.value) return;
    const next = (activeIndex.value + direction + results.value.length) % results.value.length;
    const item = results.value[next];
    if (item) activeId.value = item.id;
}

function enterResult(id: string) {
    if (busy.value || !available.value) return;
    void activate(id);
}

function focusFavorite() {
    const favorite = resultsContainer.value?.querySelector<HTMLButtonElement>(`[data-favorite-index="${activeIndex.value}"]`);
    favorite?.focus({ preventScroll: true });
}

async function toggleResultFavorite(id: string) {
    if (busy.value || !available.value) return;
    activeId.value = id;
    toggleFavorite(id);
    await nextTick();
    if (visible.value && !disposed) focusFavorite();
}

function handleSearchKeydown(event: KeyboardEvent) {
    if (isComposing(event)) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        event.stopPropagation();
        moveSelection(event.key === "ArrowDown" ? 1 : -1);
    } else if (event.key === "Enter") {
        event.preventDefault();
        event.stopPropagation();
        if (activeId.value) enterResult(activeId.value);
    } else if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        close();
    }
}

async function handleResultsKeydown(event: KeyboardEvent) {
    if (isComposing(event) || busy.value) return;
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    event.stopPropagation();
    const fromFavorite = event.target instanceof HTMLElement && event.target.closest(".quick-launch-favorite");
    moveSelection(event.key === "ArrowDown" ? 1 : -1);
    await nextTick();
    if (!visible.value || disposed) return;
    if (fromFavorite) {
        focusFavorite();
    } else {
        focusSearch();
    }
}

function handleWindowKeydown(event: KeyboardEvent) {
    if (isComposing(event)) {
        // Element Plus 在 document 监听 Esc；组合输入时保留输入法自己的取消行为。
        if (visible.value && event.key === "Escape") event.stopPropagation();
        return;
    }
    const primaryKey = isMac.value ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey;
    if (!primaryKey || event.altKey || event.shiftKey || event.key.toLowerCase() !== "k") return;
    event.preventDefault();
    event.stopPropagation();
    if (!event.repeat) openQuickLaunch();
}

watch(results, (items) => {
    if (!items.some(item => item.id === activeId.value)) activeId.value = items[0]?.id || "";
}, { immediate: true });

watch(query, () => { activeId.value = results.value[0]?.id || ""; });

watch(visible, (opened) => {
    if (opened) {
        composing.value = false;
        activeId.value = results.value[0]?.id || "";
    }
});

watch([activeId, results], async () => {
    if (!visible.value) return;
    await nextTick();
    const option = resultsContainer.value?.querySelector<HTMLElement>(`[data-result-index="${activeIndex.value}"]`);
    option?.scrollIntoView({ block: "nearest", inline: "nearest" });
});

onMounted(async () => {
    isMac.value = /Mac/i.test(navigator.platform);
    window.addEventListener("keydown", handleWindowKeydown, true);
    window.addEventListener("compositionstart", startComposition, true);
    window.addEventListener("compositionend", endComposition, true);
    try {
        const stop = await listen("erp-open-quick-launch", openQuickLaunch, {
            target: { kind: "WebviewWindow", label: "erp" },
        });
        if (disposed) {
            stop();
            return;
        }
        unlisten = stop;
        if (await invoke<boolean>("desktop_quick_launch_ready") && !disposed) openQuickLaunch();
    } catch (error) {
        console.error("初始化桌面快捷入口失败", error);
    }
});

onBeforeUnmount(() => {
    disposed = true;
    unlisten?.();
    window.removeEventListener("keydown", handleWindowKeydown, true);
    window.removeEventListener("compositionstart", startComposition, true);
    window.removeEventListener("compositionend", endComposition, true);
});
</script>

<style scoped>
.quick-launch {
    color: var(--el-text-color-primary);
    font-size: 14PX;
}

.quick-launch-search {
    display: flex;
    align-items: center;
    gap: 10PX;
    min-height: 44PX;
    padding: 0 12PX;
    border: 1PX solid var(--el-border-color);
    border-radius: 6PX;
    background: var(--el-fill-color-blank);
}

.quick-launch-search:focus-within {
    border-color: var(--el-color-primary);
}

.quick-launch-search > .iconify {
    flex: 0 0 18PX;
    width: 18PX;
    height: 18PX;
    color: var(--el-text-color-secondary);
}

.quick-launch-search input {
    min-width: 0;
    flex: 1;
    padding: 10PX 0;
    border: 0;
    outline: 0;
    background: transparent;
    color: inherit;
    font: inherit;
}

.quick-launch-search input::placeholder {
    color: var(--el-text-color-placeholder);
}

.quick-launch-results {
    display: flex;
    flex-wrap: wrap;
    gap: 8PX;
    max-height: min(360PX, 45vh);
    margin-top: 12PX;
    overflow: auto;
    overscroll-behavior: contain;
}

.quick-launch-options {
    min-width: 0;
    flex: 1;
}

.quick-launch-options,
.quick-launch-favorites {
    display: flex;
    flex-direction: column;
    gap: 4PX;
}

.quick-launch-option {
    display: flex;
    align-items: center;
    gap: 10PX;
    flex: 0 0 60PX;
    width: 100%;
    height: 60PX;
    padding: 8PX 10PX;
    border: 1PX solid transparent;
    border-radius: 6PX;
    background: transparent;
    color: inherit;
    font: inherit;
    text-align: left;
    cursor: pointer;
}

.quick-launch-option.is-active {
    background: var(--el-color-primary-light-9);
    color: var(--el-color-primary);
}

.quick-launch-item-icon {
    flex: 0 0 20PX;
    width: 20PX;
    height: 20PX;
}

.quick-launch-item-text {
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: 4PX;
    min-width: 0;
}

.quick-launch-item-text strong,
.quick-launch-item-text > span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.quick-launch-item-text strong {
    font-size: 14PX;
    font-weight: 500;
    line-height: 20PX;
}

.quick-launch-item-text > span,
.quick-launch-source {
    color: var(--el-text-color-secondary);
    font-size: 12PX;
    line-height: 16PX;
}

.quick-launch-source {
    flex: 0 0 auto;
}

.quick-launch-favorite-slot {
    display: flex;
    align-items: center;
    flex: 0 0 60PX;
    height: 60PX;
}

.quick-launch-favorite {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 36PX;
    height: 36PX;
    border: 1PX solid transparent;
    border-radius: 6PX;
    background: transparent;
    color: var(--el-text-color-secondary);
    font-size: 18PX;
    cursor: pointer;
}

.quick-launch-favorite.is-favorite {
    color: var(--el-color-warning);
}

.quick-launch-favorite:hover {
    background: var(--el-fill-color-light);
}

.quick-launch-option:focus-visible,
.quick-launch-favorite:focus-visible {
    outline: 2PX solid var(--el-color-primary);
    outline-offset: -2PX;
}

.quick-launch button:disabled {
    cursor: wait;
    opacity: 0.65;
}

.quick-launch-empty {
    width: 100%;
    margin: 0;
    padding: 28PX 12PX;
    color: var(--el-text-color-secondary);
    font-size: 14PX;
    line-height: 22PX;
    text-align: center;
}

.quick-launch-notice {
    margin: 12PX 0 0;
    color: var(--el-color-warning);
    font-size: 13PX;
    line-height: 20PX;
}

.quick-launch-footer {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    gap: 8PX;
    color: var(--el-text-color-secondary);
    font-size: 12PX;
    line-height: 20PX;
    text-align: left;
}

kbd {
    display: inline-block;
    padding: 0 4PX;
    border: 1PX solid var(--el-border-color-light);
    border-radius: 4PX;
    background: var(--el-fill-color-light);
    color: var(--el-text-color-secondary);
    font-family: inherit;
    font-size: 12PX;
    line-height: 20PX;
    white-space: nowrap;
}

.quick-launch-footer kbd + kbd {
    margin-left: 2PX;
}

@media (max-width: 480PX) {
    .quick-launch-source {
        display: none;
    }

    .quick-launch-search > kbd {
        display: none;
    }
}
</style>
