<template>
    <div class="order-root" :class="{ 'approval-page': isApprovalPage }">
        <header class="page-header">
            <ErpBreadcrumb icon="lucide:clipboard-check" :items="orderBreadcrumbItems" />
            <ErpSearchBox
                v-model="filters.keyword"
                placeholder="搜索订单编号、客户或销售员"
                :disabled="isLoading"
                @search="handleSearch"
            />
        </header>

        <div class="filter-row">
            <label class="filter-field">
                <span>订单编号</span>
                <input v-model="filters.orderNo" type="text" placeholder="请输入" @keyup.enter="applyFilters" />
            </label>
            <label class="filter-field">
                <span>{{ isApprovalPage ? '审批状态' : '订单状态' }}</span>
                <select v-if="isApprovalPage" v-model="filters.approvalResult">
                    <option v-for="option in approvalResultOptions" :key="option.value" :value="option.value">
                        {{ option.label }}
                    </option>
                </select>
                <select v-else v-model="filters.status">
                    <option value="">请选择</option>
                    <option v-for="status in statusOptions" :key="status" :value="status">{{ status }}</option>
                </select>
            </label>
            <label class="filter-field">
                <span>订单类型</span>
                <select v-model="filters.orderType">
                    <option value="">请选择</option>
                    <option v-for="type in orderTypeOptions" :key="type" :value="type">{{ type }}</option>
                </select>
            </label>
            <div class="filter-actions">
                <button class="outline-button" type="button" @click="resetFilters">
                    <Icon name="lucide:refresh-cw" class="button-icon" />
                    <span>重置</span>
                </button>
                <button class="muted-button" :class="{ active: hasPendingFilters }" type="button" @click="applyFilters">
                    <Icon name="lucide:sliders-horizontal" class="button-icon" />
                    <span>筛选</span>
                </button>
            </div>
        </div>

        <div class="action-row">
            <template v-if="!isApprovalPage">
                <button class="secondary-action" :disabled="isImporting || !canImportOrders" @click="triggerImportOrders">
                    <Icon name="lucide:upload" class="button-icon" />
                    {{ isImporting ? '导入中...' : '导入' }}
                </button>
                <button class="secondary-action" :disabled="isExporting" @click="handleExportOrders">
                    <Icon name="lucide:download" class="button-icon" />
                    {{ isExporting ? '导出中...' : '导出' }}
                </button>
                <button class="secondary-action" @click="handleOpenPrintDialog">
                    <Icon name="lucide:printer" class="button-icon" />
                    打印<span v-if="selectedOrderCount > 0">({{ selectedOrderCount }})</span>
                </button>
                <button class="secondary-action draft-box-button" :disabled="draftLoading" @click="openDraftBox">
                    <Icon name="lucide:archive" class="button-icon" />
                    草稿箱<span v-if="draftPagination.total > 0">({{ draftPagination.total }})</span>
                </button>
                <button v-if="isSuperAdmin" class="secondary-action" :class="{ active: showDeletedOrders }" @click="toggleDeletedOrders">
                    <Icon name="lucide:archive-x" class="button-icon" />
                    {{ showDeletedOrders ? '返回订单' : '已删除订单' }}
                </button>
                <button
                    v-if="canShowBatchDelete"
                    class="secondary-action danger-button"
                    :disabled="deletableSelectedOrderCount === 0"
                    @click="handleBatchDeleteOrders"
                >
                    <Icon name="lucide:trash-2" class="button-icon" />
                    批量删除<span v-if="deletableSelectedOrderCount > 0">({{ deletableSelectedOrderCount }})</span>
                </button>
                <button
                    v-if="showDeletedOrders && isSuperAdmin && selectedOrders.length"
                    class="secondary-action danger-button"
                    @click="handleBatchPurgeOrders"
                >
                    <Icon name="lucide:trash-2" class="button-icon" />
                    批量彻底删除({{ selectedOrders.length }})
                </button>
            </template>
            <button class="secondary-action column-button" type="button" @click="openColumnConfigDialog">
                <Icon name="lucide:columns-3" class="button-icon" />
                配置列
            </button>
            <input
                ref="importInputRef"
                class="hidden-file-input"
                type="file"
                accept=".xlsx,.xls,.csv"
                @change="handleImportOrders"
            />
        </div>

        <ErpTableFrame
            class="order-table-frame"
            :columns="orderTableColumnTemplate"
            :minimum-width="orderTableMinimumWidth"
            :loading="isLoading"
            :empty="orders.length === 0"
            :empty-text="emptyText"
            scroll-x
        >
            <template #header>
                <div
                    class="table-row table-head"
                >
                    <div class="table-cell checkbox-cell selection-cell">
                        <input
                            class="row-checkbox"
                            type="checkbox"
                            :checked="isAllCurrentPageSelected"
                            :disabled="orders.length === 0"
                            @change="toggleCurrentPageSelection"
                        />
                    </div>
                    <div
                        v-for="(column, index) in lockedColumns"
                        :key="`locked-head-${column.key}`"
                        class="table-cell table-head-cell locked-table-cell"
                        :class="{
                            'locked-table-cell-last': index === lockedColumns.length - 1,
                            'erp-table-fixed-start': index === lockedColumns.length - 1,
                        }"
                        :style="{ left: getLockedColumnLeft(index) }"
                    >
                        {{ column.label }}
                    </div>
                    <div
                        v-for="column in scrollColumns"
                        :key="`head-${column.key}`"
                        class="table-cell table-head-cell"
                    >
                        {{ column.label }}
                    </div>
                    <div class="table-cell erp-table-fixed-end action-head">操作</div>
                </div>
            </template>

            <div
                v-for="order in orders"
                :key="order._id || order.id"
                class="table-row data-row"
            >
                <div class="table-cell checkbox-cell selection-cell">
                    <input
                        class="row-checkbox"
                        type="checkbox"
                        :checked="isOrderSelected(order)"
                        @change="toggleOrderSelection(order, $event)"
                    />
                </div>
                <div
                    v-for="(column, index) in lockedColumns"
                    :key="`locked-${getOrderKey(order)}-${column.key}`"
                    class="table-cell locked-table-cell"
                    :class="[
                        `column-${column.key}`,
                        {
                            'locked-table-cell-last': index === lockedColumns.length - 1,
                            'erp-table-fixed-start': index === lockedColumns.length - 1,
                        },
                    ]"
                    :style="{ left: getLockedColumnLeft(index) }"
                >
                    <template v-if="column.key === 'orderNo'">
                        <span
                            class="mono"
                            :class="{ 'order-no-copyable': !isApprovalPage }"
                            :title="isApprovalPage ? undefined : '双击复制订单编号'"
                            @dblclick.stop="!isApprovalPage && copyCellText(order.orderNo)"
                        >{{ order.orderNo || '--' }}</span>
                    </template>
                    <template v-else-if="column.key === 'status'">
                        <span class="status-pill" :class="statusClass(getOrderDisplayStatus(order))">
                            {{ getOrderDisplayStatus(order) }}
                        </span>
                    </template>
                    <template v-else-if="column.key === 'orderImages'">
                        <div class="order-image-cell">
                            <button
                                v-if="getOrderThumbnailUrl(order)"
                                class="order-thumbnail"
                                type="button"
                                title="查看订单图片"
                                @click="openOrderImage(order)"
                            >
                                <img :src="getOrderThumbnailUrl(order)" :alt="`${order.orderNo || '订单'}图片`" />
                                <span v-if="getOrderImageCount(order) > 1" class="order-thumbnail-count">
                                    {{ getOrderImageCount(order) }}
                                </span>
                            </button>
                            <span v-else class="order-thumbnail-placeholder">无图</span>
                        </div>
                    </template>
                    <template v-else-if="column.key === 'amount'">
                        <span class="amount">{{ formatAmount(order.amount) }}</span>
                    </template>
                    <template v-else-if="column.key === 'orderDate'">
                        {{ formatDate(order.orderDate) }}
                    </template>
                    <template v-else-if="column.key === 'duration'">
                        {{ formatDuration(order) }}
                    </template>
                    <template v-else-if="column.key === 'sampleRequirement'">
                        <span class="long-cell" :title="order.sampleRequirement || ''">
                            {{ order.sampleRequirement || '--' }}
                        </span>
                    </template>
                    <template v-else-if="column.key === 'installationRequirement'">
                        <span class="long-cell" :title="order.installationRequirement || ''">
                            {{ order.installationRequirement || '--' }}
                        </span>
                    </template>
                    <template v-else-if="column.key === 'testingRequirement'">
                        <span class="long-cell" :title="order.testingRequirement || ''">
                            {{ order.testingRequirement || '--' }}
                        </span>
                    </template>
                    <template v-else-if="column.key === 'orderRemark'">
                        <span class="long-cell" :title="order.orderRemark || order.remark || ''">
                            {{ order.orderRemark || order.remark || '--' }}
                        </span>
                    </template>
                    <template v-else-if="column.key === 'paymentProgress'">
                        <div class="progress-cell">
                            <div v-if="hasReceivableOrder(order)" class="payment-progress">
                                <div class="progress-bar">
                                    <span :style="{ width: `${getPaymentProgressPercent(order)}%` }"></span>
                                </div>
                                <button class="progress-text progress-link" type="button" :disabled="!canCreateReceipt(order)" @click="openReceiptDialog(order)">
                                    ({{ formatAmount(getReceivedAmount(order)) }}/{{ formatAmount(getReceivableAmount(order)) }})
                                </button>
                            </div>
                            <span v-else>--</span>
                        </div>
                    </template>
                    <template v-else-if="column.key === 'receivableOrder'">
                        <button class="link-button" :disabled="!hasReceivableOrder(order)">
                            {{ hasReceivableOrder(order) ? '有' : '无' }}
                        </button>
                    </template>
                    <template v-else-if="column.key === 'auditProgress'">
                        <span class="audit-progress" :title="auditProgressTitle(order)">
                            {{ auditProgressText(order) }}
                        </span>
                    </template>
                    <template v-else-if="column.key === 'creator'">
                        {{ order.creator || order.createdBy || '--' }}
                    </template>
                    <template v-else-if="column.key === 'salespersonName'">
                        {{ order.salespersonName || '--' }}
                    </template>
                    <template v-else-if="column.key === 'orderType'">
                        {{ order.orderType || '--' }}
                    </template>
                </div>
                <div
                    v-for="column in scrollColumns"
                    :key="`${getOrderKey(order)}-${column.key}`"
                    class="table-cell"
                    :class="`column-${column.key}`"
                >
                    <template v-if="column.key === 'orderNo'">
                        <span
                            class="mono"
                            :class="{ 'order-no-copyable': !isApprovalPage }"
                            :title="isApprovalPage ? undefined : '双击复制订单编号'"
                            @dblclick.stop="!isApprovalPage && copyCellText(order.orderNo)"
                        >{{ order.orderNo || '--' }}</span>
                    </template>
                    <template v-else-if="column.key === 'status'">
                        <span class="status-pill" :class="statusClass(getOrderDisplayStatus(order))">
                            {{ getOrderDisplayStatus(order) }}
                        </span>
                    </template>
                    <template v-else-if="column.key === 'orderImages'">
                        <div class="order-image-cell">
                            <button
                                v-if="getOrderThumbnailUrl(order)"
                                class="order-thumbnail"
                                type="button"
                                title="查看订单图片"
                                @click="openOrderImage(order)"
                            >
                                <img :src="getOrderThumbnailUrl(order)" :alt="`${order.orderNo || '订单'}图片`" />
                                <span v-if="getOrderImageCount(order) > 1" class="order-thumbnail-count">
                                    {{ getOrderImageCount(order) }}
                                </span>
                            </button>
                            <span v-else class="order-thumbnail-placeholder">无图</span>
                        </div>
                    </template>
                    <template v-else-if="column.key === 'amount'">
                        <span class="amount">{{ formatAmount(order.amount) }}</span>
                    </template>
                    <template v-else-if="column.key === 'orderDate'">
                        {{ formatDate(order.orderDate) }}
                    </template>
                    <template v-else-if="column.key === 'duration'">
                        {{ formatDuration(order) }}
                    </template>
                    <template v-else-if="column.key === 'sampleRequirement'">
                        <span class="long-cell" :title="order.sampleRequirement || ''">
                            {{ order.sampleRequirement || '--' }}
                        </span>
                    </template>
                    <template v-else-if="column.key === 'installationRequirement'">
                        <span class="long-cell" :title="order.installationRequirement || ''">
                            {{ order.installationRequirement || '--' }}
                        </span>
                    </template>
                    <template v-else-if="column.key === 'testingRequirement'">
                        <span class="long-cell" :title="order.testingRequirement || ''">
                            {{ order.testingRequirement || '--' }}
                        </span>
                    </template>
                    <template v-else-if="column.key === 'orderRemark'">
                        <span class="long-cell" :title="order.orderRemark || order.remark || ''">
                            {{ order.orderRemark || order.remark || '--' }}
                        </span>
                    </template>
                    <template v-else-if="column.key === 'paymentProgress'">
                        <div class="progress-cell">
                            <div v-if="hasReceivableOrder(order)" class="payment-progress">
                                <div class="progress-bar">
                                    <span :style="{ width: `${getPaymentProgressPercent(order)}%` }"></span>
                                </div>
                                <button class="progress-text progress-link" type="button" :disabled="!canCreateReceipt(order)" @click="openReceiptDialog(order)">
                                    ({{ formatAmount(getReceivedAmount(order)) }}/{{ formatAmount(getReceivableAmount(order)) }})
                                </button>
                            </div>
                            <span v-else>--</span>
                        </div>
                    </template>
                    <template v-else-if="column.key === 'receivableOrder'">
                        <button class="link-button" :disabled="!hasReceivableOrder(order)">
                            {{ hasReceivableOrder(order) ? '有' : '无' }}
                        </button>
                    </template>
                    <template v-else-if="column.key === 'auditProgress'">
                        <span class="audit-progress" :title="auditProgressTitle(order)">
                            {{ auditProgressText(order) }}
                        </span>
                    </template>
                    <template v-else-if="column.key === 'creator'">
                        {{ order.creator || order.createdBy || '--' }}
                    </template>
                    <template v-else-if="column.key === 'salespersonName'">
                        {{ order.salespersonName || '--' }}
                    </template>
                    <template v-else-if="column.key === 'orderType'">
                        {{ order.orderType || '--' }}
                    </template>
                </div>
                <div class="table-cell action-cell erp-table-fixed-end action-cell-fixed">
                    <button
                        aria-label="查看"
                        data-icon-tooltip="查看"
                        @click="handleViewOrder(order)"
                    >
                        <Icon name="material-symbols:article-outline" />
                    </button>
                    <button
                        v-if="canShowEditOrder(order)"
                        class="edit-action"
                        :disabled="!canEditOrder(order)"
                        :aria-label="getOrderEditTitle(order)"
                        :data-icon-tooltip="getOrderEditTitle(order)"
                        :title="getOrderEditTitle(order)"
                        @click="handleEditOrder(order)"
                    >
                        <Icon name="material-symbols:edit-square-outline-rounded" />
                    </button>
                    <button
                        v-if="isApprovalPage"
                        :aria-label="canAuditOrder(order) ? '审核通过' : '审批详情'"
                        :data-icon-tooltip="canAuditOrder(order) ? '审核通过' : '审批详情'"
                        :class="{ disabled: !canOpenAuditDetail(order) }"
                        :disabled="!canOpenAuditDetail(order)"
                        @click="handleAuditOrder(order)"
                    >
                        <Icon name="material-symbols:fact-check-outline" />
                    </button>
                    <button
                        v-if="canRevokeOrderAudit(order)"
                        aria-label="撤销审核"
                        data-icon-tooltip="撤销审核"
                        :class="{ disabled: isRevokingOrder(order) }"
                        :disabled="isRevokingOrder(order)"
                        @click="handleRevokeOrderAudit(order)"
                    >
                        <Icon name="material-symbols:undo-rounded" />
                    </button>
                    <button
                        v-if="canRestoreOrder(order)"
                        aria-label="恢复"
                        data-icon-tooltip="恢复"
                        @click="handleRestoreOrder(order)"
                    >
                        <Icon name="material-symbols:restore-from-trash" />
                    </button>
                    <button
                        v-if="canPurgeOrder(order)"
                        aria-label="彻底删除"
                        data-icon-tooltip="彻底删除"
                        class="danger-action"
                        @click="handlePurgeOrder(order)"
                    >
                        <Icon name="material-symbols:delete-forever-outline" />
                    </button>
                    <button
                        v-if="canDeleteOrder(order)"
                        aria-label="删除"
                        data-icon-tooltip="删除"
                        class="danger-action"
                        @click="handleDeleteOrder(order)"
                    >
                        <Icon name="material-symbols:delete-outline" />
                    </button>
                </div>
            </div>
        </ErpTableFrame>

        <InventoryPagination
            v-model:page-size="pageSize"
            v-model:jump-page-input="jumpPageInput"
            :total="totalItems"
            :page-size-options="pageSizeOptions"
            :page-numbers="pageNumbers"
            :total-pages="totalPages"
            :current-page="currentPage"
            @page-change="handlePageChange"
            @jump="handleJumpPage"
        />

        <AddOrderDialog
            v-model="showEditDialog"
            mode="edit"
            :customer="editingCustomer"
            :order="editingOrder"
            @updated="handleOrderUpdated"
        />
        <AddOrderDialog
            v-model="showDraftEditDialog"
            mode="edit"
            :customer="draftEditingCustomer"
            :order="draftEditingOrder"
            @updated="handleDraftUpdated"
        />
        <AddOrderDialog
            v-model="showViewDialog"
            mode="view"
            :customer="viewingCustomer"
            :order="viewingOrder"
        />
        <ColumnConfigDialog
            v-if="showColumnConfigDialog"
            :column-configs="columnConfigs"
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

        <div v-if="showPrintTemplateDialog" class="print-dialog-mask" @click.self="closePrintTemplateDialog">
            <div class="print-template-dialog">
                <div class="print-template-header">
                    <h3>请选择打印模板</h3>
                    <button @click="closePrintTemplateDialog">
                        <Icon name="material-symbols:close-rounded" />
                    </button>
                </div>
                <div class="print-template-body">
                    <label class="print-template-field">
                        <span>文档模板选择<strong>*</strong></span>
                        <select v-model="selectedPrintTemplate">
                            <option value="">请选择</option>
                            <option value="production-dispatch">生产派工与领料模板</option>
                            <option value="custom">自定义模板</option>
                        </select>
                    </label>
                    <p class="print-template-hint">已选择 {{ selectedOrderCount }} 个订单。</p>
                </div>
                <div class="print-template-footer">
                    <button class="print-cancel" @click="closePrintTemplateDialog">取消</button>
                    <button class="print-confirm" :disabled="!selectedPrintTemplate" @click="confirmPrintTemplate">确认</button>
                </div>
            </div>
        </div>

        <div v-if="showAuditDialog" class="erp-dialog-mask audit-dialog-mask" @click.self="closeAuditDialog">
            <div class="audit-dialog">
                <div class="audit-dialog-body">
                    <button class="audit-close" type="button" :disabled="isAuditing || isRejecting" @click="closeAuditDialog">
                        <Icon name="lucide:x" />
                    </button>
                    <section class="audit-section">
                        <h3>审批详情</h3>
                        <div class="audit-detail-grid">
                            <div class="audit-detail-item">
                                <span>订单编号</span>
                                <strong>{{ auditingOrder?.orderNo || '--' }}</strong>
                            </div>
                            <div class="audit-detail-item">
                                <span>客户名称</span>
                                <strong>{{ auditingOrder?.customerName || '--' }}</strong>
                            </div>
                            <div class="audit-detail-item">
                                <span>订单类型</span>
                                <strong>{{ auditingOrder?.orderType || '--' }}</strong>
                            </div>
                            <div class="audit-detail-item">
                                <span>订单总金额</span>
                                <strong>{{ formatAmount(auditingOrder?.amount) }}</strong>
                            </div>
                            <div class="audit-detail-item">
                                <span>派单日期</span>
                                <strong>{{ formatDate(auditingOrder?.orderDate) }}</strong>
                            </div>
                            <div class="audit-detail-item">
                                <span>当前状态</span>
                                <strong>{{ auditingOrder ? getOrderDisplayStatus(auditingOrder) : '--' }}</strong>
                            </div>
                            <div class="audit-detail-item">
                                <span>通过后状态</span>
                                <strong>{{ auditingOrder?.approvalTargetStatus || '--' }}</strong>
                            </div>
                            <div class="audit-detail-item audit-detail-wide">
                                <span>非标要求</span>
                                <strong>{{ auditingOrder?.sampleRequirement || '--' }}</strong>
                            </div>
                            <div class="audit-detail-item audit-detail-wide">
                                <span>安装要求</span>
                                <strong>{{ auditingOrder?.installationRequirement || '--' }}</strong>
                            </div>
                            <div class="audit-detail-item audit-detail-wide">
                                <span>测试要求</span>
                                <strong>{{ auditingOrder?.testingRequirement || '--' }}</strong>
                            </div>
                            <div class="audit-detail-item audit-detail-wide">
                                <span>订单备注</span>
                                <strong>{{ auditingOrder?.orderRemark || auditingOrder?.remark || '--' }}</strong>
                            </div>
                        </div>

                        <div class="audit-attachment-row">
                            <span class="audit-detail-label">附件</span>
                            <div class="audit-attachment-list">
                                <div v-if="auditAttachments.length === 0" class="audit-empty-attachments">暂无附件</div>
                                <div
                                    v-else
                                    v-for="(attachment, index) in auditAttachments"
                                    :key="`${getAttachmentName(attachment)}-${index}`"
                                    class="audit-attachment-card"
                                >
                                    <Icon :name="getAttachmentIcon(attachment)" class="attachment-type-icon" />
                                    <span :title="getAttachmentName(attachment)">{{ getAttachmentName(attachment) }}</span>
                                    <button title="查看" @click="openAttachment(attachment)">
                                        <Icon name="material-symbols:visibility-outline-rounded" />
                                    </button>
                                    <button title="下载" @click="downloadAttachment(attachment)">
                                        <Icon name="material-symbols:download-rounded" />
                                    </button>
                                </div>
                            </div>
                        </div>
                    </section>

                    <section class="audit-section">
                        <h3>审批记录</h3>
                        <div class="audit-record-table">
                            <div class="audit-record-header audit-record-grid">
                                <div>节点名称</div>
                                <div>审批人</div>
                                <div>审批结果</div>
                            </div>
                            <div
                                v-for="(row, index) in auditRecordRows"
                                :key="`${row.nodeName}-${index}`"
                                class="audit-record-row audit-record-grid"
                            >
                                <div>{{ row.nodeName }}</div>
                                <div class="audit-approver">
                                    <span class="audit-avatar">{{ row.avatarText }}</span>
                                    <span>{{ row.approver }}</span>
                                </div>
                                <div class="audit-result-content">
                                    <span class="audit-result-pill" :class="row.resultClass">{{ row.result }}</span>
                                    <small v-if="row.resultDetail">{{ row.resultDetail }}</small>
                                </div>
                            </div>
                        </div>
                    </section>

                    <section v-if="auditHistorySections.length > 0" class="audit-section">
                        <h3>历史审批记录</h3>
                        <div
                            v-for="round in auditHistorySections"
                            :key="round.roundNo"
                            class="audit-history-round"
                        >
                            <div class="audit-history-round-title">第 {{ round.roundNo }} 轮</div>
                            <div class="audit-record-table">
                                <div class="audit-record-header audit-record-grid">
                                    <div>节点名称</div>
                                    <div>审批人</div>
                                    <div>审批结果</div>
                                </div>
                                <div
                                    v-for="(row, index) in round.rows"
                                    :key="`${round.roundNo}-${row.nodeName}-${index}`"
                                    class="audit-record-row audit-record-grid"
                                >
                                    <div>{{ row.nodeName }}</div>
                                    <div class="audit-approver">
                                        <span class="audit-avatar">{{ row.avatarText }}</span>
                                        <span>{{ row.approver }}</span>
                                    </div>
                                    <div class="audit-result-content">
                                        <span class="audit-result-pill" :class="row.resultClass">{{ row.result }}</span>
                                        <small v-if="row.resultDetail">{{ row.resultDetail }}</small>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </section>
                </div>

                <div class="audit-dialog-footer">
                    <template v-if="auditingOrder && canAuditOrder(auditingOrder)">
                        <button class="audit-reject" :disabled="isAuditing || isRejecting" @click="openRejectDialog">
                            驳回
                        </button>
                        <button class="audit-agree" :disabled="isAuditing || isRejecting" @click="submitAuditOrder">
                            {{ isAuditing ? '提交中...' : '同意' }}
                        </button>
                    </template>
                    <button v-else class="audit-readonly" disabled>
                        <Icon name="lucide:eye" />
                        {{ auditReadOnlyButtonText }}
                    </button>
                </div>
            </div>
        </div>

        <div v-if="showRejectDialog" class="erp-dialog-mask" @click.self="closeRejectDialog">
            <ErpDialogFrame
                class="order-reject-dialog"
                title="驳回订单"
                width="600px"
                height="440px"
                :close-disabled="isRejecting"
                @close="closeRejectDialog"
                @submit.prevent="submitRejectOrder"
            >
                <label class="reject-reason-field">
                    <span class="field-label required">驳回原因</span>
                    <textarea
                        v-model.trim="rejectReason"
                        placeholder="例如：折扣太低，重新报价"
                        maxlength="300"
                        :disabled="isRejecting"
                    />
                </label>
                <template #footer>
                    <button class="dialog-button cancel" type="button" :disabled="isRejecting" @click="closeRejectDialog">取消</button>
                    <button class="dialog-button danger" type="submit" :disabled="isRejecting">
                        {{ isRejecting ? '提交中...' : '确认驳回' }}
                    </button>
                </template>
            </ErpDialogFrame>
        </div>

        <div v-if="showReceiptDialog" class="receipt-dialog-mask" @click.self="closeReceiptDialog">
            <form class="receipt-dialog" @submit.prevent="submitReceipt">
                <div class="receipt-header">
                    <h3>新建回款单</h3>
                    <button type="button" :disabled="receiptSubmitting" @click="closeReceiptDialog">
                        <Icon name="material-symbols:close-rounded" />
                    </button>
                </div>

                <div class="receipt-body">
                    <label class="receipt-field">
                        <span>回款单号</span>
                        <input :value="receiptNoPreview" type="text" disabled />
                    </label>
                    <label class="receipt-field">
                        <span>回款金额<strong>*</strong></span>
                        <input v-model.number="receiptForm.amount" type="number" min="0" step="0.01" />
                    </label>
                    <label class="receipt-field">
                        <span>回款日期<strong>*</strong></span>
                        <input v-model="receiptForm.paymentDate" type="date" />
                    </label>
                    <label class="receipt-field receipt-field-compact">
                        <span>币种<strong>*</strong></span>
                        <SearchableSelect
                            v-model="receiptForm.currency"
                            :options="receiptCurrencyOptions"
                            :disabled="receiptCurrencyLoading"
                            :placeholder="receiptCurrencyLoading ? '币种加载中' : '请选择'"
                            aria-label="币种"
                        />
                    </label>
                    <label class="receipt-field receipt-textarea-field">
                        <span>备注</span>
                        <textarea v-model="receiptForm.remark"></textarea>
                    </label>
                    <label class="receipt-field receipt-upload-field">
                        <span>附件</span>
                        <FileUploader v-model="receiptForm.attachments" :multiple="true" :max-size="10" accept="*" />
                        <small>单个文件不超过10MB</small>
                    </label>
                </div>

                <div class="receipt-footer">
                    <button class="receipt-cancel" type="button" :disabled="receiptSubmitting" @click="closeReceiptDialog">
                        取消
                    </button>
                    <button class="receipt-confirm" type="submit" :disabled="receiptSubmitting">
                        {{ receiptSubmitting ? '提交中...' : '确认' }}
                    </button>
                </div>
            </form>
        </div>

        <div v-if="showDraftBox" class="draft-dialog-mask" @click.self="closeDraftBox">
            <section class="draft-dialog">
                <header class="draft-header">
                    <h3>草稿箱</h3>
                    <button type="button" @click="closeDraftBox">
                        <Icon name="material-symbols:close-rounded" />
                    </button>
                </header>
                <div class="draft-body">
                    <div v-if="draftLoading" class="draft-empty">加载中...</div>
                    <div v-else-if="draftOrders.length === 0" class="draft-empty">暂无草稿</div>
                    <div v-else class="draft-list">
                        <article v-for="draft in draftOrders" :key="draft._id || draft.id" class="draft-card">
                            <div class="draft-thumb">
                                <img v-if="getOrderThumbnailUrl(draft)" :src="getOrderThumbnailUrl(draft)" alt="" />
                                <span v-else>无图</span>
                            </div>
                            <div class="draft-info">
                                <strong>{{ draft.orderNo || '未生成订单编号' }}</strong>
                                <span>{{ draft.orderType || '未选择订单类型' }} · {{ draft.customerName || '未选择客户' }}</span>
                                <span>保存时间：{{ formatDateTime(draft.updateTime || draft.createTime || draft.orderDate) }}</span>
                            </div>
                            <div class="draft-actions">
                                <button v-if="canShowEditOrder(draft)" type="button" :disabled="!canEditOrder(draft)" :title="getOrderEditTitle(draft)" :aria-label="getOrderEditTitle(draft)" @click="editDraftOrder(draft)">编辑</button>
                                <button v-if="canDeleteOrder(draft)" type="button" class="danger" @click="deleteDraftOrder(draft)">删除</button>
                            </div>
                        </article>
                    </div>
                </div>
                <footer class="draft-footer">
                    <span>共{{ draftPagination.total }}条</span>
                    <div class="draft-pager">
                        <button
                            type="button"
                            :disabled="draftPagination.page <= 1 || draftLoading"
                            @click="loadDraftOrders(draftPagination.page - 1)"
                        >
                            上一页
                        </button>
                        <button
                            type="button"
                            :disabled="draftPagination.page * draftPagination.limit >= draftPagination.total || draftLoading"
                            @click="loadDraftOrders(draftPagination.page + 1)"
                        >
                            下一页
                        </button>
                    </div>
                </footer>
            </section>
        </div>
    </div>
