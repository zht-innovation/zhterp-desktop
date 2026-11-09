import { clearAdminSession } from "~/utils/auth"

const logout = async () => {
    const router = useRouter()
    const cleared = await clearAdminSession()
    await router.push('/admin')
    if (cleared === false) {
        ElMessage.warning('已退出当前会话，系统凭据清理失败')
    } else {
        ElMessage.success('已退出登录')
    }
}

export default logout
