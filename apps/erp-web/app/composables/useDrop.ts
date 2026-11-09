import { ref, watch } from "vue";
import { uploadImage } from "./api/useIndicesApi";
import type { Ref } from "vue";
import { isDesktop } from "~/utils/desktop";
import { MAX_DESKTOP_OPEN_BYTES, selectDesktopFiles } from "~/utils/fileActions";

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
    const uploadFile = async (file?: File) => {
        if (!file?.size) {
            ElMessage.warning("请拖入单个文件");
            return;
        }
        const formData = new FormData();
        formData.append("image", file);
        loading.value = true;
        try {
            const res = await (opt.uploader || uploadImage)(formData);
            if (res.code == 200) {
                callback(res.data.path);
            } else {
                ElMessage.error("上传文件失败");
            }
        } catch {
            ElMessage.error("上传文件失败");
        } finally {
            loading.value = false;
        }
    };

    const userSelectFile = () => {
        isDragOver.value = false;
        const accept = opt.accept || "*";
        if (isDesktop()) {
            void selectDesktopFiles(accept, false, MAX_DESKTOP_OPEN_BYTES)
                .then(([file]) => { if (file) return uploadFile(file); })
                .catch(() => ElMessage.error("无法读取所选文件"));
            return;
        }
        const input = document.createElement("input");
        input.type = "file";
        input.accept = accept;
        input.onchange = () => void uploadFile(input.files?.[0]);
        input.click();
    };

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
        dom.value.addEventListener("drop", (e: DragEvent) => {
            e.preventDefault();
            e.stopPropagation();
            isDragOver.value = false;
            void uploadFile(e.dataTransfer?.files[0]);
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
