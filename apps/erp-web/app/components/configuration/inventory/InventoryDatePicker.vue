<template>
    <div ref="pickerRef" class="inventory-date-picker">
        <button
            class="date-trigger"
            type="button"
            :aria-expanded="isOpen"
            :aria-label="triggerAriaLabel"
            :disabled="disabled"
            @click.stop="togglePicker"
        >
            <Icon name="lucide:calendar-days" class="date-trigger-icon" />
            <span :class="{ placeholder: !model }">
                {{ model || placeholder }}
            </span>
        </button>

        <div
            v-if="isOpen"
            class="date-panel"
            @click.stop
        >
            <header class="calendar-header">
                <h3>{{ calendarTitle }}</h3>
                <div class="calendar-nav">
                    <button
                        type="button"
                        aria-label="上一月"
                        @click="shiftCalendarMonth(-1)"
                    >
                        <Icon name="lucide:chevron-left" />
                    </button>
                    <button
                        type="button"
                        aria-label="下一月"
                        @click="shiftCalendarMonth(1)"
                    >
                        <Icon name="lucide:chevron-right" />
                    </button>
                </div>
            </header>

            <div class="calendar-weekdays">
                <span
                    v-for="weekday in calendarWeekdays"
                    :key="weekday"
                >
                    {{ weekday }}
                </span>
            </div>

            <div class="calendar-days">
                <button
                    v-for="(day, index) in calendarDays"
                    :key="day.value || `empty-${index}`"
                    class="calendar-day"
                    :class="getCalendarDayClass(day)"
                    type="button"
                    :disabled="!day.value"
                    @click="selectDate(day)"
                >
                    {{ day.day }}
                </button>
            </div>

            <button class="today-button" type="button" @click="selectToday">
                今天
            </button>
        </div>
    </div>
</template>

<script setup lang="ts">
interface CalendarDay {
    day: string;
    value: string;
}

const props = withDefaults(defineProps<{
    placeholder?: string;
    ariaLabel?: string;
    ariaLabelText?: string;
    initialMonth?: string;
    disabled?: boolean;
}>(), {
    placeholder: "请选择",
    ariaLabel: "选择日期",
    ariaLabelText: "",
    initialMonth: "",
    disabled: false,
});

const emit = defineEmits<{
    change: [value: string];
}>();

const model = defineModel<string>({ default: "" });
const pickerRef = ref<HTMLElement | null>(null);
const isOpen = ref(false);
const calendarBaseDate = ref(getInitialCalendarMonth());
const calendarWeekdays = ["一", "二", "三", "四", "五", "六", "日"];

const calendarTitle = computed(() => formatCalendarMonth(calendarBaseDate.value));
const calendarDays = computed(() => buildCalendarDays(calendarBaseDate.value));
const triggerAriaLabel = computed(() => props.ariaLabelText || props.ariaLabel);

const padDatePart = (value: number) => String(value).padStart(2, "0");

const formatDateValue = (date: Date) =>
    `${date.getFullYear()}-${padDatePart(date.getMonth() + 1)}-${padDatePart(date.getDate())}`;

const formatCalendarMonth = (date: Date) =>
    `${date.getFullYear()}年${date.getMonth() + 1}月`;

function parseDateValue(value: string) {
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);

    if (!match) {
        return null;
    }

    const year = Number(match[1]);
    const month = Number(match[2]) - 1;
    const day = Number(match[3]);
    const date = new Date(year, month, day);

    if (
        date.getFullYear() !== year
        || date.getMonth() !== month
        || date.getDate() !== day
    ) {
        return null;
    }

    return date;
}

function getInitialCalendarMonth() {
    const initialDate = parseDateValue(props.initialMonth);
    const today = new Date();
    const baseDate = initialDate ?? today;

    return new Date(baseDate.getFullYear(), baseDate.getMonth(), 1);
}

function buildCalendarDays(monthDate: Date): CalendarDay[] {
    const year = monthDate.getFullYear();
    const month = monthDate.getMonth();
    const firstDate = new Date(year, month, 1);
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const firstWeekday = (firstDate.getDay() + 6) % 7;
    const days: CalendarDay[] = Array.from({ length: firstWeekday }, () => ({
        day: "",
        value: "",
    }));

    for (let day = 1; day <= daysInMonth; day += 1) {
        const date = new Date(year, month, day);

        days.push({
            day: String(day),
            value: formatDateValue(date),
        });
    }

    while (days.length % 7 !== 0) {
        days.push({
            day: "",
            value: "",
        });
    }

    return days;
}

const syncCalendarToModel = () => {
    if (!model.value) {
        return;
    }

    const selectedDate = parseDateValue(model.value);

    if (!selectedDate) {
        return;
    }

    calendarBaseDate.value = new Date(
        selectedDate.getFullYear(),
        selectedDate.getMonth(),
        1,
    );
};

const togglePicker = () => {
    if (props.disabled) {
        return;
    }

    if (!isOpen.value) {
        syncCalendarToModel();
    }

    isOpen.value = !isOpen.value;
};

const shiftCalendarMonth = (offset: number) => {
    calendarBaseDate.value = new Date(
        calendarBaseDate.value.getFullYear(),
        calendarBaseDate.value.getMonth() + offset,
        1,
    );
};

const selectDate = (day: CalendarDay) => {
    if (!day.value) {
        return;
    }

    model.value = day.value;
    emit("change", day.value);
    isOpen.value = false;
};

const selectToday = () => {
    const today = new Date();
    const value = formatDateValue(today);

    model.value = value;
    calendarBaseDate.value = new Date(today.getFullYear(), today.getMonth(), 1);
    emit("change", value);
    isOpen.value = false;
};

