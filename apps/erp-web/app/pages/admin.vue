<template>
    <div :class="desktopLogin ? 'desktop-login' : 'root'">
        <template v-if="desktopLogin">
            <div class="drone-backdrop" aria-hidden="true">
                <svg viewBox="222 413 957 1113" focusable="false">
                    <image :href="droneImage" width="1401" height="1601" />
                </svg>
            </div>
            <header class="brand-bar">
                <strong class="brand"><span class="brand-mark" aria-hidden="true"></span>ZHT ERP</strong>
                <span>企业管理系统</span>
            </header>
        </template>
        <main class="login-wrapper">
            <template v-if="desktopLogin">
                <h1>ZHT ERP</h1>
                <p class="welcome">欢迎登录企业管理系统</p>
                <div class="method"><span>账号登录</span></div>
            </template>
            <div v-else style="text-align: center;">
                <div class="title">
                    <span class="origin">中航通 ERP</span>
                </div>
                <div class="sub-title">
                    <span>ZHT Enterprise Resource Planning</span>
                </div>
            </div>
            <el-form ref="form" :model="loginForm" :rules="rules" label-position="top"
                :hide-required-asterisk="desktopLogin" @submit.prevent="onSubmit">
                <el-form-item prop="user" :label="desktopLogin ? '账号' : undefined">
                    <el-input
                        :prefix-icon="Avatar"
                        :clearable="true"
                        :input-style="desktopLogin ? undefined : inputStyle"
                        v-model="loginForm.user"
                        placeholder="请输入账号"
                    />
                </el-form-item>
                <el-form-item prop="password" :label="desktopLogin ? '密码' : undefined"
                    :style="desktopLogin ? undefined : { marginBottom: 0 }">
                    <el-input
                        :prefix-icon="Key"
                        :show-password="!desktopLogin"
                        :type="desktopLogin && showPassword ? 'text' : 'password'"
                        :clearable="true"
                        :input-style="desktopLogin ? undefined : inputStyle"
                        placeholder="请输入密码"
                        v-model="loginForm.password"
                    >
                        <template v-if="desktopLogin" #suffix>
                            <button type="button" class="password-toggle" :aria-pressed="showPassword"
                                aria-label="显示密码" @click="showPassword = !showPassword">
                                {{ showPassword ? '隐藏' : '显示' }}
                            </button>
                        </template>
                    </el-input>
                </el-form-item>
                <div v-if="desktopLogin" class="password-help">
                    <button type="button" @click="showHelp = true">忘记密码？</button>
                </div>
                <el-form-item class="btn-wrapper">
                    <el-button class="btn" native-type="submit" :loading="isSubmitting">登录</el-button>
                </el-form-item>
            </el-form>
            <p v-if="desktopLogin" class="help-message" role="status">{{ showHelp ? '请联系系统管理员重置密码。' : '' }}</p>
        </main>
        <footer v-if="desktopLogin" class="brand-footer">中航通 · ZHT ERP</footer>
    </div>
</template>


<script setup lang="ts">
import { ref, reactive } from "vue"
import { useRouter, useRoute } from "vue-router"
import { Avatar, Key } from "@element-plus/icons-vue"
import { adminLogin } from "~/composables/api/useAdminApi"
import { cancelDesktopSessionRestore, desktopLoginTarget, persistDesktopSession, setToken } from "~/utils/auth"
import { DESKTOP_ERP_ACCESS_DENIED, getDesktopErpLandingPath } from "~~/shared/utils/adminPermission"
import { isDesktop } from "~/utils/desktop"
import droneImage from "~/assets/login-drone.png"

definePageMeta({
    layout: 'admin'
})

const router = useRouter()
const route = useRoute()
const desktopLogin = useRuntimeConfig().public.erpDesktop === true && isDesktop()
const showPassword = ref(false)
const showHelp = ref(false)
const inputStyle = {
    height: "2.7rem",
    lineHeight: "2.7rem",
    backgroundColor: "rgba(0, 0, 0, 0)",
    borderRadius: "12px",
}

const form = ref();
const isSubmitting = ref(false)
const loginForm = reactive({
    user: "",
    password: "",
})
const rules = reactive({
    user: [
        {
            required: true,
            message: "请输入账号",
            type: "string",
        },
    ],
    password: [
        {
            required: true,
            message: "请输入密码",
            type: "string",
        },
    ]
})

