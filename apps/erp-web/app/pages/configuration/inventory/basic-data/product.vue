<template>
    <div class="product-page" :class="{ 'product-page--desktop': desktop }">
        <header v-if="!desktop" class="topbar">
            <ErpBreadcrumb
                icon="lucide:warehouse"
                :items="productBreadcrumbItems"
            />

            <ErpSearchBox
                v-model="searchText"
                :disabled="isLoading"
                @search="loadProducts"
            />
        </header>

        <div v-show="!desktop || showDesktopFilters" id="product-filters" class="filter-row">
            <div class="filter-field">
                <span>分类</span>
                <div
                    class="category-cascader"
                    :class="{ open: isDraftCategoryMenuOpen }"
                >
                    <button
                        class="category-trigger"
                        type="button"
                        :disabled="isLoading"
                        @click="toggleDraftCategoryMenu"
                    >
                        <span>{{ draftSelectedCategory || "请选择" }}</span>
                    </button>
                    <div
                        class="category-menu"
                        :class="{ 'single-column': activeDraftCategoryOptions.length === 0 }"
                    >
                        <div class="category-search-row">
                            <Icon name="lucide:search" />
                            <input
                                v-model="draftCategorySearchText"
                                type="search"
                                placeholder="搜索分类"
                                aria-label="搜索分类"
                                @keydown.esc.stop.prevent="isDraftCategoryMenuOpen = false"
                            >
                        </div>
                        <div class="category-primary-list">
                            <button
                                v-for="group in filteredDraftCategoryGroups"
                                :key="group.id"
                                class="category-primary-option"
                                :class="{ active: activeDraftCategoryGroup === group.id }"
                                type="button"
                                @click="handleDraftCategoryGroupClick(group)"
                                @mouseenter="activeDraftCategoryGroup = group.id"
                            >
                                <span>{{ group.name }}</span>
                                <Icon v-if="group.children.length" name="lucide:chevron-right" />
                            </button>
                        </div>
                        <div v-if="activeDraftCategoryOptions.length" class="category-secondary-list">
                            <button
                                v-for="category in activeDraftCategoryOptions"
                                :key="category.id"
                                class="category-secondary-option"
                                type="button"
                                @click="selectDraftCategory(category)"
                            >
                                {{ category.name }}
                            </button>
                        </div>
                        <div v-if="filteredDraftCategoryGroups.length === 0" class="category-empty">
                            暂无匹配分类
                        </div>
                    </div>
                </div>
            </div>

            <label class="filter-field">
                <span>仓库</span>
                <select v-model="draftSelectedWarehouseId" aria-label="筛选仓库">
                    <option value="">请选择</option>
                    <option
                        v-for="warehouse in warehouseFilterOptions"
                        :key="warehouse.id"
                        :value="warehouse.id"
                    >
                        {{ warehouse.name }}
                    </option>
                </select>
            </label>

            <label class="filter-field">
                <span>来源</span>
                <select v-model="draftSelectedSource" aria-label="筛选来源">
                    <option value="">请选择</option>
                    <option
                        v-for="source in sourceOptions"
                        :key="source"
                        :value="source"
                    >
                        {{ source }}
                    </option>
                </select>
            </label>

            <div class="filter-actions">
                <button
                    class="outline-button"
                    type="button"
                    :disabled="isLoading"
                    @click="resetFilters"
                >
                    <Icon name="lucide:refresh-cw" class="button-icon" />
                    <span>重置</span>
                </button>
                <button
                    class="muted-button"
                    :class="{ active: hasPendingFilters }"
                    type="button"
                    :disabled="isLoading"
                    @click="applyFilters"
                >
                    <Icon name="lucide:sliders-horizontal" class="button-icon" />
                    <span>筛选</span>
                </button>
            </div>
        </div>

        <div class="toolbar">
            <div v-if="desktop" class="toolbar-left desktop-toolbar-left">
                <button
                    class="primary-button"
                    type="button"
                    :disabled="isLoading || isSubmitting"
                    @click="openProductDialog"
                >
                    <Icon name="lucide:plus" class="button-icon" />
                    <span>新建产品</span>
                </button>
                <button class="outline-button" type="button" :disabled="isSubmitting" @click="openDesktopProductDrafts">
                    草稿箱
                </button>
                <button
                    class="outline-button"
                    type="button"
                    :disabled="isSubmitting || selectedProductIds.length === 0"
                    @click="batchDeleteProducts"
                >
                    批量删除
                </button>
                <button class="outline-button" type="button" :disabled="isExporting" @click="exportProducts">
                    {{ isExporting ? "导出中" : "导出CSV" }}
                </button>
                <details ref="desktopMoreMenu" class="desktop-more-menu" @keydown.esc="closeDesktopMoreMenu">
                    <summary>更多<Icon name="lucide:chevron-down" /></summary>
                    <div class="desktop-more-actions">
                        <button type="button" @click="handleDesktopMoreAction('view')">
                            {{ desktopCompactView ? "切换详细视图" : "切换合并视图" }}
                        </button>
                        <button type="button" :disabled="isImporting" @click="handleDesktopMoreAction('import')">
                            {{ isImporting ? "导入中" : "导入产品" }}
                        </button>
                        <button type="button" :disabled="isSubmitting" @click="handleDesktopMoreAction('resize')">
                            {{ isColumnResizeMode ? "完成调整列宽" : "调整列宽" }}
                        </button>
                        <button type="button" :disabled="isSubmitting" @click="handleDesktopMoreAction('reset')">重置列宽</button>
                        <button type="button" :disabled="isSubmitting" @click="handleDesktopMoreAction('columns')">配置列</button>
                    </div>
                </details>
            </div>
            <div v-else class="toolbar-left">
                <button
                    class="primary-button"
                    type="button"
                    :disabled="isLoading || isSubmitting"
                    @click="openProductDialog"
                >
                    <Icon name="lucide:circle-plus" class="button-icon" />
                    <span>新建产品</span>
                </button>
                <button
                    class="outline-button"
                    type="button"
                    :disabled="isImporting"
                    @click="openImportDialog"
                >
                    <Icon name="lucide:download" class="button-icon" />
                    <span>{{ isImporting ? "导入中" : "导入" }}</span>
                </button>
                <button
                    class="outline-button"
                    type="button"
                    :disabled="isExporting"
                    @click="exportProducts"
                >
                    <Icon name="lucide:upload" class="button-icon" />
                    <span>{{ isExporting ? "导出中" : "导出" }}</span>
                </button>
                <button
                    class="outline-button danger-button"
                    type="button"
                    :disabled="isSubmitting || selectedProductIds.length === 0"
                    @click="batchDeleteProducts"
                >
                    <Icon name="lucide:trash-2" class="button-icon" />
                    <span>批量删除</span>
                </button>
            </div>

            <div v-if="desktop" class="toolbar-right desktop-toolbar-right">
                <form class="desktop-product-search" @submit.prevent="loadProducts()">
                    <input
                        v-model="searchText"
                        type="search"
                        aria-label="搜索产品"
                        placeholder="搜索产品编号或型号"
                        :disabled="isLoading"
                    >
                </form>
                <button
                    class="outline-button"
                    :class="{ 'desktop-filter-active': showDesktopFilters || appliedCategoryId || appliedWarehouseId || appliedSource }"
                    type="button"
                    aria-controls="product-filters"
                    :aria-expanded="showDesktopFilters"
                    @click="showDesktopFilters = !showDesktopFilters"
                >
                    筛选
                </button>
            </div>
            <div v-else class="toolbar-right">
                <button
                    class="text-button"
                    :class="{ active: isColumnResizeMode }"
                    type="button"
                    :disabled="isSubmitting"
                    @click="toggleColumnResizeMode"
                >
                    <Icon name="lucide:move-horizontal" class="button-icon" />
                    <span>{{ isColumnResizeMode ? "完成调整" : "调整列宽" }}</span>
                </button>
                <button
                    class="text-button"
                    type="button"
                    :disabled="isSubmitting"
                    @click="resetColumnWidths"
                >
                    <Icon name="lucide:rotate-ccw" class="button-icon" />
                    <span>重置列宽</span>
                </button>
                <button
                    class="text-button"
                    type="button"
                    :disabled="isSubmitting"
                    @click="openColumnConfigDialog"
                >
                    <Icon name="lucide:columns-3" class="button-icon" />
                    <span>配置列</span>
                </button>
            </div>
        </div>

        <ErpTableFrame
            v-if="desktop && desktopCompactView"
            class="desktop-product-table"
            data-inventory-copy-table
            columns="36px minmax(160px, 1.15fr) minmax(100px, .8fr) 80px minmax(130px, 1fr) 100px 100px 120px minmax(130px, 1fr) minmax(220px, 1.6fr) 120px"
            minimum-width="1296px"
            :loading="isLoading"
            :empty="showProductEmptyState"
            loading-text="正在加载产品数据..."
            empty-text="暂无匹配产品"
            scroll-x
        >
            <template #header>
                <div class="table-row table-head">
                    <div class="selection-head checkbox-cell">
                        <label class="checkbox-control">
                            <input
                                class="row-checkbox"
                                type="checkbox"
                                :checked="allRowsSelected"
                                :disabled="isLoading || isSubmitting || visibleProducts.length === 0"
                                aria-label="选择全部产品"
                                @change="toggleSelectAll"
                            >
                        </label>
                    </div>
                    <div class="table-cell">产品编号 / 型号</div>
                    <div class="table-cell">分类</div>
                    <div class="table-cell">图片</div>
                    <div class="table-cell">单位 / 材质</div>
                    <div class="table-cell">来源</div>
                    <div class="table-cell">BOM结构</div>
                    <div class="table-cell">库存上限 / 下限</div>
                    <div class="table-cell">默认仓库 / 仓位</div>
                    <div class="table-cell">简介 / 修改时间</div>
                    <div class="action-head erp-table-fixed-end">操作</div>
                </div>
            </template>
            <div v-for="product in visibleProducts" :key="product.id" class="table-row data-row">
                <div class="selection-row checkbox-cell">
                    <label class="checkbox-control">
                        <input
                            v-model="selectedProductIds"
                            class="row-checkbox"
                            type="checkbox"
                            :value="product.id"
                            :disabled="isSubmitting"
                            :aria-label="`选择${product.id}`"
                        >
                    </label>
                </div>
                <div class="table-cell desktop-stacked-cell">
                    <button class="desktop-text-action" type="button" :disabled="isSubmitting" @click="openProductDetail(product)">
                        {{ product.id || "--" }}
                    </button>
                    <span class="desktop-secondary-text" :title="product.model">{{ product.model || "--" }}</span>
                </div>
                <div class="table-cell"><span :title="product.category">{{ product.category || "--" }}</span></div>
                <div class="table-cell">
                    <button
                        v-if="product.image"
                        class="desktop-image-button"
                        type="button"
                        :aria-label="`查看${product.model || product.id}的图片`"
                        @click.stop="openImagePreview(product.image, product.model || product.id)"
                    >
                        <img :src="resolveErpImageUrl(product.image)" :alt="product.model || product.id">
                    </button>
                    <span v-else class="desktop-image-placeholder" aria-label="暂无图片"><Icon name="lucide:image" class="desktop-image-icon" /></span>
                </div>
                <div class="table-cell desktop-stacked-cell">
                    <span>{{ product.unit || "--" }}</span>
                    <span class="desktop-secondary-text" :title="product.material">{{ product.material || "--" }}</span>
                </div>
                <div class="table-cell"><span>{{ product.source || "--" }}</span></div>
                <div class="table-cell">
                    <button class="desktop-text-action" type="button" @click="openBomDialog(product)">查看结构</button>
                </div>
                <div class="table-cell"><span>{{ product.stockUpper || "0" }} / {{ product.stockLower || "0" }}</span></div>
                <div class="table-cell desktop-stacked-cell">
                    <span :title="product.warehouseName">{{ product.warehouseName || "--" }}</span>
                    <span class="desktop-secondary-text" :title="product.locationName">{{ product.locationName || "--" }}</span>
                </div>
                <div class="table-cell desktop-stacked-cell">
                    <span :title="product.description">{{ product.description || "--" }}</span>
                    <span class="desktop-secondary-text">{{ product.updatedAt || "--" }}</span>
                </div>
                <div class="action-row actions-cell erp-table-fixed-end">
                    <button class="desktop-text-action" type="button" :disabled="isSubmitting" @click="openProductDetail(product)">查看</button>
                    <button class="desktop-text-action" type="button" :disabled="isSubmitting" @click="openEditProductDialog(product)">编辑</button>
                    <button class="desktop-text-action" type="button" :disabled="isSubmitting" @click="deleteProduct(product)">删除</button>
                </div>
            </div>
        </ErpTableFrame>

        <ErpTableFrame
            v-else
            data-inventory-copy-table
            :columns="productTableColumnTemplate"
            :minimum-width="productTableMinimumWidth"
            :loading="isLoading"
            :empty="showProductEmptyState"
            loading-text="正在加载产品数据..."
            empty-text="暂无匹配产品"
            scroll-x
        >
            <template #header>
                <div class="table-row table-head">
                    <div class="selection-head checkbox-cell">
                        <label class="checkbox-control">
                            <input
                                class="row-checkbox"
                                type="checkbox"
                                :checked="allRowsSelected"
                                :disabled="isLoading || isSubmitting || visibleProducts.length === 0"
                                aria-label="选择全部产品"
                                @change="toggleSelectAll"
                            >
                        </label>
                    </div>
                    <div
                        v-for="(column, index) in lockedColumns"
                        :key="`locked-head-${column.key}`"
                        class="table-cell table-head-cell locked-table-cell"
                        :class="{ 'erp-table-fixed-start': index === lockedColumns.length - 1 }"
                        :style="{ left: getLockedColumnLeft(index) }"
                    >
                        <span>{{ column.label }}</span>
                        <button
                            v-if="isColumnResizeMode"
                            class="column-resize-handle"
                            type="button"
                            :aria-label="`调整${column.label}列宽`"
                            @mousedown="startColumnResize($event, column.key)"
                        />
                    </div>

                    <div
                        v-for="column in scrollColumns"
                        :key="column.key"
                        class="table-cell table-head-cell"
                    >
                        <span>{{ column.label }}</span>
                        <button
                            v-if="isColumnResizeMode"
                            class="column-resize-handle"
                            type="button"
                            :aria-label="`调整${column.label}列宽`"
                            @mousedown="startColumnResize($event, column.key)"
                        />
                    </div>

                    <div class="action-head erp-table-fixed-end">操作</div>
                </div>
            </template>

            <template v-for="product in visibleProducts" :key="product.id">
                <div class="table-row data-row">
                    <div class="selection-row checkbox-cell">
                        <label class="checkbox-control">
                            <input
                                v-model="selectedProductIds"
                                class="row-checkbox"
                                type="checkbox"
                                :value="product.id"
                                :disabled="isSubmitting"
                                :aria-label="`选择${product.id}`"
                            >
                        </label>
                    </div>

                    <div
                        v-for="(column, index) in lockedColumns"
                        :key="`locked-${product.id}-${column.key}`"
                        class="table-cell locked-table-cell"
                        :class="{
                            'image-cell': column.key === 'image',
                            'erp-table-fixed-start': index === lockedColumns.length - 1,
                        }"
                        :style="{ left: getLockedColumnLeft(index) }"
                    >
                        <template v-if="column.key === 'image'">
                            <img
                                v-if="product.image"
                                :src="resolveErpImageUrl(product.image)"
                                :alt="product.model || product.id"
                                class="clickable-image"
                                @click.stop="openImagePreview(product.image, product.model || product.id)"
                            >
                            <span v-else>--</span>
                        </template>
                        <button
                            v-else-if="column.key === 'bom'"
                            class="bom-link"
                            type="button"
                            @click="openBomDialog(product)"
                        >
                            {{ getProductCellValue(product, column.key) }}
                        </button>
                        <el-popover
                            v-else-if="column.key === 'description' && shouldShowProductDescriptionPopover(product)"
                            trigger="hover"
                            placement="top"
                            :width="280"
                            popper-class="erp-app product-description-popover"
                        >
                            <div class="description-popover-content">{{ getProductCellValue(product, column.key) }}</div>
                            <template #reference>
                                <span class="description-cell-text">{{ getProductCellValue(product, column.key) }}</span>
                            </template>
                        </el-popover>
                        <span v-else>{{ getProductCellValue(product, column.key) }}</span>
                    </div>

                    <div
                        v-for="column in scrollColumns"
                        :key="`${product.id}-${column.key}`"
                        class="table-cell"
                        :class="{ 'image-cell': column.key === 'image' }"
                    >
                        <template v-if="column.key === 'image'">
                            <img
                                v-if="product.image"
                                :src="resolveErpImageUrl(product.image)"
                                :alt="product.model || product.id"
                                class="clickable-image"
                                @click.stop="openImagePreview(product.image, product.model || product.id)"
                            >
                            <span v-else>--</span>
                        </template>
                        <button
                            v-else-if="column.key === 'bom'"
                            class="bom-link"
                            type="button"
                            @click="openBomDialog(product)"
                        >
                            {{ getProductCellValue(product, column.key) }}
                        </button>
                        <el-popover
                            v-else-if="column.key === 'description' && shouldShowProductDescriptionPopover(product)"
                            trigger="hover"
                            placement="top"
                            :width="280"
                            popper-class="erp-app product-description-popover"
                        >
                            <div class="description-popover-content">{{ getProductCellValue(product, column.key) }}</div>
                            <template #reference>
                                <span class="description-cell-text">{{ getProductCellValue(product, column.key) }}</span>
                            </template>
                        </el-popover>
                        <span v-else>{{ getProductCellValue(product, column.key) }}</span>
                    </div>

                    <div class="action-row actions-cell erp-table-fixed-end">
                        <button
                            class="icon-button blue"
                            type="button"
                            :disabled="isSubmitting"
                            :aria-label="`查看${product.id}`"
                            @click="openProductDetail(product)"
                        >
                            <Icon name="lucide:list" />
                        </button>
                        <button
                            class="icon-button blue"
                            type="button"
                            :disabled="isSubmitting"
                            :aria-label="`编辑${product.id}`"
                            @click="openEditProductDialog(product)"
                        >
                            <Icon name="lucide:square-pen" />
                        </button>
                        <button
                            class="icon-button delete"
                            type="button"
                            :disabled="isSubmitting"
                            :aria-label="`删除${product.id}`"
                            @click="deleteProduct(product)"
                        >
                            <Icon name="lucide:trash-2" />
                        </button>
                    </div>
                </div>
            </template>
        </ErpTableFrame>

        <InventoryPagination
            v-model:page-size="pageSize"
            v-model:jump-page-input="jumpPageInput"
            :compact="desktop"
            :selected-count="selectedProductIds.length"
            :total="totalProducts"
            :page-size-options="pageSizeOptions"
            :page-numbers="pageNumbers"
            :total-pages="totalPages"
            :current-page="currentPage"
            @page-change="goToPage"
            @jump="jumpToInputPage"
        />

        <ProductDetailDrawer
            :product="selectedDetailProduct"
            :can-view-standard-price="canViewStandardPrice"
            @close="closeProductDetail"
            @open-bom="openBomDialog"
            @sn-print-state-updated="handleSnPrintStateUpdated"
        />

        <div
            v-if="showImportDialog"
            class="erp-dialog-mask"
            role="presentation"
            @click.self="closeImportDialog"
        >
            <ErpDialogFrame
                title="批量导入产品"
                :close-disabled="isImporting"
                @close="closeImportDialog"
            >
                <div class="import-dialog-body">
                    <div class="import-section-title">上传 Excel</div>
                    <div v-if="importFileName" class="uploaded-image-attachment import-file-attachment">
                        <div class="uploaded-image-info">
                            <Icon name="lucide:file-text" class="uploaded-image-icon" />
                            <span>{{ importFileName }}</span>
                        </div>
                        <button
                            class="uploaded-image-remove"
                            type="button"
                            :disabled="isImporting"
                            @click="removeImportFile"
                        >
                            删除
                        </button>
                    </div>
                    <label
                        v-else
                        class="import-upload-box"
                        :class="{ disabled: isImporting, 'is-dragover': isImportDragover }"
                        @dragover.prevent="handleImportDragover"
                        @dragleave.prevent="handleImportDragleave"
                        @drop.prevent="handleImportDrop"
                    >
                        <Icon name="lucide:upload" class="upload-icon" />
                        <span>选择或拖拽 Excel 文件到此处</span>
                        <input
                            type="file"
                            accept=".xlsx"
                            :disabled="isImporting"
                            @click="openDesktopFileInput($event, INVENTORY_IMPORT_MAX_FILE_SIZE_BYTES, (files) => setImportFile(files[0]))"
                            @change="handleImportFileChange"
                        >
                    </label>
                    <p class="import-hint">支持 .xlsx，单个文件不超过 {{ INVENTORY_IMPORT_MAX_FILE_SIZE_MB }}MB。</p>
                    <button
                        class="import-template-button"
                        type="button"
                        :disabled="isImporting"
                        @click="downloadProductImportTemplate"
                    >
                        下载模板（Excel）
                    </button>

                    <div class="import-section-title">字段说明</div>
                    <div class="import-hint-list">
                        <p><strong>必填字段：</strong>型号</p>
                        <p><strong>可选字段：</strong>SN前缀参数、分类（一级分类或一级/二级分类）、单位、材质、来源、库存上下限、仓库（格式：仓库/一级仓位/二级仓位/三级仓位，填写到末级仓位）、产品简介</p>
                        <p><strong>产品图片：</strong>在"产品图片"列的单元格中直接插入图片，图片左上角需在对应行的单元格内。</p>
                        <p class="warning"><strong>注意事项：</strong>产品编号由系统自动生成；分类、单位、来源、仓库填写时会匹配已有内容。</p>
                    </div>
                </div>

                <template #footer>
                    <button
                        class="dialog-button cancel"
                        type="button"
                        :disabled="isImporting"
                        @click="closeImportDialog"
                    >
                        取消
                    </button>
                    <button
                        class="dialog-button confirm"
                        type="button"
                        :disabled="!importFile || isImporting"
                        @click="confirmImportProducts"
                    >
                        {{ isImporting ? "导入中" : "开始导入" }}
                    </button>
                </template>
            </ErpDialogFrame>
        </div>

        <div
            v-if="showProductDialog"
            class="erp-dialog-mask"
            role="presentation"
            @click.self="closeProductDialog"
        >
            <ErpDialogFrame
                :title="productDialogTitle"
                :close-disabled="isSubmitting"
                @close="closeProductDialog"
                @submit.prevent="confirmProductDialog"
            >
                <div class="product-form-body">
                    <label class="product-form-row">
                        <span>产品编号</span>
                        <input
                            v-model="newProductForm.id"
                            class="readonly"
                            type="text"
                            placeholder="保存后自动生成"
                            readonly
                        >
                    </label>

                    <label class="product-form-row textarea-row sn-prefixes-row">
                        <span>SN前缀参数</span>
                        <textarea
                            v-model="newProductForm.snPrefixesText"
                            placeholder="多个前缀用逗号、空格或换行分隔"
                        ></textarea>
                    </label>

                    <label class="product-form-row">
                        <span>型号<i>*</i></span>
                        <input v-model="newProductForm.model" type="text" required>
                    </label>

                    <div class="product-form-row">
                        <span>分类<i>*</i></span>
                        <div
                            class="category-cascader form-category-cascader"
                            :class="{ open: isProductCategoryMenuOpen }"
                        >
                            <button
                                class="category-trigger"
                                type="button"
                                :disabled="isSubmitting"
                                @click="toggleProductCategoryMenu"
                            >
                                <span>{{ newProductForm.category || "请选择" }}</span>
                            </button>
                            <div
                                class="category-menu"
                                :class="{ 'single-column': activeProductCategoryOptions.length === 0 }"
                            >
                                <div class="category-search-row">
                                    <Icon name="lucide:search" />
                                    <input
                                        v-model="productCategorySearchText"
                                        type="search"
                                        placeholder="搜索分类"
                                        aria-label="搜索产品分类"
                                        @keydown.esc.stop.prevent="isProductCategoryMenuOpen = false"
                                    >
                                </div>
                                <div class="category-primary-list">
                                    <button
                                        v-for="group in filteredProductCategoryGroups"
                                        :key="group.id"
                                        class="category-primary-option"
                                        :class="{ active: activeProductCategoryGroup === group.id }"
                                        type="button"
                                        @click="handleProductCategoryGroupClick(group)"
                                        @mouseenter="activeProductCategoryGroup = group.id"
                                    >
                                        <span>{{ group.name }}</span>
                                        <Icon v-if="group.children.length" name="lucide:chevron-right" />
                                    </button>
                                </div>
                                <div v-if="activeProductCategoryOptions.length" class="category-secondary-list">
                                    <button
                                        v-for="category in activeProductCategoryOptions"
                                        :key="category.id"
                                        class="category-secondary-option"
                                        type="button"
                                        @click="selectProductCategory(category)"
                                    >
                                        {{ category.name }}
                                    </button>
                                </div>
                                <div v-if="filteredProductCategoryGroups.length === 0" class="category-empty">
                                    暂无匹配分类
                                </div>
                            </div>
                        </div>
                    </div>

                    <label class="product-form-row">
                        <span>单位<i>*</i></span>
                        <SearchableSelect
                            v-model="newProductForm.unitId"
                            :options="unitSelectOptions"
                            placeholder="请选择"
                            aria-label="单位"
                        />
                    </label>

                    <label class="product-form-row">
                        <span>材质</span>
                        <SearchableSelect
                            v-model="newProductForm.material"
                            :options="materialSelectOptions"
                            placeholder="请选择材质"
                            aria-label="产品材质"
                        />
                    </label>

                    <div class="product-form-row">
                        <span>来源</span>
                        <SearchableSelect
                            v-model="newProductForm.source"
                            :options="sourceSelectOptions"
                            placeholder="请选择来源"
                            aria-label="产品来源"
                            :clearable="false"
                        />
                    </div>

                    <div class="product-form-row">
                        <span>仓库</span>
                        <InventoryWarehouseCascader
                            :warehouse-options="warehouseOptions"
                            :warehouse-id="newProductForm.defaultWarehouseId"
                            :location-id="newProductForm.defaultLocationId"
                            :label="newProductForm.defaultWarehouse"
                            :disabled="isSubmitting"
                            placeholder="请选择"
                            aria-label="选择仓库"
                            @select="updateProductWarehouse"
                        />
                    </div>

                    <label class="product-form-row">
                        <span>库存上限</span>
                        <input
                            v-model="newProductForm.stockUpper"
                            type="text"
                            inputmode="decimal"
                            @blur="normalizeProductDecimalField('stockUpper')"
                        >
                    </label>

                    <label class="product-form-row">
                        <span>库存下限</span>
                        <input
                            v-model="newProductForm.stockLower"
                            type="text"
                            inputmode="decimal"
                            @blur="normalizeProductDecimalField('stockLower')"
                        >
                    </label>

                    <div class="product-form-row image-row">
                        <span>产品图片<i>*</i></span>
                        <div class="image-upload-field">
                            <div v-if="productImageName" class="uploaded-image-attachment">
                                <div class="uploaded-image-info">
                                    <Icon name="lucide:image" class="uploaded-image-icon" />
                                    <span>{{ productImageName }}</span>
                                </div>
                                <button
                                    class="uploaded-image-remove"
                                    type="button"
                                    :disabled="isSubmitting || (productDialogMode === 'edit' && !productImageFile)"
                                    @click="removeProductImage"
                                >
                                    删除
                                </button>
                            </div>
                            <label
                                class="upload-box"
                                :class="{ 'is-dragover': isProductImageDragover }"
                                @dragover.prevent="handleProductImageDragover"
                                @dragleave.prevent="handleProductImageDragleave"
                                @drop.prevent="handleProductImageDrop"
                            >
                                <Icon name="lucide:upload" class="upload-icon" />
                                <span>
                                    {{ productDialogMode === "create" ? "您的文件拖拽到这里" : "选择新图片替换当前图片" }}
                                </span>
                                <input
                                    type="file"
                                    accept="image/*"
                                    :disabled="isSubmitting"
                                    @click="openDesktopFileInput($event, PRODUCT_IMAGE_MAX_SIZE_BYTES, setProductImageFiles)"
                                    @change="handleProductImageChange"
                                >
                            </label>
                            <p>最小分辨率 {{ PRODUCT_IMAGE_MIN_DIMENSION }}×{{ PRODUCT_IMAGE_MIN_DIMENSION }} 像素</p>
                        </div>
                    </div>

                    <label class="product-form-row textarea-row description-row">
                        <span>产品简介</span>
                        <textarea v-model="newProductForm.description"></textarea>
                    </label>
                </div>

                <template #footer>
                    <button
                        v-if="productShowDraftActions"
                        class="dialog-button cancel"
                        type="button"
                        :disabled="isSubmitting"
                        @click="openProductDrafts"
                    >
                        草稿箱
                    </button>
                    <button
                        v-if="productShowDraftActions"
                        class="dialog-button cancel draft-save-button"
                        type="button"
                        :disabled="isSubmitting"
                        @click="saveProductDraft"
                    >
                        保存草稿
                    </button>
                    <button
                        class="dialog-button cancel"
                        type="button"
                        :disabled="isSubmitting"
                        @click="closeProductDialog"
                    >
                        取消
                    </button>
                    <button
                        class="dialog-button confirm"
                        type="submit"
                        :disabled="isSubmitting || isProductImageValidating"
                    >
                        {{ isSubmitting ? "提交中" : "确认" }}
                    </button>
                </template>
            </ErpDialogFrame>

            <InventoryDraftPanel
                v-if="showProductDrafts"
                :drafts="productDrafts"
                @close="showProductDrafts = false"
                @apply="applyProductDraft"
                @remove="removeProductDraft"
            />
        </div>

        <div
            v-if="showBomDialog"
            class="erp-dialog-mask bom-structure-mask"
            role="presentation"
            @click.self="closeBomDialog"
        >
            <section class="bom-structure-dialog" :aria-label="bomDialogTitle">
                <header class="bom-structure-header">
                    <h2>{{ bomDialogTitle }}</h2>
                    <button
                        class="dialog-close"
                        type="button"
                        :aria-label="`关闭${bomDialogTitle}`"
                        @click="closeBomDialog"
                    >
                        <Icon name="lucide:x" />
                    </button>
                </header>

                <div class="bom-structure-body">
                    <BomTreeTable :root="selectedBomStructure" />
                </div>
            </section>
        </div>

        <ColumnConfigDialog
            v-if="showColumnConfigDialog"
            :column-configs="configurableColumnConfigs"
            :all-columns-visible="allColumnsVisible"
            @close="closeColumnConfigDialog"
            @confirm="confirmColumnConfig"
            @toggle-all-visible="toggleAllColumnsVisible"
            @toggle-visible="toggleColumnVisible"
            @toggle-locked="toggleColumnLocked"
            @drag-start="startColumnDrag"
            @drop="dropColumn"
        />

        <ImagePreviewDialog
            v-model="showImagePreview"
            :title="previewTitle"
            :images="previewImages"
        />
    </div>
