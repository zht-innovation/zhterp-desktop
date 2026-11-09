<template>
    <div v-if="visible" class="modal-overlay">
        <div class="modal-content log-modal">
            <div class="modal-header">
                <h3>用户详情</h3>
                <button class="close-btn" @click="handleClose" v-if="!readonly">
                    <Icon name="heroicons:x-mark" />
                </button>
            </div>

            <div class="form-row">
                <div class="form-group full">
                    <label> 客户姓名</label>
                    <div class="readonly-value">{{ customer?.name }}</div>
                </div>
            </div>

            <div class="form-row">
                <div class="form-group full">
                    <label> 客户公司 </label>
                    <div class="readonly-value">{{ customer?.company  }}</div>
                </div>
            </div>

            <div class="form-row">
                <div class="form-group full">
                    <label> 客户地区 </label>
                    <div class="readonly-value">{{ customer?.country }}</div>
                </div>
            </div>

            <div class="form-row">
                <div class="form-group full">
                    <label> 客户联系方式 </label>
                    <div class="readonly-value">{{ customer?.phone }}</div>
                </div>
            </div>

            <div class="form-row">
                <div class="form-group full">
                    <label> 客户邮箱 </label>
                    <div class="readonly-value">{{ customer?.email }}</div>
                </div>
            </div>

            <!-- <div class="form-row">
                <div class="form-group full">
                    <label> 客户联系方式 </label>
                    <div class="readonly-value">{{ customerContant }}</div>
                </div>
            </div>

            <div class="form-row">
                <div class="form-group full">
                    <label> 客户邮箱 </label>
                    <div class="readonly-value">{{ customerEmail }}</div>
                </div>
            </div> -->


            <div class="modal-actions">
                <button @click="handleClose">关闭</button>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">

const props = defineProps<{
    visible: boolean
    readonly?: boolean
    isEditing?: boolean
    customerDisabled?: boolean
    customerHint?: string
    customer?: any
}>()


const emit = defineEmits<{
    'update:visible': [value: boolean]
    'save': [data: any]
    'delete': []
}>()


const handleClose = () => {
    emit('update:visible', false)
}
</script>

<style lang="less" scoped>
::-webkit-scrollbar {
    display: none; /* 隐藏滚动条 */
}

.modal-overlay {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0,0,0,0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
}

