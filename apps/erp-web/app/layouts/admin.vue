<template>
    <div class="scrollbox admin-layout">
        <!-- 展示 page -->
        <slot />
    </div>
</template>

<script setup>
import { useGlobalStore } from '~/store/global'
import { useRoute, useRouter } from "vue-router"

const route = useRoute()
const router = useRouter()
const globalStore = useGlobalStore()

watch(() => route.query.lang, (newLang) => {
    globalStore.isZh = newLang === 'zh'
}, {
    immediate: true
})
</script>

<style>
/* PingFang SC 字体声明 */
@font-face {
    font-family: 'PingFang SC';
    src: url('/font/管理系统使用字体/字体/pingfangSC/PingFangSC-Mod-18.d1-Ultralight.otf') format('opentype');
    font-weight: 100;
    font-style: normal;
    font-display: swap;
}

@font-face {
    font-family: 'PingFang SC';
    src: url('/font/管理系统使用字体/字体/pingfangSC/PingFangSC-Mod-18.d1-Thin.otf') format('opentype');
    font-weight: 200;
    font-style: normal;
    font-display: swap;
}

@font-face {
    font-family: 'PingFang SC';
    src: url('/font/管理系统使用字体/字体/pingfangSC/PingFangSC-Mod-18.d1-Light.otf') format('opentype');
    font-weight: 300;
    font-style: normal;
    font-display: swap;
}

@font-face {
    font-family: 'PingFang SC';
    src: url('/font/管理系统使用字体/字体/pingfangSC/PingFangSC-Mod-18.d1-Regular.otf') format('opentype');
    font-weight: 400;
    font-style: normal;
    font-display: swap;
}

@font-face {
    font-family: 'PingFang SC';
    src: url('/font/管理系统使用字体/字体/pingfangSC/PingFangSC-Mod-18.d1-Medium.otf') format('opentype');
    font-weight: 500;
    font-style: normal;
    font-display: swap;
}

@font-face {
    font-family: 'PingFang SC';
    src: url('/font/管理系统使用字体/字体/pingfangSC/PingFangSC-Mod-18.d1-Semibold.otf') format('opentype');
    font-weight: 600;
    font-style: normal;
    font-display: swap;
}

/* configuration路由下所有元素使用PingFang SC字体 */
.admin-layout,
.admin-layout * {
    font-family: 'PingFang SC', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif !important;
}
</style>

<style scoped>
.scrollbox {
    position: relative;
    overflow: hidden;
    height: 100vh;
    width: 100vw;
}
</style>