</template>

<script setup lang="ts">
import { escapeHtml } from "~/utils/highlightText";
import { resolveErpImageUrl } from "~/utils/attachmentPreview";
import { downloadBlob, downloadWorkbook, openDesktopFileInput } from "~/utils/fileActions";
import type {
    InventoryCategory,
    InventoryLocation,
    InventoryProduct,
    InventoryUnit,
    InventoryWarehouse,
} from "~~/shared/types/inventory";
import { INVENTORY_PRODUCT_SOURCE } from "~~/shared/enums";
import { canManageInventory } from "~~/shared/utils/adminPermission";
import {
    INVENTORY_IMPORT_FILE_SIZE_MESSAGE,
    INVENTORY_IMPORT_MAX_FILE_SIZE_BYTES,
    INVENTORY_IMPORT_MAX_FILE_SIZE_MB,
} from "~~/shared/utils/inventoryImport";
import {
    addInventoryProduct,
    deleteInventoryProduct,
    getInventoryBomStructure,
    importInventoryProducts,
    type InventoryBomStructureNode,
    type InventoryProductMutationPayload,
    retrieveInventoryCategoryTree,
    retrieveInventoryLocations,
    retrieveInventoryMaterials,
    retrieveInventoryProducts,
    retrieveInventoryUnits,
    retrieveInventoryWarehouses,
    updateInventoryProduct,
} from "~/composables/api/useInventoryApi";
import { uploadImage } from "~/composables/api/useIndicesApi";
import { getPaginationPageNumbers } from "~/composables/inventory/useInventoryPagination";
import ErpBreadcrumb from "~/components/configuration/ErpBreadcrumb.vue";
import ErpDialogFrame from "~/components/configuration/ErpDialogFrame.vue";
import ErpSearchBox from "~/components/configuration/ErpSearchBox.vue";
import ErpTableFrame from "~/components/configuration/ErpTableFrame.vue";
import ColumnConfigDialog from "~/components/configuration/inventory/basic-data/ColumnConfigDialog.vue";
import InventoryPagination from "~/components/configuration/inventory/basic-data/InventoryPagination.vue";
import InventoryWarehouseCascader from "~/components/configuration/inventory/InventoryWarehouseCascader.vue";
import InventoryDraftPanel from "~/components/configuration/inventory/InventoryDraftPanel.vue";
import BomTreeTable from "~/components/configuration/inventory/basic-data/product/BomTreeTable.vue";
import ProductDetailDrawer from "~/components/configuration/inventory/basic-data/product/ProductDetailDrawer.vue";
import ImagePreviewDialog from "~/components/configuration/inventory/ImagePreviewDialog.vue";
import {
    buildInboundLocationTree,
    type InboundLocationOption,
} from "~/utils/inventory/inboundFrontendMapping";
import type { PreviewImage } from "~/components/configuration/inventory/ImagePreviewDialog.vue";
import {
    createInventoryDraftId,
    deleteInventoryDraft,
    listInventoryDrafts,
    saveInventoryDraft,
    shouldShowInventoryDraftActions,
    type InventoryDraftFile,
    type InventoryDraftRecord,
} from "~/composables/inventory/useInventoryDraftStorage";
import {
    PRODUCT_IMAGE_MIN_DIMENSION,
    resolveProductImageUpload,
    validateProductImageResolution,
} from "~/utils/inventory/productImageUpload";
import { formatOneDecimalText } from "~/utils/inventoryNumberFormat";
import { getErpTableGridColumn, getErpTableMinimumWidth } from "~/utils/inventory/erpTableColumns";
import { erpMessageBox } from "~/utils/erpMessageBox";