.modal-content {
    background: #fff;
    padding: 24px;
    border-radius: 16px;
    width: 600px;
    box-shadow: 0 10px 25px rgba(0,0,0,0.1);
    max-height: 90vh;
    overflow-y: auto;

    .modal-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 20px;

        h3 {
            margin: 0;
            font-size: 18px;
            color: #111827;
        }

        .close-btn {
            background: none;
            border: none;
            cursor: pointer;
            color: #9CA3AF;
            font-size: 20px;
            padding: 4px;

            &:hover {
                color: #374151;
            }
        }
    }

    .form-row {
        display: flex;
        gap: 16px;
    }

    .form-group {
        margin-bottom: 16px;
        
        &.half {
            flex: 1;
        }

        &.full {
            width: 100%;
        }
        
        label {
            display: block;
            margin-bottom: 8px;
            font-size: 14px;
            color: #374151;
            font-weight: 500;

            .required {
                color: #EF4444;
            }
        }

        input, textarea, select {
            width: 100%;
            padding: 8px 12px;
            border: 1px solid #E5E7EB;
            border-radius: 8px;
            font-size: 14px;
            
            &:focus {
                outline: none;
                border-color: #4E8AF4;
            }

            &:disabled {
                background-color: #F3F4F6;
                cursor: not-allowed;
            }
        }

        .select-input {
            appearance: none;
            background-image: url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e");
            background-position: right 8px center;
            background-repeat: no-repeat;
            background-size: 20px;
            padding-right: 32px;
        }

        .readonly-value {
            padding: 8px 12px;
            background: #F9FAFB;
            border-radius: 8px;
            font-size: 14px;
            color: #374151;
            min-height: 38px;
            display: flex;
            align-items: center;

            &.content-value {
                white-space: pre-wrap;
                min-height: 80px;
                align-items: flex-start;
            }

            &.tag-value {
                background: transparent;
                padding: 0;
            }
        }

        .tag {
            padding: 4px 12px;
            border-radius: 16px;
            font-size: 13px;

            &.blue {
                background: #EFF6FF;
                color: #3B82F6;
            }
            &.green {
                background: #ECFDF5;
                color: #10B981;
            }
            &.gray {
                background: #F3F4F6;
                color: #6B7280;
            }
            &.red {
                background: #FEF2F2;
                color: #EF4444;
            }
        }

        .radio-group {
            display: flex;
            flex-wrap: wrap;
            gap: 8px;

            .radio-item {
                display: flex;
                align-items: center;
                padding: 6px 12px;
                border: 1px solid #E5E7EB;
                border-radius: 20px;
                cursor: pointer;
                transition: all 0.2s;

                input[type="radio"] {
                    display: none;
                }

                span {
                    font-size: 13px;
                    color: #374151;
                }

                &:hover {
                    border-color: #4E8AF4;
                }

                &.active {
                    background-color: #4E8AF4;
                    border-color: #4E8AF4;

                    span {
                        color: #fff;
                    }
                }

                &.attitude-item.active {
                    &:has(input[value="十分满意，并达成合作"]) {
                        background-color: #10B981;
                        border-color: #10B981;
                    }
                    &:has(input[value="积极"]) {
                        background-color: #3B82F6;
                        border-color: #3B82F6;
                    }
                    &:has(input[value="中性"]) {
                        background-color: #6B7280;
                        border-color: #6B7280;
                    }
                    &:has(input[value="消极"]) {
                        background-color: #EF4444;
                        border-color: #EF4444;
                    }
                }
            }
        }

        .form-hint {
            margin-top: 6px;
            font-size: 12px;
            color: #9CA3AF;
            line-height: 1.5;
        }
    }

    .attachments-list {
        display: flex;
        flex-direction: column;
        gap: 10px;
        margin-bottom: 16px;

            .attachment-item {
                display: flex;
                align-items: center;
                gap: 10px;
                padding: 8px 12px;
                border-radius: 10px;
                background: #F9FAFB;
                cursor: pointer;
                transition: background 0.2s ease;

            &:hover {
                background: #F3F4F6;
            }

            .file-icon {
                font-size: 18px;
                color: #6B7280;
            }

            .file-name {
                flex: 1;
                font-size: 14px;
                color: #374151;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
            }

            .action-icon {
                font-size: 18px;
                color: #9CA3AF;
            }

            .remove-attachment {
                border: none;
                background: transparent;
                color: #EF4444;
                font-size: 12px;
                cursor: pointer;
                padding: 4px 6px;
                border-radius: 6px;

                &:hover {
                    background: rgba(239, 68, 68, 0.08);
                }
            }
        }
    }

    .modal-actions {
        display: flex;
        justify-content: flex-end;
        gap: 12px;
        margin-top: 24px;

        button {
            padding: 8px 16px;
            border-radius: 6px;
            border: 1px solid #E5E7EB;
            background: #fff;
            cursor: pointer;

            &.primary {
                background: #4E8AF4;
                color: #fff;
                border-color: #4E8AF4;

                &:disabled {
                    opacity: 0.6;
                    cursor: not-allowed;
                }
            }

            &.delete {
                background: #f44e4e;
                color: #fff;
                border-color: #f44e4e;

                &:disabled {
                    opacity: 0.6;
                    cursor: not-allowed;
                }
            }
        }
    }
}

.section-divider {
    display: flex;
    align-items: center;
    margin: 20px 0 16px;
    
    span {
        padding: 0 12px;
        font-size: 14px;
        font-weight: 600;
        color: #10B981;
        white-space: nowrap;
    }

    &::before,
    &::after {
        content: '';
        flex: 1;
        height: 1px;
        background: #E5E7EB;
    }
}
</style>