const nuxtApp = useNuxtApp()
const onSubmit = async () => {
    if (isSubmitting.value) return
    isSubmitting.value = true
    try {
        const valid = await form.value?.validate().catch(() => false)
        if (!valid) {
            ElMessage.error("请输入完整信息")
            return
        }

        const desktop = isDesktop()
        if (desktop) cancelDesktopSessionRestore()
        const res = await adminLogin()(loginForm.user, loginForm.password)
        if (res?.code != 200 || !res.data?.token) {
            ElMessage.error(res?.msg || "登录失败，请重试")
            return
        }

        const token = res.data.token
        if (desktop) {
            const landingPath = getDesktopErpLandingPath(res.data.user?.role)
            if (!landingPath) {
                ElMessage.error(DESKTOP_ERP_ACCESS_DENIED)
                return
            }
            nuxtApp.runWithContext(() => setToken(token))
            if (!(await persistDesktopSession(token))) {
                ElMessage.warning("无法保存登录状态，下次启动需重新登录")
            }
            await router.replace(desktopLoginTarget(landingPath, route.query.redirect))
            return
        }

        nuxtApp.runWithContext(() => setToken(token))
        const redirect = String(route.query.redirect || '')
        if (redirect.startsWith('/') && !redirect.startsWith('//')) {
            await router.push(redirect)
            return
        }
        await router.push({ name: 'configuration' })
    } catch (error) {
        const failure = error as { statusCode?: number; data?: { msg?: string }; response?: Response }
        if (failure.response?.headers.get("cf-mitigated") === "challenge") {
            ElMessage.error("ERP 网关要求浏览器验证，请联系管理员检查预发站访问规则")
            return
        }
        ElMessage.error(failure.data?.msg || (failure.statusCode
            ? `登录失败（HTTP ${failure.statusCode}），请稍后重试`
            : "无法连接 ERP 服务，请检查网络后重试"))
    } finally {
        isSubmitting.value = false
    }
}

</script>