definePageMeta({
    layout: "inventory",
});

const desktop = useRuntimeConfig().public.erpDesktop === true;
const desktopCompactView = ref(true);
const showDesktopFilters = ref(false);
const desktopMoreMenu = ref<HTMLDetailsElement | null>(null);

const productBreadcrumbItems = [
    { label: "仓储管理" },
    { label: "基础数据" },
    { label: "产品管理" },
];

type ProductOption = {
    id: string;
    code: string;
    name: string;
};

interface CategoryOption extends ProductOption {
    parentId: string;
    children: CategoryOption[];
}

interface WarehouseOption extends ProductOption {
    enableLocation: boolean;
    children: InboundLocationOption[];
}

interface ProductItem {
    backendId: string;
    id: string;
    model: string;
    modelCode: string;
    category: string;
    categoryId: string;
    image: string;
    unit: string;
    unitId: string;
    material: string;
    source: string;
    standardPrice: string;
    averagePrice: string;
    stockUpper: string;
    stockLower: string;
    defaultWarehouse: string;
    warehouseName: string;
    locationName: string;
    warehouseId: string;
    locationId: string;
    barcode: string;
    snPrefixes: string[];
    snPrintState?: InventoryProduct["snPrintState"];
    description: string;
    updatedBy?: string;
    updatedAt?: string;
}

interface ProductForm {
    id: string;
    model: string;
    modelCode: string;
    snPrefixesText: string;
    categoryId: string;
    category: string;
    unitId: string;
    material: string;
    source: string;
    standardPrice: string;
    averagePrice: string;
    defaultWarehouseId: string;
    defaultLocationId: string;
    defaultWarehouse: string;
    stockUpper: string;
    stockLower: string;
    image: string;
    description: string;
}

interface ProductDraftData extends ProductForm {
    productImageName?: string;
}

interface ProductColumn {
    key:
        | "id"
        | "model"
        | "category"
        | "image"
        | "unit"
        | "material"
        | "source"
        | "standardPrice"
        | "bom"
        | "stockUpper"
        | "stockLower"
        | "defaultWarehouse"
        | "description"
        | "updatedBy"
        | "updatedAt";
    label: string;
    width: number;
    grow?: boolean;
}

interface ProductColumnConfig extends ProductColumn {
    visible: boolean;
    locked: boolean;
}

interface BomTreeNode {
    productCode: string;
    model: string;
    material?: string;
    image?: string;
    quantity?: number | null;
    unit: string;
    children?: BomTreeNode[];
}

const normalizeBomTreeNode = (node: InventoryBomStructureNode): BomTreeNode => ({
    productCode: node.productCode || "--",
    model: node.model || "--",
    material: node.material || "",
    image: node.image || "",
    quantity: node.quantity,
    unit: node.unitName || "--",
    children: Array.isArray(node.children)
        ? node.children.map((child) => normalizeBomTreeNode(child))
        : [],
});

type CsvValidationResult = {
    file: File;
    totalCount: number;
};

const columnConfigs = reactive<ProductColumnConfig[]>([
    {
        key: "id",
        label: "产品编号",
        width: 145,
        visible: true,
        locked: false,
    },
    {
        key: "model",
        label: "型号",
        width: 170,
        grow: true,
        visible: true,
        locked: false,
    },
    {
        key: "category",
        label: "分类",
        width: 140,
        visible: true,
        locked: false,
    },
    {
        key: "image",
        label: "产品图片",
        width: 150,
        visible: true,
        locked: false,
    },
    {
        key: "unit",
        label: "单位",
        width: 80,
        visible: true,
        locked: false,
    },
    {
        key: "material",
        label: "材质",
        width: 150,
        visible: true,
        locked: false,
    },
    {
        key: "source",
        label: "来源",
        width: 100,
        visible: true,
        locked: false,
    },
    {
        key: "standardPrice",
        label: "标准价",
        width: 105,
        visible: false,
        locked: false,
    },
    {
        key: "bom",
        label: "BOM结构",
        width: 130,
        visible: true,
        locked: false,
    },
    {
        key: "stockUpper",
        label: "库存上限",
        width: 105,
        visible: true,
        locked: false,
    },
    {
        key: "stockLower",
        label: "库存下限",
        width: 105,
        visible: true,
        locked: false,
    },
    {
        key: "defaultWarehouse",
        label: "仓库",
        width: 150,
        grow: true,
        visible: true,
        locked: false,
    },
    {
        key: "description",
        label: "产品简介",
        width: 190,
        grow: true,
        visible: true,
        locked: false,
    },
    {
        key: "updatedBy",
        label: "修改人",
        width: 150,
        visible: true,
        locked: false,
    },
    {
        key: "updatedAt",
        label: "修改时间",
        width: 180,
        visible: true,
        locked: false,
    },
]);
const defaultColumnWidths = columnConfigs.reduce<Record<ProductColumn["key"], number>>((widths, column) => {
    widths[column.key] = column.width;
    return widths;
}, {} as Record<ProductColumn["key"], number>);

const searchText = ref("");
const draftSelectedCategory = ref("");
const draftSelectedCategoryId = ref("");
const draftSelectedWarehouseId = ref("");
const draftSelectedSource = ref("");
const appliedCategoryId = ref("");
const appliedWarehouseId = ref("");
const appliedSource = ref("");
const products = ref<ProductItem[]>([]);
const categoryGroups = ref<CategoryOption[]>([]);
const unitOptions = ref<ProductOption[]>([]);
const materialOptions = ref<ProductOption[]>([]);
const warehouseOptions = ref<WarehouseOption[]>([]);
const selectedProductIds = ref<string[]>([]);
const showProductDialog = ref(false);
const showProductDrafts = ref(false);
const showImportDialog = ref(false);
const showBomDialog = ref(false);
const productDialogMode = ref<"create" | "edit">("create");
const showColumnConfigDialog = ref(false);
const showImagePreview = ref(false);
const previewImages = ref<PreviewImage[]>([]);
const previewTitle = ref("");
const selectedDetailProduct = ref<ProductItem | null>(null);
const selectedBomProduct = ref<ProductItem | null>(null);
const selectedBomStructure = ref<BomTreeNode | null>(null);
const isDraftCategoryMenuOpen = ref(false);
const isProductCategoryMenuOpen = ref(false);
const draftCategorySearchText = ref("");
const productCategorySearchText = ref("");
const isLoading = ref(false);
const isSubmitting = ref(false);
const isImporting = ref(false);
const isExporting = ref(false);
const isLoadingBomStructure = ref(false);
const isColumnResizeMode = ref(false);
const draggingColumnKey = ref<ProductColumn["key"] | null>(null);
const resizingColumnKey = ref<ProductColumn["key"] | null>(null);
const columnResizeStartX = ref(0);
const columnResizeStartWidth = ref(0);
const editingProductBackendId = ref("");
const productImageFile = ref<File | null>(null);
const isProductImageValidating = ref(false);
let productImageValidationId = 0;
const isProductImageDragover = ref(false);
const importFile = ref<File | null>(null);
const isImportDragover = ref(false);
const pageSizeOptions = [5, 10, 15];
const pageSize = ref(10);
const totalProducts = ref(0);
const currentPage = ref(1);
const jumpPageInput = ref("1");
const productImageName = ref("");
const productDrafts = ref<InventoryDraftRecord<ProductDraftData>[]>([]);
const importFileName = computed(() => importFile.value?.name || "");
const adminInfo = useState<{ role?: number }>("admin_info", () => ({}));
const canViewStandardPrice = computed(() => canManageInventory(Number(adminInfo.value?.role)));

const sourceOptions = Object.values(INVENTORY_PRODUCT_SOURCE);
const unitSelectOptions = computed(() =>
    unitOptions.value.map((unit) => ({
        label: unit.name,
        value: unit.id,
    })),
);
const materialSelectOptions = computed(() =>
    materialOptions.value.map((material) => ({
        label: material.name,
        value: material.name,
    })),
);
const sourceSelectOptions = sourceOptions.map((source) => ({
    label: source,
    value: source,
}));
const activeDraftCategoryGroup = ref("");
const activeProductCategoryGroup = ref("");
const PRODUCT_IMAGE_MAX_SIZE_MB = 10;
const PRODUCT_IMAGE_MAX_SIZE_BYTES = PRODUCT_IMAGE_MAX_SIZE_MB * 2048 * 2048;
const PRODUCT_COLUMN_WIDTH_STORAGE_KEY = "inventory.product.columnWidths";
const PRODUCT_COLUMN_CONFIG_STORAGE_KEY = "inventory.product.columnConfigs";
const PRODUCT_COLUMN_MIN_WIDTH = 60;

const filterCategoryGroups = (keyword: string) => {
    const normalizedKeyword = keyword.trim().toLowerCase();

    if (!normalizedKeyword) {
        return categoryGroups.value;
    }

    return categoryGroups.value
        .map((group) => {
            const groupMatched = group.name.toLowerCase().includes(normalizedKeyword)
                || group.code.toLowerCase().includes(normalizedKeyword);
            const matchedChildren = group.children.filter((category) =>
                category.name.toLowerCase().includes(normalizedKeyword)
                || category.code.toLowerCase().includes(normalizedKeyword),
            );

            if (groupMatched) {
                return group;
            }

            if (matchedChildren.length) {
                return {
                    ...group,
                    children: matchedChildren,
                };
            }

            return null;
        })
        .filter((group): group is CategoryOption => Boolean(group));
};

const filteredDraftCategoryGroups = computed(() =>
    filterCategoryGroups(draftCategorySearchText.value),
);
const filteredProductCategoryGroups = computed(() =>
    filterCategoryGroups(productCategorySearchText.value),
);

const getActiveCategoryOptions = (groups: CategoryOption[], groupId: string) =>
    groups.find((item) => item.id === groupId)?.children || [];

const activeDraftCategoryOptions = computed(() =>
    getActiveCategoryOptions(filteredDraftCategoryGroups.value, activeDraftCategoryGroup.value),
);
const activeProductCategoryOptions = computed(() =>
    getActiveCategoryOptions(filteredProductCategoryGroups.value, activeProductCategoryGroup.value),
);

watch(filteredDraftCategoryGroups, (groups) => {
    if (
        isDraftCategoryMenuOpen.value &&
        !groups.some((group) => group.id === activeDraftCategoryGroup.value)
    ) {
        activeDraftCategoryGroup.value = groups[0]?.id || "";
    }
});

watch(filteredProductCategoryGroups, (groups) => {
    if (
        isProductCategoryMenuOpen.value &&
        !groups.some((group) => group.id === activeProductCategoryGroup.value)
    ) {
        activeProductCategoryGroup.value = groups[0]?.id || "";
    }
});

const syncJumpInput = () => {
    jumpPageInput.value = String(currentPage.value);
};

const normalizePage = (page: number) => {
    if (!Number.isFinite(page)) {
        return currentPage.value;
    }

    return Math.min(Math.max(1, Math.trunc(page)), totalPages.value);
};

const goToPage = (page: number, shouldLoad = true) => {
    const nextPage = normalizePage(page);
    const changed = nextPage !== currentPage.value;

    currentPage.value = nextPage;
    syncJumpInput();

    if (shouldLoad && changed) {
        loadProducts(false);
    }
};

const jumpToInputPage = () => {
    goToPage(Number(jumpPageInput.value.trim()));
};
const hasPendingFilters = computed(() =>
    draftSelectedCategoryId.value !== appliedCategoryId.value ||
    draftSelectedWarehouseId.value !== appliedWarehouseId.value ||
    draftSelectedSource.value !== appliedSource.value,
);

const createEmptyProductForm = (): ProductForm => ({
    id: "",
    model: "",
    modelCode: "",
    snPrefixesText: "",
    categoryId: "",
    category: "",
    unitId: "",
    material: "",
    source: INVENTORY_PRODUCT_SOURCE.PURCHASED,
    standardPrice: "",
    averagePrice: "",
    defaultWarehouseId: "",
    defaultLocationId: "",
    defaultWarehouse: "",
    stockUpper: "0.0",
    stockLower: "0.0",
    image: "",
    description: "",
});

const newProductForm = reactive<ProductForm>(createEmptyProductForm());
const initialProductAveragePrice = ref(0);

const productDialogTitle = computed(() =>
    productDialogMode.value === "edit" ? "编辑产品" : "新建产品",
);
const productShowDraftActions = computed(() =>
    shouldShowInventoryDraftActions(productDialogMode.value),
);

const warehouseFilterOptions = computed(() => warehouseOptions.value);
const configurableColumnConfigs = computed(() =>
    columnConfigs.filter((column) => canViewStandardPrice.value || column.key !== "standardPrice"),
);
const displayedColumns = computed(() =>
    configurableColumnConfigs.value.filter((column) => column.visible),
);
const lockedColumns = computed(() => displayedColumns.value.filter((column) => column.locked));
const scrollColumns = computed(() => displayedColumns.value.filter((column) => !column.locked));
const allColumnsVisible = computed(() =>
    configurableColumnConfigs.value.every((column) => column.visible),
);
const totalPages = computed(() =>
    Math.max(1, Math.ceil(totalProducts.value / pageSize.value)),
);
const pageNumbers = computed(() =>
    getPaginationPageNumbers(totalPages.value, currentPage.value),
);
const productTableColumnTemplate = computed(() => [
    "var(--product-selection-width)",
    ...lockedColumns.value.map(getErpTableGridColumn),
    ...scrollColumns.value.map(getErpTableGridColumn),
    "var(--product-action-width)",
].join(" "));
const productTableMinimumWidth = computed(() =>
    getErpTableMinimumWidth(
        displayedColumns.value,
        ["var(--product-selection-width)"],
        ["var(--product-action-width)"],
    ),
);
const getLockedColumnLeft = (columnIndex: number) => {
    const previousLockedWidth = lockedColumns.value
        .slice(0, columnIndex)
        .reduce((total, column) => total + column.width, 0);

    return `calc(var(--product-selection-width) + ${previousLockedWidth}px)`;
};
const bomDialogTitle = computed(() => {
    const product = selectedBomProduct.value;

    if (!product) {
        return "BOM结构";
    }

    return `${product.model || "--"}（${product.id || "--"}） BOM结构`;
});

