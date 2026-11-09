<template>
    <div class="business-detail">
        <section class="business-section">
            <h4>基本信息</h4>
            <dl class="detail-grid">
                <div><dt>申请编号</dt><dd>{{ request.requestNo }}</dd></div>
                <div><dt>借用人</dt><dd>{{ request.borrower || "--" }}</dd></div>
                <div><dt>预计归还</dt><dd>{{ formatDate(request.expectedReturnDate) }}</dd></div>
                <div class="detail-grid-wide"><dt>借用事由</dt><dd>{{ request.reason || "--" }}</dd></div>
            </dl>
        </section>

        <section class="business-section">
            <h4>借用产品<template v-if="products.length > 1">（共{{ products.length }}项）</template></h4>
            <ErpTableFrame
                class="borrow-product-table"
                columns="180px minmax(220px, 1fr) 160px 120px 140px 100px 80px"
                :empty="products.length === 0"
                empty-text="暂无借用产品"
                scroll-x
                embedded
            >
                <template #header>
                    <div class="table-row table-head product-row">
                        <div class="table-cell">产品编号</div>
                        <div class="table-cell">型号</div>
                        <div class="table-cell">分类</div>
                        <div class="table-cell">产品图片</div>
                        <div class="table-cell">借用数量</div>
                        <div class="table-cell">单位</div>
                        <div class="table-cell">操作</div>
                    </div>
                </template>
                <div
                    v-for="product in products"
                    :key="product.id"
                    class="table-row data-row product-row"
                >
                    <div class="table-cell" title="双击复制" @dblclick.stop="copyCellText(product.code)">
                        {{ product.code || "--" }}
                    </div>
                    <div
                        class="table-cell"
                        :title="`${product.model || '--'}（双击复制）`"
                        @dblclick.stop="copyCellText(product.model)"
                    >
                        {{ product.model || "--" }}
                    </div>
                    <div class="table-cell" title="双击复制" @dblclick.stop="copyCellText(product.category)">
                        {{ product.category || "--" }}
                    </div>
                    <div class="table-cell product-image-cell">
                        <a
                            v-if="product.image"
                            class="product-image-link"
                            :href="resolveErpImageUrl(product.image)"
                            target="_blank"
                            rel="noopener noreferrer"
                            :title="product.model || '查看大图'"
                            @click="previewProductImage($event, product.image, product.model)"
                        >
                            <img :src="resolveErpImageUrl(product.image)" :alt="product.model || '产品图片'">
                        </a>
                        <Icon v-else name="lucide:image" />
                    </div>
                    <div
                        class="table-cell"
                        title="双击复制"
                        @dblclick.stop="copyCellText(formatOneDecimalText(product.quantity, '0.0'))"
                    >
                        {{ formatOneDecimalText(product.quantity, "0.0") }}
                    </div>
                    <div class="table-cell" title="双击复制" @dblclick.stop="copyCellText(product.unit)">
                        {{ product.unit || "--" }}
                    </div>
                    <div class="table-cell">--</div>
                </div>
            </ErpTableFrame>
        </section>
        <AttachmentImagePreview v-model="showImagePreview" :title="previewTitle" :src="previewUrl" />
    </div>
</template>

<script setup lang="ts">
import AttachmentImagePreview from "~/components/configuration/sales/AttachmentImagePreview.vue";
import { resolveErpImageUrl } from "~/utils/attachmentPreview";
import { isDesktop } from "~/utils/desktop";
import ErpTableFrame from "~/components/configuration/ErpTableFrame.vue";
import type { BorrowBusinessDetail } from "~/types/approval";
import { formatOneDecimalText } from "~/utils/inventoryNumberFormat";

const props = defineProps<{
    detail: BorrowBusinessDetail;
}>();

const request = computed(() => props.detail.request);
const products = computed(() => {
    const items = Array.isArray(request.value.items) ? request.value.items : [];
    if (items.length) {
        return items.map((item, index) => ({
            id: item.materialId || `${index}`,
            code: item.materialCode,
            model: item.materialName || item.materialModel,
            category: "",
            unit: item.materialUnitName,
            image: item.image || "",
            quantity: item.quantity,
        }));
    }
    if (request.value.materialId || request.value.quantity) {
        return [{
            id: request.value.materialId || "",
            code: request.value.materialCode || "",
            model: request.value.materialName || request.value.materialModel || "",
            category: "",
            unit: request.value.materialUnitName || "",
            image: request.value.image || "",
            quantity: Number(request.value.quantity || 0),
        }];
    }
    return [];
});

const { copyCellText } = useApprovalCellCopy();

const showImagePreview = ref(false);
const previewTitle = ref("");
const previewUrl = ref("");

const previewProductImage = (event: MouseEvent, source: string, model?: string) => {
    if (!isDesktop()) return;
    event.preventDefault();
    const url = resolveErpImageUrl(source);
    if (!url) return;
    previewTitle.value = model || "产品图片";
    previewUrl.value = url;
    showImagePreview.value = true;
};

const formatDate = (value?: string) => {
    if (!value) return "--";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "--" : date.toLocaleDateString("zh-CN");
};
</script>

<style scoped>
.borrow-product-table {
    height: auto;
    border: 1px solid var(--erp-color-border-muted);
}

.borrow-product-table .product-row {
    width: 100%;
    min-width: 1000px;
}

.borrow-product-table .table-cell {
    overflow: hidden;
    text-overflow: ellipsis;
}

.product-image-cell {
    display: grid;
    place-items: center;
    color: var(--erp-color-icon-disabled);
}

.product-image-link {
    width: 52px;
    height: 36px;
    display: grid;
    place-items: center;
    padding: 0;
    overflow: hidden;
    border: 1px solid var(--erp-color-border-muted);
    border-radius: var(--erp-radius-control-default);
    background: var(--erp-color-fill-default);
    cursor: zoom-in;
}

.product-image-link img {
    width: 100%;
    height: 100%;
    object-fit: contain;
}

.product-image-cell :deep(svg) {
    width: 24px;
    height: 24px;
}
</style>