</template>

<script setup lang="ts">
import ErpBreadcrumb from "~/components/configuration/ErpBreadcrumb.vue";
import ErpDialogFrame from "~/components/configuration/ErpDialogFrame.vue";
import ErpSearchBox from "~/components/configuration/ErpSearchBox.vue";
import ErpTableFrame from "~/components/configuration/ErpTableFrame.vue";
import InventoryPagination from "~/components/configuration/inventory/basic-data/InventoryPagination.vue";
import { useInventoryPagination } from "~/composables/inventory/useInventoryPagination";
import { useApprovalCellCopy } from "~/composables/useApprovalCellCopy";
import { downloadAttachmentFile } from "~/utils/attachmentPreview";
import { erpMessageBox } from "~/utils/erpMessageBox";
import {
    getErpTableColumnWidth,
    getErpTableGridColumn,
    getErpTableMinimumWidth,
} from "~/utils/inventory/erpTableColumns";
import {
    addSalesOrderReceipt,
    auditSalesOrder,
    deleteSalesOrder,
    exportSalesOrders,
    importSalesOrders,
    rejectSalesOrder,
    retrieveSalesOrderList,
    revokeSalesOrderAudit,
} from '~/composables/api/useCustomerApi'
import { getInventoryBomStructure, retrieveInventoryCurrencies } from '~/composables/api/useInventoryApi'
import ColumnConfigDialog from '~/components/configuration/inventory/basic-data/ColumnConfigDialog.vue'
import AddOrderDialog from '~/components/configuration/sales/AddOrderDialog.vue'
import FileUploader from '~/components/configuration/sales/FileUploader.vue'
import ImagePreviewDialog from '~/components/configuration/inventory/ImagePreviewDialog.vue'
import type { PreviewImage } from '~/components/configuration/inventory/ImagePreviewDialog.vue'
import type { SalesOrderPaymentPlan } from '~~/shared/types/salesOrderPayment'
import { getSalesOrderDeliveryDate } from "~~/shared/utils/salesOrderDelivery";
import { getSalesOrderPaymentTotals } from "~~/shared/utils/salesOrderPayment";
import { isSalesOrderEditLocked, SALES_ORDER_REJECTION_LOCK_MESSAGE } from "~~/shared/utils/salesOrderRejection";

