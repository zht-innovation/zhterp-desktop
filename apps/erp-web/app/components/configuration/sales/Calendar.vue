<template>
    <div class="calendar-container">
        <!-- Month View -->
        <template v-if="!expandedDate">
            <div class="calendar-header">
                <div class="month-selector">
                    <button class="nav-btn" @click="changeMonth(-1)"><Icon name="heroicons:chevron-left" /></button>
                    <div class="quick-select">
                        <select v-model.number="currentYear" class="select-input">
                            <option v-for="year in yearOptions" :key="year" :value="year">{{ year }}年</option>
                        </select>
                        <select v-model.number="currentMonth" class="select-input">
                            <option v-for="month in monthOptions" :key="month" :value="month - 1">{{ month }}月</option>
                        </select>
                    </div>
                    <button class="nav-btn" @click="changeMonth(1)"><Icon name="heroicons:chevron-right" /></button>
                </div>
                <div class="view-options">
                    <button class="today-btn" @click="goToToday">今天</button>
                </div>
            </div>

            <div class="calendar-grid">
                <!-- Week Header -->
                <div class="week-header">
                    <div v-for="day in weekDays" :key="day" class="week-day">{{ day }}</div>
                </div>

                <!-- Days Grid -->
                <div class="days-body">
                    <!-- Padding Days (Previous Month) -->
                    <div v-for="n in startDayOfWeek" :key="'prev-' + n" class="day-cell padding-day"></div>

                    <!-- Actual Days -->
                    <div 
                        v-for="day in daysInMonth" 
                        :key="day" 
                        class="day-cell"
                        :class="{ 'selected': isSelected(day) }"
                        @click="selectDate(day)"
                        @dblclick="expandDay(day)"
                    >
                        <div class="date-number" :class="{ 'is-today': isToday(day) }">{{ day }}</div>
                        
                        <!-- Events (Limited to 1) -->
                        <div class="events-list">
                            <div 
                                v-for="(event, idx) in getEventsForDay(day).slice(0, 1)" 
                                :key="idx" 
                                class="event-item"
                                :class="event.type"
                            >
                                <div class="event-bar"></div>
                                <div class="event-content-wrapper">
                                    <div class="event-title">{{ event.title }}</div>
                                    <div class="event-desc">{{ event.content }}</div>
                                </div>
                                <div class="edit-icon" :title="canEdit ? '编辑' : '查看'" @click.stop="emitEditEvent(event)">
                                    <Icon :name="canEdit ? 'heroicons:pencil-square' : 'heroicons:eye'" />
                                </div>
                            </div>
                            <div
                                v-if="getEventsForDay(day).length > 1"
                                class="more-events"
                                @click.stop="expandDay(day)"
                            >
                                +{{ getEventsForDay(day).length - 1 }} 更多
                            </div>
                        </div>

                        <!-- Add Event Button (Visible on Selection) -->
                        <button 
                            v-if="canAdd && isSelected(day)" 
                            class="add-event-btn"
                            @click.stop="emitAddEvent(day)"
                        >
                            <Icon name="heroicons:plus" /> 添加日志
                        </button>
                    </div>
                </div>
            </div>
        </template>

        <!-- Expanded Day View (Full Size) -->
        <div v-else class="day-view-container">
            <div class="day-view-header">
                <div class="left-actions">
                    <button class="back-btn" @click="closeExpand">
                        <Icon name="heroicons:arrow-left" /> 返回月视图
                    </button>
                    <span class="day-title">{{ expandedDate }}</span>
                </div>
                <button v-if="canAdd" class="add-btn" @click="emitAddEventFromExpand">
                    <Icon name="heroicons:plus" /> 添加新日志
                </button>
            </div>
            
            <div class="day-view-content">
                <div 
                    v-for="(event, idx) in getEventsForDateStr(expandedDate)" 
                    :key="idx" 
                    class="event-item expanded"
                    :class="event.type"
                >
                    <div class="event-bar"></div>
                    <div class="event-content-wrapper">
                        <div class="event-title">{{ event.title }}</div>
                        <div class="event-desc">{{ event.content }}</div>
                    </div>
                    <div class="edit-icon" :title="canEdit ? '编辑' : '查看'" @click.stop="emitEditEvent(event)">
                        <Icon :name="canEdit ? 'heroicons:pencil-square' : 'heroicons:eye'" />
                    </div>
                </div>
                <div v-if="getEventsForDateStr(expandedDate).length === 0" class="no-events">
                    暂无日志
                </div>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