const visibleProducts = computed(() => products.value);
const allRowsSelected = computed(() =>
    visibleProducts.value.length > 0 &&
    visibleProducts.value.every((product) => selectedProductIds.value.includes(product.id)),
);
const showProductEmptyState = computed(() => !isLoading.value && visibleProducts.value.length === 0);

const toggleSelectAll = () => {
    if (allRowsSelected.value) {
        selectedProductIds.value = selectedProductIds.value.filter(
            (id) => !visibleProducts.value.some((product) => product.id === id),
        );
        return;
    }

    selectedProductIds.value = [
        ...new Set([
            ...selectedProductIds.value,
            ...visibleProducts.value.map((product) => product.id),
        ]),
    ];
};

const handleApiError = (err: any, fallbackMessage: string) => {
    ElMessage.error(err?.data?.msg || err?.message || fallbackMessage);
};

const toCsvValue = (value: unknown) => {
    const text = value == null ? "" : String(value);
    if (/[",\n]/.test(text)) {
        const escapedText = text.replace(/"/g, "\"\"");
        return "\"" + escapedText + "\"";
    }
    return text;
};

const downloadCsv = (headers: string[], rows: unknown[][], filename: string) => {
    const csvContent = [headers, ...rows]
        .map((row) => row.map(toCsvValue).join(","))
        .join("\n");
    const blob = new Blob([`\uFEFF${csvContent}`], { type: "text/csv;charset=utf-8;" });
    return downloadBlob(blob, filename);
};

const buildCsvFile = (headers: string[], rows: unknown[][], filename: string) => {
    const csvContent = [headers, ...rows]
        .map((row) => row.map(toCsvValue).join(","))
        .join("\n");
    return new File([csvContent], filename, { type: "text/csv;charset=utf-8;" });
};

const decodeCsvFile = async (file: File) => {
    const buffer = await file.arrayBuffer();

    try {
        return new TextDecoder("utf-8", { fatal: true }).decode(buffer);
    } catch {
        try {
            return new TextDecoder("gb18030").decode(buffer);
        } catch {
            throw new Error("当前浏览器不支持解析 GB2312/GBK 编码的 CSV，请将文件另存为 UTF-8 后重试");
        }
    }
};

const parseCsvRows = (text: string) => {
    const rows: string[][] = [];
    let row: string[] = [];
    let cell = "";
    let inQuotes = false;

    for (let index = 0; index < text.length; index += 1) {
        const char = text[index];
        const nextChar = text[index + 1];

        if (char === '"') {
            if (inQuotes && nextChar === '"') {
                cell += '"';
                index += 1;
            } else {
                inQuotes = !inQuotes;
            }
            continue;
        }

        if (char === "," && !inQuotes) {
            row.push(cell);
            cell = "";
            continue;
        }

        if ((char === "\n" || char === "\r") && !inQuotes) {
            if (char === "\r" && nextChar === "\n") {
                index += 1;
            }
            row.push(cell);
            rows.push(row);
            row = [];
            cell = "";
            continue;
        }

        cell += char;
    }

    row.push(cell);
    rows.push(row);

    return rows.filter((item) => item.some((value) => value.trim()));
};

const normalizeCsvHeader = (value: string) =>
    value.replace(/^\uFEFF/, "").replace(/\s+/g, "").trim().toLowerCase();

const findCsvColumn = (headers: string[], names: string[]) => {
    const normalizedNames = names.map(normalizeCsvHeader);
    return headers.findIndex((header) => normalizedNames.includes(normalizeCsvHeader(header)));
};

const removeCsvColumns = (headers: string[], rows: string[][], names: string[]) => {
    const normalizedNames = names.map(normalizeCsvHeader);
    const removeIndexes = headers
        .map((header, index) => (normalizedNames.includes(normalizeCsvHeader(header)) ? index : -1))
        .filter((index) => index >= 0)
        .sort((a, b) => b - a);

    removeIndexes.forEach((index) => {
        headers.splice(index, 1);
        rows.forEach((row) => {
            row.splice(index, 1);
        });
    });
};

const getCsvCell = (row: string[], index: number) =>
    index >= 0 ? (row[index] || "").trim() : "";

const ensureCsvColumn = (headers: string[], rows: string[][], name: string) => {
    let index = findCsvColumn(headers, [name]);
    if (index >= 0) {
        return index;
    }

    headers.push(name);
    index = headers.length - 1;
    rows.forEach((row) => {
        row[index] = "";
    });
    return index;
};

const setCsvCell = (row: string[], index: number, value: string) => {
    while (row.length <= index) {
        row.push("");
    }
    row[index] = value;
};

const flattenCategories = (categories: CategoryOption[], parentNames: string[] = []): Array<CategoryOption & { path: string }> =>
    categories.flatMap((category) => {
        const pathNames = [...parentNames, category.name].filter(Boolean);
        const current = { ...category, path: pathNames.join("/") };
        return [
            current,
            ...flattenCategories(category.children || [], pathNames),
        ];
    });

const findOptionByText = (options: ProductOption[], value: string) =>
    options.find((option) =>
        option.id === value ||
        option.code.toUpperCase() === value.toUpperCase() ||
        option.name === value,
    );

const findCategoryByText = (value: string) => {
    const normalizedValue = value.replace(/／/g, "/").trim();
    const categories = flattenCategories(categoryGroups.value);

    if (normalizedValue.includes("/")) {
        return categories.find((category) => category.path === normalizedValue);
    }

    return categories.find((category) =>
        category.id === normalizedValue ||
        category.code.toUpperCase() === normalizedValue.toUpperCase() ||
        category.name === normalizedValue,
    );
};

const prepareProductImportCsv = async (file: File): Promise<CsvValidationResult | null> => {
    let csvText = "";
    try {
        csvText = await decodeCsvFile(file);
    } catch (err: any) {
        ElMessage.error(err?.message || "CSV 文件读取失败");
        return null;
    }

    const rows = parseCsvRows(csvText);
    const headers = rows[0] || [];
    const dataRows = rows.slice(1);

    if (!headers.length || !dataRows.length) {
        ElMessage.warning("CSV 中没有可导入的数据");
        return null;
    }

    const modelIndex = findCsvColumn(headers, ["型号", "model"]);
    const categoryIndex = findCsvColumn(headers, ["分类"]);
    const unitIndex = findCsvColumn(headers, ["单位"]);
    const sourceIndex = findCsvColumn(headers, ["来源", "产品来源", "source"]);
    const warehouseIndex = findCsvColumn(headers, ["仓库"]);
    const categoryIdIndex = ensureCsvColumn(headers, dataRows, "分类id");
    const unitIdIndex = ensureCsvColumn(headers, dataRows, "单位id");
    const warehouseIdIndex = ensureCsvColumn(headers, dataRows, "仓库id");
    const errors: string[] = [];
    const normalizedRows: string[][] = [];
    let totalCount = 0;

    dataRows.forEach((row, rowIndex) => {
        const rowNumber = rowIndex + 2;
        if (!row.some((value) => value.trim())) {
            return;
        }

        totalCount += 1;

        if (!getCsvCell(row, modelIndex)) {
            errors.push("第" + rowNumber + "行：型号必填");
        }

        const categoryText = getCsvCell(row, categoryIndex);
        if (categoryText) {
            const category = findCategoryByText(categoryText);
            if (!category) {
                errors.push("第" + rowNumber + "行：分类不存在");
            } else {
                setCsvCell(row, categoryIdIndex, category.id);
            }
        }

        const unitText = getCsvCell(row, unitIndex);
        if (unitText) {
            const unit = findOptionByText(unitOptions.value, unitText);
            if (!unit) {
                errors.push("第" + rowNumber + "行：单位不存在");
            } else {
                setCsvCell(row, unitIdIndex, unit.id);
            }
        }

        const sourceText = getCsvCell(row, sourceIndex);
        if (sourceText && !sourceOptions.includes(sourceText as INVENTORY_PRODUCT_SOURCE)) {
            errors.push("第" + rowNumber + "行：来源不存在");
        }

        const warehouseText = getCsvCell(row, warehouseIndex);
        if (warehouseText) {
            const warehouse = findOptionByText(warehouseOptions.value, warehouseText);
            if (!warehouse) {
                errors.push("第" + rowNumber + "行：仓库不存在");
            } else {
                setCsvCell(row, warehouseIdIndex, warehouse.id);
            }
        }

        normalizedRows.push(row);
    });

    if (!totalCount) {
        ElMessage.warning("CSV 中没有可导入的数据");
        return null;
    }

    if (errors.length) {
        await erpMessageBox.alert(errors.slice(0, 20).map(escapeHtml).join("<br/>"), "导入数据检查失败", {
            confirmButtonText: "知道了",
            type: "warning",
            dangerouslyUseHTMLString: true,
        });
        return null;
    }

    removeCsvColumns(headers, normalizedRows, ["产品编号", "产品编码", "编号", "code"]);

    return {
        file: buildCsvFile(headers, normalizedRows, file.name),
        totalCount,
    };
};

const formatDateTime = (value?: string | Date) => {
    if (!value) {
        return "--";
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return String(value);
    }

    const pad = (item: number) => String(item).padStart(2, "0");

    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
};

const formatNumberText = (value?: number | string, fallback = "--") => {
    if (value === undefined || value === null || value === "") {
        return fallback;
    }

    const num = Number(value);
    return Number.isFinite(num) ? String(num) : fallback;
};

const formatPriceText = (value?: number | string, fallback = "--") => {
    if (value === undefined || value === null || value === "") {
        return fallback;
    }

    const num = Number(value);
    return Number.isFinite(num) ? num.toFixed(2) : fallback;
};

const toEntityId = (value?: unknown) => {
    if (!value) {
        return "";
    }

    if (typeof value === "string") {
        return value;
    }

    if (typeof value === "object" && value !== null && "toString" in value) {
        return String(value);
    }

    return "";
};

const normalizeBaseOption = (item: InventoryUnit | InventoryWarehouse | InventoryLocation): ProductOption => ({
    id: item._id || "",
    code: item.code || "",
    name: item.name || "",
});

const normalizeWarehouseOption = (
    warehouse: InventoryWarehouse,
    children: InboundLocationOption[] = [],
): WarehouseOption => ({
    ...normalizeBaseOption(warehouse),
    enableLocation: warehouse.enableLocation === true,
    children,
});

const loadLocationsByWarehouse = async (warehouse: InventoryWarehouse) => {
    const warehouseId = warehouse._id || "";
    if (!warehouseId || warehouse.enableLocation !== true) {
        return [];
    }

    const res = await retrieveInventoryLocations({ warehouseId });
    if (res.code !== 200) {
        ElMessage.error(res.msg || "获取仓位选项失败");
        return [];
    }

    return Array.isArray(res.data?.list)
        ? buildInboundLocationTree(res.data.list)
        : [];
};

const normalizeCategoryOption = (category: InventoryCategory): CategoryOption => ({
    id: category._id || "",
    code: category.code || "",
    name: category.name || "",
    parentId: category.parentId ? String(category.parentId) : "",
    children: Array.isArray(category.children)
        ? category.children.map((child) => normalizeCategoryOption(child as InventoryCategory))
        : [],
});

const normalizeProduct = (product: InventoryProduct): ProductItem => ({
    backendId: product._id || "",
    id: product.code || "",
    model: product.model || "",
    modelCode: product.modelCode || "",
    category: product.categoryPath || product.categoryName || "--",
    categoryId: toEntityId(product.categoryId),
    image: product.image || "",
    unit: product.unitName || "--",
    unitId: toEntityId(product.unitId),
    material: product.material || "",
    source: product.source || INVENTORY_PRODUCT_SOURCE.PURCHASED,
    standardPrice: formatPriceText(product.standardPrice, ""),
    averagePrice: formatNumberText(product.averagePrice, ""),
    stockUpper: formatOneDecimalText(product.stockUpperLimit, ""),
    stockLower: formatOneDecimalText(product.stockLowerLimit, ""),
    defaultWarehouse: product.locationName
        ? `${product.warehouseName || "--"}/${product.locationName}`
        : product.warehouseName || "默认仓库",
    warehouseName: product.warehouseName || "默认仓库",
    locationName: product.locationName || "",
    warehouseId: toEntityId(product.warehouseId),
    locationId: toEntityId(product.locationId),
    barcode: product.barcode || "",
    snPrefixes: Array.isArray(product.snPrefixes) ? product.snPrefixes : [],
    snPrintState: product.snPrintState,
    description: product.introduction || "",
    updatedBy: product.updatedBy || product.operator || "--",
    updatedAt: formatDateTime(product.updateTime),
});

const buildProductQuery = (resetPage = false) => ({
    keyword: searchText.value.trim() || undefined,
    categoryId: appliedCategoryId.value || undefined,
    warehouseId: appliedWarehouseId.value || undefined,
    source: appliedSource.value || undefined,
    page: resetPage ? 1 : currentPage.value,
    limit: pageSize.value,
});

const loadProducts = async (resetPage = true) => {
    if (isLoading.value) {
        return;
    }

    if (resetPage) {
        currentPage.value = 1;
        syncJumpInput();
    }

    isLoading.value = true;
    try {
        const res = await retrieveInventoryProducts(buildProductQuery(false));

        if (res.code !== 200) {
            ElMessage.error(res.msg || "获取产品列表失败");
            products.value = [];
            totalProducts.value = 0;
            return;
        }

        products.value = Array.isArray(res.data?.list)
            ? res.data.list.map(normalizeProduct)
            : [];
        totalProducts.value = Number(res.data?.pagination?.total || 0);
        goToPage(res.data?.pagination?.page || currentPage.value, false);
    } catch (err: any) {
        products.value = [];
        totalProducts.value = 0;
        handleApiError(err, "获取产品列表失败");
    } finally {
        isLoading.value = false;
    }
};

const loadProductOptions = async () => {
    try {
        const [categoryRes, unitRes, materialRes, warehouseRes] = await Promise.all([
            retrieveInventoryCategoryTree(),
            retrieveInventoryUnits(),
            retrieveInventoryMaterials(),
            retrieveInventoryWarehouses(),
        ]);

        if (categoryRes.code === 200) {
            categoryGroups.value = Array.isArray(categoryRes.data?.tree)
                ? categoryRes.data.tree.map(normalizeCategoryOption)
                : [];
            activeDraftCategoryGroup.value = categoryGroups.value[0]?.id || "";
            activeProductCategoryGroup.value = categoryGroups.value[0]?.id || "";
        } else {
            ElMessage.error(categoryRes.msg || "获取分类选项失败");
        }

        if (unitRes.code === 200) {
            unitOptions.value = Array.isArray(unitRes.data?.list)
                ? unitRes.data.list.map(normalizeBaseOption)
                : [];
        } else {
            ElMessage.error(unitRes.msg || "获取单位选项失败");
        }

        if (materialRes.code === 200) {
            materialOptions.value = Array.isArray(materialRes.data?.list)
                ? materialRes.data.list.map(normalizeBaseOption)
                : [];
        } else {
            ElMessage.error(materialRes.msg || "获取材质选项失败");
        }

        if (warehouseRes.code === 200) {
            const warehouses = Array.isArray(warehouseRes.data?.list)
                ? warehouseRes.data.list
                : [];
            const locationGroups = await Promise.all(
                warehouses.map((warehouse) => loadLocationsByWarehouse(warehouse)),
            );
            warehouseOptions.value = warehouses.map((warehouse, index) =>
                normalizeWarehouseOption(warehouse, locationGroups[index]),
            );
        } else {
            ElMessage.error(warehouseRes.msg || "获取仓库选项失败");
        }
    } catch (err: any) {
        handleApiError(err, "获取产品基础选项失败");
    }
};

const resetFilters = () => {
    searchText.value = "";
    draftSelectedCategory.value = "";
    draftSelectedCategoryId.value = "";
    draftSelectedWarehouseId.value = "";
    draftSelectedSource.value = "";
    appliedCategoryId.value = "";
    appliedWarehouseId.value = "";
    appliedSource.value = "";
    loadProducts();
};

const applyFilters = () => {
    appliedCategoryId.value = draftSelectedCategoryId.value;
    appliedWarehouseId.value = draftSelectedWarehouseId.value;
    appliedSource.value = draftSelectedSource.value;
    loadProducts();
};

const toggleDraftCategoryMenu = () => {
    isDraftCategoryMenuOpen.value = !isDraftCategoryMenuOpen.value;
    if (!isDraftCategoryMenuOpen.value) {
        draftCategorySearchText.value = "";
    }
};

const toggleProductCategoryMenu = () => {
    isProductCategoryMenuOpen.value = !isProductCategoryMenuOpen.value;
    if (!isProductCategoryMenuOpen.value) {
        productCategorySearchText.value = "";
    }
};

const handleCategoryOutsideClick = (event: MouseEvent) => {
    const target = event.target as HTMLElement | null;

    if (target?.closest(".category-cascader")) {
        return;
    }

    isDraftCategoryMenuOpen.value = false;
    isProductCategoryMenuOpen.value = false;
    draftCategorySearchText.value = "";
    productCategorySearchText.value = "";
};

const selectDraftCategory = (category: CategoryOption) => {
    draftSelectedCategory.value = category.name;
    draftSelectedCategoryId.value = category.id;
    isDraftCategoryMenuOpen.value = false;
    draftCategorySearchText.value = "";
};

const handleDraftCategoryGroupClick = (group: CategoryOption) => {
    activeDraftCategoryGroup.value = group.id;
    selectDraftCategory(group);
};

const selectProductCategory = (category: CategoryOption) => {
    newProductForm.category = category.name;
    newProductForm.categoryId = category.id;
    isProductCategoryMenuOpen.value = false;
    productCategorySearchText.value = "";
};

const handleProductCategoryGroupClick = (group: CategoryOption) => {
    activeProductCategoryGroup.value = group.id;
    selectProductCategory(group);
};

const updateProductWarehouse = (warehouseId: string, locationId: string, label: string) => {
    newProductForm.defaultWarehouseId = warehouseId;
    newProductForm.defaultLocationId = locationId;
    newProductForm.defaultWarehouse = label === "--" ? "" : label;
};

const openImagePreview = (url: string, title: string) => {
    previewImages.value = [{ url, alt: title }];
    previewTitle.value = title;
    showImagePreview.value = true;
};

const getProductImageName = (imagePath: string) => {
    const normalizedPath = imagePath.replace(/\\/g, "/").split("?")[0].split("#")[0];

    return decodeURIComponent(normalizedPath.split("/").pop() ?? "");
};

const invalidateProductImageValidation = () => {
    productImageValidationId += 1;
    isProductImageValidating.value = false;
};

const resetProductForm = () => {
    invalidateProductImageValidation();
    Object.assign(newProductForm, createEmptyProductForm());
    initialProductAveragePrice.value = 0;
    productImageName.value = "";
    productImageFile.value = null;
    editingProductBackendId.value = "";
};

const toProductDraftData = (): ProductDraftData => ({
    id: "",
    model: newProductForm.model,
    modelCode: newProductForm.modelCode,
    snPrefixesText: newProductForm.snPrefixesText,
    categoryId: newProductForm.categoryId,
    category: newProductForm.category,
    unitId: newProductForm.unitId,
    material: newProductForm.material,
    source: newProductForm.source,
    standardPrice: newProductForm.standardPrice,
    averagePrice: newProductForm.averagePrice,
    defaultWarehouseId: newProductForm.defaultWarehouseId,
    defaultLocationId: newProductForm.defaultLocationId,
    defaultWarehouse: newProductForm.defaultWarehouse,
    stockUpper: newProductForm.stockUpper,
    stockLower: newProductForm.stockLower,
    image: "",
    description: newProductForm.description,
    productImageName: productImageFile.value?.name || "",
});

const toProductDraftFiles = (): InventoryDraftFile[] => {
    if (!productImageFile.value) {
        return [];
    }

    return [{
        field: "image",
        name: productImageFile.value.name,
        type: productImageFile.value.type,
        size: productImageFile.value.size,
        lastModified: productImageFile.value.lastModified,
        file: productImageFile.value,
    }];
};

const loadProductDrafts = async () => {
    try {
        productDrafts.value = await listInventoryDrafts<ProductDraftData>("product");
    } catch (err: any) {
        productDrafts.value = [];
        handleApiError(err, "读取产品草稿失败");
    }
};

const saveProductDraft = async () => {
    const now = Date.now();
    const title = newProductForm.model.trim() || "未命名产品草稿";

    try {
        await saveInventoryDraft<ProductDraftData>({
            id: createInventoryDraftId("product"),
            type: "product",
            title,
            data: toProductDraftData(),
            files: toProductDraftFiles(),
            createdAt: now,
            updatedAt: now,
        });
        await loadProductDrafts();
        ElMessage.success("草稿已保存");
    } catch (err: any) {
        handleApiError(err, "保存产品草稿失败");
    }
};

const openProductDrafts = async () => {
    await loadProductDrafts();
    showProductDrafts.value = true;
};

const getProductDraftImageFile = (draft: InventoryDraftRecord<ProductDraftData>) => {
    const imageFile = draft.files?.find((file) => file.field === "image");
    const file = imageFile?.file;

    if (!imageFile || !file) {
        return null;
    }

    if (typeof File !== "undefined" && file instanceof File) {
        return file;
    }

    if (typeof Blob !== "undefined" && file instanceof Blob && typeof File !== "undefined") {
        return new File([file], imageFile.name || "product-image", {
            type: imageFile.type || file.type,
            lastModified: imageFile.lastModified || Date.now(),
        });
    }

    return null;
};

const applyProductDraft = (draft: InventoryDraftRecord) => {
    if (isSubmitting.value) {
        return;
    }

    invalidateProductImageValidation();
    const productDraft = draft as InventoryDraftRecord<ProductDraftData>;
    const data = productDraft.data || createEmptyProductForm();
    const imageFile = getProductDraftImageFile(productDraft);
    const isEditingProduct = productDialogMode.value === "edit";
    const currentProductId = newProductForm.id;
    const currentProductImage = newProductForm.image;
    const currentProductImageName = productImageName.value;

    Object.assign(newProductForm, createEmptyProductForm(), {
        id: isEditingProduct ? currentProductId : "",
        model: data.model || "",
        modelCode: data.modelCode || "",
        snPrefixesText: data.snPrefixesText || "",
        categoryId: data.categoryId || "",
        category: data.category || "",
        unitId: data.unitId || "",
        material: data.material || "",
        source: data.source || INVENTORY_PRODUCT_SOURCE.PURCHASED,
        standardPrice: data.standardPrice || "",
        averagePrice: data.averagePrice || "",
        defaultWarehouseId: data.defaultWarehouseId || "",
        defaultLocationId: data.defaultLocationId || "",
        defaultWarehouse: data.defaultWarehouse || "",
        stockUpper: data.stockUpper || "0.0",
        stockLower: data.stockLower || "0.0",
        image: isEditingProduct && !imageFile ? currentProductImage : "",
        description: data.description || "",
    });
    productImageFile.value = imageFile;
    productImageName.value = imageFile?.name || (isEditingProduct ? currentProductImageName : "");
    isProductCategoryMenuOpen.value = false;
    showProductDrafts.value = false;
};

const removeProductDraft = async (id: string) => {
    try {
        await deleteInventoryDraft(id);
        productDrafts.value = productDrafts.value.filter((draft) => draft.id !== id);
        ElMessage.success("草稿已删除");
    } catch (err: any) {
        handleApiError(err, "删除产品草稿失败");
    }
};

const openProductDialog = () => {
    productDialogMode.value = "create";
    resetProductForm();
    void loadProductDrafts();
    showProductDialog.value = true;
};

const openDesktopProductDrafts = async () => {
    openProductDialog();
    await openProductDrafts();
};

const openEditProductDialog = (product: ProductItem) => {
    invalidateProductImageValidation();
    productDialogMode.value = "edit";
    editingProductBackendId.value = product.backendId;
    initialProductAveragePrice.value = Number(product.averagePrice || 0);
    Object.assign(newProductForm, {
        id: product.id,
        model: product.model,
        modelCode: product.modelCode,
        categoryId: product.categoryId,
        category: product.category,
        unitId: product.unitId,
        material: product.material,
        source: product.source,
        standardPrice: product.standardPrice,
        averagePrice: product.averagePrice,
        defaultWarehouseId: product.warehouseId,
        defaultLocationId: product.locationId,
        defaultWarehouse: product.defaultWarehouse,
        stockUpper: product.stockUpper,
        stockLower: product.stockLower,
        image: product.image,
        description: product.description,
        snPrefixesText: (product.snPrefixes || []).join("，"),
    });
    productImageName.value = getProductImageName(product.image);
    productImageFile.value = null;
    void loadProductDrafts();
    showProductDialog.value = true;
};

const closeProductDialog = () => {
    invalidateProductImageValidation();
    showProductDialog.value = false;
    showProductDrafts.value = false;
};

const setProductImageFiles = async (files: File[]) => {
    if (isSubmitting.value || !showProductDialog.value || files.length === 0) {
        return;
    }

    const validationId = ++productImageValidationId;
    isProductImageValidating.value = true;

    try {
        for (const file of files) {
            if (!file.type.startsWith("image/")) {
                ElMessage.warning("请上传图片文件");
                continue;
            }

            if (file.size > PRODUCT_IMAGE_MAX_SIZE_BYTES) {
                ElMessage.warning(`产品图片不能超过 ${PRODUCT_IMAGE_MAX_SIZE_MB}MB`);
                continue;
            }

            const validationError = await validateProductImageResolution(file);
            if (validationId !== productImageValidationId || !showProductDialog.value) {
                return;
            }
            if (validationError) {
                ElMessage.warning(validationError);
                continue;
            }

            productImageFile.value = file;
            productImageName.value = file.name;
        }
    } finally {
        if (validationId === productImageValidationId) {
            isProductImageValidating.value = false;
        }
    }
};

const handleProductImageChange = (event: Event) => {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = "";

    if (!file) {
        return;
    }

    void setProductImageFiles([file]);
};

const handleProductImageDragover = () => {
    if (isSubmitting.value) {
        return;
    }

    isProductImageDragover.value = true;
};

const handleProductImageDragleave = () => {
    isProductImageDragover.value = false;
};

const handleProductImageDrop = (event: DragEvent) => {
    if (isSubmitting.value) {
        return;
    }

    isProductImageDragover.value = false;
    const droppedFiles = Array.from(event.dataTransfer?.files || []);
    void setProductImageFiles(droppedFiles);
};

const removeProductImage = () => {
    invalidateProductImageValidation();
    productImageFile.value = null;
    productImageName.value = "";
    newProductForm.image = "";
};

const appendFormDataValue = (formData: FormData, key: string, value?: string | number | null) => {
    if (value === undefined || value === null || value === "") {
        return;
    }

    formData.append(key, String(value));
};

const toOptionalNumber = (value: string, fallback?: number) => {
    const normalized = value.trim();
    if (!normalized) {
        return fallback;
    }

    const num = Number(normalized);
    return Number.isFinite(num) ? num : fallback;
};

const hasProductAveragePriceChanged = () =>
    toOptionalNumber(newProductForm.averagePrice, 0) !== initialProductAveragePrice.value;

const normalizeProductDecimalField = (
    field: "stockUpper" | "stockLower",
) => {
    newProductForm[field] = formatOneDecimalText(newProductForm[field], "");
};

const normalizeStandardPriceField = () => {
    newProductForm.standardPrice = formatPriceText(newProductForm.standardPrice, "");
};

const normalizeProductDecimalFields = () => {
    normalizeStandardPriceField();
    normalizeProductDecimalField("stockUpper");
    normalizeProductDecimalField("stockLower");
};

const parseSnPrefixesText = (text: string): string[] => {
    return text
        .split(/[，,\s]+/)
        .map((item) => item.trim().toUpperCase().replace(/-/g, ""))
        .filter(Boolean);
};

const buildCreateProductFormData = (image = "") => {
    const formData = new FormData();

    appendFormDataValue(formData, "categoryId", newProductForm.categoryId);
    appendFormDataValue(formData, "unitId", newProductForm.unitId);
    appendFormDataValue(formData, "material", newProductForm.material.trim());
    appendFormDataValue(formData, "source", newProductForm.source);
    appendFormDataValue(formData, "averagePrice", newProductForm.averagePrice.trim());
    appendFormDataValue(formData, "model", newProductForm.model.trim());
    appendFormDataValue(formData, "modelCode", newProductForm.modelCode.trim().toUpperCase());
    appendFormDataValue(formData, "stockUpperLimit", newProductForm.stockUpper.trim());
    appendFormDataValue(formData, "stockLowerLimit", newProductForm.stockLower.trim());
    appendFormDataValue(formData, "warehouseId", newProductForm.defaultWarehouseId);
    appendFormDataValue(formData, "locationId", newProductForm.defaultLocationId);
    appendFormDataValue(formData, "introduction", newProductForm.description.trim());
    const snPrefixes = parseSnPrefixesText(newProductForm.snPrefixesText);
    if (snPrefixes.length) {
        formData.append("snPrefixes", JSON.stringify(snPrefixes));
    }
    if (image || productImageFile.value) {
        formData.append("image", image);
    }

    return formData;
};

const buildUpdateProductPayload = () => {
    const payload: InventoryProductMutationPayload & { id: string } = {
        id: editingProductBackendId.value,
        categoryId: newProductForm.categoryId || null,
        unitId: newProductForm.unitId || null,
        material: newProductForm.material.trim(),
        source: newProductForm.source,
        model: newProductForm.model.trim(),
        modelCode: newProductForm.modelCode.trim().toUpperCase(),
        stockUpperLimit: toOptionalNumber(newProductForm.stockUpper, 0),
        stockLowerLimit: toOptionalNumber(newProductForm.stockLower, 0),
        warehouseId: newProductForm.defaultWarehouseId || "",
        locationId: newProductForm.defaultLocationId || "",
        introduction: newProductForm.description.trim(),
        snPrefixes: parseSnPrefixesText(newProductForm.snPrefixesText),
    };

    if (hasProductAveragePriceChanged()) {
        payload.averagePrice = toOptionalNumber(newProductForm.averagePrice, 0);
    }

    return payload;
};

const buildUpdateProductFormData = (image = "") => {
    const formData = new FormData();

    appendFormDataValue(formData, "id", editingProductBackendId.value);
    formData.append("categoryId", newProductForm.categoryId || "");
    formData.append("unitId", newProductForm.unitId || "");
    formData.append("material", newProductForm.material.trim());
    appendFormDataValue(formData, "source", newProductForm.source);
    if (hasProductAveragePriceChanged()) {
        formData.append("averagePrice", String(toOptionalNumber(newProductForm.averagePrice, 0)));
    }
    formData.append("model", newProductForm.model.trim());
    formData.append("modelCode", newProductForm.modelCode.trim().toUpperCase());
    formData.append("stockUpperLimit", String(toOptionalNumber(newProductForm.stockUpper, 0)));
    formData.append("stockLowerLimit", String(toOptionalNumber(newProductForm.stockLower, 0)));
    formData.append("warehouseId", newProductForm.defaultWarehouseId || "");
    formData.append("locationId", newProductForm.defaultLocationId || "");
    formData.append("introduction", newProductForm.description.trim());
    const snPrefixes = parseSnPrefixesText(newProductForm.snPrefixesText);
    formData.append("snPrefixes", JSON.stringify(snPrefixes));
    formData.append("image", image);

    return formData;
};

const confirmProductDialog = async () => {
    if (isSubmitting.value || isProductImageValidating.value || !showProductDialog.value) {
        return;
    }

    if (!newProductForm.model.trim()) {
        ElMessage.warning("请输入型号");
        return;
    }
    if (!newProductForm.categoryId) {
        ElMessage.warning("请选择分类");
        return;
    }
    if (!newProductForm.unitId) {
        ElMessage.warning("请选择单位");
        return;
    }
    if (productDialogMode.value === "create" && !productImageFile.value) {
        ElMessage.warning("新增产品必须上传产品图片");
        return;
    }

    normalizeProductDecimalFields();

    isSubmitting.value = true;
    try {
        const imageFile = productImageFile.value;
        const validationId = productImageValidationId;
        if (imageFile) {
            const validationError = await validateProductImageResolution(imageFile);
            if (validationId !== productImageValidationId || !showProductDialog.value) {
                return;
            }
            if (validationError) {
                ElMessage.warning(validationError);
                return;
            }
        }

        const imageResult = await resolveProductImageUpload(imageFile, uploadImage);
        if (imageResult.failed) {
            ElMessage.warning("产品图片上传失败，已继续保存产品，可后续编辑补传图片");
        }

        const image = imageFile ? imageResult.image : newProductForm.image;
        const res = productDialogMode.value === "create"
            ? await addInventoryProduct(buildCreateProductFormData(image))
            : await updateInventoryProduct(
                imageFile ? buildUpdateProductFormData(image) : buildUpdateProductPayload(),
            );

        if (res.code !== 200) {
            ElMessage.error(res.msg || `${productDialogTitle.value}失败`);
            return;
        }

        ElMessage.success(`${productDialogTitle.value}成功`);
        closeProductDialog();
        await loadProducts(productDialogMode.value === "create");
    } catch (err: any) {
        handleApiError(err, `${productDialogTitle.value}失败`);
    } finally {
        isSubmitting.value = false;
    }
};

const deleteProduct = async (product: ProductItem) => {
    if (!product.backendId || isSubmitting.value) {
        return;
    }

    try {
        await erpMessageBox.confirm(`是否确认删除产品 ${product.model || product.id}`, "删除产品", {
            type: "warning",
            confirmButtonText: "确认",
            cancelButtonText: "取消",
        });
    } catch {
        return;
    }

    isSubmitting.value = true;
    try {
        const res = await deleteInventoryProduct({ ids: [product.backendId] });

        if (res.code !== 200) {
            ElMessage.error(res.msg || "删除产品失败");
            return;
        }

        ElMessage.success("删除产品成功");
        selectedProductIds.value = selectedProductIds.value.filter((id) => id !== product.id);
        await loadProducts(false);
    } catch (err: any) {
        handleApiError(err, "删除产品失败");
    } finally {
        isSubmitting.value = false;
    }
};

const batchDeleteProducts = async () => {
    const selectedProducts = products.value.filter((product) =>
        selectedProductIds.value.includes(product.id) && product.backendId,
    );
    const ids = selectedProducts.map((product) => product.backendId);

    if (!ids.length || isSubmitting.value) {
        ElMessage.warning("请先选择需要删除的产品");
        return;
    }

    try {
        await erpMessageBox.confirm(`是否确认删除选中的 ${ids.length} 个产品？`, "批量删除产品", {
            type: "warning",
            confirmButtonText: "确认",
            cancelButtonText: "取消",
        });
    } catch {
        return;
    }

    isSubmitting.value = true;
    try {
        const res = await deleteInventoryProduct({ ids });

        if (res.code !== 200) {
            ElMessage.error(res.msg || "批量删除产品失败");
            return;
        }

        selectedProductIds.value = [];
        ElMessage.success("批量删除产品成功");
        await loadProducts(false);
    } catch (err: any) {
        handleApiError(err, "批量删除产品失败");
    } finally {
        isSubmitting.value = false;
    }
};

const openImportDialog = () => {
    if (isImporting.value) {
        return;
    }

    showImportDialog.value = true;
};

const closeImportDialog = () => {
    if (isImporting.value) {
        return;
    }

    showImportDialog.value = false;
    importFile.value = null;
};

const removeImportFile = () => {
    if (isImporting.value) {
        return;
    }

    importFile.value = null;
};

const setImportFile = (file: File) => {
    if (!file) {
        return;
    }

    if (!file.name.toLowerCase().endsWith(".xlsx")) {
        ElMessage.warning("请上传 Excel 文件（.xlsx）");
        return;
    }

    if (file.size > INVENTORY_IMPORT_MAX_FILE_SIZE_BYTES) {
        ElMessage.warning(INVENTORY_IMPORT_FILE_SIZE_MESSAGE);
        return;
    }

    importFile.value = file;
};

const handleImportFileChange = (event: Event) => {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];

    if (!file) {
        return;
    }

    setImportFile(file);
    input.value = "";
};

