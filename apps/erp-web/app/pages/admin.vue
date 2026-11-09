<template>
    <div class="root">
        <!-- <img class="bg-logo" src="../assets/bg.png"> -->
        <div class="login-wrapper">
            <div style="text-align: center;">
                <div class="title">
                    <span class="origin">中航通 ERP</span>
                </div>
                <div class="sub-title">
                    <span>ZHT Enterprise Resource Planning</span>
                </div>
            </div>
            <el-form ref="form" :model="loginForm" :rules="rules">
                <el-form-item prop="user">
                    <el-input
                        :prefix-icon="Avatar"
                        :clearable="true"
                        :input-style="inputStyle"
                        v-model="loginForm.user"
                        placeholder="请输入账号"
                    />
                </el-form-item>
                <el-form-item prop="password" style="margin-bottom: 0;">
                    <el-input
                        :prefix-icon="Key"
                        :show-password="true"
                        :clearable="true"
                        :input-style="inputStyle"
                        placeholder="请输入密码"
                        v-model="loginForm.password"
                    />
                </el-form-item>
                <!-- <div class="find-pwd-wrapper">
                    <div class="left-blank"></div>
                    <div class="find-pwd-text">
                        <span>找回密码</span>
                    </div>
                </div> -->
                <el-form-item class="btn-wrapper">
                    <el-button class="btn" :loading="isSubmitting" @click="onSubmit">登录</el-button>
                    <!-- <el-button class="btn" @click="onRegister">注册</el-button> -->
                </el-form-item>
            </el-form>
        </div>
    </div>
</template>


<script setup lang="ts">
import { ref, reactive } from "vue"
import { useRouter, useRoute } from "vue-router"
import { Avatar, Key } from "@element-plus/icons-vue"
import { adminLogin } from "~/composables/api/useAdminApi"
import { cancelDesktopSessionRestore, persistDesktopSession, setToken } from "~/utils/auth"
import { isDesktop } from "~/utils/desktop"

definePageMeta({
    layout: 'admin'
})

const router = useRouter()
const route = useRoute()
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

        if (isDesktop()) cancelDesktopSessionRestore()
        const res = await adminLogin()(loginForm.user, loginForm.password)
        if (res?.code != 200 || !res.data?.token) {
            ElMessage.error(res?.msg || "登录失败，请重试")
            return
        }

        nuxtApp.runWithContext(() => setToken(res.data.token))
        if (isDesktop() && !(await persistDesktopSession(res.data.token))) {
            ElMessage.warning("无法保存登录状态，下次启动需重新登录")
        }

        const redirect = String(route.query.redirect || '')
        if (redirect.startsWith('/') && !redirect.startsWith('//')) {
            await router.push(redirect)
            return
        }
        await router.push({ name: 'configuration' })
    } catch (error) {
        const failure = error as { statusCode?: number; data?: { msg?: string } }
        ElMessage.error(failure.data?.msg || (failure.statusCode
            ? "登录失败，请稍后重试"
            : "无法连接 ERP 服务，请检查网络后重试"))
    } finally {
        isSubmitting.value = false
    }
}

</script>

<style>
.el-form-item {
    margin-top: 25px;
}
.el-icon {
    transform: scale(1.1);
    color: #363c54;
}
.el-input__inner::placeholder {
    color: rgba(54, 60, 84, 0.8);
    padding: 0 5px;
}
/* 谷歌 */
.el-input__inner::-webkit-input-placeholder {
    color: rgba(54, 60, 84, 0.8);
}
/* 火狐 */
.el-input__inner:-moz-placeholder {
    color: rgba(54, 60, 84, 0.8);
}
/*ie*/
.el-input__inner:-ms-input-placeholder {
    color: rgba(54, 60, 84, 0.8);
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
        .find-pwd-wrapper {
            margin-top: 4px;
            margin-right: 4px;
            display: flex;
            flex-direction: row-reverse;
            .find-pwd-text {
                cursor: pointer;
                font-size: 10px;
                color: rgb(34, 138, 223);
                text-decoration: underline;
            }
        }
    }
}
</style>
