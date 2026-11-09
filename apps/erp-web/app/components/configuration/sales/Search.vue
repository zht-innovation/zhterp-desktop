<template>
    <div class="search-wrapper">
        <div class="search-input-container">
            <el-icon class="search-icon"><Search /></el-icon>
            <input
                type="text"
                class="search-input"
                :placeholder="placeholder"
                :value="searchQuery"
                @input="$emit('update:searchQuery', ($event.target as HTMLInputElement).value)"
                @keyup.enter="handleSearch"
            />
            <el-icon v-if="searchQuery" class="clear-icon" @click="handleClear"><Close /></el-icon>
            <button class="search-btn" @click="handleSearch">搜索</button>
        </div>
    </div>
</template>

<script setup lang="ts">
import { Search, Close } from '@element-plus/icons-vue'

const props = withDefaults(defineProps<{
    searchQuery?: string
    placeholder?: string
}>(), {
    searchQuery: '',
    placeholder: '搜索姓名、区域、联系方式、邮箱、公司...'
})

const emit = defineEmits<{
    'update:searchQuery': [value: string]
    'search': []
    'clear': []
}>()

const handleSearch = () => {
    emit('search')
}

const handleClear = () => {
    emit('update:searchQuery', '')
    emit('clear')
}
</script>

<style lang="less" scoped>
.search-wrapper {
    margin-bottom: 20px;

    .search-input-container {
        display: flex;
        align-items: center;
        background: #fff;
        border-radius: 12px;
        padding: 8px 16px;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);

        .search-icon {
            color: #999;
            font-size: 18px;
            margin-right: 10px;
        }

        .search-input {
            flex: 1;
            border: none;
            outline: none;
            font-size: 14px;
            color: #333;

            &::placeholder {
                color: #bbb;
            }
        }

        .clear-icon {
            color: #999;
            font-size: 16px;
            cursor: pointer;
            margin-right: 10px;

            &:hover {
                color: #666;
            }
        }

        .search-btn {
            padding: 6px 16px;
            background: #3f8cff;
            color: #fff;
            border: none;
            border-radius: 8px;
            cursor: pointer;
            font-size: 14px;
            transition: all 0.3s;

            &:hover {
                opacity: 0.9;
            }
        }
    }
}
</style>