const handleImportDragover = () => {
    if (isImporting.value) {
        return;
    }

    isImportDragover.value = true;
};

const handleImportDragleave = () => {
    isImportDragover.value = false;
};

const handleImportDrop = (event: DragEvent) => {
    if (isImporting.value) {
        return;
    }

    isImportDragover.value = false;
    const droppedFiles = Array.from(event.dataTransfer?.files || []);
    droppedFiles.forEach(setImportFile);
};

const downloadProductImportTemplate = async () => {
    const XLSX = await import("xlsx");
    const headers = [
        "型号",
        "SN前缀参数",
        "分类",
        "单位",
        "材质",
        "来源",
        "库存上限",
        "库存下限",
        "仓库",
        "产品简介",
        "产品图片",
    ];
    const example = [
        "M-100",
        "SN100,SN200",
        "一级分类/二级分类",
        "个",
        "铝合金",
        INVENTORY_PRODUCT_SOURCE.PURCHASED,
        "100",
        "10",
        "默认仓库/A区/货架01/库位01",
        "示例产品简介",
        "",
    ];

    const ws = XLSX.utils.aoa_to_sheet([headers, example]);

    // 设置列宽
    ws["!cols"] = headers.map(() => ({ wch: 16 }));
    // 产品图片列宽一些
    ws["!cols"][headers.length - 1] = { wch: 20 };

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "产品导入模板");
    await downloadWorkbook(wb, "产品导入模板.xlsx");
};