definePageMeta({
    layout: 'sales',
})

type SalesOrderAuditRecord = {
    adminId?: string
    username?: string
    nickname?: string
    role?: number
    auditOrder?: number
    isFinalAuditor?: boolean
    approved?: boolean
    approvedAt?: string
    rejected?: boolean
    rejectedById?: string
    rejectedByName?: string
    rejectedAt?: string
    rejectReason?: string
}

type SalesOrder = {
    _id?: string
    id?: string
    orderNo?: string
    customerId?: string
    customerName?: string
    customerCompany?: string
    customerRegion?: string
    salespersonName?: string
    salespersonId?: string
    status?: string
    rejectionCount?: number
    approvalTargetStatus?: string
    auditRecords?: SalesOrderAuditRecord[]
    auditHistory?: Array<{
        roundNo?: number
        records?: SalesOrderAuditRecord[]
    }>
    orderType?: string
    amount?: number
    orderImages?: any[]
    attachments?: any[]
    orderDate?: string
    durationDays?: number
    durationText?: string
    sampleRequirement?: string
    installationRequirement?: string
    testingRequirement?: string
    orderRemark?: string
    remark?: string
    paymentProgress?: number
    approvalProgress?: {
        completed: number
        total: number
    }
    receivableOrder?: string
    hasReceivable?: boolean
    currency?: string
    contractNo?: string
    invoiceStatus?: string
    products?: any[]
    receivableDate?: string
    incomeCategory?: string
    plannedPayments?: SalesOrderPaymentPlan[]
    plannedPaymentDate?: string
    plannedPaymentAmount?: number
    actualReceivableAmount?: number
    receivedAmount?: number
    baseReceivedAmount?: number
    receivableRemark?: string
    receivableAttachments?: any[]
    machineNo?: string
    creator?: string
    createdBy?: string
    rejectionReason?: string
    rejectedBy?: string
    rejectedAt?: string
    _isDeleted?: boolean
    deletedAt?: string
    deletedBy?: string
    createTime?: string
    updateTime?: string
}

type OrderColumnKey =
    | "orderNo"
    | "salespersonName"
    | "status"
    | "orderType"
    | "orderImages"
    | "amount"
    | "orderDate"
    | "duration"
    | "sampleRequirement"
    | "installationRequirement"
    | "testingRequirement"
    | "orderRemark"
    | "paymentProgress"
    | "receivableOrder"
    | "auditProgress"
    | "creator"

type OrderColumnConfig = {
    key: OrderColumnKey
    label: string
    width: number
    widthVar?: string
    grow?: boolean
    visible: boolean
    locked: boolean
}

const DEFAULT_ORDER_COLUMN_CONFIGS: OrderColumnConfig[] = [
    { key: "orderNo", label: "订单编号", width: 160, grow: true, visible: true, locked: false },
    { key: "salespersonName", label: "销售员", width: 120, visible: true, locked: false },
    { key: "status", label: "订单状态", width: 120, visible: true, locked: false },
    { key: "orderType", label: "订单类型", width: 120, visible: true, locked: false },
    { key: "orderImages", label: "图片", width: 110, visible: true, locked: false },
    { key: "amount", label: "订单总金额", width: 160, visible: true, locked: false },
    { key: "orderDate", label: "派单日期", width: 160, widthVar: "--erp-table-col-date", visible: true, locked: false },
    { key: "duration", label: "交期", width: 160, widthVar: "--erp-table-col-date", visible: true, locked: false },
    { key: "sampleRequirement", label: "非标要求", width: 180, grow: true, visible: false, locked: false },
    { key: "installationRequirement", label: "安装要求", width: 180, grow: true, visible: false, locked: false },
    { key: "testingRequirement", label: "测试要求", width: 180, grow: true, visible: false, locked: false },
    { key: "orderRemark", label: "订单备注", width: 180, widthVar: "--erp-table-col-remark", grow: true, visible: false, locked: false },
    { key: "paymentProgress", label: "回款进度", width: 160, visible: true, locked: false },
    { key: "receivableOrder", label: "对应应收单", width: 120, visible: true, locked: false },
    { key: "auditProgress", label: "审核进度", width: 120, visible: true, locked: false },
    { key: "creator", label: "创建人", width: 120, widthVar: "--erp-table-col-operator", visible: true, locked: false },
]

const userInfo = useState<any>('admin_info', () => ({}))
const salespersonId = useState<string | null>('salesperson_id', () => null)
const route = useRoute()
const { copyCellText } = useApprovalCellCopy();
const isSuperAdmin = computed(() => Number(userInfo.value?.role) === 0)
const showDeletedOrders = ref(false)
const isSalespersonUser = computed(() => Number(userInfo.value?.role) === 3)
const canAuditSalesOrder = computed(() => Boolean(userInfo.value?.canAuditSalesOrder))
const isApprovalPage = computed(() => route.path.startsWith('/configuration/approval/order'))
const orderBreadcrumbItems = computed(() => isApprovalPage.value
    ? [{ label: "审批管理" }, { label: "订单审批" }]
    : [{ label: "销售管理" }, { label: "订单记录" }])
type ApprovalResultFilter = 'pending' | 'rejected' | 'approved' | 'all'
const approvalResultOptions: Array<{ label: string; value: ApprovalResultFilter }> = [
    { label: '待审核', value: 'pending' },
    { label: '已驳回', value: 'rejected' },
    { label: '已通过', value: 'approved' },
    { label: '全部', value: 'all' },
]
const approvalResultLabel = computed(() =>
    approvalResultOptions.find((option) => option.value === filters.approvalResult)?.label || '审批',
)
const emptyText = computed(() =>
    isApprovalPage.value ? `暂无${approvalResultLabel.value}订单` : '暂无订单记录',
)
const canImportOrders = computed(() => isSuperAdmin.value || Number(userInfo.value?.role) === 3)
const statusOptions = ['待审核', '已驳回', '待仓库复核', '待采购', '待生产', '生产中', '待出库', '已出库']
const orderTypeOptions = ['机架', '机架动力套', '整机+配件', '电池', '其他']
const filters = reactive({
    keyword: '',
    orderNo: '',
    status: '',
    approvalResult: 'pending' as ApprovalResultFilter,
    orderType: '',
})
const appliedFilters = reactive({ ...filters })
const hasPendingFilters = computed(() =>
    Object.entries(filters).some(([key, value]) => value !== appliedFilters[key as keyof typeof appliedFilters]),
)
const orders = ref<SalesOrder[]>([])
const isLoading = ref(false)
const isImporting = ref(false)
const isExporting = ref(false)
const importInputRef = ref<HTMLInputElement | null>(null)
const router = useRouter()
const selectedOrderMap = ref<Record<string, SalesOrder>>({})
const showPrintTemplateDialog = ref(false)
const selectedPrintTemplate = ref("")
const showEditDialog = ref(false)
const editingOrder = ref<SalesOrder | null>(null)
const showDraftEditDialog = ref(false)
const draftEditingOrder = ref<SalesOrder | null>(null)
const showViewDialog = ref(false)
const viewingOrder = ref<SalesOrder | null>(null)
const showDraftBox = ref(false)
const showColumnConfigDialog = ref(false)
const showImagePreview = ref(false)
const previewImages = ref<PreviewImage[]>([])
const previewTitle = ref("")
const draftLoading = ref(false)
const draftOrders = ref<SalesOrder[]>([])
const showAuditDialog = ref(false)
const auditingOrder = ref<SalesOrder | null>(null)
const isAuditing = ref(false)
const showRejectDialog = ref(false)
const rejectReason = ref("")
const isRejecting = ref(false)
const revokingOrderId = ref("")
const showReceiptDialog = ref(false)
const receiptOrder = ref<SalesOrder | null>(null)
const receiptSubmitting = ref(false)
const receiptCurrencyLoading = ref(false)
const fallbackReceiptCurrencyOptions = [
    { label: '人民币 CNY', value: 'CNY' },
    { label: '美元 USD', value: 'USD' },
    { label: '欧元 EUR', value: 'EUR' },
]
const receiptCurrencyOptions = ref([...fallbackReceiptCurrencyOptions])
const columnConfigs = reactive<OrderColumnConfig[]>(DEFAULT_ORDER_COLUMN_CONFIGS.map((column) => ({ ...column })))
const ORDER_COLUMN_CONFIG_STORAGE_KEY = 'sales.order.columnConfigs'
const ORDER_APPROVAL_COLUMN_CONFIG_STORAGE_KEY = 'sales.order.approval.columnConfigs'
const draggingColumnKey = ref<OrderColumnKey | null>(null)
const receiptForm = reactive({
    amount: undefined as number | undefined,
    paymentDate: '',
    currency: 'CNY',
    remark: '',
    attachments: [] as any[],
})
const {
    pageSizeOptions,
    pageSize,
    pageNumbers,
    totalPages,
    currentPage,
    jumpPageInput,
    totalItems,
    setTotalItems,
    goToPage,
    jumpToInputPage,
} = useInventoryPagination({ pageSizeOptions: [10, 20, 50] })
const draftPagination = reactive({
    page: 1,
    limit: 10,
    total: 0,
})

const buildDateValue = (date = new Date()) => {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
}

const receiptNoPreview = computed(() => `SKD-${buildDateValue().replace(/-/g, '')}-01`)
const columnConfigStorageKey = computed(() =>
    isApprovalPage.value ? ORDER_APPROVAL_COLUMN_CONFIG_STORAGE_KEY : ORDER_COLUMN_CONFIG_STORAGE_KEY,
)
const displayedColumns = computed(() => columnConfigs.filter((column) => column.visible))
const lockedColumns = computed(() => displayedColumns.value.filter((column) => column.locked))
const scrollColumns = computed(() => displayedColumns.value.filter((column) => !column.locked))
const allColumnsVisible = computed(() => columnConfigs.every((column) => column.visible))
const orderTableColumnTemplate = computed(() => [
    "58px",
    ...lockedColumns.value.map(getErpTableGridColumn),
    ...scrollColumns.value.map(getErpTableGridColumn),
    "var(--erp-table-col-action, 150px)",
].join(' '))
const orderTableMinimumWidth = computed(() => getErpTableMinimumWidth(
    displayedColumns.value,
    ["58px"],
    ["var(--erp-table-col-action, 150px)"],
))
const getLockedColumnLeft = (columnIndex: number) => {
    const previousLockedWidths = lockedColumns.value
        .slice(0, columnIndex)
        .map(getErpTableColumnWidth)

    return `calc(${["58px", ...previousLockedWidths].join(" + ")})`
}

