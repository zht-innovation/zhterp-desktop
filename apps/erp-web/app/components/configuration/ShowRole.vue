<template>
    <div class="show-role nose">
        <div class="info">
            <div class="name">{{ nickname }}</div>
            <div class="role-tag">{{ roleName }}</div>
        </div>
        <div class="logout-btn" @click="logout">
            <Icon name="material-symbols:logout" class="icon" />
            <span>退出</span>
        </div>
    </div>
</template>

<script setup lang="ts">
import { ADMIN_ROLE_NAME } from '~~/shared/enums'

// 使用 useState 替代 useLocalStorage，数据来源为中间件解析的 Token
const userInfo = useState('admin_info', () => ({ username: '', nickname: '', role: 1 }))

const roleName = computed(() => ADMIN_ROLE_NAME[Number(userInfo.value.role)] || '未知角色')
const nickname = computed(() => userInfo.value.nickname || '未知用户')
</script>

<style scoped>
.show-role {
    position: absolute;
    top: 2rem;
    right: 3rem;
    display: flex;
    align-items: center;
    gap: 1.5rem;
    background: rgba(255, 255, 255, 0.9);
    padding: 0.8rem 1.5rem;
    border-radius: 50px;
    box-shadow: 0 4px 15px rgba(0, 0, 0, 0.08);
    border: 1px solid #ffe3e3;
    z-index: 100;
}

.info {
    display: flex;
}

.name {
    font-size: 1.4rem;
    font-weight: bold;
    color: #333;
	margin-right: 18px;
}

.role-tag {
    font-size: 1rem;
    color: #ff5b5b;
    background: #ffe3e3;
    padding: 0.1rem 0.6rem;
    border-radius: 10px;
    margin-top: 0.2rem;
}

.logout-btn {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    cursor: pointer;
    color: #666;
    padding: 0.6rem 1.2rem;
    border-radius: 20px;
    transition: all 0.2s;
    background: #f5f5f5;
    font-size: 1.2rem;
}

.logout-btn:hover {
    background: #ff5b5b;
    color: white;
}

.icon {
    font-size: 1.4rem;
}
</style>