const props = defineProps<{
    events: Array<{ id?: number, date: string, title: string, content?: string, type: string }>
    canAdd?: boolean
    canEdit?: boolean
}>()

const canAdd = computed(() => props.canAdd !== false)
const canEdit = computed(() => props.canEdit !== false)

const emit = defineEmits(['add-event', 'edit-event'])

const weekDays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
const now = new Date()
const currentYear = ref(now.getFullYear())
const currentMonth = ref(now.getMonth()) // 0-11
const selectedDate = ref<string | null>(null)
const expandedDate = ref<string | null>(null)
const yearRange = 5

// Computed
const daysInMonth = computed(() => {
    return new Date(currentYear.value, currentMonth.value + 1, 0).getDate()
})

const startDayOfWeek = computed(() => {
    return new Date(currentYear.value, currentMonth.value, 1).getDay()
})

const yearOptions = computed(() => {
    const baseYear = now.getFullYear()
    const years: number[] = []
    for (let y = baseYear - yearRange; y <= baseYear + yearRange; y += 1) {
        years.push(y)
    }
    return years
})

const monthOptions = Array.from({ length: 12 }, (_, i) => i + 1)

// Methods
const changeMonth = (delta: number) => {
    let newMonth = currentMonth.value + delta
    if (newMonth > 11) {
        currentMonth.value = 0
        currentYear.value++
    } else if (newMonth < 0) {
        currentMonth.value = 11
        currentYear.value--
    } else {
        currentMonth.value = newMonth
    }
}

const goToToday = () => {
    const today = new Date()
    currentYear.value = today.getFullYear()
    currentMonth.value = today.getMonth()
    selectDate(today.getDate())
}

const formatDate = (day: number) => {
    const m = String(currentMonth.value + 1).padStart(2, '0')
    const d = String(day).padStart(2, '0')
    return `${currentYear.value}-${m}-${d}`
}

const isToday = (day: number) => {
    const today = new Date()
    return today.getDate() === day && 
           today.getMonth() === currentMonth.value && 
           today.getFullYear() === currentYear.value
}

const isSelected = (day: number) => {
    return selectedDate.value === formatDate(day)
}

const selectDate = (day: number) => {
    selectedDate.value = formatDate(day)
}

const expandDay = (day: number) => {
    expandedDate.value = formatDate(day)
}

const closeExpand = () => {
    expandedDate.value = null
}

const getEventsForDay = (day: number) => {
    const dateStr = formatDate(day)
    return props.events.filter(e => e.date === dateStr)
}

const getEventsForDateStr = (dateStr: string) => {
    return props.events.filter(e => e.date === dateStr)
}

const emitAddEvent = (day: number) => {
    emit('add-event', formatDate(day))
}

const emitAddEventFromExpand = () => {
    if (expandedDate.value) {
        emit('add-event', expandedDate.value)
    }
}

const emitEditEvent = (event: any) => {
    emit('edit-event', event)
}
</script>