const resetColumnConfigs = () => {
    columnConfigs.splice(
        0,
        columnConfigs.length,
        ...DEFAULT_ORDER_COLUMN_CONFIGS.map((column) => ({ ...column })),
    )
}

const formatDate = (value?: string) => {
    if (!value) return '--'
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return '--'
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
}

const formatDateTime = (value?: string) => {
    if (!value) return '--'
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return '--'
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    const hour = String(date.getHours()).padStart(2, '0')
    const minute = String(date.getMinutes()).padStart(2, '0')
    return `${year}-${month}-${day} ${hour}:${minute}`
}

const formatAmount = (value?: number) =>
    Number(value || 0).toLocaleString('zh-CN', {
        maximumFractionDigits: 2,
    })

const isFileAttachment = (file: unknown): file is File =>
    typeof File !== 'undefined' && file instanceof File

const hasReceivableOrder = (order: SalesOrder) =>
    Boolean(order.hasReceivable || order.receivableOrder)
const canCreateReceipt = (order: SalesOrder) =>
    !order._isDeleted
    && hasReceivableOrder(order)
    && ["待仓库复核", "待采购", "待生产", "生产中", "待出库", "已出库"].includes(order.status || "")

const getPaymentProgressPercent = (order: SalesOrder) => {
    const receivableAmount = getReceivableAmount(order)
    const receivedAmount = Number(order.receivedAmount || 0)
    if (receivableAmount > 0 && Number.isFinite(receivedAmount) && receivedAmount > 0) {
        return Math.max(0, Math.min(100, Number(((receivedAmount / receivableAmount) * 100).toFixed(2))))
    }
    const progress = Number(order.paymentProgress || 0)
    if (!Number.isFinite(progress)) return 0
    return Math.max(0, Math.min(100, progress))
}

const getReceivableAmount = (order: SalesOrder) => {
    const actualAmount = Number(order.actualReceivableAmount || 0)
    if (Number.isFinite(actualAmount) && actualAmount > 0) {
        return actualAmount
    }
    const currency = String(order.currency || '').trim().toUpperCase();
    const plannedAmount = getSalesOrderPaymentTotals(order).find((total) => total.currency === currency)?.amount || 0;
    if (Number.isFinite(plannedAmount) && plannedAmount > 0) {
        return plannedAmount
    }
    const orderAmount = Number(order.amount || 0)
    return Number.isFinite(orderAmount) && orderAmount > 0 ? orderAmount : 0
}

const getReceivedAmount = (order: SalesOrder) => {
    const receivedAmount = Number(order.receivedAmount || 0)
    if (Number.isFinite(receivedAmount) && receivedAmount > 0) {
        return receivedAmount
    }
    const receivableAmount = getReceivableAmount(order)
    const progress = getPaymentProgressPercent(order)
    if (receivableAmount <= 0 || progress <= 0) return 0
    return Number(((receivableAmount * progress) / 100).toFixed(2))
}

const formatDuration = (order: SalesOrder) => getSalesOrderDeliveryDate(order) || '--'

const getOrderKey = (order: SalesOrder) => String(order._id || order.id || order.orderNo || "")
const selectedOrderCount = computed(() => Object.keys(selectedOrderMap.value).length)
const selectedOrders = computed(() => Object.values(selectedOrderMap.value))
const isOrderSelected = (order: SalesOrder) => {
    const key = getOrderKey(order)
    return Boolean(key && selectedOrderMap.value[key])
}
const isAllCurrentPageSelected = computed(() =>
    orders.value.length > 0 && orders.value.every((order) => isOrderSelected(order))
)
const toggleOrderSelection = (order: SalesOrder, event: Event) => {
    const key = getOrderKey(order)
    if (!key) return
    const checked = Boolean((event.target as HTMLInputElement)?.checked)
    const next = { ...selectedOrderMap.value }
    if (checked) {
        next[key] = order
    } else {
        delete next[key]
    }
    selectedOrderMap.value = next
}
const toggleCurrentPageSelection = (event: Event) => {
    const checked = Boolean((event.target as HTMLInputElement)?.checked)
    const next = { ...selectedOrderMap.value }
    orders.value.forEach((order) => {
        const key = getOrderKey(order)
        if (!key) return
        if (checked) {
            next[key] = order
        } else {
            delete next[key]
        }
    })
    selectedOrderMap.value = next
}
type AuditRecord = NonNullable<SalesOrder['auditRecords']>[number]

const getAuditRecords = (order: SalesOrder) => Array.isArray(order.auditRecords) ? order.auditRecords : []
const getOrderedAuditRecordList = (records: AuditRecord[]) =>
    [...records].sort((a, b) => {
        const orderA = Number(a.auditOrder || 0)
        const orderB = Number(b.auditOrder || 0)
        if (orderA && orderB && orderA !== orderB) return orderA - orderB
        if (Boolean(a.isFinalAuditor) !== Boolean(b.isFinalAuditor)) {
            return a.isFinalAuditor ? 1 : -1
        }
        const roleA = Number.isFinite(Number(a.role)) ? Number(a.role) : 999
        const roleB = Number.isFinite(Number(b.role)) ? Number(b.role) : 999
        if (roleA !== roleB) return roleB - roleA
        return String(a.nickname || a.username || '').localeCompare(String(b.nickname || b.username || ''), 'zh-CN')
    })
const getOrderedAuditRecords = (order: SalesOrder) => getOrderedAuditRecordList(getAuditRecords(order))
const getPendingNonFinalAuditRecords = (records: AuditRecord[]) =>
    records.filter((record) => !record.isFinalAuditor && !record.approved && !record.rejected)
const canAuditRecordNow = (record: AuditRecord | undefined, records: AuditRecord[]) => {
    if (!record || record.approved || record.rejected) return false
    if (!record.isFinalAuditor) return true
    return getPendingNonFinalAuditRecords(records).length === 0
}
const getCurrentPendingAuditRecords = (order: SalesOrder) => {
    const records = getOrderedAuditRecords(order)
    return records.filter((record) => canAuditRecordNow(record, records))
}
const getCurrentAuditRecord = (order: SalesOrder) =>
    getOrderedAuditRecords(order).find((record) => record.username && record.username === userInfo.value?.username)
const isMyAuditRecord = (record?: AuditRecord) =>
    Boolean(record?.username && record.username === userInfo.value?.username)
const auditProgressText = (order: SalesOrder) => {
    const progress = order.approvalProgress
    return progress?.total ? `${progress.completed}/${progress.total}` : '--'
}
const auditProgressTitle = (order: SalesOrder) => {
    return order.approvalProgress?.total ? auditProgressText(order) : '暂无审核人'
}
const canAuditOrder = (order: SalesOrder) => {
    if (!canAuditSalesOrder.value || order._isDeleted || order.status !== '待审核') return false
    const records = getOrderedAuditRecords(order)
    const currentRecord = getCurrentAuditRecord(order)
    return isMyAuditRecord(currentRecord) && canAuditRecordNow(currentRecord, records)
}
const canOpenAuditDetail = (order: SalesOrder) =>
    canAuditSalesOrder.value || getAuditRecords(order).length > 0 || Boolean(order.auditHistory?.length)
const currentOrderActor = computed(() =>
    String(userInfo.value?.nickname || userInfo.value?.username || '').trim(),
)
const isOrderCreatedByCurrentUser = (order: SalesOrder) => {
    const actor = currentOrderActor.value
    if (!actor) return false
    return [order.createdBy, order.creator]
        .some((value) => String(value || '').trim() === actor)
}
const isOrderOwner = (order: SalesOrder) => {
    return Boolean(
        isSalespersonUser.value &&
        salespersonId.value &&
        order.salespersonId &&
        String(order.salespersonId) === String(salespersonId.value),
    )
}
const canMutateOrder = (order: SalesOrder) =>
    isOrderOwner(order) || (isSuperAdmin.value && isOrderCreatedByCurrentUser(order))
const canShowEditOrder = (order: SalesOrder) =>
    !isApprovalPage.value && !order._isDeleted && ['草稿', '已驳回'].includes(order.status || '') && canMutateOrder(order)
const canEditOrder = (order: SalesOrder) => canShowEditOrder(order) && !isSalesOrderEditLocked(order);
const getOrderEditTitle = (order: SalesOrder) => isSalesOrderEditLocked(order)
    ? SALES_ORDER_REJECTION_LOCK_MESSAGE
    : (order.status === "已驳回" ? "修改并重新提交" : "编辑");
const canRevokeOrderAudit = (order: SalesOrder) =>
    !isApprovalPage.value && !order._isDeleted && order.status === '待审核' && isOrderOwner(order)
const isRevokingOrder = (order: SalesOrder) => revokingOrderId.value === getOrderKey(order)
const canDeleteOrder = (order?: SalesOrder) => {
    if (isApprovalPage.value) return false
    if (showDeletedOrders.value) return false
    if (isSuperAdmin.value) return Boolean(order && !order._isDeleted)
    return Boolean(order && ['草稿', '已驳回'].includes(order.status || '') && canMutateOrder(order))
}
const canRestoreOrder = (order?: SalesOrder) => Boolean(!isApprovalPage.value && showDeletedOrders.value && isSuperAdmin.value && order?._isDeleted)
const canPurgeOrder = canRestoreOrder
const deletableSelectedOrders = computed(() => selectedOrders.value.filter((order) => canDeleteOrder(order)))
const deletableSelectedOrderCount = computed(() => deletableSelectedOrders.value.length)
const canShowBatchDelete = computed(() =>
    !isApprovalPage.value && selectedOrders.value.some((order) => canDeleteOrder(order))
)
const getAttachmentName = (attachment: any) =>
    String(attachment?.originalName || attachment?.name || attachment?.filename || attachment?.path || attachment || '附件')
const getAttachmentUrl = (attachment: any) =>
    String(attachment?.path || attachment?.url || attachment?.href || attachment || '')
const normalizeImageUrl = (url: string) => {
    const trimmed = url.trim()
    if (!trimmed || trimmed === '[object Object]') return ''
    if (/^(https?:)?\/\//i.test(trimmed) || trimmed.startsWith('data:') || trimmed.startsWith('blob:')) {
        return trimmed
    }
    return trimmed.startsWith('/') ? trimmed : `/${trimmed.replace(/^\/+/, '')}`
}
const getOrderImageUrls = (order: SalesOrder) => {
    const products = Array.isArray(order.products) ? order.products : []
    const firstProductImage = products.length > 0
        ? normalizeImageUrl(getAttachmentUrl(products[0]?.image))
        : ''
    return firstProductImage ? [firstProductImage] : []
}
const getOrderThumbnailUrl = (order: SalesOrder) => getOrderImageUrls(order)[0] || ''
const getOrderImageCount = (order: SalesOrder) => getOrderImageUrls(order).length
const openOrderImage = (order: SalesOrder) => {
    const images = getOrderImageUrls(order)
    if (images.length === 0) return
    const title = order.orderNo || '订单图片'
    previewImages.value = images.map((url, index) => ({
        url,
        alt: images.length > 1 ? `${title}（${index + 1}）` : title,
    }))
    previewTitle.value = title
    showImagePreview.value = true
}
const getAttachmentIcon = (attachment: any) => {
    const name = getAttachmentName(attachment).toLowerCase()
    if (name.endsWith('.pdf')) return 'material-symbols:picture-as-pdf-rounded'
    return 'material-symbols:image-rounded'
}
const auditAttachments = computed(() => {
    const attachments = Array.isArray(auditingOrder.value?.attachments) ? auditingOrder.value?.attachments : []
    const receivableAttachments = Array.isArray(auditingOrder.value?.receivableAttachments)
        ? auditingOrder.value?.receivableAttachments
        : []
    return [...(attachments || []), ...(receivableAttachments || [])]
})
type AuditRecordRow = {
    nodeName: string
    approver: string
    avatarText: string
    result: string
    resultClass: string
    resultDetail?: string
}
const formatAuditTime = (value?: string) => {
    if (!value) return ''
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return ''
    return date.toLocaleString('zh-CN', { hour12: false })
}
const buildAuditRows = (
    records: AuditRecord[],
    options: { historical?: boolean; orderStatus?: string } = {},
): AuditRecordRow[] => {
    const orderedRecords = getOrderedAuditRecordList(records)
    return orderedRecords.map((record) => {
        const approver = record.rejectedByName || record.nickname || record.username || '审核人'
        if (record.rejected) {
            return {
                nodeName: record.isFinalAuditor ? '最终审核' : '审批',
                approver,
                avatarText: approver.slice(0, 1),
                result: '已驳回',
                resultClass: 'rejected',
                resultDetail: [formatAuditTime(record.rejectedAt), record.rejectReason].filter(Boolean).join('\n'),
            }
        }
        if (record.approved) {
            return {
                nodeName: record.isFinalAuditor ? '最终审核' : '审批',
                approver,
                avatarText: approver.slice(0, 1),
                result: '已同意',
                resultClass: 'approved',
                resultDetail: formatAuditTime(record.approvedAt),
            }
        }

        const isCurrentPending = !options.historical && options.orderStatus === '待审核' && canAuditRecordNow(record, orderedRecords)
        const isUnprocessed = options.historical || options.orderStatus === '已驳回'
        return {
            nodeName: record.isFinalAuditor ? '最终审核' : '审批',
            approver,
            avatarText: approver.slice(0, 1),
            result: isCurrentPending ? '审批中' : (isUnprocessed ? '未处理' : '等待前序'),
            resultClass: isCurrentPending ? 'processing' : 'default',
        }
    })
}
const auditRecordRows = computed<AuditRecordRow[]>(() => {
    const order = auditingOrder.value
    if (!order) return []
    const rows: AuditRecordRow[] = [{
        nodeName: '提交',
        approver: order.creator || order.createdBy || order.salespersonName || '提交人',
        avatarText: '提',
        result: '已提交',
        resultClass: 'submitted',
    }]
    const records = getAuditRecords(order)
    if (records.length > 0) {
        rows.push(...buildAuditRows(records, { orderStatus: order.status }))
    } else {
        rows.push({
            nodeName: '审批',
            approver: '暂无审核人',
            avatarText: '审',
            result: order.status === '待审核' ? '审批中' : '无记录',
            resultClass: order.status === '待审核' ? 'processing' : 'default',
        })
    }
    rows.push({
        nodeName: '结束',
        approver: '系统',
        avatarText: '系',
        result: order.status === '待审核' ? '未结束' : '已结束',
        resultClass: order.status === '待审核' ? 'default' : 'finished',
    })
    return rows
})
const auditHistorySections = computed(() => {
    const history = Array.isArray(auditingOrder.value?.auditHistory) ? auditingOrder.value.auditHistory : []
    return [...history]
        .sort((a, b) => Number(a.roundNo || 0) - Number(b.roundNo || 0))
        .map((round, index) => ({
            roundNo: Number(round.roundNo || index + 1),
            rows: buildAuditRows(Array.isArray(round.records) ? round.records : [], { historical: true }),
        }))
})
const auditReadOnlyButtonText = computed(() => {
    const order = auditingOrder.value
    if (!order || order.status !== '待审核') return '仅查看'
    const records = getOrderedAuditRecords(order)
    const currentRecord = getCurrentAuditRecord(order)
    if (currentRecord && !currentRecord.approved && currentRecord.isFinalAuditor && getPendingNonFinalAuditRecords(records).length > 0) {
        return '等待前序审核'
    }

    const pendingRecords = getCurrentPendingAuditRecords(order)
    if (pendingRecords.length === 0) return '仅查看'
    const names = pendingRecords
        .map((record) => record.nickname || record.username)
        .filter(Boolean)
        .join('、')
    return names ? `等待${names}` : '等待审批'
})
const buildDialogCustomer = (order: Partial<SalesOrder>) => ({
    _id: order.customerId,
    name: order.customerName,
    company: order.customerCompany,
    companyDetail: order.customerCompany,
    country: order.customerRegion,
    _assignSalespersonId: order.salespersonId,
    assignSalespersonName: order.salespersonName,
    salesPerson: order.salespersonName,
})
const editingCustomer = computed(() => buildDialogCustomer(editingOrder.value || {}))
const draftEditingCustomer = computed(() => buildDialogCustomer(draftEditingOrder.value || {}))
const viewingCustomer = computed(() => buildDialogCustomer(viewingOrder.value || {}))
const statusClass = (status?: string) => {
    const map: Record<string, string> = {
        草稿: 'draft',
        待审核: 'pending',
        已驳回: 'rejected',
        已删除: 'deleted',
        待采购: 'purple',
        待生产: 'orange',
        生产中: 'warning',
        待出库: 'cyan',
        已出库: 'success',
    }
    return map[status || ''] || 'default'
}
const getOrderDisplayStatus = (order: SalesOrder) =>
    order._isDeleted ? '已删除' : (order.status || '--')

