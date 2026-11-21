<template>
    <section>
        <header class="home-card-header">
            <h2>项目日志</h2>
            <NuxtLink class="home-action" to="/configuration/sales/logs">查看全部</NuxtLink>
        </header>
        <p v-if="error" role="alert">{{ error }} <button type="button" class="home-action" @click="$emit('retry')">重试</button></p>
        <p v-else-if="!logs.length" class="home-card-note">{{ loading ? '加载中…' : '暂无项目日志。' }}</p>
        <article v-for="log in logs.slice(0, 2)" :key="log._id" class="log-entry">
            <div class="author">
                <el-avatar :size="28" :src="resolveErpImageUrl(log.salesperson?.avatar || undefined)">
                    {{ (log.salesperson?.nameCn || log.salesperson?.name || '未知')[0] }}
                </el-avatar>
                <strong>{{ log.salesperson?.nameCn || log.salesperson?.name || '未知销售' }}</strong>
                <small>{{ customerName(log) }}</small>
            </div>
            <div class="log-body">
                <span>{{ log.subject || log.content || '无内容' }}</span>
                <button type="button" class="home-action" @click="selected = log">详细查看</button>
            </div>
        </article>
        <NuxtLink v-if="logs.length > 2" class="home-action more" to="/configuration/sales/logs">
            还有 {{ logs.length - 2 }} 条日志
        </NuxtLink>
        <LogFormModal v-if="selected" :visible="true" readonly :customer-name="customerName(selected)"
            :initial-data="{ ...selected, logDate: selected.logDate?.slice(0, 10) }"
            @update:visible="visible => { if (!visible) selected = null }" />
    </section>
</template>

<script setup lang="ts">
import type { SalesProjectLog } from "~/composables/api/useLogApi";
import { resolveErpImageUrl } from "~/utils/attachmentPreview";
import LogFormModal from "~/components/configuration/sales/LogFormModal.vue";

defineProps<{ logs: SalesProjectLog[]; loading: boolean; error: string }>();
defineEmits<{ retry: [] }>();
const selected = ref<SalesProjectLog | null>(null);
const customerName = (log: SalesProjectLog) => log.customer?.name || log.customer?.company || log.customer?.id || "未知客户";
</script>

<style scoped>
.log-entry + .log-entry, .more { margin-top: 12px; }
.author, .log-body { display: flex; align-items: center; gap: 8px; overflow-wrap: anywhere; }
.author small { color: var(--secondary); }
.log-body { justify-content: space-between; margin-top: 5px; padding: 6px 9px; border-radius: 6px; background: var(--brand-soft); }
.log-body button { flex: none; }
.more { display: inline-block; }
</style>
