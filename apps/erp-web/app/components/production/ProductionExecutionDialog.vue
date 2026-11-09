<template>
    <Teleport to="body">
        <div ref="overlay" class="production-execution-overlay erp-app" @click.self="requestClose" @wheel.self.prevent>
            <section ref="dialogElement" class="production-execution-dialog-shell" :style="{ width }" role="dialog" aria-modal="true" :aria-label="title" tabindex="-1">
                <ErpDialogFrame class="production-execution-dialog" :title="title" width="100%" :form="false" :close-disabled="closeDisabled" @close="requestClose">
                    <slot />
                    <template #footer><slot name="footer" /></template>
                </ErpDialogFrame>
            </section>
        </div>
    </Teleport>
</template>

<script setup lang="ts">
import ErpDialogFrame from "~/components/configuration/ErpDialogFrame.vue";

const props = withDefaults(defineProps<{
    title: string;
    width?: string;
    closeDisabled?: boolean;
}>(), { width: "1000px", closeDisabled: false });
const emit = defineEmits<{ close: [] }>();
const overlay = ref<HTMLElement | null>(null);
const dialogElement = ref<HTMLElement | null>(null);
let previousFocus: HTMLElement | null = null;

const requestClose = () => {
    if (!props.closeDisabled) emit("close");
};
const focusableElements = () => Array.from(dialogElement.value?.querySelectorAll<HTMLElement>(
    'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], summary, [tabindex="0"]',
) || []).filter((element) => element.getClientRects().length > 0);
const handleKeydown = (event: KeyboardEvent) => {
    const overlays = document.querySelectorAll(".production-execution-overlay");
    if (overlays[overlays.length - 1] !== overlay.value) return;
    const imageOverlays = document.querySelectorAll<HTMLElement>(".erp-image-preview-overlay");
    if (Array.from(imageOverlays).some((element) => element.getClientRects().length > 0)) return;
    if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        requestClose();
    }
    if (event.key !== "Tab") return;
    const elements = focusableElements();
    const first = elements[0];
    const last = elements[elements.length - 1];
    if (!first) {
        event.preventDefault();
        dialogElement.value?.focus();
    } else if (event.shiftKey && (document.activeElement === first || !dialogElement.value?.contains(document.activeElement))) {
        event.preventDefault();
        last.focus();
    } else if (!event.shiftKey && (document.activeElement === last || !dialogElement.value?.contains(document.activeElement))) {
        event.preventDefault();
        first.focus();
    }
};

onMounted(() => {
    previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    document.addEventListener("keydown", handleKeydown);
    nextTick(() => (focusableElements()[0] || dialogElement.value)?.focus({ preventScroll: true }));
});
onUnmounted(() => {
    document.removeEventListener("keydown", handleKeydown);
    const overlays = document.querySelectorAll(".production-execution-overlay");
    const topOverlay = overlays[overlays.length - 1];
    if (previousFocus?.isConnected && (!topOverlay || topOverlay.contains(previousFocus))) {
        previousFocus.focus({ preventScroll: true });
    } else {
        topOverlay?.querySelector<HTMLElement>(".production-execution-dialog-shell")?.focus({ preventScroll: true });
    }
});
</script>