const buildOrderQuery = () => ({
    keyword: filters.keyword.trim(),
    orderNo: filters.orderNo.trim(),
    status: isApprovalPage.value ? undefined : filters.status,
    orderType: filters.orderType,
    approvalOnly: isApprovalPage.value,
    approvalResult: isApprovalPage.value ? filters.approvalResult : undefined,
    deletedOnly: !isApprovalPage.value && showDeletedOrders.value,
})

const downloadBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
}

const openAttachment = (attachment: any) => {
    const url = getAttachmentUrl(attachment)
    if (!url) {
        ElMessage.warning('附件地址不存在')
        return
    }
    window.open(url, '_blank')
}

const downloadAttachment = async (attachment: any) => {
    const url = getAttachmentUrl(attachment)
    if (!url) {
        ElMessage.warning('附件地址不存在')
        return
    }
    try {
        await downloadAttachmentFile(url, getAttachmentName(attachment))
    } catch {
        ElMessage.error('附件下载失败，请稍后重试')
    }
}

const loadOrders = async (page = currentPage.value) => {
    isLoading.value = true
    try {
        const res: any = await retrieveSalesOrderList()({
            page,
            limit: pageSize.value,
            ...buildOrderQuery(),
        })
        if (res?.data?.access?.canAuditSalesOrder !== undefined) {
            userInfo.value = {
                ...userInfo.value,
                canAuditSalesOrder: Boolean(res.data.access.canAuditSalesOrder),
            }
        }
        orders.value = Array.isArray(res?.data?.list) ? res.data.list : []
        const pageInfo = res?.data?.pagination || {}
        goToPage(Number(pageInfo.page || page))
        setTotalItems(Number(pageInfo.total || orders.value.length))
    } catch (err: any) {
        ElMessage.error(err?.data?.msg || err?.message || '获取订单记录失败')
    } finally {
        isLoading.value = false
    }
}

const toggleDeletedOrders = async () => {
    showDeletedOrders.value = !showDeletedOrders.value
    selectedOrderMap.value = {}
    await loadOrders(1)
}

const loadDraftOrders = async (page = 1) => {
    draftLoading.value = true
    try {
        const res: any = await retrieveSalesOrderList()({
            draftOnly: true,
            page,
            limit: draftPagination.limit,
        })
        draftOrders.value = Array.isArray(res?.data?.list) ? res.data.list : []
        const pageInfo = res?.data?.pagination || {}
        draftPagination.page = Number(pageInfo.page || page)
        draftPagination.limit = Number(pageInfo.limit || draftPagination.limit)
        draftPagination.total = Number(pageInfo.total || draftOrders.value.length)
    } catch (err: any) {
        ElMessage.error(err?.data?.msg || err?.message || '获取草稿失败')
    } finally {
        draftLoading.value = false
    }
}

const openDraftBox = async () => {
    showDraftBox.value = true
    await loadDraftOrders(1)
}

const closeDraftBox = () => {
    showDraftBox.value = false
}

const openColumnConfigDialog = () => {
    showColumnConfigDialog.value = true
}

const closeColumnConfigDialog = () => {
    showColumnConfigDialog.value = false
}

const persistColumnConfigs = () => {
    const configs = columnConfigs.map((column) => ({
        key: column.key,
        visible: column.visible,
        locked: column.locked,
    }))
    localStorage.setItem(columnConfigStorageKey.value, JSON.stringify(configs))
}

const applyStoredColumnConfigs = () => {
    const rawConfigs = localStorage.getItem(columnConfigStorageKey.value)
    if (!rawConfigs) return

    try {
        const configs = JSON.parse(rawConfigs) as Array<{ key: string; visible: boolean; locked: boolean }>
        const configMap = new Map(configs.map((item) => [item.key, item]))
        columnConfigs.forEach((column) => {
            const stored = configMap.get(column.key)
            if (!stored) return
            column.visible = stored.visible
            column.locked = stored.locked
        })

        const orderedKeys = configs.map((item) => item.key)
        columnConfigs.sort((a, b) => {
            const indexA = orderedKeys.indexOf(a.key)
            const indexB = orderedKeys.indexOf(b.key)
            const orderA = indexA >= 0 ? indexA : 999
            const orderB = indexB >= 0 ? indexB : 999
            return orderA - orderB
        })
    } catch {
        localStorage.removeItem(columnConfigStorageKey.value)
    }
}

const confirmColumnConfig = () => {
    persistColumnConfigs()
    closeColumnConfigDialog()
}

const toggleColumnVisible = (columnKey: OrderColumnKey) => {
    const column = columnConfigs.find((item) => item.key === columnKey)
    if (!column) return
    column.visible = !column.visible
}

const toggleAllColumnsVisible = () => {
    const nextVisible = !allColumnsVisible.value
    columnConfigs.forEach((column) => {
        column.visible = nextVisible
    })
}

const moveColumnConfig = (fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0) return
    const movingColumn = columnConfigs[fromIndex]
    const targetColumn = columnConfigs[toIndex]
    if (!movingColumn || !targetColumn) return
    if (movingColumn.locked !== targetColumn.locked) return
    const [column] = columnConfigs.splice(fromIndex, 1)
    columnConfigs.splice(toIndex, 0, column)
}

const sortLockedColumnsFirst = () => {
    const locked = columnConfigs.filter((column) => column.locked)
    const unlocked = columnConfigs.filter((column) => !column.locked)
    columnConfigs.splice(0, columnConfigs.length, ...locked, ...unlocked)
}

const toggleColumnLocked = (columnKey: OrderColumnKey) => {
    const column = columnConfigs.find((item) => item.key === columnKey)
    if (!column) return
    column.locked = !column.locked
    sortLockedColumnsFirst()
}

const startColumnDrag = (columnKey: OrderColumnKey) => {
    draggingColumnKey.value = columnKey
}

const dropColumn = (targetColumnKey: OrderColumnKey) => {
    if (!draggingColumnKey.value || draggingColumnKey.value === targetColumnKey) return
    const fromIndex = columnConfigs.findIndex((column) => column.key === draggingColumnKey.value)
    const toIndex = columnConfigs.findIndex((column) => column.key === targetColumnKey)
    moveColumnConfig(fromIndex, toIndex)
    draggingColumnKey.value = null
}

const applyFilters = () => {
    Object.assign(appliedFilters, filters)
    void loadOrders(1)
}

const resetFilters = () => {
    filters.keyword = ''
    filters.orderNo = ''
    filters.status = ''
    filters.approvalResult = 'pending'
    filters.orderType = ''
    applyFilters()
}

const handleSearch = () => {
    applyFilters()
}

const handlePageChange = (page: number) => {
    goToPage(page)
    void loadOrders(page)
}

const handleJumpPage = () => {
    jumpToInputPage()
    void loadOrders(currentPage.value)
}

watch(pageSize, () => {
    void loadOrders(1)
})

const triggerImportOrders = () => {
    if (isImporting.value) return
    importInputRef.value?.click()
}

const handleImportOrders = async (event: Event) => {
    const input = event.target as HTMLInputElement
    const file = input.files?.[0]
    input.value = ''
    if (!file || isImporting.value) return

    isImporting.value = true
    try {
        const formData = new FormData()
        formData.append('file', file)
        const res: any = await importSalesOrders()(formData)
        if (res?.code !== 200) {
            ElMessage.error(res?.msg || '订单导入失败')
            return
        }

        const data = res?.data || {}
        const success = Number(data.successCount || 0)
        const failed = Number(data.failCount || 0)
        if (failed > 0) {
            ElMessage.warning(`导入完成：成功 ${success} 条，失败 ${failed} 条`)
            const detail = (Array.isArray(data.errors) ? data.errors : [])
                .slice(0, 8)
                .map((item: any) => `第${item.row}行：${item.message || '导入失败'}`)
                .join('\n')
            if (detail) {
                await erpMessageBox.alert(detail, '导入失败明细', {
                    confirmButtonText: '知道了',
                    type: 'warning',
                })
            }
        } else {
            ElMessage.success(`导入完成：成功 ${success} 条`)
        }
        await loadOrders(1)
    } catch (err: any) {
        ElMessage.error(err?.data?.msg || err?.message || '订单导入失败')
    } finally {
        isImporting.value = false
    }
}

const handleExportOrders = async () => {
    if (isExporting.value) return
    isExporting.value = true
    try {
        const blob = await exportSalesOrders()(buildOrderQuery())
        downloadBlob(blob, `订单记录_${new Date().toISOString().slice(0, 10)}.xlsx`)
        ElMessage.success('订单导出完成')
    } catch (err: any) {
        ElMessage.error(err?.data?.msg || err?.message || '订单导出失败')
    } finally {
        isExporting.value = false
    }
}

const handleOpenPrintDialog = () => {
    if (selectedOrderCount.value === 0) {
        ElMessage.warning('请先选择需要打印的订单')
        return
    }
    selectedPrintTemplate.value = 'production-dispatch'
    showPrintTemplateDialog.value = true
}

const closePrintTemplateDialog = () => {
    showPrintTemplateDialog.value = false
}

const enrichOrdersWithBomData = async (orders: any[]) => {
    const productIdSet = new Set<string>()
    for (const order of orders) {
        const products = Array.isArray(order.products) ? order.products : []
        for (const product of products) {
            if (product.productId) productIdSet.add(product.productId)
        }
    }
    if (productIdSet.size === 0) return

    const bomMap = new Map<string, any[]>()
    await Promise.all(
        Array.from(productIdSet).map(async (productId) => {
            try {
                const res: any = await getInventoryBomStructure(productId)
                const children = res?.data?.structure?.children
                bomMap.set(productId, Array.isArray(children) ? children : [])
            } catch {
                bomMap.set(productId, [])
            }
        }),
    )

    for (const order of orders) {
        const products = Array.isArray(order.products) ? order.products : []
        for (const product of products) {
            const children = bomMap.get(product.productId)
            product.primaryBomLines = children
                ? children.map((child: any) => ({
                    model: child.model || child.productCode || '',
                    productCode: child.productCode || '',
                    productName: child.productName || '',
                    quantity: child.quantity,
                    unitName: child.unitName || '',
                }))
                : []
        }
    }
}

const confirmPrintTemplate = async () => {
    if (!selectedPrintTemplate.value) {
        ElMessage.warning('请选择打印模板')
        return
    }
    const orders = selectedOrders.value.map((order) => ({ ...order, products: Array.isArray(order.products) ? order.products.map((p: any) => ({ ...p })) : [] }))
    await enrichOrdersWithBomData(orders)
    sessionStorage.setItem(
        'sales-order-print-data',
        JSON.stringify({
            template: selectedPrintTemplate.value,
            orders,
        }),
    )
    showPrintTemplateDialog.value = false
    router.push('/configuration/sales/order/print')
}

const handleViewOrder = (order: SalesOrder) => {
    viewingOrder.value = order
    showViewDialog.value = true
}

const closeAuditDialog = () => {
    if (isAuditing.value || isRejecting.value) return
    showAuditDialog.value = false
    showRejectDialog.value = false
    rejectReason.value = ""
    auditingOrder.value = null
}