<style scoped>
.root :deep(.el-form-item) {
    margin-top: 25px;
}
.root :deep(.el-icon) {
    transform: scale(1.1);
    color: #363c54;
}
.root :deep(.el-input__inner::placeholder) {
    color: rgba(54, 60, 84, 0.8);
    padding: 0 5px;
}
.desktop-login {
    position: relative;
    isolation: isolate;
    display: grid;
    grid-template-rows: auto 1fr auto;
    height: 100vh;
    overflow: auto;
    color: #172341;
    font-size: 16px;
    background:
        radial-gradient(ellipse at 9% 58%, #dceaff, transparent 54%),
        radial-gradient(ellipse at 89% 21%, white, transparent 49%),
        linear-gradient(138deg, #f5f9ff 20%, #edf4ff 69%, #e7f0ff);
}
.drone-backdrop {
    position: absolute;
    inset: 0;
    z-index: -1;
    display: grid;
    place-content: center;
    overflow: hidden;
    pointer-events: none;
}
.drone-backdrop::before {
    content: "";
    position: absolute;
    inset: 0;
    background-image: linear-gradient(90deg, #4a81c610 1px, transparent 1px),
        linear-gradient(#4a81c610 1px, transparent 1px);
    background-size: 36px 36px;
    mask-image: radial-gradient(ellipse, black, transparent 74%);
}
.drone-backdrop svg {
    width: min(97vw, 1440px);
    height: clamp(500px, 106vh, 1360px);
    mix-blend-mode: multiply;
    opacity: .45;
}
.brand-bar, .brand-footer {
    width: min(1320px, calc(100% - 100px));
    min-height: 72px;
    margin-inline: auto;
    display: flex;
    align-items: center;
    justify-content: space-between;
    color: #536581;
    font-size: 13px;
}
.brand {
    display: inline-flex;
    align-items: center;
    gap: 11px;
    color: #172341;
    font-size: 23px;
    letter-spacing: -.045em;
}
.brand-mark {
    display: flex;
    align-items: center;
    gap: 3px;
    transform: skew(-18deg);
}
.brand-mark::before, .brand-mark::after {
    content: "";
    width: 14px;
    height: 21px;
    border-radius: 3px;
    background: #2353e7;
}
.brand-mark::after { height: 17px; background: #75b8ff; }
.desktop-login .login-wrapper {
    box-sizing: border-box;
    place-self: center;
    width: min(446px, calc(100% - 36px));
    margin-block: 18px;
    padding: clamp(26px, 4vw, 54px);
    border: 1px solid #ffffffde;
    border-radius: 21px;
    background: linear-gradient(148deg, #fafdffd9, #dfedfcc9);
    box-shadow: 0 24px 72px #2a497829, inset 0 1px 0 #ffffffc7, inset 0 0 0 1px #7da4d32b;
}
@supports ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {
    .desktop-login .login-wrapper {
        background: linear-gradient(148deg, #f9fdff8c, #e6f2ff5c 57%, #e0edfd7a);
        -webkit-backdrop-filter: blur(12px) saturate(128%);
        backdrop-filter: blur(12px) saturate(128%);
    }
}
.desktop-login h1 {
    margin: 0;
    text-align: center;
    color: #102146;
    font-size: clamp(48px, 4.3vw, 72px);
    line-height: 1.04;
    letter-spacing: -.072em;
}
.welcome { margin: 12px 0 28px; text-align: center; color: #536581; }
.method { margin-bottom: 21px; border-bottom: 1px solid #ccd9ef; }
.method span {
    display: inline-block;
    min-width: 115px;
    padding-bottom: 10px;
    border-bottom: 2px solid #2855e5;
    color: #234dbf;
    font-size: 15px;
    font-weight: 650;
}
.desktop-login :deep(.el-form-item) { margin: 0 0 20px; }
.desktop-login :deep(.el-form-item__label) {
    color: #172341;
    font-size: 15px;
    font-weight: 600;
    line-height: 20px;
}
.desktop-login :deep(.el-input) {
    --el-input-height: 53px;
    --el-input-border-radius: 9px;
    --el-input-border-color: #cbd8ed;
    --el-input-focus-border-color: #4779eb;
    --el-input-placeholder-color: #657695;
    font-size: 16px;
}
.desktop-login :deep(.el-input__wrapper) { padding-inline: 14px; }
.password-help { display: flex; justify-content: flex-end; margin: 0 0 15px; }
.password-help button, .password-toggle {
    padding: 4px;
    border: 0;
    background: transparent;
    color: #3155ac;
    font-size: 13px;
    cursor: pointer;
    pointer-events: auto;
}
.desktop-login button:focus-visible { outline: 2px solid #436be6; outline-offset: 2px; }
.desktop-login .btn-wrapper { margin: 0; }
.desktop-login .btn {
    width: 100%;
    height: 52px;
    border: 0;
    border-radius: 9px;
    color: white;
    background: linear-gradient(105deg, #2856ef, #2348d3);
    box-shadow: 0 8px 17px #254cd72c;
    font-size: 16px;
    font-weight: 650;
}
.desktop-login .btn:hover { background: #1b3fc2; }
.help-message { min-height: 20px; margin: 12px 0 0; color: #536581; font-size: 13px; }
@media (max-height: 720px) {
    .brand-bar, .brand-footer { min-height: 44px; }
    .desktop-login .login-wrapper { margin-block: 8px; padding: 22px 34px; }
    .desktop-login h1 { font-size: 44px; }
    .welcome { margin: 8px 0 15px; }
    .method { margin-bottom: 14px; }
}
@media (prefers-reduced-transparency: reduce) {
    .desktop-login .login-wrapper {
        background: #f4f9ff;
        -webkit-backdrop-filter: none;
        backdrop-filter: none;
    }
}
</style>

<style lang="less" scoped>
.root {
    height: 100vh;
    overflow: hidden;
    background: linear-gradient(to bottom right, #ffffff, #6c6c6c);
    .login-wrapper {
        width: 640px;
        position: fixed;
        top: 45%;
        left: 50%;
        transform: translate(-50%, -50%);
        .title {
            font-size: 42px;
            color: #363c54;
            letter-spacing: 2px;
        }
        .sub-title {
            color: #363c54;
            margin-top: 15px;
            letter-spacing: 2px;
            word-spacing: 3px;
            font-size: 23px;
        }
        .btn-wrapper {
            margin-top: 40px !important;
            .btn {
                margin: auto;
                border-radius: 8px;
                height: 50px;
                width: 200px;
                color: #eee !important;
                background-color: #363c54;
                &:hover {
                    transform: scale(1.04);
                }
            }
        }
    }
}
</style>