const confirmImportProducts = async () => {
    if (!importFile.value || isImporting.value) {
        return;
    }

    try {
        await erpMessageBox.confirm("是否确认导入文件 " + importFile.value.name + "？", "导入产品", {
            type: "warning",
            confirmButtonText: "确认导入",
            cancelButtonText: "取消",
        });
    } catch {
        return;
    }

    const formData = new FormData();
    formData.append("file", importFile.value);

    isImporting.value = true;
    try {
        const res = await importInventoryProducts(formData);

        if (res.code !== 200) {
            ElMessage.error(res.msg || "导入产品失败");
            return;
        }

        const data = res.data;
        const successCount = Number(data?.successCount || 0);
        const failCount = Number(data?.failCount || 0);
        if (successCount > 0) {
            ElMessage.success(`导入完成：成功 ${successCount} 条${failCount ? `，失败 ${failCount} 条` : ""}`);
        } else {
            ElMessage.warning(`导入完成：成功 ${successCount} 条，失败 ${failCount} 条`);
        }

        if (failCount > 0 && Array.isArray(data?.errors) && data.errors.length > 0) {
            const detail = data.errors
                .slice(0, 20)
                .map((item: any) => escapeHtml(`第${item.row}行：${item.message || "导入失败"}`))
                .join("<br/>");
            await erpMessageBox.alert(detail, "导入失败明细", {
                confirmButtonText: "知道了",
                type: "warning",
                dangerouslyUseHTMLString: true,
            });
        }

        showImportDialog.value = false;
        importFile.value = null;
        await loadProducts();
    } catch (err: any) {
        handleApiError(err, "导入产品失败");
    } finally {
        isImporting.value = false;
    }
};

const exportProducts = async () => {
    if (isExporting.value) {
        return;
    }

    isExporting.value = true;
    try {
        const selectedProducts = products.value.filter((product) =>
            selectedProductIds.value.includes(product.id),
        );

        if (!selectedProducts.length) {
            ElMessage.warning("请先选择要导出的产品");
            return;
        }

        const headers = [
            "产品编号",
            "型号",
            "分类",
            "单位",
            "材质",
            "来源",
            ...(canViewStandardPrice.value ? ["标准价"] : []),
            "库存上限",
            "库存下限",
            "仓库",
            "商品简介",
            "条码",
            "修改人",
            "修改时间",
        ];
        const rows = selectedProducts.map((product) => [
            product.id,
            product.model,
            product.category,
            product.unit,
            product.material,
            product.source,
            ...(canViewStandardPrice.value ? [product.standardPrice] : []),
            product.stockUpper,
            product.stockLower,
            product.defaultWarehouse,
            product.description,
            product.barcode,
            product.updatedBy || "",
            product.updatedAt || "",
        ]);
        await downloadCsv(headers, rows, `产品导出_选中_${new Date().toISOString().slice(0, 10)}.csv`);
    } catch (err: any) {
        handleApiError(err, "导出产品失败");
    } finally {
        isExporting.value = false;
    }
};

const openProductDetail = (product: ProductItem) => {
    selectedDetailProduct.value = product;
};

const closeProductDetail = () => {
    selectedDetailProduct.value = null;
};

const handleSnPrintStateUpdated = (snPrintState: NonNullable<InventoryProduct["snPrintState"]>) => {
    if (!selectedDetailProduct.value) {
        return;
    }

    selectedDetailProduct.value = {
        ...selectedDetailProduct.value,
        snPrintState,
    };
    products.value = products.value.map((product) =>
        product.backendId === selectedDetailProduct.value?.backendId
            ? { ...product, snPrintState }
            : product,
    );
};

const createBomNodeFromProduct = (product: ProductItem, quantity?: number | null): BomTreeNode => ({
    productCode: product.id,
    model: product.model,
    material: product.material,
    image: product.image,
    quantity,
    unit: product.unit,
    children: [],
});

const openBomDialog = async (product: ProductItem) => {
    selectedBomProduct.value = product;
    selectedBomStructure.value = createBomNodeFromProduct(product, null);
    showBomDialog.value = true;

    if (!product.backendId || isLoadingBomStructure.value) {
        return;
    }

    isLoadingBomStructure.value = true;
    try {
        const res = await getInventoryBomStructure(product.backendId);

        if (res.code !== 200) {
            ElMessage.error(res.msg || "获取BOM结构失败");
            return;
        }

        selectedBomStructure.value = res.data?.structure
            ? normalizeBomTreeNode(res.data.structure)
            : createBomNodeFromProduct(product, null);
    } catch (err: any) {
        handleApiError(err, "获取BOM结构失败");
    } finally {
        isLoadingBomStructure.value = false;
    }
};

const closeBomDialog = () => {
    showBomDialog.value = false;
    selectedBomProduct.value = null;
    selectedBomStructure.value = null;
};

const getProductCellValue = (product: ProductItem, key: ProductColumn["key"]) => {
    if (key === "bom") {
        return "查看BOM结构";
    }

    return product[key] || "--";
};

const shouldShowProductDescriptionPopover = (product: ProductItem) => {
    const description = getProductCellValue(product, "description");

    return description !== "--" && description.length > 12;
};

const openColumnConfigDialog = () => {
    showColumnConfigDialog.value = true;
};

const closeColumnConfigDialog = () => {
    showColumnConfigDialog.value = false;
};

const confirmColumnConfig = () => {
    persistColumnConfigs();
    closeColumnConfigDialog();
};

const persistColumnWidths = () => {
    const widths = columnConfigs.reduce<Record<string, number>>((result, column) => {
        result[column.key] = column.width;
        return result;
    }, {});

    localStorage.setItem(PRODUCT_COLUMN_WIDTH_STORAGE_KEY, JSON.stringify(widths));
};

const applyStoredColumnWidths = () => {
    const rawWidths = localStorage.getItem(PRODUCT_COLUMN_WIDTH_STORAGE_KEY);
    if (!rawWidths) {
        return;
    }

    try {
        const widths = JSON.parse(rawWidths) as Record<string, number>;
        columnConfigs.forEach((column) => {
            const width = widths[column.key];
            if (Number.isFinite(width)) {
                column.width = Math.max(PRODUCT_COLUMN_MIN_WIDTH, Math.trunc(width));
            }
        });
    } catch {
        localStorage.removeItem(PRODUCT_COLUMN_WIDTH_STORAGE_KEY);
    }
};

const persistColumnConfigs = () => {
    const configs = columnConfigs.map((column) => ({
        key: column.key,
        visible: column.visible,
        locked: column.locked,
    }));
    localStorage.setItem(PRODUCT_COLUMN_CONFIG_STORAGE_KEY, JSON.stringify(configs));
};

const applyStoredColumnConfigs = () => {
    const rawConfigs = localStorage.getItem(PRODUCT_COLUMN_CONFIG_STORAGE_KEY);
    if (!rawConfigs) {
        return;
    }

    try {
        const configs = JSON.parse(rawConfigs) as Array<{ key: string; visible: boolean; locked: boolean }>;
        const configMap = new Map(configs.map((c) => [c.key, c]));

        // 恢复可见性和锁定状态
        columnConfigs.forEach((column) => {
            const stored = configMap.get(column.key);
            if (stored) {
                column.visible = stored.visible;
                column.locked = stored.locked;
            }
        });

        // 恢复排序
        const orderedKeys = configs.map((c) => c.key);
        columnConfigs.sort((a, b) => {
            const indexA = orderedKeys.indexOf(a.key);
            const indexB = orderedKeys.indexOf(b.key);
            // 未找到的排到最后
            const orderA = indexA >= 0 ? indexA : 999;
            const orderB = indexB >= 0 ? indexB : 999;
            return orderA - orderB;
        });
    } catch {
        localStorage.removeItem(PRODUCT_COLUMN_CONFIG_STORAGE_KEY);
    }
};

const toggleColumnResizeMode = () => {
    isColumnResizeMode.value = !isColumnResizeMode.value;
};

const resetColumnWidths = () => {
    columnConfigs.forEach((column) => {
        column.width = defaultColumnWidths[column.key];
    });
    persistColumnWidths();
};

const resizeColumn = (event: MouseEvent) => {
    if (!resizingColumnKey.value) {
        return;
    }

    const column = columnConfigs.find((config) => config.key === resizingColumnKey.value);
    if (!column) {
        return;
    }

    const nextWidth = columnResizeStartWidth.value + event.clientX - columnResizeStartX.value;
    column.width = Math.max(PRODUCT_COLUMN_MIN_WIDTH, Math.trunc(nextWidth));
};

const stopColumnResize = () => {
    if (!resizingColumnKey.value) {
        return;
    }

    resizingColumnKey.value = null;
    document.removeEventListener("mousemove", resizeColumn);
    document.removeEventListener("mouseup", stopColumnResize);
    persistColumnWidths();
};

const startColumnResize = (event: MouseEvent, columnKey: ProductColumn["key"]) => {
    const column = columnConfigs.find((config) => config.key === columnKey);
    if (!column) {
        return;
    }

    event.preventDefault();
    event.stopPropagation();
    resizingColumnKey.value = columnKey;
    columnResizeStartX.value = event.clientX;
    columnResizeStartWidth.value = column.width;
    document.addEventListener("mousemove", resizeColumn);
    document.addEventListener("mouseup", stopColumnResize);
};

const toggleColumnVisible = (columnKey: ProductColumn["key"]) => {
    const column = columnConfigs.find((config) => config.key === columnKey);

    if (column) {
        column.visible = !column.visible;
    }
};

const toggleAllColumnsVisible = () => {
    const nextVisible = !allColumnsVisible.value;
    configurableColumnConfigs.value.forEach((column) => {
        column.visible = nextVisible;
    });
};