const openRejectDialog = () => {
    const order = auditingOrder.value
    if (!order || !canAuditOrder(order)) return
    rejectReason.value = ""
    showRejectDialog.value = true
}

const closeRejectDialog = () => {
    if (isRejecting.value) return
    showRejectDialog.value = false
    rejectReason.value = ""
}

const handleEditOrder = (order: SalesOrder) => {
    if (!canEditOrder(order)) {
        ElMessage.warning(isSalesOrderEditLocked(order)
            ? SALES_ORDER_REJECTION_LOCK_MESSAGE
            : (order.status === '待审核' ? '订单已提交审核，请先撤销审核' : '该订单当前不可修改'))
        return
    }
    editingOrder.value = order
    showEditDialog.value = true
}

const handleOrderUpdated = async () => {
    editingOrder.value = null
    await loadOrders(currentPage.value)
}

const editDraftOrder = (draft: SalesOrder) => {
    if (!canEditOrder(draft)) {
        ElMessage.warning(isSalesOrderEditLocked(draft) ? SALES_ORDER_REJECTION_LOCK_MESSAGE : "该订单当前不可修改");
        return;
    }
    draftEditingOrder.value = draft
    showDraftEditDialog.value = true
}

const handleDraftUpdated = async () => {
    draftEditingOrder.value = null
    showDraftEditDialog.value = false
    await loadDraftOrders(draftPagination.page)
    await loadOrders(1)
}

const deleteDraftOrder = async (draft: SalesOrder) => {
    if (!canDeleteOrder(draft)) return
    const id = draft._id || draft.id
    if (!id) {
        ElMessage.warning('缺少草稿ID')
        return
    }

    try {
        await erpMessageBox.confirm('确认删除该草稿吗？', '删除草稿', {
            confirmButtonText: '删除',
            cancelButtonText: '取消',
            type: 'warning',
        })
        const res: any = await deleteSalesOrder()({ id })
        if (res?.code !== 200) {
            ElMessage.error(res?.msg || '删除草稿失败')
            return
        }
        ElMessage.success('草稿已删除')
        await loadDraftOrders(draftPagination.page)
    } catch (err: any) {
        if (err === 'cancel' || err === 'close') return
        ElMessage.error(err?.data?.msg || err?.message || '删除草稿失败')
    }
}

const handleDeleteOrder = async (order: SalesOrder) => {
    if (!canDeleteOrder(order)) return
    const id = order._id || order.id
    if (!id) {
        ElMessage.warning('缺少订单ID')
        return
    }

    try {
        await erpMessageBox.confirm('确认删除该订单吗？', '删除订单', {
            confirmButtonText: '删除',
            cancelButtonText: '取消',
            type: 'warning',
        })
        const res: any = await deleteSalesOrder()({ id })
        if (res?.code !== 200) {
            ElMessage.error(res?.msg || '删除订单失败')
            return
        }
        ElMessage.success('订单已删除')
        await loadOrders(currentPage.value)
    } catch (err: any) {
        if (err === 'cancel' || err === 'close') return
        ElMessage.error(err?.data?.msg || err?.message || '删除订单失败')
    }
}

const handleBatchDeleteOrders = async () => {
    const ids = deletableSelectedOrders.value
        .map((order) => order._id || order.id)
        .filter((id): id is string => Boolean(id))

    if (ids.length === 0) {
        ElMessage.warning('请先选择需要删除的订单')
        return
    }

    try {
        await erpMessageBox.confirm(`确认删除选中的 ${ids.length} 个订单吗？`, '批量删除订单', {
            confirmButtonText: '删除',
            cancelButtonText: '取消',
            type: 'warning',
        })
        const res: any = await deleteSalesOrder()({ ids })
        if (res?.code !== 200) {
            ElMessage.error(res?.msg || '批量删除订单失败')
            return
        }
        ElMessage.success('订单已批量删除')
        selectedOrderMap.value = {}
        await loadOrders(currentPage.value)
    } catch (err: any) {
        if (err === 'cancel' || err === 'close') return
        ElMessage.error(err?.data?.msg || err?.message || '批量删除订单失败')
    }
}

const handleRestoreOrder = async (order: SalesOrder) => {
    if (!canRestoreOrder(order)) return
    const id = order._id || order.id
    if (!id) return
    try {
        await erpMessageBox.confirm('恢复后订单将重新可见，但不会自动恢复库存预占或采购需求，确认恢复吗？', '恢复订单', {
            confirmButtonText: '恢复', cancelButtonText: '取消', type: 'warning',
        })
        const res: any = await deleteSalesOrder()({ restore: true, id })
        if (res?.code !== 200) throw new Error(res?.msg || '恢复订单失败')
        ElMessage.success(res?.data?.warning || '订单已恢复')
        await loadOrders(currentPage.value)
    } catch (err: any) {
        if (err === 'cancel' || err === 'close') return
        ElMessage.error(err?.data?.msg || err?.message || '恢复订单失败')
    }
}

const handlePurgeOrder = async (order: SalesOrder) => {
    if (!canPurgeOrder(order)) return
    const id = order._id || order.id
    if (!id) return
    try {
        const preview: any = await deleteSalesOrder()({ action: 'purge-preview', ids: [id] })
        const check = preview?.data?.orders?.[0]
        if (!check?.canDelete) {
            ElMessage.error(`无法彻底删除：${(check?.reasons || []).join('、') || '存在业务关联'}`)
            return
        }
        await erpMessageBox.confirm('该操作不可恢复，确认永久删除订单及临时关联吗？', '彻底删除订单', {
            confirmButtonText: '永久删除', cancelButtonText: '取消', type: 'error',
        })
        const res: any = await deleteSalesOrder()({ action: 'purge', ids: [id] })
        if (res?.code !== 200) throw new Error(res?.msg || '彻底删除失败')
        ElMessage.success('订单已彻底删除')
        delete selectedOrderMap.value[getOrderKey(order)]
        selectedOrderMap.value = { ...selectedOrderMap.value }
        await loadOrders(currentPage.value)
    } catch (err: any) {
        if (err === 'cancel' || err === 'close') return
        ElMessage.error(err?.data?.msg || err?.message || '彻底删除失败')
    }
}

const handleBatchPurgeOrders = async () => {
    const ids = selectedOrders.value.map((order) => order._id || order.id).filter((id): id is string => Boolean(id))
    if (!ids.length) return
    try {
        const preview: any = await deleteSalesOrder()({ action: 'purge-preview', ids })
        const checks = Array.isArray(preview?.data?.orders) ? preview.data.orders : []
        const failed = checks.filter((item: any) => !item.canDelete)
        if (failed.length) {
            ElMessage.error(failed.map((item: any) => `${item.orderNo || item.id}: ${(item.reasons || []).join('、')}`).join('；'))
            return
        }
        await erpMessageBox.confirm(`确认永久删除选中的 ${ids.length} 个订单吗？该操作不可恢复。`, '批量彻底删除', {
            confirmButtonText: '永久删除', cancelButtonText: '取消', type: 'error',
        })
        const res: any = await deleteSalesOrder()({ action: 'purge', ids })
        if (res?.code !== 200) throw new Error(res?.msg || '批量彻底删除失败')
        ElMessage.success('订单已批量彻底删除')
        selectedOrderMap.value = {}
        await loadOrders(currentPage.value)
    } catch (err: any) {
        if (err === 'cancel' || err === 'close') return
        ElMessage.error(err?.data?.msg || err?.message || '批量彻底删除失败')
    }
}

const handleRevokeOrderAudit = async (order: SalesOrder) => {
    if (!canRevokeOrderAudit(order)) return
    const id = order._id || order.id
    const key = getOrderKey(order)
    if (!id || !key) {
        ElMessage.warning('缺少订单ID')
        return
    }

    try {
        await erpMessageBox.confirm('确认撤销该订单审核并放回草稿箱吗？', '撤销审核', {
            confirmButtonText: '撤销',
            cancelButtonText: '取消',
            type: 'warning',
        })
        revokingOrderId.value = key
        const res: any = await revokeSalesOrderAudit()({ id })
        if (res?.code !== 200) {
            ElMessage.error(res?.msg || '撤销审核失败')
            return
        }
        ElMessage.success('已撤销审核，订单已放回草稿箱')
        delete selectedOrderMap.value[key]
        selectedOrderMap.value = { ...selectedOrderMap.value }
        await loadOrders(currentPage.value)
        if (showDraftBox.value) {
            await loadDraftOrders(draftPagination.page)
        }
    } catch (err: any) {
        if (err === 'cancel' || err === 'close') return
        ElMessage.error(err?.data?.msg || err?.message || '撤销审核失败')
    } finally {
        if (revokingOrderId.value === key) {
            revokingOrderId.value = ""
        }
    }
}

const handleAuditOrder = async (order: SalesOrder) => {
    if (!canOpenAuditDetail(order)) return
    auditingOrder.value = order
    showAuditDialog.value = true
}

const loadReceiptCurrencyOptions = async () => {
    if (receiptCurrencyLoading.value) return
    receiptCurrencyLoading.value = true
    try {
        const res: any = await retrieveInventoryCurrencies({ limit: 100 })
        const seenCodes = new Set<string>()
        const options = Array.isArray(res?.data?.list)
            ? res.data.list
                .map((currency: any) => {
                    const code = String(currency?.currencyCode || '').trim().toUpperCase()
                    const name = String(currency?.name || '').trim()
                    if (!code || seenCodes.has(code)) return null
                    seenCodes.add(code)
                    return {
                        label: name ? `${name} ${code}` : code,
                        value: code,
                    }
                })
                .filter(Boolean)
            : []

        receiptCurrencyOptions.value = options.length ? options : [...fallbackReceiptCurrencyOptions]
        if (!receiptCurrencyOptions.value.some((currency) => currency.value === receiptForm.currency)) {
            receiptForm.currency = receiptCurrencyOptions.value[0]?.value || ''
        }
    } catch (err) {
        console.error('获取币种列表失败:', err)
        receiptCurrencyOptions.value = [...fallbackReceiptCurrencyOptions]
    } finally {
        receiptCurrencyLoading.value = false
    }
}

const resetReceiptForm = (order?: SalesOrder | null) => {
    receiptForm.amount = undefined
    receiptForm.paymentDate = ''
    receiptForm.currency = order?.currency || 'CNY'
    receiptForm.remark = ''
    receiptForm.attachments = []
}

const buildReceiptSubmitData = (salesOrderId: string) => {
    const fd = new FormData()
    fd.append('salesOrderId', salesOrderId)
    fd.append('amount', String(receiptForm.amount || 0))
    fd.append('paymentDate', receiptForm.paymentDate)
    fd.append('currency', receiptForm.currency)
    fd.append('remark', receiptForm.remark.trim())
    fd.append(
        'attachmentsExisting',
        JSON.stringify((receiptForm.attachments || []).filter((file) => !isFileAttachment(file))),
    )
    ;(receiptForm.attachments || []).filter(isFileAttachment).forEach((file) => fd.append('attachments', file))
    return fd
}

const openReceiptDialog = async (order: SalesOrder) => {
    if (!canCreateReceipt(order)) return
    receiptOrder.value = order
    resetReceiptForm(order)
    showReceiptDialog.value = true
    await loadReceiptCurrencyOptions()
}

const closeReceiptDialog = () => {
    if (receiptSubmitting.value) return
    showReceiptDialog.value = false
    receiptOrder.value = null
    resetReceiptForm()
}

const submitReceipt = async () => {
    const order = receiptOrder.value
    const salesOrderId = order?._id || order?.id
    const amount = Number(receiptForm.amount)
    if (!salesOrderId) {
        ElMessage.warning('缺少订单ID')
        return
    }
    if (!Number.isFinite(amount) || amount <= 0) {
        ElMessage.warning('请输入大于0的回款金额')
        return
    }
    if (!receiptForm.paymentDate) {
        ElMessage.warning('请选择回款日期')
        return
    }
    if (!receiptForm.currency) {
        ElMessage.warning('请选择币种')
        return
    }

    receiptSubmitting.value = true
    try {
        const res: any = await addSalesOrderReceipt()(buildReceiptSubmitData(salesOrderId))
        if (res?.code !== 200) {
            ElMessage.error(res?.msg || '回款单提交失败')
            return
        }
        ElMessage.success('回款单已提交审核')
        showReceiptDialog.value = false
        receiptOrder.value = null
        resetReceiptForm()
    } catch (err: any) {
        ElMessage.error(err?.data?.msg || err?.message || '回款单提交失败')
    } finally {
        receiptSubmitting.value = false
    }
}

const submitAuditOrder = async () => {
    const order = auditingOrder.value
    if (!order || !canAuditOrder(order)) return
    const id = order._id || order.id
    if (!id) {
        ElMessage.warning('缺少订单ID')
        return
    }

    isAuditing.value = true
    let shouldClose = false
    try {
        const res: any = await auditSalesOrder()({ id })
        if (res?.code !== 200) {
            ElMessage.error(res?.msg || '订单审核失败')
            return
        }
        const nextStatus = res?.data?.detail?.status
        ElMessage.success(nextStatus && nextStatus !== '待审核' ? `订单已进入${nextStatus}` : '审核已通过')
        shouldClose = true
        await loadOrders(currentPage.value)
        window.dispatchEvent(new Event('sales-order-approval-stats-refresh'))
    } catch (err: any) {
        ElMessage.error(err?.data?.msg || err?.message || '订单审核失败')
    } finally {
        isAuditing.value = false
        if (shouldClose) {
            closeAuditDialog()
        }
    }
}

const submitRejectOrder = async () => {
    const order = auditingOrder.value
    if (!order || !canAuditOrder(order)) return
    const id = order._id || order.id
    const reason = rejectReason.value.trim()
    if (!id) {
        ElMessage.warning('缺少订单ID')
        return
    }
    if (!reason) {
        ElMessage.warning('请填写驳回原因')
        return
    }
    isRejecting.value = true
    try {
        const res: any = await rejectSalesOrder()({
            id,
            reason,
        })
        if (res?.code !== 200) {
            ElMessage.error(res?.msg || '驳回订单失败')
            return
        }
        ElMessage.success('已驳回订单')
        showRejectDialog.value = false
        rejectReason.value = ""
        showAuditDialog.value = false
        auditingOrder.value = null
        await loadOrders(currentPage.value)
        window.dispatchEvent(new Event('sales-order-approval-stats-refresh'))
    } catch (err: any) {
        ElMessage.error(err?.data?.msg || err?.message || '驳回订单失败')
    } finally {
        isRejecting.value = false
    }
}