const getCalendarDayClass = (day: CalendarDay) => ({
    empty: !day.value,
    selected: Boolean(day.value && day.value === model.value),
});

const handlePageClick = (event: MouseEvent) => {
    const target = event.target as Node;

    if (isOpen.value && !pickerRef.value?.contains(target)) {
        isOpen.value = false;
    }
};

const close = () => {
    isOpen.value = false;
};

defineExpose({ close });

onMounted(() => {
    document.addEventListener("click", handlePageClick);
});

onBeforeUnmount(() => {
    document.removeEventListener("click", handlePageClick);
});
</script>

<style scoped>
.inventory-date-picker {
    position: relative;
    width: 244px;
    max-width: 244px;
    flex: 0 1 244px;
    box-sizing: border-box;
}

.date-trigger {
    width: 100%;
    height: var(--erp-size-control-height-sm);
    display: flex;
    align-items: center;
    gap: var(--erp-spacing-8);
    padding: 0 var(--erp-spacing-12);
    border: 1px solid var(--erp-color-border-default);
    border-radius: var(--erp-radius-control-default);
    color: var(--erp-color-text-primary);
    background: var(--erp-color-fill-default);
    font: inherit;
    font-size: var(--erp-typography-content1-font-size);
    font-weight: var(--erp-typography-content1-font-weight);
    line-height: var(--erp-typography-content1-line-height);
    cursor: pointer;
    appearance: none;
    box-sizing: border-box;
}

.date-trigger:disabled {
    border-color: var(--erp-color-border-muted);
    color: var(--erp-color-text-disabled);
    background: var(--erp-color-fill-disabled);
    cursor: not-allowed;
}

.date-trigger .placeholder {
    color: inherit;
}

.date-trigger-icon {
    width: 16px;
    height: 16px;
    flex: 0 0 16px;
    color: var(--erp-color-icon-default);
}

.date-trigger span {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.date-panel {
    position: absolute;
    top: calc(100% + var(--erp-spacing-8));
    left: 0;
    z-index: 40;
    width: min(var(--inventory-date-picker-panel-width, 288px), calc(100vw - 32px));
    padding: var(--erp-spacing-20) 24px;
    border: 1px solid var(--erp-color-border-muted);
    border-radius: var(--erp-radius-surface-default);
    background: var(--erp-color-fill-default);
    box-shadow: var(--erp-shadow-surface);
    box-sizing: border-box;
}

.calendar-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: var(--erp-spacing-20);
}

.calendar-header h3 {
    margin: 0;
    color: var(--erp-color-text-primary);
    font-size: var(--erp-typography-title1-font-size);
    font-weight: var(--erp-typography-title1-font-weight);
    line-height: var(--erp-typography-title1-line-height);
}

.calendar-nav {
    display: flex;
    align-items: center;
    gap: var(--erp-spacing-8);
}

.calendar-nav button {
    width: 24px;
    height: 24px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    border: 0;
    color: var(--erp-color-icon-default);
    background: transparent;
    font: inherit;
    cursor: pointer;
    appearance: none;
}

.calendar-nav :deep(svg) {
    width: 16px;
    height: 16px;
}

.calendar-weekdays,
.calendar-days {
    display: grid;
    grid-template-columns: repeat(7, 1fr);
    text-align: center;
}

.calendar-weekdays {
    margin-bottom: var(--erp-spacing-12);
    color: var(--erp-color-text-primary);
    font-size: var(--erp-typography-title2-font-size);
    font-weight: var(--erp-typography-title2-font-weight);
    line-height: var(--erp-typography-title2-line-height);
}

.calendar-weekdays span,
.calendar-day {
    height: var(--erp-size-control-height-sm);
    display: flex;
    align-items: center;
    justify-content: center;
}

.calendar-day {
    position: relative;
    z-index: 0;
    padding: 0;
    border: 0;
    border-radius: 0;
    color: var(--erp-color-text-secondary);
    background: transparent;
    font: inherit;
    font-size: var(--erp-typography-content1-font-size);
    font-weight: var(--erp-typography-content1-font-weight);
    line-height: var(--erp-typography-content1-line-height);
    cursor: pointer;
    appearance: none;
}

.calendar-day.empty {
    cursor: default;
}

.calendar-day.selected {
    color: var(--erp-color-text-white);
}

.calendar-day.selected::before {
    content: "";
    position: absolute;
    z-index: -1;
    width: var(--erp-size-control-height-sm);
    height: var(--erp-size-control-height-sm);
    border-radius: 50%;
    background: var(--erp-color-action-primary);
}

.today-button {
    width: fit-content;
    display: block;
    margin: var(--erp-spacing-20) auto 0;
    padding: 0;
    border: 0;
    color: var(--erp-color-text-brand);
    background: transparent;
    font: inherit;
    font-size: var(--erp-typography-title1-font-size);
    font-weight: var(--erp-typography-title1-font-weight);
    line-height: var(--erp-typography-title1-line-height);
    cursor: pointer;
    appearance: none;
}

@media (max-width: 760px) {
    .date-panel {
        width: min(var(--inventory-date-picker-panel-width-compact, 260px), calc(100vw - 24px));
        padding: 20px 22px 22px;
    }

    .calendar-header {
        margin-bottom: 18px;
    }

    .calendar-weekdays {
        margin-bottom: 10px;
        font-size: 15px;
    }

    .calendar-day {
        height: 29px;
        font-size: 14px;
    }

    .calendar-day.selected::before {
        width: 32px;
        height: 32px;
    }

    .today-button {
        margin-top: 18px;
        font-size: 16px;
    }
}
</style>