const moveColumnConfig = (fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0) {
        return;
    }

    const movingColumn = columnConfigs[fromIndex];
    const targetColumn = columnConfigs[toIndex];

    if (movingColumn.locked !== targetColumn.locked) {
        return;
    }

    const [column] = columnConfigs.splice(fromIndex, 1);
    columnConfigs.splice(toIndex, 0, column);
};

const sortLockedColumnsFirst = () => {
    const locked = columnConfigs.filter((column) => column.locked);
    const unlocked = columnConfigs.filter((column) => !column.locked);
    columnConfigs.splice(0, columnConfigs.length, ...locked, ...unlocked);
};

const toggleColumnLocked = (columnKey: ProductColumn["key"]) => {
    const column = columnConfigs.find((config) => config.key === columnKey);

    if (!column) {
        return;
    }

    column.locked = !column.locked;
    sortLockedColumnsFirst();
};

const startColumnDrag = (columnKey: ProductColumn["key"]) => {
    draggingColumnKey.value = columnKey;
};

const dropColumn = (targetColumnKey: ProductColumn["key"]) => {
    if (!draggingColumnKey.value || draggingColumnKey.value === targetColumnKey) {
        return;
    }

    const fromIndex = columnConfigs.findIndex(
        (column) => column.key === draggingColumnKey.value,
    );
    const toIndex = columnConfigs.findIndex(
        (column) => column.key === targetColumnKey,
    );

    moveColumnConfig(fromIndex, toIndex);
    draggingColumnKey.value = null;
};

const closeDesktopMoreMenu = () => {
    if (desktopMoreMenu.value) {
        desktopMoreMenu.value.open = false;
    }
};

const handleDesktopMoreOutsideClick = (event: MouseEvent) => {
    if (event.target instanceof Node && !desktopMoreMenu.value?.contains(event.target)) {
        closeDesktopMoreMenu();
    }
};

const handleDesktopMoreAction = (action: "view" | "import" | "resize" | "reset" | "columns") => {
    closeDesktopMoreMenu();

    if (action === "view") {
        stopColumnResize();
        desktopCompactView.value = !desktopCompactView.value;
        isColumnResizeMode.value = false;
    } else if (action === "import") {
        openImportDialog();
    } else {
        desktopCompactView.value = false;
        if (action === "resize") {
            toggleColumnResizeMode();
        } else if (action === "reset") {
            resetColumnWidths();
        } else {
            openColumnConfigDialog();
        }
    }
};

onMounted(() => {
    document.addEventListener("click", handleCategoryOutsideClick);
    if (desktop) {
        document.addEventListener("click", handleDesktopMoreOutsideClick);
    }
    applyStoredColumnWidths();
    applyStoredColumnConfigs();
    loadProductOptions();
    loadProducts();
});

onBeforeUnmount(() => {
    invalidateProductImageValidation();
    document.removeEventListener("click", handleCategoryOutsideClick);
    document.removeEventListener("click", handleDesktopMoreOutsideClick);
    document.removeEventListener("mousemove", resizeColumn);
    document.removeEventListener("mouseup", stopColumnResize);
});

watch(pageSize, () => {
    loadProducts();
});
</script>

<style scoped>
.product-page {
    --product-selection-width: 58px;
    --product-action-width: var(--erp-table-col-action);
    --product-select-arrow: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23262626' stroke-width='2.4' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E");

    height: 100%;
    display: grid;
    grid-template-rows: 40px 56px 32px minmax(0, 1fr) 52px;
    gap: var(--erp-spacing-container-gap);
    color: var(--erp-color-text-primary);
}

button,
input,
select,
textarea {
    font: inherit;
}

.topbar,
.filter-row,
.toolbar,
.toolbar-right,
.toolbar-left,
.filter-actions {
    display: flex;
    align-items: center;
}

.topbar,
.toolbar {
    justify-content: space-between;
}

.filter-row {
    gap: var(--erp-spacing-40);
    padding: var(--erp-spacing-12);
    border-radius: var(--erp-radius-surface-default);
    background: var(--erp-color-fill-default);
}

.filter-field {
    display: flex;
    align-items: center;
    gap: var(--erp-spacing-12);
    color: var(--erp-color-text-primary);
    font-size: var(--erp-typography-content1-font-size);
    font-weight: var(--erp-typography-content1-font-weight);
    line-height: var(--erp-typography-content1-line-height);
}

.filter-field select {
    width: 200px;
    height: var(--erp-size-control-height-sm);
    padding: 0 32px 0 var(--erp-spacing-8);
    border: 1px solid var(--erp-color-border-default);
    border-radius: var(--erp-radius-control-default);
    outline: 0;
    color: var(--erp-color-text-primary);
    background: var(--erp-color-fill-default);
    font-size: var(--erp-typography-content1-font-size);
    font-weight: var(--erp-typography-content1-font-weight);
    line-height: var(--erp-typography-content1-line-height);
}

.product-form-row select {
    width: 100%;
    height: var(--erp-size-control-height-sm);
    padding: 0 32px 0 var(--erp-spacing-8);
    border: 1px solid var(--erp-color-border-default);
    border-radius: var(--erp-radius-control-default);
    outline: 0;
    color: var(--erp-color-text-primary);
    background: var(--erp-color-fill-default);
    font-size: var(--erp-typography-content1-font-size);
    font-weight: var(--erp-typography-content1-font-weight);
    line-height: var(--erp-typography-content1-line-height);
}

.product-form-row :deep(.searchable-select) {
    --searchable-select-height: var(--erp-size-control-height-sm);
    --searchable-select-border: var(--erp-color-border-default);
    --searchable-select-radius: var(--erp-radius-control-default);
    --searchable-select-font-size: var(--erp-typography-content1-font-size);
    --searchable-select-active-border: var(--erp-color-border-brand);
    --searchable-select-text: var(--erp-color-text-primary);

    width: 100%;
}

.product-form-row :deep(.searchable-select-input) {
    padding: 0 32px 0 var(--erp-spacing-8);
    font-weight: var(--erp-typography-content1-font-weight);
}

.filter-field select,
.product-form-row select {
    appearance: none;
    background-color: var(--erp-color-fill-default);
    background-image: var(--product-select-arrow);
    background-repeat: no-repeat;
    background-position: right var(--erp-spacing-12) center;
    background-size: 12px 12px;
}

.category-cascader {
    position: relative;
}

.filter-field .category-cascader,
.form-category-cascader {
    width: 200px;
}

.form-category-cascader {
    width: 100%;
}

.filter-field .category-trigger {
    width: 200px;
    height: var(--erp-size-control-height-sm);
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 var(--erp-spacing-8);
    border: 1px solid var(--erp-color-border-default);
    border-radius: var(--erp-radius-control-default);
    color: var(--erp-color-text-primary);
    background: var(--erp-color-fill-default);
    font-size: var(--erp-typography-content1-font-size);
    line-height: var(--erp-typography-content1-line-height);
    cursor: pointer;
}

.category-trigger::after {
    width: 12px;
    height: 12px;
    flex: 0 0 12px;
    content: "";
    background-image: var(--product-select-arrow);
    background-repeat: no-repeat;
    background-position: center;
    background-size: 12px 12px;
}

.form-category-cascader .category-trigger {
    width: 100%;
    height: var(--erp-size-control-height-sm);
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 var(--erp-spacing-8);
    border: 1px solid var(--erp-color-border-default);
    border-radius: var(--erp-radius-control-default);
    color: var(--erp-color-text-primary);
    background: var(--erp-color-fill-default);
    font-size: var(--erp-typography-content1-font-size);
    line-height: var(--erp-typography-content1-line-height);
    cursor: pointer;
}

.category-trigger :deep(svg) {
    display: none;
    width: 16px;
    height: 16px;
}

.category-menu {
    position: absolute;
    top: calc(100% + 8px);
    left: 0;
    z-index: 21;
    width: 376px;
    min-height: 124px;
    max-height: min(320px, calc(100dvh - 160px));
    display: none;
    grid-template-columns: 174px 1fr;
    overflow: hidden;
    border: 1px solid var(--erp-color-border-muted);
    border-radius: var(--erp-radius-surface-default);
    background: var(--erp-color-fill-default);
    box-shadow: var(--erp-shadow-surface);
}

.filter-field .category-menu,
.form-category-cascader .category-menu {
    width: 376px;
}

.filter-field .category-menu.single-column,
.form-category-cascader .category-menu.single-column {
    width: 176px;
    grid-template-columns: 174px;
}

.category-search-row {
    grid-column: 1 / -1;
    height: 38px;
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px 10px;
    border-bottom: 1px solid var(--erp-color-divider-subtle);
    color: var(--erp-color-text-placeholder);
    background: var(--erp-color-fill-default);
}

.category-search-row :deep(svg) {
    width: 15px;
    height: 15px;
    flex: 0 0 auto;
}

.category-search-row input {
    min-width: 0;
    flex: 1;
    border: 0;
    outline: 0;
    color: var(--erp-color-text-primary);
    background: transparent;
    font-size: var(--erp-typography-content1-font-size);
    line-height: var(--erp-typography-content1-line-height);
}

.category-search-row input::placeholder {
    color: var(--erp-color-text-placeholder);
}

.category-cascader.open .category-menu {
    display: grid;
}

.category-primary-list,
.category-secondary-list {
    min-height: 0;
    max-height: min(280px, calc(100dvh - 200px));
    padding: 4px 6px;
    overflow-y: auto;
    overscroll-behavior: contain;
    scrollbar-gutter: stable;
}

.category-primary-list::-webkit-scrollbar,
.category-secondary-list::-webkit-scrollbar {
    width: 6px;
}

.category-primary-list::-webkit-scrollbar-thumb,
.category-secondary-list::-webkit-scrollbar-thumb {
    border-radius: 999px;
    background: #c7d1dc;
}

.category-primary-list::-webkit-scrollbar-track,
.category-secondary-list::-webkit-scrollbar-track {
    background: transparent;
}

.category-primary-list {
    border-right: 1px solid var(--erp-color-divider-subtle);
}

.category-menu.single-column .category-primary-list {
    border-right-color: transparent;
}

.category-primary-option,
.category-secondary-option {
    width: 100%;
    height: var(--erp-size-control-height-sm);
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 10px;
    border: 0;
    border-radius: var(--erp-radius-control-default);
    color: var(--erp-color-text-primary);
    background: transparent;
    font-size: var(--erp-typography-content1-font-size);
    font-weight: var(--erp-typography-content1-font-weight);
    line-height: var(--erp-typography-content1-line-height);
    cursor: pointer;
}

.category-primary-option.active,
.category-primary-option:hover,
.category-secondary-option:hover {
    background: var(--erp-color-fill-hover);
}

.category-primary-option :deep(svg) {
    width: 18px;
    height: 18px;
}

.category-secondary-option {
    justify-content: flex-start;
}

.category-empty {
    grid-column: 1 / -1;
    min-height: 86px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--erp-color-text-tertiary);
    font-size: var(--erp-typography-content1-font-size);
    line-height: var(--erp-typography-content1-line-height);
}

.filter-actions {
    margin-left: auto;
    gap: var(--erp-spacing-12);
}

.toolbar-left {
    gap: var(--erp-spacing-12);
}

.toolbar-right {
    gap: var(--erp-spacing-12);
}

.primary-button {
    border: 0;
    border-radius: var(--erp-radius-control-default);
    background: var(--erp-color-action-primary);
    color: var(--erp-color-text-white);
    cursor: pointer;
}

.primary-button:not(:disabled):active {
    background: var(--erp-color-action-primary-pressed);
}

.primary-button,
.outline-button,
.muted-button,
.text-button {
    height: var(--erp-size-control-height-sm);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: var(--erp-spacing-4);
    padding: var(--erp-spacing-4) var(--erp-spacing-8);
    font-size: var(--erp-typography-title3-font-size);
    font-weight: var(--erp-typography-title3-font-weight);
    line-height: var(--erp-typography-title3-line-height);
    cursor: pointer;
}

.primary-button:disabled,
.outline-button:disabled,
.muted-button:disabled {
    border-color: var(--erp-color-border-muted);
    color: var(--erp-color-text-disabled);
    background: var(--erp-color-fill-disabled);
}

.text-button:disabled {
    color: var(--erp-color-text-disabled);
}

.outline-button {
    border: 1px solid var(--erp-color-border-default);
    border-radius: var(--erp-radius-control-default);
    color: var(--erp-color-text-secondary-strong);
    background: var(--erp-color-fill-default);
}

.danger-button {
    border-color: var(--erp-color-border-error);
    color: var(--erp-color-text-status-error);
}

.danger-button:not(:disabled):hover {
    background: var(--erp-color-bg-status-error);
}

.danger-button:disabled {
    border-color: color-mix(in srgb, var(--erp-color-border-error) 70%, transparent);
    color: color-mix(in srgb, var(--erp-color-text-status-error) 70%, transparent);
    background: var(--erp-color-fill-default);
}

button:disabled,
select:disabled,
input:disabled {
    cursor: not-allowed;
}

.muted-button {
    border: 0;
    border-radius: var(--erp-radius-control-default);
    color: var(--erp-color-text-disabled);
    background: var(--erp-color-fill-disabled);
}

.muted-button.active {
    color: var(--erp-color-text-white);
    background: var(--erp-color-action-primary);
}

.text-button {
    border: 0;
    color: var(--erp-color-text-primary);
    background: transparent;
}

.text-button.active {
    color: var(--erp-color-text-brand);
}

.button-icon {
    width: var(--erp-size-icon-default);
    height: var(--erp-size-icon-default);
}

.table-row {
    width: max-content;
    min-width: 100%;
    display: grid;
    align-items: center;
    padding-right: 8px;
}

.selection-head,
.selection-row {
    position: sticky;
    left: 0;
    z-index: 5;
}

.locked-table-cell {
    position: sticky;
    z-index: 4;
    height: 100%;
    background: inherit;
}

.action-head,
.action-row {
    position: sticky;
    right: 0;
    z-index: 5;
}

.table-head {
    background: var(--erp-color-fill-table-header);
    font-size: var(--erp-typography-title2-font-size);
    font-weight: var(--erp-typography-title2-font-weight);
    line-height: var(--erp-typography-title2-line-height);
}

.data-row {
    height: 80px;
    border-bottom: 1px solid var(--erp-color-divider-default);
    background: var(--erp-color-fill-default);
    font-size: var(--erp-typography-content1-font-size);
    font-weight: var(--erp-typography-content1-font-weight);
    line-height: var(--erp-typography-content1-line-height);
}

.data-row:hover {
    background: var(--erp-color-fill-hover);
}

.selection-head,
.selection-row,
.action-head,
.action-row {
    display: flex;
    align-items: center;
    justify-content: center;
}

.selection-head,
.action-head {
    height: 100%;
    background: var(--erp-color-fill-table-header);
    font-size: var(--erp-typography-title2-font-size);
    font-weight: var(--erp-typography-title2-font-weight);
    line-height: var(--erp-typography-title2-line-height);
}

.selection-row,
.action-row {
    height: 80px;
    background: inherit;
    font-size: var(--erp-typography-content1-font-size);
}

.table-cell {
    min-width: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0 var(--erp-spacing-20);
    white-space: nowrap;
}

.table-head-cell {
    position: relative;
    height: 100%;
    align-self: stretch;
}

.table-head-cell.locked-table-cell {
    position: sticky;
}

.column-resize-handle {
    position: absolute;
    top: 0;
    bottom: 0;
    right: -5px;
    z-index: 8;
    width: 10px;
    padding: 0;
    border: 0;
    border-radius: 4px;
    background: transparent;
    cursor: col-resize;
}

.column-resize-handle::after {
    content: "";
    position: absolute;
    top: 0;
    bottom: 0;
    right: 4px;
    width: 2px;
    border-radius: 2px;
    background: var(--erp-color-action-primary);
    opacity: 0.85;
}

.column-resize-handle:hover,
.column-resize-handle:focus-visible {
    background: color-mix(in srgb, var(--erp-color-fill-brand) 14%, transparent);
    outline: 0;
}