onMounted(() => {
    resetColumnConfigs()
    applyStoredColumnConfigs()
    void loadOrders(1)
})

watch(columnConfigStorageKey, () => {
    resetColumnConfigs()
    applyStoredColumnConfigs()
})

watch(showEditDialog, (visible) => {
    if (!visible) {
        editingOrder.value = null
    }
})

watch(showDraftEditDialog, (visible) => {
    if (!visible) {
        draftEditingOrder.value = null
    }
})

watch(showViewDialog, (visible) => {
    if (!visible) {
        viewingOrder.value = null
    }
})

watch(showAuditDialog, (visible) => {
    if (!visible) {
        showRejectDialog.value = false
        rejectReason.value = ""
        auditingOrder.value = null
    }
})
</script>

<style lang="less" scoped>
.order-root {
    height: 100%;
    min-width: 0;
    min-height: 0;
    display: grid;
    grid-template-rows: 40px 32px 32px minmax(0, 1fr) 52px;
    gap: var(--erp-spacing-container-gap);
    color: var(--erp-color-text-primary);
}

.page-header,
.filter-row,
.action-row {
    min-width: 0;
    display: flex;
    align-items: center;
}

.page-header {
    justify-content: space-between;
}

.filter-row,
.action-row {
    gap: var(--erp-spacing-8);
}

.filter-actions {
    display: flex;
    align-items: center;
    gap: var(--erp-spacing-12);
    margin-left: auto;
}

.filter-field {
    display: inline-grid;
    grid-template-columns: auto 200px;
    align-items: center;
    gap: var(--erp-spacing-8);
    color: var(--erp-color-text-primary);
    font-size: var(--erp-typography-content1-font-size);
    font-weight: var(--erp-typography-content1-font-weight);
    line-height: var(--erp-typography-content1-line-height);
}

.filter-field input,
.filter-field select {
    width: 200px;
    height: var(--erp-size-control-height-sm);
    padding: 0 var(--erp-spacing-8);
    border: 1px solid var(--erp-color-border-default);
    border-radius: var(--erp-radius-control-default);
    outline: 0;
    background: var(--erp-color-fill-default);
    color: var(--erp-color-text-primary);
    font: inherit;
}

.filter-field input::placeholder {
    color: var(--erp-color-text-placeholder);
}

.filter-field input:focus,
.filter-field select:focus {
    border-color: var(--erp-color-border-brand);
}

.outline-button,
.muted-button,
.text-button,
.secondary-action {
    height: var(--erp-size-control-height-sm);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: var(--erp-spacing-4);
    padding: 4px 8px;
    border-radius: var(--erp-radius-control-default);
    font-size: var(--erp-typography-title3-font-size);
    font-weight: var(--erp-typography-title3-font-weight);
    line-height: var(--erp-typography-title3-line-height);
    cursor: pointer;
}

.outline-button {
    border: 1px solid var(--erp-color-border-default);
    background: var(--erp-color-fill-default);
    color: var(--erp-color-text-secondary-strong);
}

.muted-button {
    border: 0;
    background: var(--erp-color-fill-disabled);
    color: var(--erp-color-text-disabled);
}

.muted-button.active {
    background: var(--erp-color-action-primary);
    color: var(--erp-color-text-white);
}

.text-button {
    border: 0;
    background: transparent;
    color: var(--erp-color-text-primary);
}

.secondary-action {
    border: 1px solid var(--erp-color-border-default);
    background: var(--erp-color-fill-default);
    color: var(--erp-color-text-secondary-strong);
}

.secondary-action:disabled {
    border-color: var(--erp-color-border-muted);
    background: var(--erp-color-fill-disabled);
    color: var(--erp-color-text-disabled);
    cursor: not-allowed;
}

.button-icon {
    width: var(--erp-size-icon-default);
    height: var(--erp-size-icon-default);
}

.danger-button {
    border-color: var(--erp-color-border-error);
    color: var(--erp-color-text-status-error);
}

.danger-button:hover:not(:disabled) {
    background: var(--erp-color-bg-status-error-subtle);
}

.draft-box-button {
    border-color: var(--erp-color-border-brand);
    color: var(--erp-color-text-brand);
}

.column-button {
    margin-left: auto;
}

.hidden-file-input {
    display: none;
}

.order-table-frame {
    min-width: 0;
    min-height: 0;
}

.order-table-frame .table-cell {
    overflow: hidden;
    text-overflow: ellipsis;
}

.selection-cell,
.locked-table-cell,
.order-table-frame .erp-table-fixed-end {
    position: sticky;
    align-self: stretch;
    z-index: 5;
    background: var(--erp-color-fill-default);
}

.selection-cell {
    left: 0;
    padding: 0;
}

.locked-table-cell {
    z-index: 4;
}

.order-table-frame .erp-table-fixed-end {
    right: 0;
}

.order-table-frame .table-head .selection-cell,
.order-table-frame .table-head .locked-table-cell,
.order-table-frame .table-head .erp-table-fixed-end {
    z-index: 25;
    background: var(--erp-color-fill-table-header);
}

.order-table-frame .data-row:hover .selection-cell,
.order-table-frame .data-row:hover .locked-table-cell,
.order-table-frame .data-row:hover .erp-table-fixed-end {
    background: var(--erp-color-fill-hover);
}

.action-cell {
    gap: var(--erp-spacing-12);
}

.action-cell button,
.link-button,
.progress-link,
.order-thumbnail {
    border: 0;
    font: inherit;
    cursor: pointer;
}

.action-cell button {
    width: var(--erp-size-icon-default);
    height: var(--erp-size-icon-default);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    border-radius: var(--erp-radius-control-default);
    background: transparent;
    color: var(--erp-color-icon-brand);
    font-size: var(--erp-size-icon-default);
}

.action-cell button:hover:not(:disabled) {
    background: var(--erp-color-fill-hover);
}

.action-cell button:disabled,
.action-cell button.disabled {
    color: var(--erp-color-icon-disabled);
    cursor: not-allowed;
}

.action-cell button.danger-action {
    color: var(--erp-color-icon-error);
}

.mono,
.amount,
.audit-progress,
.progress-text {
    font-variant-numeric: tabular-nums;
}

.order-no-copyable {
    cursor: copy;
}

.order-image-cell {
    display: flex;
    justify-content: center;
}

.order-thumbnail,
.order-thumbnail-placeholder {
    width: 56px;
    height: 42px;
    border-radius: var(--erp-radius-control-default);
}

.order-thumbnail {
    position: relative;
    overflow: hidden;
    border: 1px solid var(--erp-color-border-muted);
    background: var(--erp-color-fill-hover);
}

.order-thumbnail img {
    width: 100%;
    height: 100%;
    display: block;
    object-fit: cover;
}

.order-thumbnail-count {
    position: absolute;
    right: 3px;
    bottom: 3px;
    min-width: 18px;
    height: 18px;
    padding: 0 5px;
    border-radius: var(--erp-radius-control-pill);
    background: var(--erp-color-text-primary);
    color: var(--erp-color-text-white);
    font-size: var(--erp-typography-note-font-size);
    line-height: 18px;
}

.order-thumbnail-placeholder {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: 1px dashed var(--erp-color-border-muted);
    background: var(--erp-color-fill-hover);
    color: var(--erp-color-text-placeholder);
    font-size: var(--erp-typography-note-font-size);
}

.long-cell {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.status-pill,
.audit-result-pill {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 64px;
    height: 24px;
    padding: 0 var(--erp-spacing-8);
    border-radius: var(--erp-radius-control-pill);
    font-size: var(--erp-typography-note-font-size);
    font-weight: var(--erp-typography-title3-font-weight);
}

.status-pill.pending { background: var(--erp-color-bg-status-review); color: var(--erp-color-text-status-review); }
.status-pill.warning,
.status-pill.orange { background: var(--erp-color-bg-status-producing); color: var(--erp-color-text-status-producing); }
.status-pill.cyan { background: var(--erp-color-bg-status-outbound); color: var(--erp-color-text-status-outbound); }
.status-pill.success { background: var(--erp-color-bg-status-complete); color: var(--erp-color-text-status-complete); }
.status-pill.purple { background: var(--erp-color-bg-status-purchase); color: var(--erp-color-text-status-purchase); }
.status-pill.rejected,
.status-pill.danger { background: var(--erp-color-bg-status-error-subtle); color: var(--erp-color-text-status-error); }
.status-pill.draft,
.status-pill.deleted,
.status-pill.default { background: var(--erp-color-fill-control-secondary); color: var(--erp-color-text-secondary); }

.link-button,
.progress-link {
    padding: 0;
    background: transparent;
    color: var(--erp-color-text-brand);
}

.link-button:disabled {
    color: var(--erp-color-text-disabled);
    cursor: not-allowed;
}

.payment-progress {
    width: 140px;
    display: grid;
    justify-items: center;
    gap: var(--erp-spacing-4);
    color: var(--erp-color-text-secondary);
    font-size: var(--erp-typography-content2-font-size);
    line-height: var(--erp-typography-content2-line-height);
}

.progress-bar {
    width: 132px;
    height: 8px;
    overflow: hidden;
    border-radius: var(--erp-radius-control-pill);
    background: var(--erp-color-fill-disabled);
}

.progress-bar span {
    display: block;
    height: 100%;
    border-radius: inherit;
    background: var(--erp-color-action-primary);
}

.audit-progress {
    color: var(--erp-color-text-brand);
    font-weight: var(--erp-typography-title3-font-weight);
}


.receipt-dialog-mask {
    position: fixed;
    inset: 0;
    z-index: 1650;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--erp-color-bg-overlay);
}

.draft-dialog-mask {
    position: fixed;
    inset: 0;
    z-index: 1700;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--erp-color-bg-overlay);
}

.draft-dialog {
    width: min(760px, calc(100vw - 40px));
    max-height: calc(100vh - 72px);
    display: flex;
    flex-direction: column;
    background: var(--erp-color-fill-default);
    border-radius: 8px;
    box-shadow: var(--erp-shadow-surface);
    overflow: hidden;
}

.draft-header {
    height: 64px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 18px;
    border-bottom: 1px solid var(--erp-color-divider-subtle);

    h3 {
        margin: 0;
        color: var(--erp-color-text-primary);
        font-size: 18px;
        font-weight: 700;
    }

    button {
        border: none;
        background: transparent;
        color: var(--erp-color-text-primary);
        cursor: pointer;
        font-size: 22px;
    }
}

.draft-body {
    min-height: 260px;
    padding: 16px;
    overflow: auto;
    background: var(--erp-color-fill-hover);
}

.draft-empty {
    height: 220px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--erp-color-text-placeholder);
    font-size: 14px;
}

.draft-list {
    display: flex;
    flex-direction: column;
    gap: 10px;
}

.draft-card {
    display: grid;
    grid-template-columns: 82px 1fr 150px;
    align-items: center;
    gap: 14px;
    padding: 12px;
    border: 1px solid var(--erp-color-border-muted);
    border-radius: 8px;
    background: var(--erp-color-fill-default);
}

.draft-thumb {
    width: 70px;
    height: 52px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: 1px dashed var(--erp-color-border-muted);
    border-radius: 6px;
    background: var(--erp-color-fill-hover);
    color: var(--erp-color-text-placeholder);
    font-size: 12px;
    overflow: hidden;

    img {
        width: 100%;
        height: 100%;
        object-fit: cover;
    }
}

.draft-info {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;

    strong {
        color: var(--erp-color-text-primary);
        font-size: 14px;
    }

    span {
        color: var(--erp-color-text-secondary);
        font-size: 12px;
    }
}

.draft-actions {
    display: flex;
    justify-content: flex-end;
    gap: 10px;

    button {
        height: 30px;
        border: 1px solid var(--erp-color-border-brand);
        border-radius: 8px;
        background: var(--erp-color-fill-default);
        color: var(--erp-color-text-brand);
        padding: 0 12px;
        cursor: pointer;

        &.danger {
            border-color: var(--erp-color-border-error);
            color: var(--erp-color-text-status-error);
        }
    }
}

.draft-footer {
    height: 58px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 18px;
    border-top: 1px solid var(--erp-color-divider-subtle);
    color: var(--erp-color-text-secondary);
    font-size: 13px;
}

.draft-pager {
    display: flex;
    gap: 10px;

    button {
        height: 30px;
        border: 1px solid var(--erp-color-border-muted);
        border-radius: 8px;
        background: var(--erp-color-fill-default);
        color: var(--erp-color-text-secondary-strong);
        padding: 0 12px;
        cursor: pointer;

        &:disabled {
            cursor: not-allowed;
            opacity: 0.55;
        }
    }
}

.receipt-dialog {
    width: min(620px, calc(100vw - 40px));
    background: var(--erp-color-fill-default);
    border-radius: 8px;
    box-shadow: var(--erp-shadow-surface);
    overflow: hidden;
}

.receipt-header {
    height: 70px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 18px;

    h3 {
        margin: 0;
        color: var(--erp-color-text-primary);
        font-size: 18px;
        font-weight: 700;
    }

    button {
        border: none;
        background: transparent;
        color: var(--erp-color-text-primary);
        cursor: pointer;
        font-size: 22px;

        &:disabled {
            cursor: not-allowed;
            opacity: 0.6;
        }
    }
}

.receipt-body {
    padding: 20px 54px 24px 70px;
    display: flex;
    flex-direction: column;
    gap: 24px;
}

