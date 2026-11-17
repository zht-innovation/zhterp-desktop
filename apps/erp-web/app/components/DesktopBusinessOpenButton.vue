<script setup lang="ts">
import { openDesktopBusinessWindow } from "~/composables/useDesktopBusinessWindows";
import type { DesktopBusinessKind } from "~/types/desktopBusiness";

const props = defineProps<{ kind: DesktopBusinessKind; recordId: string }>();
const desktop = useRuntimeConfig().public.erpDesktop === true;
const opening = ref(false);
let disposed = false;

async function open() {
    if (opening.value || !props.recordId) return;
    opening.value = true;
    try {
        await openDesktopBusinessWindow(props.kind, props.recordId);
    } catch (error) {
        if (!disposed) ElMessage.error(error instanceof Error ? error.message : String(error || "无法打开独立窗口。"));
    } finally { opening.value = false; }
}

onBeforeUnmount(() => { disposed = true; });
</script>

<template>
    <button v-if="desktop && recordId" class="desktop-business-open" type="button" :disabled="opening" @click="open">
        {{ opening ? '正在打开…' : '在独立窗口查看' }}
    </button>
</template>

<style scoped>
.desktop-business-open { padding: 6px 12px; border: 1px solid var(--erp-color-border-default, #cbd5e1); border-radius: 5px; color: var(--erp-color-text-brand, #2563eb); background: var(--erp-color-fill-default, white); font: inherit; font-size: 13px; cursor: pointer; white-space: nowrap; }
.desktop-business-open:disabled { opacity: .6; cursor: default; }
.desktop-business-open:focus-visible { outline: 2px solid #2563eb; outline-offset: 2px; }
</style>