.checkbox-cell {
    padding: 0;
}

.checkbox-control {
    width: 100%;
    height: 100%;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
}

.checkbox-control:has(.row-checkbox:disabled) {
    cursor: not-allowed;
}

.icon-button {
    width: 24px;
    height: 24px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    border: 0;
    border-radius: var(--erp-radius-control-default);
    background: transparent;
    cursor: pointer;
}

.row-checkbox {
    width: 18px;
    height: 18px;
    margin: 0;
    accent-color: var(--erp-color-action-primary);
}

.image-cell img {
    width: 90px;
    height: 58px;
    object-fit: contain;
}

.clickable-image {
    cursor: pointer;
}

.bom-link {
    padding: 0;
    border: 0;
    color: var(--erp-color-text-brand);
    background: transparent;
    font-size: var(--erp-typography-content1-font-size);
    cursor: pointer;
}

.description-cell-text {
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    cursor: pointer;
}

:global(.product-description-popover .description-popover-content) {
    line-height: var(--erp-typography-content1-line-height);
    word-break: break-word;
    white-space: normal;
    color: var(--erp-color-text-primary);
    font-size: var(--erp-typography-content1-font-size);
}

:global(.product-description-popover) {
    color: var(--erp-color-text-primary);
    background: var(--erp-color-fill-default);
}

.actions-cell {
    gap: var(--erp-spacing-12);
}

.icon-button.blue {
    color: var(--erp-color-icon-brand);
}

.icon-button.delete {
    color: var(--erp-color-icon-error);
}

.icon-button:not(:disabled):hover {
    background: var(--erp-color-fill-hover);
}

.icon-button:disabled {
    color: var(--erp-color-icon-disabled);
}

.empty-row {
    width: max-content;
    min-width: 100%;
    height: 80px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-bottom: 1px solid var(--erp-color-divider-default);
    color: var(--erp-color-text-tertiary);
    background: var(--erp-color-fill-default);
    font-size: var(--erp-typography-content1-font-size);
    line-height: var(--erp-typography-content1-line-height);
}

.bom-structure-mask {
    z-index: 60;
}

.dialog-close {
    width: 24px;
    height: 24px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    border: 0;
    border-radius: var(--erp-radius-control-default);
    color: var(--erp-color-icon-default);
    background: transparent;
    cursor: pointer;
}

.dialog-close:hover {
    background: var(--erp-color-fill-hover);
}

.dialog-close :deep(svg) {
    width: 16px;
    height: 16px;
}

.import-dialog-body {
    min-height: 0;
    color: var(--erp-color-text-primary);
}

.import-section-title {
    margin: var(--erp-spacing-8) 0 var(--erp-spacing-12);
    padding-bottom: var(--erp-spacing-8);
    border-bottom: 1px solid var(--erp-color-divider-subtle);
    color: var(--erp-color-text-tertiary);
    font-size: var(--erp-typography-content1-font-size);
    line-height: var(--erp-typography-content1-line-height);
}

.import-upload-box {
    height: 118px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--erp-spacing-10);
    border: 1px dashed var(--erp-color-border-default);
    border-radius: var(--erp-radius-control-default);
    color: var(--erp-color-text-tertiary);
    font-size: var(--erp-typography-content1-font-size);
    line-height: var(--erp-typography-content1-line-height);
    cursor: pointer;
    transition: border-color 0.2s, background 0.2s;
}

.import-upload-box.disabled {
    cursor: not-allowed;
    color: var(--erp-color-text-disabled);
    background: var(--erp-color-fill-disabled);
}

.import-upload-box:hover,
.import-upload-box.is-dragover {
    border-color: var(--erp-color-border-brand);
    background: var(--erp-color-fill-hover);
}

.import-upload-box input {
    display: none;
}

.import-file-attachment {
    width: 100%;
    margin-bottom: 0;
}

.import-hint {
    margin: var(--erp-spacing-8) 0 0;
    color: var(--erp-color-text-tertiary);
    font-size: var(--erp-typography-note-font-size);
    line-height: var(--erp-typography-note-line-height);
}

.import-template-button {
    margin-top: var(--erp-spacing-10);
    padding: 0;
    border: 0;
    color: var(--erp-color-text-brand);
    background: transparent;
    font-size: var(--erp-typography-content2-font-size);
    line-height: var(--erp-typography-content2-line-height);
    cursor: pointer;
}

.import-template-button:hover {
    text-decoration: underline;
}

.import-hint-list {
    display: grid;
    gap: var(--erp-spacing-8);
    color: var(--erp-color-text-secondary-strong);
    font-size: var(--erp-typography-content2-font-size);
    line-height: var(--erp-typography-content2-line-height);
}

.import-hint-list p {
    margin: 0;
}

.import-hint-list strong {
    color: var(--erp-color-text-primary);
}

.import-hint-list .warning {
    padding: var(--erp-spacing-8) var(--erp-spacing-12);
    border-radius: var(--erp-radius-control-default);
    background: var(--erp-color-bg-status-producing);
}

.product-form-body {
    display: grid;
    gap: var(--erp-spacing-12);
}

.product-form-row {
    width: 384px;
    min-height: var(--erp-size-control-height-sm);
    display: grid;
    grid-template-columns: 92px minmax(0, 1fr);
    align-items: center;
    gap: var(--erp-spacing-12);
    margin: 0 auto;
    color: var(--erp-color-text-primary);
    font-size: var(--erp-typography-content1-font-size);
    font-weight: var(--erp-typography-content1-font-weight);
    line-height: var(--erp-typography-content1-line-height);
}

.product-form-row i {
    color: var(--erp-color-text-required);
    font-style: normal;
}

.product-form-row input,
.product-form-row textarea {
    width: 100%;
    box-sizing: border-box;
    border: 1px solid var(--erp-color-border-default);
    border-radius: var(--erp-radius-control-default);
    color: var(--erp-color-text-primary);
    background: var(--erp-color-fill-default);
    outline: 0;
    font-size: var(--erp-typography-content1-font-size);
    font-weight: var(--erp-typography-content1-font-weight);
    line-height: var(--erp-typography-content1-line-height);
}

.product-form-row input {
    height: var(--erp-size-control-height-sm);
    padding: 0 var(--erp-spacing-8);
}

.product-form-row input:focus,
.product-form-row textarea:focus {
    border-color: var(--erp-color-border-brand);
}

.product-form-row .readonly {
    border-color: var(--erp-color-border-muted);
    color: var(--erp-color-text-disabled);
    background: var(--erp-color-fill-disabled);
}

.image-row {
    min-height: 0;
    align-items: start;
}

.image-upload-field {
    width: 100%;
}

.uploaded-image-attachment {
    width: 100%;
    min-height: var(--erp-size-control-height-sm);
    box-sizing: border-box;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--erp-spacing-12);
    margin-bottom: var(--erp-spacing-8);
    padding: var(--erp-spacing-4) var(--erp-spacing-8);
    border: 1px solid var(--erp-color-border-muted);
    border-radius: var(--erp-radius-control-default);
    background: var(--erp-color-fill-control-secondary);
    font-size: var(--erp-typography-content1-font-size);
    line-height: var(--erp-typography-content1-line-height);
}

.uploaded-image-info {
    min-width: 0;
    display: flex;
    align-items: center;
    gap: var(--erp-spacing-4);
    color: var(--erp-color-text-primary);
}

.uploaded-image-info span {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.uploaded-image-icon {
    width: 16px;
    height: 16px;
    flex: 0 0 16px;
    color: var(--erp-color-icon-brand);
}

.uploaded-image-remove {
    flex: 0 0 auto;
    padding: 0;
    border: 0;
    color: var(--erp-color-text-status-error);
    background: transparent;
    font-size: var(--erp-typography-content1-font-size);
    cursor: pointer;
}

.upload-box {
    width: 100%;
    height: 140px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--erp-spacing-10);
    border: 1px dashed var(--erp-color-border-default);
    border-radius: var(--erp-radius-control-default);
    color: var(--erp-color-text-tertiary);
    font-size: var(--erp-typography-content1-font-size);
    line-height: var(--erp-typography-content1-line-height);
    cursor: pointer;
    transition: border-color 0.2s, background 0.2s;
}

.upload-box:hover,
.upload-box.is-dragover {
    border-color: var(--erp-color-border-brand);
    background: var(--erp-color-fill-hover);
}

.upload-box input {
    display: none;
}

.upload-icon {
    width: 20px;
    height: 20px;
    color: var(--erp-color-icon-brand);
}

.image-row p {
    margin: 8px 0 0;
    color: var(--erp-color-text-tertiary);
    font-size: var(--erp-typography-content1-font-size);
}

.textarea-row {
    min-height: 120px;
    align-items: start;
}

.sn-prefixes-row textarea {
    height: 54px;
}

.product-form-row textarea {
    height: 120px;
    padding: var(--erp-spacing-8);
    resize: none;
}

.bom-structure-dialog {
    width: 1240px;
    min-width: 600px;
    max-width: 1240px;
    min-height: 300px;
    max-height: 800px;
    display: grid;
    grid-template-rows: 52px minmax(0, 1fr);
    overflow: hidden;
    border: 1px solid var(--erp-color-border-muted);
    border-radius: var(--erp-radius-surface-dialog);
    background: var(--erp-color-fill-default);
}

.bom-structure-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--erp-spacing-12);
    border-bottom: 1px solid var(--erp-color-divider-subtle);
}

.bom-structure-header h2 {
    margin: 0;
    color: var(--erp-color-text-primary);
    font-size: var(--erp-typography-title1-font-size);
    font-weight: var(--erp-typography-title1-font-weight);
    line-height: var(--erp-typography-title1-line-height);
}

.bom-structure-body {
    min-height: 0;
    overflow: hidden;
    padding: var(--erp-spacing-20);
}

.product-page--desktop {
    --erp-color-action-primary: #2788ee;
    --erp-color-action-primary-pressed: #1876d8;
    --erp-color-fill-table-header: #f3f6fb;
    --erp-color-divider-default: #e8eef7;
    --erp-color-text-primary: #16345a;
    --erp-color-text-brand: #2788ee;
    --erp-color-icon-brand: #2788ee;
    --erp-color-border-brand: #2788ee;
    --product-selection-width: 36px;

    min-width: 0;
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 12px;
    border: 1px solid #dfe8f4;
    border-radius: 9px;
    background: #fff;
    font-size: 12px;
    box-shadow: 0 2px 4px rgb(38 69 107 / 2%);
}

.product-page--desktop > .toolbar {
    order: 1;
    min-height: 64px;
    flex: 0 0 auto;
    gap: 16px;
    padding: 12px 0;
    flex-wrap: wrap;
}

.product-page--desktop > .filter-row {
    order: 2;
    flex: 0 0 auto;
    flex-wrap: wrap;
    gap: 12px 24px;
    padding: 12px;
    border: 1px solid #e4ebf5;
    background: #f7f9fc;
}

.product-page--desktop > .erp-table-frame {
    order: 3;
    flex: 1 1 0;
    min-height: 0;
    padding: 0;
    border-radius: 0;
    box-shadow: none;
}

.product-page--desktop > :deep(.inventory-pagination) {
    order: 4;
    flex: 0 0 auto;
}

.product-page--desktop .desktop-toolbar-left,
.product-page--desktop .desktop-toolbar-right {
    flex-wrap: wrap;
    gap: 10px;
}

.product-page--desktop .desktop-toolbar-right {
    margin-left: auto;
    gap: 6px;
}

.product-page--desktop .toolbar .primary-button,
.product-page--desktop .toolbar .outline-button,
.desktop-more-menu summary {
    height: 34px;
    padding: 0 12px;
    border-radius: 5px;
    font-size: 13px;
    font-weight: 400;
    line-height: 20px;
    white-space: nowrap;
}

.product-page--desktop .toolbar .primary-button {
    font-weight: 600;
}

.product-page--desktop .toolbar .button-icon {
    width: 15px;
    height: 15px;
}

.product-page--desktop .toolbar .outline-button {
    color: #16345a;
    border-color: #c5cedb;
}

.product-page--desktop .toolbar .outline-button:disabled {
    color: #a3afbf;
    border-color: #e1e6ee;
    background: #fff;
}

.product-page--desktop .toolbar .desktop-filter-active {
    color: #2788ee;
    border-color: #2788ee;
    background: #f2f7ff;
}

.desktop-product-search input {
    width: 230px;
    height: 34px;
    padding: 0 10px;
    border: 1px solid #c5cedb;
    border-radius: 5px;
    outline: 0;
    background: #fff;
    color: #16345a;
    font-size: 13px;
}

.desktop-product-search input::placeholder {
    color: #7a8eab;
}

.desktop-product-search input:focus {
    border-color: #2788ee;
}

.desktop-more-menu {
    position: relative;
    z-index: 30;
}

.desktop-more-menu summary {
    display: flex;
    align-items: center;
    gap: 4px;
    border: 1px solid #c5cedb;
    color: #16345a;
    list-style: none;
    cursor: pointer;
}

.desktop-more-menu summary::-webkit-details-marker {
    display: none;
}

.desktop-more-menu summary :deep(svg) {
    width: 14px;
    height: 14px;
}

.desktop-more-actions {
    position: absolute;
    top: calc(100% + 6px);
    left: 0;
    min-width: 152px;
    padding: 5px;
    border: 1px solid #dfe8f4;
    border-radius: 6px;
    background: #fff;
    box-shadow: 0 5px 16px rgb(38 69 107 / 12%);
}

.desktop-more-actions button {
    width: 100%;
    padding: 8px 10px;
    border: 0;
    border-radius: 4px;
    background: transparent;
    color: #16345a;
    text-align: left;
    white-space: nowrap;
    cursor: pointer;
}

.desktop-more-actions button:not(:disabled):hover {
    background: #edf5ff;
    color: #2788ee;
}

.desktop-more-actions button:disabled {
    color: #a3afbf;
}

.desktop-product-table .table-row {
    padding-right: 0;
}

.product-page--desktop > .erp-table-frame .table-head {
    height: 44px;
    color: #5e7da3;
    font-size: 12px;
    font-weight: 400;
    line-height: 20px;
}

.product-page--desktop > .erp-table-frame .data-row,
.product-page--desktop > .erp-table-frame .selection-row,
.product-page--desktop > .erp-table-frame .action-row {
    height: 76px;
    font-size: 12px;
    font-weight: 400;
    line-height: 20px;
}

.desktop-product-table .table-cell {
    justify-content: flex-start;
    padding: 0 10px;
}

.desktop-product-table .table-cell > span,
.desktop-product-table .table-cell > button {
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.desktop-product-table .desktop-stacked-cell {
    flex-direction: column;
    align-items: flex-start;
    justify-content: center;
    gap: 5px;
}

.desktop-secondary-text {
    color: #7a8eab;
}

.desktop-product-table .action-head {
    color: #5e7da3;
    font-size: 12px;
    font-weight: 400;
}

.desktop-product-table .actions-cell {
    gap: 8px;
}

.desktop-product-table .row-checkbox {
    width: 14px;
    height: 14px;
}

.desktop-text-action {
    padding: 0;
    border: 0;
    background: transparent;
    color: #2788ee;
    line-height: 20px;
    text-align: left;
    cursor: pointer;
}

.desktop-text-action:disabled {
    color: #a3afbf;
}

.desktop-text-action:not(:disabled):hover {
    color: #1876d8;
    text-decoration: underline;
}

.desktop-image-button,
.desktop-image-placeholder {
    width: 44px;
    height: 36px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    border: 1px solid #e0eafa;
    border-radius: 4px;
    background: #f5f8fd;
    color: #9bb4ce;
}

.desktop-image-button {
    cursor: zoom-in;
}

.desktop-image-button img {
    width: 100%;
    height: 100%;
    object-fit: contain;
}

.desktop-image-icon {
    width: 19px;
    height: 19px;
}

@media (max-width: 1200px) {
    .filter-row {
        gap: var(--erp-spacing-24);
    }

    .filter-field select,
    .filter-field .category-cascader,
    .filter-field .category-trigger {
        width: 150px;
    }
}
</style>