.receipt-field {
    display: grid;
    grid-template-columns: 94px 1fr;
    align-items: center;
    gap: 18px;
    color: var(--erp-color-text-secondary-strong);
    font-size: 14px;

    span {
        text-align: right;
        white-space: nowrap;
    }

    strong {
        color: var(--erp-color-text-status-error);
        font-weight: 700;
    }

    input,
    select,
    textarea {
        width: 100%;
        border: 1px solid var(--erp-color-border-default);
        border-radius: 8px;
        background: var(--erp-color-fill-default);
        color: var(--erp-color-text-primary);
        outline: none;
        font-family: inherit;
        font-size: 14px;
        transition: border-color 0.2s, box-shadow 0.2s;

        &:focus {
            border-color: var(--erp-color-border-brand);
            box-shadow: 0 0 0 2px color-mix(in srgb, var(--erp-color-border-brand) 12%, transparent);
        }

        &:disabled {
            background: var(--erp-color-fill-disabled);
            color: var(--erp-color-text-disabled);
            cursor: not-allowed;
        }
    }

    input,
    select {
        height: 32px;
        padding: 0 10px;
    }

    :deep(.searchable-select) {
        --searchable-select-height: 32px;
        --searchable-select-border: var(--erp-color-border-default);
        --searchable-select-radius: 8px;
        --searchable-select-font-size: 14px;
        --searchable-select-active-border: var(--erp-color-border-brand);

        width: 100%;
    }

    :deep(.searchable-select-input) {
        padding: 0 30px 0 10px;
    }

    textarea {
        height: 120px;
        padding: 10px;
        resize: none;
    }
}

.receipt-field-compact {
    grid-template-columns: 94px 170px;
}

.receipt-textarea-field {
    align-items: start;

    span {
        padding-top: 10px;
    }
}

.receipt-upload-field {
    align-items: start;

    span {
        padding-top: 10px;
    }

    small {
        grid-column: 2;
        color: var(--erp-color-text-placeholder);
        font-size: 12px;
        line-height: 1.4;
        margin-top: 8px;
    }

    :deep(.upload-area) {
        padding: 20px 16px;
        border-radius: 8px;
    }
}

.receipt-footer {
    height: 76px;
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 14px;
    padding: 0 18px;
}

.receipt-cancel,
.receipt-confirm {
    width: 88px;
    height: 34px;
    border-radius: 8px;
    cursor: pointer;
    font-weight: 600;

    &:disabled {
        cursor: not-allowed;
        opacity: 0.6;
    }
}

.receipt-cancel {
    border: 1px solid var(--erp-color-border-default);
    background: var(--erp-color-fill-default);
    color: var(--erp-color-text-disabled);
}

.receipt-confirm {
    border: none;
    background: var(--erp-color-action-primary);
    color: var(--erp-color-text-white);
}

.print-dialog-mask {
    position: fixed;
    inset: 0;
    z-index: 1550;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--erp-color-bg-overlay);
}

.print-template-dialog {
    width: min(548px, calc(100vw - 40px));
    background: var(--erp-color-fill-default);
    border-radius: 8px;
    box-shadow: var(--erp-shadow-surface);
    overflow: hidden;
}

.print-template-header {
    height: 70px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 18px;

    h3 {
        margin: 0;
        color: var(--erp-color-text-primary);
        font-size: 18px;
        font-weight: 700;
    }

    button {
        border: none;
        background: transparent;
        color: var(--erp-color-text-primary);
        cursor: pointer;
        font-size: 22px;
    }
}

.print-template-body {
    min-height: 150px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
}

.print-template-field {
    display: flex;
    align-items: center;
    gap: 12px;
    color: var(--erp-color-text-secondary-strong);
    font-size: 14px;

    strong {
        color: var(--erp-color-text-status-error);
    }

    select {
        width: 178px;
        height: 32px;
        border: 1px solid var(--erp-color-border-brand);
        border-radius: 8px;
        padding: 0 10px;
        color: var(--erp-color-text-primary);
        outline: none;
        background: var(--erp-color-fill-default);
    }
}

.print-template-hint {
    margin: 10px 0 0;
    color: var(--erp-color-text-placeholder);
    font-size: 12px;
}

.print-template-footer {
    height: 64px;
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 14px;
    padding: 0 18px;
}

.print-cancel,
.print-confirm {
    width: 90px;
    height: 34px;
    border-radius: 8px;
    cursor: pointer;
    font-weight: 600;

    &:disabled {
        cursor: not-allowed;
        opacity: 0.6;
    }
}

.print-cancel {
    border: 1px solid var(--erp-color-border-default);
    background: var(--erp-color-fill-default);
    color: var(--erp-color-text-disabled);
}

.print-confirm {
    border: none;
    background: var(--erp-color-action-primary);
    color: var(--erp-color-text-white);
}

.audit-dialog {
    width: min(840px, calc(100vw - 48px));
    max-height: calc(100vh - 48px);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    border-radius: var(--erp-radius-surface-dialog);
    background: var(--erp-color-fill-default);
    border: 1px solid var(--erp-color-border-muted);
}

.audit-dialog-body {
    position: relative;
    min-width: 0;
    padding: var(--erp-spacing-20) var(--erp-spacing-20) var(--erp-spacing-12);
    overflow: auto;
}

.audit-close {
    position: absolute;
    top: var(--erp-spacing-12);
    right: var(--erp-spacing-12);
    width: 24px;
    height: 24px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    border: 0;
    border-radius: var(--erp-radius-control-default);
    background: transparent;
    color: var(--erp-color-icon-default);
    font-size: var(--erp-size-icon-default);
    cursor: pointer;
}

.audit-close:not(:disabled):hover {
    background: var(--erp-color-fill-hover);
}

.audit-close:disabled {
    color: var(--erp-color-icon-disabled);
    cursor: not-allowed;
}

.audit-section {
    margin-bottom: var(--erp-spacing-12);
}

.audit-section h3 {
    margin: 0 0 var(--erp-spacing-12);
    padding-left: var(--erp-spacing-8);
    border-left: 3px solid var(--erp-color-neutral-900);
    color: var(--erp-color-text-primary);
    font-size: var(--erp-typography-title1-font-size);
    font-weight: var(--erp-typography-title1-font-weight);
    line-height: var(--erp-typography-title1-line-height);
}

.audit-detail-grid {
    display: grid;
    grid-template-columns: 150px minmax(0, 1fr) 150px minmax(0, 1fr);
    row-gap: var(--erp-spacing-12);
    column-gap: var(--erp-spacing-20);
}

.audit-detail-item {
    display: contents;
}

.audit-detail-item > span,
.audit-detail-label {
    color: var(--erp-color-text-secondary);
    font-size: var(--erp-typography-content1-font-size);
    line-height: var(--erp-typography-content1-line-height);
}

.audit-detail-item strong {
    min-width: 0;
    color: var(--erp-color-text-primary);
    font-size: var(--erp-typography-content1-font-size);
    font-weight: var(--erp-typography-title3-font-weight);
    line-height: var(--erp-typography-content1-line-height);
    overflow-wrap: anywhere;
}

.audit-detail-wide > span {
    grid-column: 1;
}

.audit-detail-wide > strong {
    grid-column: 2 / 5;
}

.audit-attachment-row {
    display: grid;
    grid-template-columns: 150px minmax(0, 1fr);
    gap: var(--erp-spacing-20);
    margin-top: var(--erp-spacing-12);
}

.audit-attachment-list {
    min-width: 0;
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--erp-spacing-8);
}

.audit-empty-attachments {
    color: var(--erp-color-text-placeholder);
    font-size: var(--erp-typography-content1-font-size);
    line-height: var(--erp-typography-content1-line-height);
}

.audit-attachment-card {
    min-width: 0;
    height: var(--erp-size-control-height-md);
    display: grid;
    grid-template-columns: 24px minmax(0, 1fr) 24px 24px;
    align-items: center;
    gap: var(--erp-spacing-8);
    padding: 0 var(--erp-spacing-8);
    border: 1px solid var(--erp-color-border-muted);
    border-radius: var(--erp-radius-control-default);
    color: var(--erp-color-text-secondary-strong);
    font-size: var(--erp-typography-content1-font-size);
    line-height: var(--erp-typography-content1-line-height);
}

.audit-attachment-card > span {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.audit-attachment-card button {
    width: 24px;
    height: 24px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    border: 0;
    border-radius: var(--erp-radius-control-default);
    background: transparent;
    color: var(--erp-color-icon-default);
    cursor: pointer;
}

.audit-attachment-card button:hover {
    background: var(--erp-color-fill-hover);
    color: var(--erp-color-icon-brand);
}

.attachment-type-icon {
    color: var(--erp-color-text-status-producing);
    font-size: var(--erp-size-icon-default);
}

.audit-record-table {
    overflow: auto;
    border-top: 1px solid var(--erp-color-divider-default);
    border-bottom: 1px solid var(--erp-color-divider-default);
}

.audit-record-grid {
    min-width: 0;
    display: grid;
    grid-template-columns: 150px minmax(180px, 1fr) 150px;
    align-items: center;
    gap: var(--erp-spacing-12);
    min-height: 64px;
    padding: 0 var(--erp-spacing-12);
}

.audit-record-header {
    min-height: 48px;
    border-bottom: 1px solid var(--erp-color-divider-default);
    color: var(--erp-color-text-secondary);
    font-size: var(--erp-typography-title2-font-size);
    font-weight: var(--erp-typography-title2-font-weight);
    line-height: var(--erp-typography-title2-line-height);
}

.audit-record-row {
    border-bottom: 1px solid var(--erp-color-divider-default);
    color: var(--erp-color-text-primary);
    font-size: var(--erp-typography-content1-font-size);
    line-height: var(--erp-typography-content1-line-height);
}

.audit-record-row:last-child {
    border-bottom: 0;
}

.audit-history-round {
    margin-top: var(--erp-spacing-12);
}

.audit-history-round:first-of-type {
    margin-top: 0;
}

.audit-history-round-title {
    margin-bottom: var(--erp-spacing-8);
    color: var(--erp-color-text-secondary-strong);
    font-size: var(--erp-typography-title3-font-size);
    font-weight: var(--erp-typography-title3-font-weight);
    line-height: var(--erp-typography-title3-line-height);
}

.audit-approver {
    display: flex;
    align-items: center;
    gap: var(--erp-spacing-8);
}

.audit-avatar {
    width: 24px;
    height: 24px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    background: var(--erp-color-bg-status-review);
    color: var(--erp-color-text-status-review);
    font-size: var(--erp-typography-note-font-size);
    font-weight: var(--erp-typography-title3-font-weight);
}

.audit-result-content {
    min-width: 0;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--erp-spacing-4);
}

.audit-result-content small {
    max-width: 100%;
    color: var(--erp-color-text-secondary);
    font-size: var(--erp-typography-note-font-size);
    line-height: var(--erp-typography-note-line-height);
    overflow-wrap: anywhere;
    white-space: pre-line;
}

.audit-result-pill {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    height: 24px;
    padding: 0 var(--erp-spacing-8);
    border-radius: var(--erp-radius-control-default);
    font-size: var(--erp-typography-note-font-size);
    font-weight: var(--erp-typography-title3-font-weight);
    line-height: var(--erp-typography-note-line-height);
}

.audit-result-pill.submitted,
.audit-result-pill.approved {
    background: var(--erp-color-bg-status-complete);
    color: var(--erp-color-text-status-complete);
}

.audit-result-pill.processing {
    background: var(--erp-color-bg-status-review);
    color: var(--erp-color-text-status-review);
}

.audit-result-pill.finished {
    background: var(--erp-color-fill-control-secondary);
    color: var(--erp-color-text-secondary-strong);
}

.audit-result-pill.rejected {
    background: var(--erp-color-bg-status-error-subtle);
    color: var(--erp-color-text-status-error);
}

.audit-result-pill.default {
    background: transparent;
    color: var(--erp-color-text-secondary);
}

.audit-dialog-footer {
    min-height: 64px;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: var(--erp-spacing-12);
    padding: var(--erp-spacing-12) var(--erp-spacing-20);
    border-top: 1px solid var(--erp-color-divider-default);
    background: var(--erp-color-fill-default);
}

.audit-agree,
.audit-reject,
.audit-readonly {
    width: 112px;
    height: var(--erp-size-control-height-md);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: var(--erp-spacing-4);
    border-radius: var(--erp-radius-control-default);
    font-size: var(--erp-typography-title2-font-size);
    font-weight: var(--erp-typography-title2-font-weight);
    line-height: var(--erp-typography-title2-line-height);
    cursor: pointer;
}

.audit-agree {
    border: 1px solid var(--erp-color-action-primary);
    background: var(--erp-color-action-primary);
    color: var(--erp-color-text-white);
}

.audit-reject {
    border: 1px solid var(--erp-color-border-error);
    background: var(--erp-color-fill-default);
    color: var(--erp-color-text-status-error);
}

.audit-reject:not(:disabled):hover {
    background: var(--erp-color-bg-status-error-subtle);
}

.audit-readonly {
    border: 1px solid var(--erp-color-border-muted);
    background: var(--erp-color-fill-disabled);
    color: var(--erp-color-text-disabled);
    cursor: not-allowed;
}

.audit-readonly :deep(.iconify) {
    width: var(--erp-size-icon-default);
    height: var(--erp-size-icon-default);
}

.dialog-button.danger {
    border: 1px solid var(--erp-color-border-error);
    background: var(--erp-color-fill-default);
    color: var(--erp-color-text-status-error);
}

.dialog-button.danger:not(:disabled):hover {
    background: var(--erp-color-bg-status-error-subtle);
}

.reject-reason-field {
    width: 384px;
    display: grid;
    grid-template-columns: 92px minmax(0, 1fr);
    align-items: start;
    gap: var(--erp-spacing-12);
    margin: 0 auto;
}

.reject-reason-field textarea {
    width: 100%;
    border: 1px solid var(--erp-color-border-default);
    border-radius: var(--erp-radius-control-default);
    outline: 0;
    background: var(--erp-color-fill-default);
    color: var(--erp-color-text-primary);
    font: inherit;
}

.reject-reason-field textarea {
    min-height: 96px;
    padding: 7px var(--erp-spacing-8);
    resize: none;
    line-height: var(--erp-typography-content1-line-height);
}

.reject-reason-field textarea:focus {
    border-color: var(--erp-color-border-brand);
}

.reject-reason-field textarea:disabled {
    border-color: var(--erp-color-border-muted);
    background: var(--erp-color-fill-disabled);
    color: var(--erp-color-text-disabled);
    cursor: not-allowed;
}

</style>
