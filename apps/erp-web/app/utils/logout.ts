const logout = () => {
    const router = useRouter()
    // 使用 useState 替代 useLocalStorage，数据来源为中间件解析的 Token
    const userInfo = useState('admin_info', () => ({ username: '', nickname: '', role: 1 }))
    
    removeToken()
    userInfo.value = {} // 清除用户信息
    router.push('/admin')
    ElMessage.success('已退出登录')
}

export default logout