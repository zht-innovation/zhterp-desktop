<template>
    <section>
        <header class="home-card-header">
            <h2>个人日历</h2>
            <div class="week-actions">
                <button type="button" aria-label="上一周" @click="changeWeek(-1)">‹</button>
                <span>{{ days[0] }} 至 {{ days[6] }}</span>
                <button type="button" aria-label="下一周" @click="changeWeek(1)">›</button>
                <button type="button" @click="goToday">今天</button>
            </div>
        </header>
        <div class="week">
            <span v-for="label in weekdays" :key="label">{{ label }}</span>
            <button v-for="day in days" :key="day" type="button" :aria-label="day"
                :aria-current="day === today ? 'date' : undefined" :aria-pressed="day === selected"
                @click="selected = day">
                {{ Number(day.slice(-2)) }}<i v-if="markedDates.has(day)" aria-label="有个人事项" />
            </button>
        </div>
        <header class="agenda">
            <h3>{{ selected }} 的事项</h3>
            <button type="button" class="home-action" @click="openEditor()">＋ 新增事项</button>
        </header>
        <p v-if="storageError" role="alert">{{ storageError }}</p>
        <p v-else-if="!dayEvents.length" class="home-card-note">当天暂无个人事项。</p>
        <button v-for="event in dayEvents" :key="event.id" class="event" type="button" @click="openEditor(event)">
            <span>{{ event.title }}</span><small>编辑</small>
        </button>

        <el-dialog v-model="editing" :title="editingId ? '编辑个人事项' : '新增个人事项'" width="min(420px, 92vw)" append-to-body>
            <form class="event-form" @submit.prevent="saveEvent">
                <label>日期<input v-model="draftDate" type="date" min="0001-01-01" max="9999-12-31" required /></label>
                <label>事项<input v-model="draftTitle" maxlength="100" required /></label>
                <p v-if="formError" role="alert">{{ formError }}</p>
                <div class="form-actions">
                    <el-button v-if="editingId" type="danger" plain @click="commit(true)">删除事项</el-button>
                    <el-button @click="editing = false">取消</el-button>
                    <el-button type="primary" native-type="submit">保存</el-button>
                </div>
            </form>
        </el-dialog>
    </section>
</template>

<script setup lang="ts">
type PersonalEvent = { id: string; date: string; title: string };

const props = defineProps<{ username: string }>();
const storageKey = "erp:home:calendar:" + encodeURIComponent(props.username);
const weekdays = ["一", "二", "三", "四", "五", "六", "日"];
const beijingDate = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Shanghai" });
const today = ref(beijingDate());
const selected = ref(today.value);
const events = ref<PersonalEvent[]>([]);
const editing = ref(false);
const editingId = ref("");
const draftTitle = ref("");
const draftDate = ref("");
const formError = ref("");
const storageError = ref("");

// 日期只表示日历日，使用 UTC 做加减，避免设备时区或夏令时改变结果。
function shiftDate(day: string, offset: number) {
    const date = new Date(day + "T00:00:00Z");
    date.setUTCDate(date.getUTCDate() + offset);
    return date.toISOString().split("T")[0];
}
const days = computed(() => {
    const weekday = new Date(selected.value + "T00:00:00Z").getUTCDay();
    const monday = shiftDate(selected.value, -((weekday + 6) % 7));
    return weekdays.map((_, index) => shiftDate(monday, index));
});
const dayEvents = computed(() => events.value.filter(item => item.date === selected.value));
const markedDates = computed(() => new Set(events.value.map(item => item.date)));

function changeWeek(offset: number) {
    const day = shiftDate(selected.value, offset * 7);
    if (/^\d{4}-/.test(day) && day >= "0001-01-01") selected.value = day;
}
function goToday() {
    today.value = beijingDate();
    selected.value = today.value;
}
function readEvents(): PersonalEvent[] {
    const value = localStorage.getItem(storageKey);
    if (value === null) return [];
    const items = JSON.parse(value);
    if (!Array.isArray(items) || !items.every(item => item && typeof item.id === "string"
        && typeof item.date === "string" && typeof item.title === "string")) {
        throw new Error("个人日历数据无效");
    }
    return items;
}
function reload() {
    today.value = beijingDate();
    try {
        events.value = readEvents();
        storageError.value = "";
    } catch {
        storageError.value = "无法读取本机个人事项。";
    }
}
function onStorage(event: StorageEvent) {
    if (event.key === storageKey || event.key === null) reload();
}
onMounted(() => {
    reload();
    window.addEventListener("storage", onStorage);
    window.addEventListener("focus", reload);
});
onUnmounted(() => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener("focus", reload);
});

function openEditor(item?: PersonalEvent) {
    editingId.value = item?.id || "";
    draftDate.value = item?.date || selected.value;
    draftTitle.value = item?.title || "";
    formError.value = "";
    editing.value = true;
}
function saveEvent() {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(draftDate.value) || !draftTitle.value.trim() || draftTitle.value.trim().length > 100) {
        formError.value = "请填写有效日期及 100 字以内的事项名称。";
        return;
    }
    commit(false);
}
function commit(remove: boolean) {
    try {
        const items = readEvents();
        const index = items.findIndex(item => item.id === editingId.value);
        if (editingId.value && index < 0) {
            formError.value = "此事项已被删除。";
            return;
        }
        if (remove) {
            items.splice(index, 1);
        } else {
            const item = { id: editingId.value || crypto.randomUUID(), date: draftDate.value, title: draftTitle.value.trim() };
            if (index < 0) items.push(item);
            else items[index] = item;
        }
        localStorage.setItem(storageKey, JSON.stringify(items));
        events.value = items;
        if (!remove) selected.value = draftDate.value;
        storageError.value = "";
        editing.value = false;
    } catch {
        formError.value = "无法保存个人事项，请检查本机存储后重试。";
    }
}
</script>

<style scoped>
.week-actions, .agenda, .form-actions { display: flex; align-items: center; flex-wrap: wrap; gap: 6px; }
.week-actions { color: var(--secondary); font-size: 12px; }
.week-actions button, .week button { border: 1px solid var(--border); border-radius: 4px; background: white; color: inherit; cursor: pointer; }
.week-actions button { padding: 2px 6px; }
.week { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 4px; text-align: center; }
.week > span { font-size: 12px; color: var(--secondary); }
.week button { position: relative; min-height: 34px; }
.week button[aria-current="date"] { border-color: var(--brand); }
.week button[aria-pressed="true"] { color: #2678a9; background: var(--brand-soft); }
.week i { position: absolute; bottom: 3px; left: calc(50% - 2px); width: 4px; height: 4px; border-radius: 50%; background: var(--brand); }
.agenda { justify-content: space-between; margin: 14px 0 6px; }
h3 { font-size: 13px; margin: 0; }
.event { display: flex; align-items: center; justify-content: space-between; gap: 8px; width: 100%; margin-top: 4px; padding: 6px 8px; border: 0; border-radius: 4px; background: var(--brand-soft); text-align: left; overflow-wrap: anywhere; cursor: pointer; }
.event small { flex: none; color: var(--secondary); }
.event-form, .event-form label { display: grid; gap: 8px; }
.event-form { gap: 14px; }
.event-form input { padding: 6px 8px; border: 1px solid #dcdfe6; border-radius: 4px; }
.event-form [role="alert"] { color: #b42318; }
.form-actions { justify-content: flex-end; }
</style>
