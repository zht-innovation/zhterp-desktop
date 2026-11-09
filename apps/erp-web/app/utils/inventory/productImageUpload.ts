export type ProductImageUploadResult = {
    image: string;
    failed: boolean;
};

export type ProductImageUploader = (formData: FormData) => Promise<any>;

export const PRODUCT_IMAGE_MIN_DIMENSION = 800;

export const validateProductImageResolution = async (file: File): Promise<string> => {
    let imageUrl = "";

    try {
        imageUrl = URL.createObjectURL(file);
        const image = new Image();

        await new Promise<void>((resolve, reject) => {
            image.onload = () => resolve();
            image.onerror = () => reject(new Error("Image loading failed"));
            image.src = imageUrl;
        });

        if (image.naturalWidth < PRODUCT_IMAGE_MIN_DIMENSION || image.naturalHeight < PRODUCT_IMAGE_MIN_DIMENSION) {
            return "产品图片分辨率不能低于 800×800 像素";
        }

        return "";
    } catch {
        return "无法读取产品图片，请重新选择";
    } finally {
        if (imageUrl) {
            URL.revokeObjectURL(imageUrl);
        }
    }
};

export const resolveProductImageUpload = async (
    file: File | null,
    uploader: ProductImageUploader,
): Promise<ProductImageUploadResult> => {
    if (!file) {
        return {
            image: "",
            failed: false,
        };
    }

    try {
        const formData = new FormData();
        formData.append("image", file);

        const res = await uploader(formData);
        const image = typeof res?.data?.path === "string" ? res.data.path : "";

        return {
            image,
            failed: res?.code !== 200 || !image,
        };
    } catch {
        return {
            image: "",
            failed: true,
        };
    }
};
