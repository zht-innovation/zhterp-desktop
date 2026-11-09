import { ref, onMounted, watch } from "vue";
import { uploadImage } from "./api/useIndicesApi";
import type { Ref } from "vue";

export default function (
    dom: Ref<HTMLElement | undefined>,
    callback: (filePath: string) => void,
    opt: {
        accept?: string;
        uploader?: (formData: FormData) => Promise<any>;
    } = {},
    noClick?: boolean // 是否默认绑定点击上传
) {
    const isDragOver = ref(false);
    const delayRef = ref();
    const loading = ref(false);

    let timer: any;
    watch(isDragOver, () => {
        clearTimeout(timer);
        timer = setTimeout(() => {
            // 防止抖动
            delayRef.value = isDragOver.value;
        }, 16);
    });
    const userSelectFile = () => {
        isDragOver.value = false;
        const input = document.createElement("input");
        input.type = "file";
        input.accept = opt.accept || "*";
        input.onchange = (e: any) => {
            // 过滤文件夹
            if (input.files?.[0].size) {
                const formData = new FormData();
                formData.append("image", input.files[0]);
                loading.value = true;
                const uploader = opt.uploader || uploadImage;
                uploader(formData)
                    .then((res: any) => {
                        if (res.code == 200) {
                            callback(res.data.path);
                        } else {
                            ElMessage.error("上传文件失败");
                        }
                    })
                    .catch(() => {
                        ElMessage.error("上传文件失败");
                    })
                    .finally(() => {
                        loading.value = false;
                    });
            } else {
                ElMessage.warning("请拖入单个文件");
            }
        };
        input.click();
    };
    onMounted(() => {});

    watch(dom, () => {
        if (!dom.value) return;
        dom.value.addEventListener("dragover", (e: any) => {
            e.preventDefault();
            e.stopPropagation();
            isDragOver.value = true;
        });
        dom.value.addEventListener("dragenter", (e: any) => {
            e.preventDefault();
            e.stopPropagation();
            isDragOver.value = true;
        });
        dom.value.addEventListener("dragleave", (e: any) => {
            e.preventDefault();
            e.stopPropagation();
            isDragOver.value = false;
        });
        dom.value.addEventListener("drop", (e: any) => {
            e.preventDefault();
            e.stopPropagation();
            isDragOver.value = false;
            // 过滤文件夹
            if (e.dataTransfer.files[0].size) {
                const formData = new FormData();
                formData.append("image", e.dataTransfer.files[0]);
                loading.value = true;
                const uploader = opt.uploader || uploadImage;
                uploader(formData)
                    .then((res: any) => {
                        if (res.code == 200) {
                            callback(res.data.path);
                        } else {
                            ElMessage.error("上传文件失败");
                        }
                    })
                    .catch(() => {
                        ElMessage.error("上传文件失败");
                    })
                    .finally(() => {
                        loading.value = false;
                    });
            } else {
                ElMessage.warning("请拖入单个文件");
            }
        });
        if (!noClick) {
            dom.value.addEventListener("click", () => {
                userSelectFile();
            });
        }
    });
    return {
        isDragOver: delayRef,
        loading,
        userSelectFile,
    };
}
