// 图床，上传图片
export function uploadImage(formData: FormData) {
    return $fetch(
        `https://server.zhtaero.com/image/upload`,
        {
            method: 'POST',
            timeout: 300000,  // 上传视频超时时间改为300秒，防止视频传不上去
            responseType: 'json',
            body: formData,
        }
    )
}