<style scoped lang="less">
.calendar-container {
    height: 100%;
    display: flex;
    flex-direction: column;
    position: relative;
    
    .calendar-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 20px;

        .month-selector {
            display: flex;
            align-items: center;
            gap: 16px;

            .quick-select {
                display: flex;
                align-items: center;
                gap: 8px;

                .select-input {
                    height: 32px;
                    padding: 0 10px;
                    border: 1px solid #E5E7EB;
                    border-radius: 6px;
                    background: #fff;
                    font-size: 14px;
                    color: #374151;
                    cursor: pointer;

                    &:focus {
                        outline: none;
                        border-color: #4E8AF4;
                    }
                }
            }

            .nav-btn {
                width: 32px;
                height: 32px;
                border-radius: 50%;
                border: 1px solid #E5E7EB;
                background: #fff;
                display: flex;
                align-items: center;
                justify-content: center;
                cursor: pointer;
                color: #6B7280;
                
                &:hover {
                    background: #F9FAFB;
                    color: #111827;
                }
            }
        }

        .today-btn {
            padding: 6px 16px;
            border-radius: 6px;
            background: #F3F4F6;
            border: none;
            color: #4B5563;
            font-size: 14px;
            cursor: pointer;
            
            &:hover {
                background: #E5E7EB;
            }
        }
    }

    .calendar-grid {
        flex: 1;
        display: flex;
        flex-direction: column;
        border: 1px solid #E5E7EB;
        border-radius: 12px;
        overflow: hidden;

        .week-header {
            display: grid;
            grid-template-columns: repeat(7, 1fr);
            background: #F9FAFB;
            border-bottom: 1px solid #E5E7EB;

            .week-day {
                padding: 12px;
                text-align: center;
                font-size: 14px;
                color: #6B7280;
                font-weight: 500;
            }
        }

        .days-body {
            flex: 1;
            display: grid;
            grid-template-columns: repeat(7, 1fr);
            grid-auto-rows: 1fr; // Equal height rows
            background: #fff;

            .day-cell {
                position: relative;
                border-right: 1px solid #F3F4F6;
                border-bottom: 1px solid #F3F4F6;
                padding: 8px;
                min-height: 100px;
                display: flex;
                flex-direction: column;
                gap: 4px;
                position: relative;
                cursor: pointer;
                transition: background-color 0.2s;

                &:nth-child(7n) {
                    border-right: none;
                }

                &.padding-day {
                    background: #FAFAFA;
                    cursor: default;
                }

                &.selected {
                    background-color: #F0F9FF;
                    box-shadow: inset 0 0 0 2px #4E8AF4;
                }

                .date-number {
                    font-size: 14px;
                    color: #374151;
                    width: 24px;
                    height: 24px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    border-radius: 50%;

                    &.is-today {
                        background: #4E8AF4;
                        color: #fff;
                    }
                }

                .events-list {
                    position: absolute;
                    left: 5px;
                    right: 5px;
                    display: flex;
                    flex-direction: column;
                    gap: 4px;
                    width: auto;
                    overflow: hidden; // Hide overflow
                    flex: 1;

                    .event-item {
                        display: flex;
                        align-items: flex-start;
                        padding: 4px 6px;
                        border-radius: 4px;
                        gap: 6px;
                        position: relative;
                        min-width: 0;
                        
                        .event-bar {
                            width: 3px;
                            height: 100%;
                            min-height: 24px;
                            border-radius: 2px;
                            flex-shrink: 0;
                        }

                        .event-content-wrapper {
                            flex: 1;
                            overflow: hidden;
                            display: flex;
                            flex-direction: column;
                            gap: 2px;
                            min-width: 0;

                            .event-title {
                                font-size: 12px;
                                font-weight: 500;
                                white-space: nowrap;
                                overflow: hidden;
                                text-overflow: ellipsis;
                                line-height: 1.2;
                            }

                            .event-desc {
                                font-size: 11px;
                                color: #666;
                                overflow: hidden;
                                white-space: normal;
                                word-break: break-word;
                                overflow-wrap: anywhere;
                                display: -webkit-box;
                                -webkit-line-clamp: 2;
                                -webkit-box-orient: vertical;
                                line-height: 1.2;
                            }
                        }

                        .edit-icon {
                            display: none;
                            position: absolute;
                            right: 4px;
                            top: 50%;
                            transform: translateY(-50%);
                            background: rgba(255,255,255,0.9);
                            border-radius: 4px;
                            padding: 2px;
                            color: #4E8AF4;
                            cursor: pointer;
                            
                            &:hover {
                                background: #fff;
                                box-shadow: 0 1px 2px rgba(0,0,0,0.1);
                            }
                        }

                        &:hover .edit-icon {
                            display: block;
                        }

                        &.blue {
                            background: #EFF6FF;
                            color: #1E40AF;
                            .event-bar { background: #3B82F6; }
                        }

                        &.green {
                            background: #ECFDF5;
                            color: #065F46;
                            .event-bar { background: #10B981; }
                        }

                        &.gray {
                            background: #F3F4F6;
                            color: #4B5563;
                            .event-bar { background: #9CA3AF; }
                        }

                        &.pink {
                            background: #FFF1F2;
                            color: #9D174D;
                            .event-bar { background: #EC4899; }
                        }

                        &.red {
                            background: #FEF2F2;
                            color: #991B1B;
                            .event-bar { background: #EF4444; }
                        }
                    }

                    .more-events {
                        font-size: 11px;
                        color: #6B7280;
                        padding-left: 6px;
                        cursor: pointer;
                        user-select: none;

                        &:hover {
                            color: #4E8AF4;
                        }
                    }
                }

                .add-event-btn {
                    position: absolute;
                    bottom: 8px;
                    right: 8px;
                    background: #4E8AF4;
                    color: white;
                    border: none;
                    border-radius: 4px;
                    padding: 4px 8px;
                    font-size: 12px;
                    display: flex;
                    align-items: center;
                    gap: 4px;
                    cursor: pointer;
                    z-index: 10;
                    box-shadow: 0 2px 4px rgba(0,0,0,0.1);

                    &:hover {
                        background: #3B82F6;
                    }
                }
            }
        }
    }

    .day-view-container {
        flex: 1;
        display: flex;
        flex-direction: column;
        background: #fff;
        border-radius: 12px;
        border: 1px solid #E5E7EB;
        overflow: hidden;

        .day-view-header {
            padding: 16px 24px;
            border-bottom: 1px solid #F3F4F6;
            display: flex;
            justify-content: space-between;
            align-items: center;
            background: #F9FAFB;

            .left-actions {
                display: flex;
                align-items: center;
                gap: 16px;

                .back-btn {
                    display: flex;
                    align-items: center;
                    gap: 6px;
                    padding: 6px 12px;
                    border: 1px solid #E5E7EB;
                    background: #fff;
                    border-radius: 6px;
                    cursor: pointer;
                    color: #374151;
                    font-size: 14px;

                    &:hover {
                        background: #F3F4F6;
                    }
                }

                .day-title {
                    font-size: 20px;
                    font-weight: 600;
                    color: #111827;
                }
            }

            .add-btn {
                display: flex;
                align-items: center;
                gap: 6px;
                padding: 8px 16px;
                background: #4E8AF4;
                color: #fff;
                border: none;
                border-radius: 6px;
                cursor: pointer;
                font-size: 14px;

                &:hover {
                    background: #3B82F6;
                }
            }
        }

        .day-view-content {
            flex: 1;
            overflow-y: auto;
            padding: 24px;
            display: flex;
            flex-direction: column;
            gap: 12px;

                .event-item.expanded {
                    display: flex;
                    align-items: flex-start;
                    padding: 16px;
                    border-radius: 8px;
                    gap: 12px;
                    position: relative;
                    border: 1px solid transparent;
                    min-width: 0;
                
                .event-bar {
                    width: 4px;
                    height: 100%;
                    min-height: 40px;
                    border-radius: 2px;
                    flex-shrink: 0;
                }

                    .event-content-wrapper {
                        flex: 1;
                        display: flex;
                        flex-direction: column;
                        gap: 6px;
                        min-width: 0;

                        .event-title {
                            font-size: 16px;
                            font-weight: 600;
                            color: #111827;
                            word-break: break-word;
                            overflow-wrap: anywhere;
                        }

                        .event-desc {
                            font-size: 14px;
                            color: #4B5563;
                            line-height: 1.5;
                            word-break: break-word;
                            overflow-wrap: anywhere;
                        }
                    }

                .edit-icon {
                    display: none;
                    background: rgba(255,255,255,0.8);
                    padding: 6px;
                    border-radius: 6px;
                    cursor: pointer;
                    color: #4E8AF4;
                    font-size: 18px;
                }

                &:hover {
                    border-color: rgba(0,0,0,0.05);
                    box-shadow: 0 2px 8px rgba(0,0,0,0.05);
                    
                    .edit-icon {
                        display: block;
                    }
                }

                &.blue {
                    background: #EFF6FF;
                    color: #1E40AF;
                    .event-bar { background: #3B82F6; }
                }
                &.green {
                    background: #ECFDF5;
                    color: #065F46;
                    .event-bar { background: #10B981; }
                }
                &.gray {
                    background: #F3F4F6;
                    color: #4B5563;
                    .event-bar { background: #9CA3AF; }
                }
                &.pink {
                    background: #FFF1F2;
                    color: #9D174D;
                    .event-bar { background: #EC4899; }
                }
                &.red {
                    background: #FEF2F2;
                    color: #991B1B;
                    .event-bar { background: #EF4444; }
                }
            }

            .no-events {
                text-align: center;
                color: #9CA3AF;
                padding: 40px;
                font-size: 16px;
            }
        }
    }
}
</style>
