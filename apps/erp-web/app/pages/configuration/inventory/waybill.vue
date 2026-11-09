<template>
    <div class="waybill-page">
        <header class="topbar">
            <ErpBreadcrumb icon="lucide:truck" :items="waybillBreadcrumbItems" />
            <ErpSearchBox v-model="searchText" :disabled="isLoadingWaybills" @search="applySearch" />
        </header>

        <nav class="waybill-tabs" aria-label="运单方向">
            <button type="button" :class="{ active: activeDirection === 'send' }" @click="switchDirection('send')">寄件</button>
            <button v-if="!isSellerReadonly" type="button" :class="{ active: activeDirection === 'receive' }" @click="switchDirection('receive')">收件</button>
        </nav>

        <div class="filter-row">
            <label class="filter-field">
                <span>物流公司</span>
                <select v-model="draftCompany" aria-label="筛选物流公司">
                    <option value="">请选择</option>
                    <option
                        v-for="company in logisticsCompanyOptions"
                        :key="company"
                        :value="company"
                    >
                        {{ company }}
                    </option>
                </select>
            </label>

            <label class="filter-field">
                <span>业务类型</span>
                <select v-model="draftBusinessType" aria-label="筛选业务类型">
                    <option value="">请选择</option>
                    <option
                        v-for="type in (activeDirection === 'receive' ? receiveBusinessTypeOptions : sendBusinessTypeOptions)"
                        :key="type"
                        :value="type"
                    >
                        {{ type }}
                    </option>
                </select>
            </label>

            <div ref="dateRangeFilterRef" class="filter-field date-filter">
                <span>日期</span>
                <div class="date-range-picker">
                    <button
                        class="date-range-trigger"
                        type="button"
                        aria-label="筛选寄件日期范围"
                        :aria-expanded="isDateRangePickerOpen"
                        @click.stop="toggleDateRangePicker"
                    >
                        <span :class="{ placeholder: !dateRangeLabel }">
                            {{ dateRangeLabel || "请选择范围" }}
                        </span>
                        <Icon name="lucide:calendar-days" class="date-range-icon" />
                    </button>

                    <div
                        v-if="isDateRangePickerOpen"
                        class="date-range-panel"
                        @click.stop
                    >
                        <section
                            v-for="calendar in calendarPanels"
                            :key="calendar.key"
                            class="calendar-panel"
                            :aria-label="calendar.label"
                        >
                            <header class="calendar-header">
                                <h3>{{ calendar.title }}</h3>
                                <div class="calendar-nav">
                                    <button
                                        type="button"
                                        :aria-label="`${calendar.label}上一月`"
                                        @click="shiftCalendarMonth(-1)"
                                    >
                                        <Icon name="lucide:chevron-left" />
                                    </button>
                                    <button
                                        type="button"
                                        :aria-label="`${calendar.label}下一月`"
                                        @click="shiftCalendarMonth(1)"
                                    >
                                        <Icon name="lucide:chevron-right" />
                                    </button>
                                </div>
                            </header>

                            <div class="calendar-weekdays">
                                <span
                                    v-for="weekday in calendarWeekdays"
                                    :key="`${calendar.key}-${weekday}`"
                                >
                                    {{ weekday }}
                                </span>
                            </div>

                            <div class="calendar-days">
                                <button
                                    v-for="(day, index) in calendar.days"
                                    :key="day.value || `${calendar.key}-empty-${index}`"
                                    class="calendar-day"
                                    :class="getCalendarDayClass(day)"
                                    type="button"
                                    :disabled="!day.value"
                                    @click="selectCalendarDate(day)"
                                >
                                    {{ day.day }}
                                </button>
                            </div>

                            <button class="today-button" type="button" @click="selectToday">
                                今天
                            </button>
                        </section>
                    </div>
                </div>
            </div>

            <label class="filter-field text-filter">
                <span>订单号</span>
                <input v-model="draftRelatedOrderNo" type="text" placeholder="请输入订单号">
            </label>

            <label v-if="!isSellerReadonly" class="filter-field text-filter">
                <span>销售人员</span>
                <input v-model="draftSalesperson" type="text" placeholder="请输入销售人员">
            </label>

            <label class="filter-field sort-filter">
                <span>日期排序</span>
                <select v-model="draftSortOrder" aria-label="日期排序">
                    <option value="desc">从新到旧</option>
                    <option value="asc">从旧到新</option>
                </select>
            </label>

            <label class="filter-field text-filter">
                <span>运单号</span>
                <input v-model="draftTrackingNo" type="text" placeholder="请输入运单号" aria-label="筛选运单号">
            </label>

            <div class="filter-actions">
                <button class="outline-button" type="button" @click="resetFilters">
                    <Icon name="lucide:refresh-cw" class="button-icon" />
                    <span>重置</span>
                </button>
                <button
                    class="muted-button"
                    :class="{ active: hasPendingFilters }"
                    type="button"
                    @click="applyFilters"
                >
                    <Icon name="lucide:sliders-horizontal" class="button-icon" />
                    <span>筛选</span>
                </button>
            </div>
        </div>

        <div class="toolbar">
            <div class="toolbar-left">
                <button v-if="!isReadonly" class="primary-button" type="button" @click="openCreateDialog">
                    <Icon name="lucide:circle-plus" class="button-icon" />
                    <span>新建</span>
                </button>
                <button v-if="!isReadonly" class="outline-button" type="button" @click="openImportDialog">
                    <Icon name="lucide:download" class="button-icon" />
                    <span>导入</span>
                </button>
                <button class="outline-button" type="button" @click="exportWaybills">
                    <Icon name="lucide:upload" class="button-icon" />
                    <span>{{ selectedWaybillIds.length ? '导出选中' : '导出' }}</span>
                </button>
                <button
                    v-if="!isReadonly"
                    class="outline-button danger-button"
                    type="button"
                    :disabled="selectedWaybillIds.length === 0"
                    @click="batchDeleteWaybills"
                >
                    <Icon name="lucide:trash-2" class="button-icon" />
                    <span>批量删除</span>
                </button>
            </div>

            <button class="text-button" type="button" @click="openColumnConfigDialog">
                <Icon name="lucide:columns-3" class="button-icon" />
                <span>配置列</span>
            </button>
        </div>

        <ErpTableFrame
            data-inventory-copy-table
            :columns="waybillTableColumnTemplate"
            :minimum-width="waybillTableMinimumWidth"
            :loading="isLoadingWaybills"
            :empty="!isLoadingWaybills && visibleWaybills.length === 0"
            loading-text="正在加载运单..."
            empty-text="暂无匹配运单"
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
                                :disabled="selectableWaybills.length === 0"
                                aria-label="选择全部运单"
                                @change="toggleSelectAll"
                            >
                        </label>
                    </div>
                    <div
                        v-for="(column, index) in displayedColumns"
                        :key="column.key"
                        class="table-cell"
                        :class="{
                            'waybill-locked-cell': column.locked,
                            'erp-table-fixed-start': index === lockedColumns.length - 1,
                        }"
                        :style="column.locked ? { left: getLockedColumnLeft(index) } : undefined"
                    >
                        {{ column.key === "sentAt" ? `${directionLabel}时间` : column.label }}
                    </div>
                    <div class="action-head erp-table-fixed-end">操作</div>
                </div>
            </template>

            <template v-for="waybill in visibleWaybills" :key="waybill.id">
                <div class="table-row data-row">
                    <div class="selection-row checkbox-cell">
                        <label class="checkbox-control">
                            <input
                                v-model="selectedWaybillIds"
                                class="row-checkbox"
                                type="checkbox"
                                :value="waybill.id"
                                :aria-label="`选择${waybill.waybillNo}`"
                            >
                        </label>
                    </div>
                    <div
                        v-for="(column, index) in displayedColumns"
                        :key="`${waybill.id}-${column.key}`"
                        class="table-cell"
                        :data-copy-value="column.key === 'trackingNo' || column.key === 'transportStatus'
                            ? getWaybillCellValue(waybill, column.key)
                            : undefined"
                        :class="[
                            getCellClass(column.key),
                            {
                                'waybill-locked-cell': column.locked,
                                'erp-table-fixed-start': index === lockedColumns.length - 1,
                            },
                        ]"
                        :style="column.locked ? { left: getLockedColumnLeft(index) } : undefined"
                    >
                        <template v-if="column.key === 'image'">
                            <img
                                v-if="waybill.images?.length"
                                :src="waybill.images[0].url"
                                :alt="waybill.goods"
                                class="clickable-image"
                                @click="openImagePreview(waybill.images, 0, waybill.goods || waybill.trackingNo)"
                            >
                            <span v-else>--</span>
                        </template>
                        <template v-else-if="column.key === 'trackingNo'">
                            <div class="tracking-number-cell">
                                <span class="ellipsis-text">{{ getWaybillCellValue(waybill, column.key) }}</span>
                                <span v-if="waybill.needsSupplement" class="supplement-tag">待补录</span>
                            </div>
                        </template>
                        <template v-else-if="column.key === 'transportStatus'">
                            <div v-if="getWaybillTransportRecord(waybill)" class="transport-cell">
                                <span
                                    class="status-tag"
                                    :data-status="getWaybillTransportRecord(waybill)?.transportStatus"
                                >
                                    {{ getWaybillTransportRecord(waybill)?.transportStatus }}
                                </span>
                                <button
                                    v-if="getWaybillTransportRecord(waybill)?.transportTraces.length"
                                    class="trace-link"
                                    type="button"
                                    @click="openTraceDialog(getWaybillTransportRecord(waybill)!)"
                                >
                                    查看轨迹
                                </button>
                            </div>
                            <span v-else>--</span>
                        </template>
                        <template v-else-if="column.key === 'acceptanceStatus'">
                            <span
                                v-if="waybill.purchaseLogistics"
                                class="status-tag"
                                :data-status="waybill.purchaseLogistics.acceptanceStatus"
                            >
                                {{ waybill.purchaseLogistics.acceptanceStatus }}
                            </span>
                            <span v-else>--</span>
                        </template>
                        <template v-else-if="column.key === 'acceptanceForm'">
                            <button
                                v-if="waybill.purchaseLogistics && canAcceptLogistics && (waybill.purchaseLogistics.transportStatus === '待取货' || waybill.purchaseLogistics.transportStatus === '已签收') && waybill.purchaseLogistics.acceptanceStatus === '待验收'"
                                class="trace-link"
                                type="button"
                                :disabled="Boolean(loadingAcceptanceWaybillId)"
                                @click="openAcceptanceDialog(waybill)"
                            >
                                {{ loadingAcceptanceWaybillId === waybill.id ? "加载中..." : "填写" }}
                            </button>
                            <button
                                v-else-if="waybill.purchaseLogistics && waybill.purchaseLogistics.acceptanceStatus !== '待验收'"
                                class="trace-link"
                                type="button"
                                @click="openAcceptanceView(waybill.purchaseLogistics)"
                            >
                                查看
                            </button>
                            <span v-else>--</span>
                        </template>
                        <el-popover
                            v-else-if="column.key === 'remark' && shouldShowPopover(waybill, column.key)"
                            trigger="hover"
                            placement="top"
                            :width="300"
                            popper-class="erp-app waybill-remark-popover"
                        >
                            <div class="remark-popover-content">{{ getWaybillCellValue(waybill, column.key) }}</div>
                            <template #reference>
                                <span class="ellipsis-text">{{ getWaybillCellValue(waybill, column.key) }}</span>
                            </template>
                        </el-popover>
                        <span v-else class="ellipsis-text">{{ getWaybillCellValue(waybill, column.key) }}</span>
                    </div>
                    <div class="action-row actions-cell erp-table-fixed-end">
                        <button
                            v-if="!isSellerReadonly"
                            class="icon-button blue"
                            type="button"
                            :disabled="!waybill.trackingNo"
                            :aria-label="`查看物流${waybill.trackingNo}`"
                            title="查看实时物流"
                            @click="trackingTarget = { id: waybill.id, waybills: [{ trackingNo: waybill.trackingNo, courierCompany: waybill.company }] }"
                        ><Icon name="lucide:truck" /></button>
                        <button
                            v-if="isReadonly"
                            class="icon-button blue"
                            type="button"
                            :aria-label="`查看${waybill.waybillNo}`"
                            @click="openViewDialog(waybill)"
                        >
                            <Icon name="lucide:list" />
                        </button>
                        <button
                            v-if="!isSellerReadonly"
                            class="icon-button blue"
                            type="button"
                            :disabled="!getWaybillAttachments(waybill).length"
                            :aria-label="`下载${waybill.waybillNo}附件`"
                            @click="downloadWaybillAttachments(waybill)"
                        >
                            <Icon name="lucide:download" />
                        </button>
                        <button
                            v-if="!isReadonly && !isPurchaseLogisticsWaybill(waybill)"
                            class="icon-button blue"
                            type="button"
                            :aria-label="`编辑${waybill.waybillNo}`"
                            @click="openEditDialog(waybill)"
                        >
                            <Icon name="lucide:square-pen" />
                        </button>
                        <button
                            v-if="!isReadonly && !isPurchaseLogisticsWaybill(waybill)"
                            class="icon-button delete"
                            type="button"
                            :aria-label="`删除${waybill.waybillNo}`"
                            @click="deleteWaybill(waybill)"
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
            :total="totalWaybills"
            :page-size-options="pageSizeOptions"
            :page-numbers="pageNumbers"
            :total-pages="totalPages"
            :current-page="currentPage"
            @page-change="handlePageChange"
            @jump="handleJumpToPage"
        />

        <div
            v-if="showWaybillDialog"
            class="dialog-mask"
            role="presentation"
            @click.self="waybillDialogMode !== 'create' && closeWaybillDialog()"
        >
            <ErpDialogFrame
                class="waybill-dialog"
                :title="waybillDialogTitle"
                @submit.prevent="confirmWaybillDialog"
                @close="closeWaybillDialog"
            >
                <div class="waybill-form-body" :class="{ readonly: waybillDialogMode === 'view' }">
                    <label class="form-row">
                        <span class="field-label required">快递公司</span>
                        <SearchableSelect
                            v-model="waybillForm.company"
                            :options="logisticsCompanySelectOptions"
                            :disabled="waybillDialogMode === 'view'"
                            placeholder="请选择"
                            aria-label="快递公司"
                        />
                    </label>

                    <label class="form-row">
                        <span class="field-label required">运单号</span>
                        <input
                            v-model="waybillForm.trackingNo"
                            type="text"
                            required
                            :readonly="waybillDialogMode === 'view'"
                            aria-label="运单号"
                        >
                    </label>

                    <label class="form-row">
                        <span class="field-label required">托寄物</span>
                        <input
                            v-model="waybillForm.goods"
                            type="text"
                            required
                            :readonly="waybillDialogMode === 'view'"
                            aria-label="托寄物"
                        >
                    </label>

                    <label class="form-row">
                        <span class="field-label required">业务类型</span>
                        <div class="business-type-select">
                            <SearchableSelect
                                v-model="waybillForm.businessType"
                                :options="currentBusinessTypeSelectOptions"
                                :disabled="waybillDialogMode === 'view'"
                                placeholder="请选择"
                                aria-label="业务类型"
                            />
                            <p v-if="!isSellerReadonly && waybillForm.direction === 'send'">需要填写快递外箱明细在备注中</p>
                        </div>
                    </label>

                    <label v-if="waybillForm.direction === 'send' && requiresRelatedOrder" class="form-row">
                        <span class="field-label required">订单号</span>
                        <RemoteSelect
                            v-model:id="selectedSalesOrderId"
                            v-model:label="waybillForm.relatedOrderNo"
                            :fetch-options="fetchSalesOrderOptions"
                            :disabled="waybillDialogMode === 'view'"
                            required
                            placeholder="请选择销售订单"
                            aria-label="订单号"
                        />
                    </label>

                    <label v-if="!isSellerReadonly && (waybillForm.direction === 'send' || waybillForm.direction === 'receive')" class="form-row textarea-row">
                        <span class="field-label" :class="{ required: waybillForm.direction === 'send' }">备注</span>
                        <textarea
                            v-model="waybillForm.remark"
                            :required="waybillForm.direction === 'send'"
                            :readonly="waybillDialogMode === 'view'"
                            aria-label="备注"
                            :placeholder="waybillForm.direction === 'send' ? '请填写各箱外箱明细' : '请输入收件备注'"
                        />
                    </label>

                    <div ref="sentAtPickerRef" class="form-row">
                        <span class="field-label required">{{ directionTimeLabel }}</span>
                        <div class="datetime-picker">
                            <button
                                class="datetime-trigger"
                                type="button"
                                :disabled="waybillDialogMode === 'view'"
                                :aria-expanded="isSentAtPickerOpen"
                                :aria-label="`选择${directionTimeLabel}`"
                                @click.stop="toggleSentAtPicker"
                            >
                                <span :class="{ placeholder: !waybillForm.sentAt }">
                                    {{ sentAtLabel }}
                                </span>
                                <Icon name="lucide:calendar" />
                            </button>

                            <div
                                v-if="isSentAtPickerOpen"
                                class="datetime-panel"
                                @click.stop
                            >
                                <section class="single-calendar-panel" :aria-label="`选择${directionTimeLabel}`">
                                    <header class="calendar-header">
                                        <h3>{{ sentAtCalendarTitle }}</h3>
                                        <div class="calendar-nav">
                                            <button
                                                type="button"
                                                :aria-label="`${directionTimeLabel}上一月`"
                                                @click="shiftSentAtCalendarMonth(-1)"
                                            >
                                                <Icon name="lucide:chevron-left" />
                                            </button>
                                            <button
                                                type="button"
                                                :aria-label="`${directionTimeLabel}下一月`"
                                                @click="shiftSentAtCalendarMonth(1)"
                                            >
                                                <Icon name="lucide:chevron-right" />
                                            </button>
                                        </div>
                                    </header>

                                    <div class="calendar-weekdays">
                                        <span
                                            v-for="weekday in calendarWeekdays"
                                            :key="`${activeDirection}-at-${weekday}`"
                                        >
                                            {{ weekday }}
                                        </span>
                                    </div>

                                    <div class="calendar-days">
                                        <button
                                            v-for="(day, index) in sentAtCalendarDays"
                                            :key="day.value || `sent-at-empty-${index}`"
                                            class="calendar-day"
                                            :class="getSentAtCalendarDayClass(day)"
                                            type="button"
                                            :disabled="!day.value"
                                            @click="selectSentAtDate(day)"
                                        >
                                            {{ day.day }}
                                        </button>
                                    </div>

                                    <button class="today-button" type="button" @click="selectSentAtToday">
                                        今天
                                    </button>
                                </section>
                            </div>
                        </div>
                    </div>

                    <label class="form-row">
                        <span class="field-label required">{{ waybillForm.direction === 'receive' ? '发货地' : '发货地' }}</span>
                        <input
                            v-model="waybillForm.senderAddress"
                            type="text"
                            :readonly="waybillDialogMode === 'view'"
                            aria-label="发货地"
                        >
                    </label>

                    <label class="form-row">
                        <span class="field-label required">收货地</span>
                        <input
                            v-model="waybillForm.receiverAddress"
                            type="text"
                            required
                            :readonly="waybillDialogMode === 'view'"
                            aria-label="收货地"
                        >
                    </label>

                    <label class="form-row">
                        <span class="field-label required">{{ waybillForm.direction === 'receive' ? '收件人' : '寄件人' }}</span>
                        <input
                            v-model="waybillForm.receiverName"
                            type="text"
                            required
                            :readonly="waybillDialogMode === 'view'"
                            :aria-label="waybillForm.direction === 'receive' ? '寄件人' : '收件人'"
                        >
                    </label>

                    <div v-if="!isSellerReadonly" class="form-row upload-row">
                        <span class="field-label required">图片</span>
                        <div class="upload-field">
                            <div v-if="uploadedImages.length" class="uploaded-file-list">
                                <div
                                    v-for="(file, index) in uploadedImages"
                                    :key="`${file.name}-${index}`"
                                    class="uploaded-file"
                                    :class="{ 'previewable-file': Boolean(file.url) }"
                                    :role="file.url ? 'button' : undefined"
                                    :tabindex="file.url ? 0 : undefined"
                                    @click="openUploadedImagePreview(file)"
                                    @keydown.enter.prevent="openUploadedImagePreview(file)"
                                    @keydown.space.prevent="openUploadedImagePreview(file)"
                                >
                                    <Icon name="lucide:image" />
                                    <span>{{ file.name }}</span>
                                    <button v-if="waybillDialogMode !== 'view'" type="button" @click.stop="removeImage(index)">移除</button>
                                </div>
                            </div>
                            <label
                                v-if="waybillDialogMode !== 'view'"
                                class="upload-box"
                                @dragover.prevent
                                @drop.prevent="handleImageDrop"
                            >
                                <input
                                    ref="imageInput"
                                    type="file"
                                    accept="image/*"
                                    multiple
                                    aria-label="上传图片"
                                    @change="handleImageFileChange"
                                >
                                <Icon name="lucide:upload" class="upload-icon" />
                                <span>您的文件拖拽到这里</span>
                            </label>
                            <p>单个文件不超过10MB，列表中展示第一张图片</p>
                        </div>
                    </div>

                    <div v-if="!isSellerReadonly" class="form-row upload-row">
                        <span class="field-label">附件</span>
                        <div class="upload-field">
                            <div v-if="uploadedAttachments.length" class="uploaded-file-list">
                                <div
                                    v-for="(file, index) in uploadedAttachments"
                                    :key="`${file.name}-${index}`"
                                    class="uploaded-file"
                                >
                                    <Icon name="lucide:paperclip" />
                                    <span>{{ file.name }}</span>
                                    <button v-if="waybillDialogMode !== 'view'" type="button" @click="removeAttachment(index)">移除</button>
                                </div>
                            </div>
                            <label
                                v-if="waybillDialogMode !== 'view'"
                                class="upload-box attachment"
                                @dragover.prevent
                                @drop.prevent="handleAttachmentDrop"
                            >
                                <input
                                    ref="attachmentInput"
                                    type="file"
                                    multiple
                                    aria-label="上传附件"
                                    @change="handleAttachmentFileChange"
                                >
                                <Icon name="lucide:upload" class="upload-icon" />
                                <span>请将文件拖拽到这里或点击选择</span>
                            </label>
                            <p>单个文件不超过10MB</p>
                        </div>
                    </div>
                </div>

                <template #footer>
                    <button class="dialog-button cancel" type="button" @click="closeWaybillDialog">
                        {{ waybillDialogMode === "view" ? "关闭" : "取消" }}
                    </button>
                    <button v-if="waybillDialogMode !== 'view'" class="dialog-button confirm" type="submit" :disabled="isSubmittingWaybill">
                        {{ isSubmittingWaybill ? "提交中" : "确认" }}
                    </button>
                </template>
            </ErpDialogFrame>
        </div>

        <div v-if="!isSellerReadonly && showTraceDialog" class="erp-dialog-mask" @click.self="closeTraceDialog">
            <ErpDialogFrame
                title="物流轨迹"
                width="680px"
                height="min(680px, calc(100vh - 32px))"
                :form="false"
                @close="closeTraceDialog"
            >
                <div class="trace-dialog">
                    <div class="trace-dialog-head">
                        <span>{{ activeTraceRecord?.courierCompany || "物流轨迹" }}</span>
                        <strong>{{ activeTraceRecord?.trackingNo }}</strong>
                    </div>
                    <div v-if="activeTraceRecord?.transportTraces?.length" class="trace-list">
                        <div
                            v-for="(trace, index) in [...activeTraceRecord.transportTraces].reverse()"
                            :key="`${trace.acceptTime}-${index}`"
                            class="trace-item"
                        >
                            <span class="trace-dot" :class="{ current: index === 0 }" />
                            <div>
                                <strong>{{ trace.acceptStation }}</strong>
                                <small>
                                    {{ formatTraceDate(trace.acceptTime) }}
                                    <template v-if="trace.location"> · {{ trace.location }}</template>
                                </small>
                            </div>
                        </div>
                    </div>
                    <div v-else class="trace-empty">
                        <Icon name="lucide:clock-3" /> 暂无物流轨迹，等待接口同步
                    </div>
                </div>
            </ErpDialogFrame>
        </div>

        <div
            v-if="!isSellerReadonly && showAcceptanceDialog"
            class="erp-dialog-mask acceptance-dialog-mask"
            @click.self="closeAcceptanceDialog"
        >
            <ErpDialogFrame
                class="acceptance-dialog"
                :title="acceptanceReadonly ? '查看验收入库单' : '新建验收入库单'"
                width="calc(100vw - 32px)"
                height="calc(100vh - 32px)"
                :form="false"
                :show-footer="!acceptanceReadonly"
                :close-disabled="isSubmittingAcceptance || isUploadingAcceptanceEvidence || isUploadingAcceptanceImages"
                @close="closeAcceptanceDialog"
            >
                <div class="acceptance-body">
                    <section class="acceptance-section acceptance-basic-section">
                        <h3 class="acceptance-section-title">基本信息</h3>
                        <div class="acceptance-basic-grid">
                            <label class="acceptance-form-field acceptance-order-field">
                                <span>采购单号</span>
                                <input :value="activeLogisticsRecord?.purchaseOrderNo || '--'" readonly>
                            </label>
                            <label class="acceptance-form-field acceptance-waybill-field">
                                <span>运单号</span>
                                <input :value="activeLogisticsRecord?.trackingNo || '--'" readonly>
                            </label>
                            <label v-if="acceptanceReadonly" class="acceptance-form-field acceptance-operator-field">
                                <span>验收人</span>
                                <input :value="activeLogisticsRecord?.acceptedBy || '--'" readonly>
                            </label>
                            <label class="acceptance-form-field acceptance-remark">
                                <span>验收备注</span>
                                <textarea
                                    v-model="acceptanceRemark"
                                    :readonly="acceptanceReadonly"
                                    placeholder="请输入损坏、少到或其他验收说明"
                                />
                            </label>
                            <div class="acceptance-form-field acceptance-evidence-field acceptance-images-field required">
                                <span>验收图片</span>
                                <div class="acceptance-evidence-content">
                                    <div v-if="acceptanceImages.length" class="acceptance-evidence-list">
                                        <div
                                            v-for="(file, index) in acceptanceImages"
                                            :key="`${file.url}-${index}`"
                                            class="acceptance-evidence-file"
                                        >
                                            <Icon name="lucide:paperclip" />
                                            <button type="button" :title="file.name" @click="downloadAcceptanceAttachment(file)">
                                                {{ file.name }}
                                            </button>
                                            <button
                                                v-if="!acceptanceReadonly"
                                                class="remove-button"
                                                type="button"
                                                :disabled="isUploadingAcceptanceImages"
                                                @click="removeAcceptanceImage(index)"
                                            >
                                                移除
                                            </button>
                                        </div>
                                    </div>
                                    <label
                                        v-if="!acceptanceReadonly"
                                        class="acceptance-upload-box"
                                        :class="{ disabled: isUploadingAcceptanceImages }"
                                        @dragover.prevent
                                        @drop.prevent="handleAcceptanceImageDrop"
                                    >
                                        <input
                                            type="file"
                                            multiple
                                            accept="image/*"
                                            :disabled="isUploadingAcceptanceImages"
                                            aria-label="上传验收图片"
                                            @change="handleAcceptanceImageChange"
                                        >
                                        <Icon name="lucide:upload" />
                                        <span>{{ isUploadingAcceptanceImages ? "上传中..." : "拖拽或点击上传" }}</span>
                                    </label>
                                    <p v-if="acceptanceReadonly && !acceptanceImages.length">暂无验收图片</p>
                                    <p v-else-if="!acceptanceReadonly">验收时必传，单个文件不超过10MB</p>
                                </div>
                            </div>
                        </div>
                    </section>

                    <section class="acceptance-section acceptance-detail-section">
                        <h3 class="acceptance-section-title">验收明细</h3>
                        <div class="acceptance-table-scroll">
                            <div class="acceptance-table">
                                <div class="acceptance-row acceptance-head">
                                    <span>采购单号</span>
                                    <span>产品</span>
                                    <span>采购剩余</span>
                                    <span>本次运单</span>
                                    <span>实际到货</span>
                                    <span>合格数量</span>
                                    <span>不合格数量</span>
                                    <span>入库仓库 / 库位</span>
                                </div>
                                <div v-for="item in acceptanceFormItems" :key="item.productId" class="acceptance-row">
                                    <span>{{ activeLogisticsRecord?.purchaseOrderNo || "--" }}</span>
                                    <span class="product-name" :title="item.productName">
                                        {{ item.productName }}
                                        <small>{{ item.productModel || item.productCode }}</small>
                                    </span>
                                    <span>{{ formatAcceptanceQuantity(item.remainingQuantity) }} {{ item.unitName }}</span>
                                    <span class="acceptance-waybill-info">
                                        {{ activeLogisticsRecord?.courierCompany || "--" }}
                                        <small>{{ activeLogisticsRecord?.trackingNo || "--" }}</small>
                                        <small>应收 {{ formatAcceptanceQuantity(item.expectedQuantity) }} {{ item.unitName }}</small>
                                    </span>
                                    <input v-model.number="item.receivedQuantity" type="number" min="0" step="0.001" :readonly="acceptanceReadonly" aria-label="实际到货数量">
                                    <span class="inbound-quantity">
                                        {{ formatAcceptanceQuantity(getAcceptanceInboundQuantity(item)) }} {{ item.unitName }}
                                    </span>
                                    <input v-model.number="item.damagedQuantity" type="number" min="0" step="0.001" :readonly="acceptanceReadonly" aria-label="不合格数量">
                                    <InventoryWarehouseCascader
                                        :warehouse-options="warehouseOptions"
                                        :warehouse-id="item.warehouseId || ''"
                                        :location-id="item.locationId || ''"
                                        :label="item.targetWarehouse"
                                        :disabled="acceptanceReadonly || getAcceptanceInboundQuantity(item) <= 0"
                                        :allow-warehouse-select="true"
                                        :aria-label="`选择${item.productName}入库仓库和库位`"
                                        @select="(warehouseId, locationId, label) => selectAcceptanceWarehouse(item, warehouseId, locationId, label)"
                                    />
                                </div>
                            </div>
                        </div>
                    </section>

                    <div class="acceptance-result-section">
                        <div class="acceptance-result-indicator" :class="{ abnormal: isAcceptanceAbnormal }">
                            <Icon :name="isAcceptanceAbnormal ? 'lucide:plus' : 'lucide:circle-check'" />
                            <span>{{ isAcceptanceAbnormal ? "异常" : "验收正常" }}</span>
                        </div>
                        <div
                            v-if="isAcceptanceEvidenceRequired || acceptanceAttachments.length"
                            class="acceptance-form-field acceptance-evidence-field"
                            :class="{ required: !acceptanceReadonly && isAcceptanceEvidenceRequired }"
                        >
                            <span>异常材料</span>
                            <div class="acceptance-evidence-content">
                                <div v-if="acceptanceAttachments.length" class="acceptance-evidence-list">
                                    <div
                                        v-for="(file, index) in acceptanceAttachments"
                                        :key="`${file.url}-${index}`"
                                        class="acceptance-evidence-file"
                                    >
                                        <Icon name="lucide:paperclip" />
                                        <button type="button" :title="file.name" @click="downloadAcceptanceAttachment(file)">
                                            {{ file.name }}
                                        </button>
                                        <button
                                            v-if="!acceptanceReadonly"
                                            class="remove-button"
                                            type="button"
                                            :disabled="isUploadingAcceptanceEvidence"
                                            @click="removeAcceptanceAttachment(index)"
                                        >
                                            移除
                                        </button>
                                    </div>
                                </div>
                                <label
                                    v-if="!acceptanceReadonly"
                                    class="acceptance-upload-box"
                                    :class="{ disabled: isUploadingAcceptanceEvidence }"
                                    @dragover.prevent
                                    @drop.prevent="handleAcceptanceEvidenceDrop"
                                >
                                    <input
                                        ref="acceptanceEvidenceInput"
                                        type="file"
                                        multiple
                                        :disabled="isUploadingAcceptanceEvidence"
                                        :aria-required="isAcceptanceEvidenceRequired"
                                        aria-label="上传异常材料"
                                        @change="handleAcceptanceEvidenceChange"
                                    >
                                    <Icon name="lucide:upload" />
                                    <span>{{ isUploadingAcceptanceEvidence ? "上传中..." : "拖拽或点击上传" }}</span>
                                </label>
                                <p v-if="acceptanceReadonly && !acceptanceAttachments.length">暂无异常材料</p>
                                <p v-else-if="!acceptanceReadonly">不合格数量大于0时必须上传异常材料，单个文件不超过10MB</p>
                            </div>
                        </div>
                    </div>
                </div>
                <template #footer>
                    <button class="outline-button acceptance-action-button" type="button" :disabled="isSubmittingAcceptance || isUploadingAcceptanceEvidence || isUploadingAcceptanceImages" @click="closeAcceptanceDialog">取消</button>
                    <button class="primary-button acceptance-action-button" type="button" :disabled="isSubmittingAcceptance || isUploadingAcceptanceEvidence || isUploadingAcceptanceImages" @click="submitAcceptance">确认</button>
                </template>
            </ErpDialogFrame>
        </div>

        <ColumnConfigDialog
            v-if="showColumnConfigDialog"
            :column-configs="availableColumnConfigs"
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
            v-if="!isSellerReadonly"
            v-model="showImagePreview"
            :title="previewTitle"
            :images="previewImages"
            :initial-index="previewImageIndex"
            @closed="() => {}"
        />

        <div v-if="!isReadonly && showImportDialog" class="dialog-mask" role="presentation" @click.self="closeImportDialog">
            <ErpDialogFrame
                class="import-dialog"
                title="批量导入运单记录"
                width="720px"
                height="600px"
                :close-disabled="isImporting"
                :form="false"
                @close="closeImportDialog"
            >
                <div class="import-dialog-body">
                    <div class="import-section-title">上传 Excel</div>
                    <div v-if="importFileName" class="import-file-attachment">
                        <div class="import-file-info">
                            <Icon name="lucide:file-text" class="import-file-icon" />
                            <span>{{ importFileName }}</span>
                        </div>
                        <button
                            class="import-file-remove"
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
                            @change="handleImportFileChange"
                        >
                    </label>
                    <p class="import-hint">支持 .xlsx，单个文件不超过 {{ INVENTORY_IMPORT_MAX_FILE_SIZE_MB }}MB。</p>
                    <button
                        class="import-template-button"
                        type="button"
                        :disabled="isImporting"
                        @click="downloadWaybillImportTemplate"
                    >
                        下载模板（Excel）
                    </button>

                    <div class="import-section-title">字段说明</div>
                    <div class="import-hint-list">
                        <p><strong>必填字段：</strong>物流公司、单号、托寄物、业务类型、寄件时间、收货地、收件人、图片URL</p>
                        <p><strong>图片URL：</strong>导入时需要填写已上传图片地址；页面上传图片用于单条新建/编辑。</p>
                        <p><strong>日期格式：</strong>建议使用 2026-06-30。</p>
                    </div>
                    <div v-if="importResult" class="import-result">
                        <p>导入完成：成功 {{ importResult.successCount }} 条，失败 {{ importResult.failCount }} 条</p>
                        <div v-if="importResult.errors.length" class="import-errors">
                            <p v-for="err in importResult.errors" :key="err.row">
                                第 {{ err.row }} 行：{{ err.message }}
                            </p>
                        </div>
                    </div>
                </div>
                <template #footer>
                    <button class="dialog-button cancel" type="button" :disabled="isImporting" @click="closeImportDialog">取消</button>
                    <button class="dialog-button confirm" type="button" :disabled="!importFile || isImporting" @click="confirmImport">
                        {{ isImporting ? "导入中" : "开始导入" }}
                    </button>
                </template>
            </ErpDialogFrame>
        </div>
        <LogisticsTrackingDialog
            v-if="!isSellerReadonly && trackingTarget"
            context="inventory"
            :record-id="trackingTarget.id"
            :waybills="trackingTarget.waybills"
            @close="trackingTarget = null"
            @updated="loadWaybills"
        />
        <QuickInboundDialog
            v-if="!isReadonly && showQuickInboundDialog && quickInboundTarget"
            :purchase-order-no="quickInboundTarget.purchaseOrderNo"
            :courier-company="quickInboundTarget.courierCompany"
            :tracking-no="quickInboundTarget.trackingNo"
            :warehouse-options="warehouseOptions"
            @close="closeQuickInboundDialog"
            @confirm="confirmQuickInbound"
        />
    </div>
</template>

<script setup lang="ts">
import { ADMIN_ROLE } from "~~/shared/enums";
import type { InventoryWaybill, InventoryWaybillAttachment } from "~~/shared/types/inventory";
import type {
    PurchaseLogisticsAcceptanceAttachment,
    PurchaseLogisticsAcceptanceItem,
    PurchaseLogisticsRecord,
} from "~~/shared/types/purchase";
import { canAcceptPurchaseLogistics, isSellerInventoryReadonly } from "~~/shared/utils/adminPermission";
import ErpBreadcrumb from "~/components/configuration/ErpBreadcrumb.vue";
import ErpDialogFrame from "~/components/configuration/ErpDialogFrame.vue";
import LogisticsTrackingDialog from "~/components/configuration/inventory/LogisticsTrackingDialog.vue";
import QuickInboundDialog from "~/components/configuration/inventory/QuickInboundDialog.vue";
import ErpSearchBox from "~/components/configuration/ErpSearchBox.vue";
import ErpTableFrame from "~/components/configuration/ErpTableFrame.vue";
import RemoteSelect from "~/components/configuration/RemoteSelect.vue";
import ColumnConfigDialog from "~/components/configuration/inventory/basic-data/ColumnConfigDialog.vue";
import InventoryPagination from "~/components/configuration/inventory/basic-data/InventoryPagination.vue";
import ImagePreviewDialog from "~/components/configuration/inventory/ImagePreviewDialog.vue";
import InventoryWarehouseCascader from "~/components/configuration/inventory/InventoryWarehouseCascader.vue";
import type { PreviewImage } from "~/components/configuration/inventory/ImagePreviewDialog.vue";
import {
    addInventoryWaybill,
    acceptPurchaseLogistics,
    deleteInventoryWaybill,
    downloadInventoryWaybillAttachments,
    exportInventoryWaybills,
    getInventoryWaybillDetail,
    importInventoryWaybills,
    retrieveInventoryWaybills,
    retrieveInventoryLocations,
    retrieveInventoryWarehouses,
    updateInventoryWaybill,
    uploadInventoryAttachment,
} from "~/composables/api/useInventoryApi";
import { uploadImage } from "~/composables/api/useIndicesApi";
import { retrieveSalesOrderList } from "~/composables/api/useCustomerApi";
import { useInventoryPagination } from "~/composables/inventory/useInventoryPagination";
import {
    getErpTableColumnWidth,
    getErpTableGridColumn,
    getErpTableMinimumWidth,
} from "~/utils/inventory/erpTableColumns";
import {
    buildInboundLocationTree,
    type InboundWarehouseOption,
} from "~/utils/inventory/inboundFrontendMapping";
import { downloadAttachmentFile } from "~/utils/attachmentPreview";
import { erpMessageBox } from "~/utils/erpMessageBox";
import { logisticsCompanyOptions } from "~/utils/logisticsCompanyOptions";
import { formatLocalDate } from "~/utils/time";
import {
    INVENTORY_IMPORT_FILE_SIZE_MESSAGE,
    INVENTORY_IMPORT_MAX_FILE_SIZE_BYTES,
    INVENTORY_IMPORT_MAX_FILE_SIZE_MB,
} from "~~/shared/utils/inventoryImport";

definePageMeta({
    layout: "inventory",
});

const trackingTarget = ref<{ id: string; waybills: Array<{ trackingNo: string; courierCompany?: string }> } | null>(null);

const waybillBreadcrumbItems = [
    { label: "仓储管理" },
    { label: "运单管理" },
];

type WaybillColumnKey =
    | "waybillNo"
    | "company"
    | "trackingNo"
    | "relatedOrderNo"
    | "salesperson"
    | "goods"
    | "businessType"
    | "sentAt"
    | "senderAddress"
    | "receiverAddress"
    | "receiverName"
    | "transportStatus"
    | "acceptanceStatus"
    | "acceptanceForm"
    | "image"
    | "remark"
    | "reserved1"
    | "reserved2"
    | "reserved3"
    | "reserved4"
    | "reserved5";

interface WaybillColumnConfig {
    key: WaybillColumnKey;
    label: string;
    width: number;
    widthVar?: string;
    grow?: boolean;
    visible: boolean;
    locked: boolean;
}

interface WaybillAttachment extends Partial<InventoryWaybillAttachment> {
    name: string;
    url: string;
}

interface WaybillItem {
    direction: "send" | "receive";
    id: string;
    waybillNo: string;
    company: string;
    trackingNo: string;
    relatedOrderNo: string;
    salesperson: string;
    goods: string;
    goodsDisplay?: string;
    businessType: string;
    sentAt: string;
    senderAddress: string;
    receiverAddress: string;
    receiverName: string;
    sourceType?: string;
    sourceOrderId?: string;
    sourceWaybillId?: string;
    purchaseLogistics?: PurchaseLogisticsRecord;
    transportInfo?: string;
    transportTraces?: InventoryWaybill["transportTraces"];
    transportStatus?: InventoryWaybill["transportStatus"];
    transportUpdatedAt?: string | Date | null;
    transportUpdatedBy?: string;
    needsSupplement: boolean;
    image: string;
    imageName: string;
    images?: WaybillAttachment[];
    attachmentNames: string[];
    attachments?: WaybillAttachment[];
    remark: string;
    reserved1: string;
    reserved2: string;
    reserved3: string;
    reserved4: string;
    reserved5: string;
}

type AcceptanceFormItem = PurchaseLogisticsAcceptanceItem & {
    targetWarehouse: string;
};

interface UploadedPreview {
    name: string;
    url?: string;
}

interface CalendarDay {
    day: string;
    value: string;
    inMonth: boolean;
}

const businessTypeOptions = [
    "订单交付",
    "业务往来",
    "采购退货",
    "演示租赁与归还",
    "售后（退换/返修）",
    "原材料采购",
    "宣传采购",
    "研发采购",
    "给供应商发货",
    "生产工具",
    "办公用品",
    "其他",
];
const sendBusinessTypeOptions = ["订单交付", "业务往来", "演示租赁与归还", "其他"];
const receiveBusinessTypeOptions = [
    "业务往来",
    "演示租赁与归还",
    "售后（退换/返修）",
    "原材料采购",
    "宣传采购",
    "研发采购",
    "给供应商发货",
    "生产工具",
    "办公用品",
    "其他",
];
const businessTypeSelectOptions = businessTypeOptions.map((type) => ({
    label: type,
    value: type,
}));
const sendBusinessTypeSelectOptions = sendBusinessTypeOptions.map((type) => ({ label: type, value: type }));
const receiveBusinessTypeSelectOptions = receiveBusinessTypeOptions.map((type) => ({ label: type, value: type }));
const logisticsCompanySelectOptions = logisticsCompanyOptions.map((company) => ({
    label: company,
    value: company,
}));
const orderRelatedBusinessTypes = ["订单交付"];
const supplementPlaceholder = "待补录";

const columnConfigs = reactive<WaybillColumnConfig[]>([
    { key: "waybillNo", label: "记录号", width: 180, visible: false, locked: false },
    // { key: "company", label: "物流公司", width: 150, visible: true, locked: false },
    { key: "relatedOrderNo", label: "关联号", width: 170, grow: true, visible: true, locked: false },
    { key: "trackingNo", label: "运单号", width: 180, grow: true, visible: true, locked: false },
    { key: "salesperson", label: "销售人员", width: 130, visible: true, locked: false },
    { key: "goods", label: "托寄物品", width: 150, grow: true, visible: true, locked: false },
    { key: "businessType", label: "业务类型", width: 170, visible: true, locked: false },
    { key: "sentAt", label: "寄件时间", width: 180, widthVar: "--erp-table-col-date", visible: true, locked: false },
    { key: "senderAddress", label: "发货地", width: 150, grow: true, visible: true, locked: false },
    { key: "receiverAddress", label: "收货地", width: 170, grow: true, visible: true, locked: false },
    { key: "receiverName", label: "收件人", width: 130, visible: true, locked: false },
    { key: "transportStatus", label: "运输状态", width: 130, visible: true, locked: false },
    { key: "acceptanceStatus", label: "验收状态", width: 130, visible: true, locked: false },
    { key: "acceptanceForm", label: "验收入库单", width: 110, visible: true, locked: false },
    { key: "image", label: "图片", width: 130, visible: true, locked: false },
    { key: "remark", label: "备注", width: 180, widthVar: "--erp-table-col-remark", grow: true, visible: true, locked: false },
    { key: "reserved1", label: "预留字段1", width: 150, visible: false, locked: false },
    { key: "reserved2", label: "预留字段2", width: 150, visible: false, locked: false },
    { key: "reserved3", label: "预留字段3", width: 150, visible: false, locked: false },
    { key: "reserved4", label: "预留字段4", width: 150, visible: false, locked: false },
    { key: "reserved5", label: "预留字段5", width: 150, visible: false, locked: false },
]);

const waybills = ref<WaybillItem[]>([]);
const adminInfo = useState<any>("admin_info", () => ({}));
const isSellerReadonly = computed(() => isSellerInventoryReadonly(Number(adminInfo.value?.role)));
const isFinanceReadonly = computed(() => Number(adminInfo.value?.role) === ADMIN_ROLE.FINANCE_MANAGER);
const isReadonly = computed(() => isFinanceReadonly.value || isSellerReadonly.value);
const route = useRoute();
const activeDirection = ref<"send" | "receive">(
    !isSellerReadonly.value && route.query.direction === "receive" ? "receive" : "send",
);
const selectedWaybillIds = ref<string[]>([]);
const searchText = ref("");
const appliedSearchText = ref("");
const draftCompany = ref("");
const appliedCompany = ref("");
const draftBusinessType = ref("");
const appliedBusinessType = ref("");
const draftRelatedOrderNo = ref("");
const appliedRelatedOrderNo = ref("");
const draftTrackingNo = ref("");
const appliedTrackingNo = ref("");
const selectedSalesOrderId = ref("");
const draftSalesperson = ref("");
const appliedSalesperson = ref("");
const draftSortOrder = ref<"desc" | "asc">("desc");
const appliedSortOrder = ref<"desc" | "asc">("desc");
const draftStartDate = ref("");
const draftEndDate = ref("");
const appliedStartDate = ref("");
const appliedEndDate = ref("");
const calendarBaseDate = ref(new Date(2027, 4, 1));
const showWaybillDialog = ref(false);
const showColumnConfigDialog = ref(false);
const showImagePreview = ref(false);
const previewImages = ref<PreviewImage[]>([]);
const previewImageIndex = ref(0);
const previewTitle = ref("");
const isDateRangePickerOpen = ref(false);
const isSentAtPickerOpen = ref(false);
const sentAtCalendarBaseDate = ref(new Date());
const canAcceptLogistics = computed(() => canAcceptPurchaseLogistics(Number(adminInfo.value?.role)));
const waybillDialogMode = ref<"create" | "edit" | "view">("create");
const editingWaybillId = ref("");
const draggingColumnKey = ref<WaybillColumnKey | null>(null);
const dateRangeFilterRef = ref<HTMLElement | null>(null);
const sentAtPickerRef = ref<HTMLElement | null>(null);
const imageInput = ref<HTMLInputElement | null>(null);
const attachmentInput = ref<HTMLInputElement | null>(null);
const showImportDialog = ref(false);
const showQuickInboundDialog = ref(false);
const quickInboundTarget = ref<{ purchaseOrderNo: string; courierCompany: string; trackingNo: string } | null>(null);
const importFile = ref<File | null>(null);
const isImporting = ref(false);
const isImportDragover = ref(false);
const importResult = ref<{ successCount: number; failCount: number; errors: Array<{ row: number; message: string }> } | null>(null);
const importFileName = computed(() => importFile.value?.name || "");
const uploadedImages = ref<UploadedPreview[]>([]);
const uploadedAttachments = ref<UploadedPreview[]>([]);
const totalWaybillCount = ref(0);
const isLoadingWaybills = ref(false);
const isSubmittingWaybill = ref(false);
const warehouseOptions = ref<InboundWarehouseOption[]>([]);
const activeLogisticsRecord = ref<PurchaseLogisticsRecord | null>(null);
type LogisticsTraceRecord = {
    courierCompany?: string;
    trackingNo: string;
    transportInfo?: string;
    transportTraces: NonNullable<InventoryWaybill["transportTraces"]>;
    transportStatus?: InventoryWaybill["transportStatus"];
};
const activeTraceRecord = ref<LogisticsTraceRecord | null>(null);
const showTraceDialog = ref(false);
const showAcceptanceDialog = ref(false);
const loadingAcceptanceWaybillId = ref("");
const acceptanceReadonly = ref(false);
const acceptanceFormItems = ref<AcceptanceFormItem[]>([]);
const acceptanceRemark = ref("");
const acceptanceAttachments = ref<PurchaseLogisticsAcceptanceAttachment[]>([]);
const acceptanceImages = ref<PurchaseLogisticsAcceptanceAttachment[]>([]);
const acceptanceEvidenceInput = ref<HTMLInputElement | null>(null);
const isUploadingAcceptanceEvidence = ref(false);
const isUploadingAcceptanceImages = ref(false);
const isSubmittingAcceptance = ref(false);
const warehouseOptionsLoaded = ref(false);
const {
    pageSizeOptions,
    pageSize,
    pageNumbers,
    totalPages,
    currentPage,
    jumpPageInput,
    setTotalItems,
    goToPage,
    jumpToInputPage,
} = useInventoryPagination();
const waybillForm = reactive({
    direction: activeDirection.value,
    company: "",
    trackingNo: "",
    relatedOrderNo: "",
    salesperson: "",
    goods: "",
    businessType: activeDirection.value === "receive"
        ? receiveBusinessTypeOptions[0]
        : sendBusinessTypeOptions[0],
    sentAt: "",
    senderAddress: "",
    receiverAddress: "",
    receiverName: "",
    images: [] as Array<{ name: string; url: string }>,
    attachmentNames: [] as string[],
    remark: "",
});

const logisticsColumnKeys = new Set<WaybillColumnKey>([
    "transportStatus",
    "acceptanceStatus",
    "acceptanceForm",
]);
const sellerHiddenColumnKeys = new Set<WaybillColumnKey>([
    "image",
    "remark",
    "reserved1",
    "reserved2",
    "reserved3",
    "reserved4",
    "reserved5",
]);
const availableColumnConfigs = computed(() => {
    if (!isSellerReadonly.value && activeDirection.value === "receive") {
        return columnConfigs.filter((column) => column.key !== "salesperson");
    }

    return columnConfigs.filter((column) =>
        !logisticsColumnKeys.has(column.key)
        && (!isSellerReadonly.value || !sellerHiddenColumnKeys.has(column.key)),
    );
});
const displayedColumns = computed(() => availableColumnConfigs.value.filter((column) => column.visible));
const lockedColumns = computed(() => displayedColumns.value.filter((column) => column.locked));
const waybillTableColumnTemplate = computed(() => [
    "var(--waybill-selection-width)",
    ...displayedColumns.value.map(getErpTableGridColumn),
    "var(--waybill-action-width)",
].join(" "));
const waybillTableMinimumWidth = computed(() =>
    getErpTableMinimumWidth(
        displayedColumns.value,
        ["var(--waybill-selection-width)"],
        ["var(--waybill-action-width)"],
    ),
);
const getLockedColumnLeft = (columnIndex: number) => {
    const previousColumns = lockedColumns.value
        .slice(0, columnIndex)
        .map(getErpTableColumnWidth);

    return `calc(var(--waybill-selection-width)${previousColumns.length ? ` + ${previousColumns.join(" + ")}` : ""})`;
};
const allColumnsVisible = computed(() => availableColumnConfigs.value.every((column) => column.visible));
const hasPendingFilters = computed(() =>
    draftCompany.value !== appliedCompany.value
    || draftBusinessType.value !== appliedBusinessType.value
    || draftRelatedOrderNo.value !== appliedRelatedOrderNo.value
    || draftTrackingNo.value !== appliedTrackingNo.value
    || draftSalesperson.value !== appliedSalesperson.value
    || draftSortOrder.value !== appliedSortOrder.value
    || draftStartDate.value !== appliedStartDate.value
    || draftEndDate.value !== appliedEndDate.value,
);
const dateRangeLabel = computed(() => {
    if (draftStartDate.value && draftEndDate.value) {
        return `${draftStartDate.value} 至 ${draftEndDate.value}`;
    }

    return draftStartDate.value || draftEndDate.value;
});
const requiresRelatedOrder = computed(() =>
    orderRelatedBusinessTypes.includes(waybillForm.businessType),
);
const currentBusinessTypeSelectOptions = computed(() =>
    waybillForm.direction === "receive" ? receiveBusinessTypeSelectOptions : sendBusinessTypeSelectOptions,
);
const directionLabel = computed(() => waybillForm.direction === "receive" ? "收件" : "寄件");
const directionTimeLabel = computed(() => `${directionLabel.value}时间`);
const waybillDialogTitle = computed(() => {
    const label = waybillForm.direction === "receive" ? "收件" : "寄件";
    if (waybillDialogMode.value === "view") return `查看${label}单`;
    if (waybillDialogMode.value === "edit") return `编辑${label}单`;
    return `新建${label}单`;
});

const fetchSalesOrderOptions = async (keyword: string) => {
    try {
        const response: any = await retrieveSalesOrderList()({
            keyword: keyword.trim() || undefined,
            page: 1,
            limit: 30,
        });
        const list = Array.isArray(response?.data?.list) ? response.data.list : [];

        const options: Array<{ id: string; label: string }> = [];
        list.forEach((order: any) => {
            const id = String(order?._id || order?.id || order?.orderNo || "");
            const label = String(order?.orderNo || "").trim();
            if (id && label) options.push({ id, label });
        });
        return options;
    } catch {
        return [];
    }
};
const sentAtLabel = computed(() =>
    waybillForm.sentAt ? formatDateValue(new Date(waybillForm.sentAt)) : "请选择",
);
const calendarWeekdays = ["一", "二", "三", "四", "五", "六", "日"];
const calendarPanels = computed(() => {
    const leftMonth = new Date(calendarBaseDate.value.getFullYear(), calendarBaseDate.value.getMonth(), 1);
    const rightMonth = new Date(calendarBaseDate.value.getFullYear(), calendarBaseDate.value.getMonth() + 1, 1);

    return [
        {
            key: "start",
            label: "开始日期",
            title: formatCalendarMonth(leftMonth),
            days: buildCalendarDays(leftMonth),
        },
        {
            key: "end",
            label: "结束日期",
            title: formatCalendarMonth(rightMonth),
            days: buildCalendarDays(rightMonth),
        },
    ];
});
const sentAtCalendarTitle = computed(() => formatCalendarMonth(sentAtCalendarBaseDate.value));
const sentAtCalendarDays = computed(() => buildCalendarDays(sentAtCalendarBaseDate.value));

const isWaybillImageUrl = (url?: string) =>
    Boolean(url && waybills.value.some((item) => item.images?.some((img) => img.url === url)));

const revokePreviewUrl = (url?: string) => {
    if (url?.startsWith("blob:") && !isWaybillImageUrl(url)) {
        URL.revokeObjectURL(url);
    }
};

const revokeImagePreviews = () => {
    uploadedImages.value.forEach((file) => revokePreviewUrl(file.url));
};

const cloneWaybillAttachments = (waybill: WaybillItem): WaybillAttachment[] => {
    if (waybill.attachments?.length) {
        return waybill.attachments.map((attachment) => ({ ...attachment }));
    }

    return waybill.attachmentNames.map((name) => ({ name, url: "" }));
};

const padDatePart = (value: number) => String(value).padStart(2, "0");

const formatDateValue = (date: Date) =>
    `${date.getFullYear()}-${padDatePart(date.getMonth() + 1)}-${padDatePart(date.getDate())}`;

const formatCalendarMonth = (date: Date) =>
    `${date.getFullYear()}年${date.getMonth() + 1}月`;

function buildCalendarDays(monthDate: Date): CalendarDay[] {
    const year = monthDate.getFullYear();
    const month = monthDate.getMonth();
    const firstDate = new Date(year, month, 1);
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const firstWeekday = (firstDate.getDay() + 6) % 7;
    const days: CalendarDay[] = Array.from({ length: firstWeekday }, () => ({
        day: "",
        value: "",
        inMonth: false,
    }));

    for (let day = 1; day <= daysInMonth; day += 1) {
        const date = new Date(year, month, day);

        days.push({
            day: String(day),
            value: formatDateValue(date),
            inMonth: true,
        });
    }

    while (days.length % 7 !== 0) {
        days.push({
            day: "",
            value: "",
            inMonth: false,
        });
    }

    return days;
}

const normalizeWaybill = (item: InventoryWaybill): WaybillItem => {
    const id = item._id || "";
    const sentAt = formatLocalDate(item.sentAt);
    const attachments = (item.attachments || []).map((attachment) => ({
        name: attachment.name,
        url: attachment.url,
        size: attachment.size,
        type: attachment.type,
    }));

    return {
        id,
        direction: item.direction === "receive" ? "receive" : "send",
        waybillNo: item.waybillNo || "",
        company: item.company || "",
        trackingNo: item.trackingNo || "",
        relatedOrderNo: item.relatedOrderNo || "",
        salesperson: item.salesperson || "",
        goods: item.goods || "",
        goodsDisplay: item.goodsDisplay,
        businessType: item.businessType || businessTypeOptions[0],
        sentAt,
        senderAddress: item.senderAddress || "",
        receiverAddress: item.receiverAddress || "",
        receiverName: item.receiverName || "",
        transportInfo: item.transportInfo || "",
        transportTraces: item.transportTraces || [],
        transportStatus: item.transportStatus,
        transportUpdatedAt: item.transportUpdatedAt || null,
        transportUpdatedBy: item.transportUpdatedBy || "",
        sourceType: item.sourceType,
        sourceOrderId: item.sourceOrderId,
        sourceWaybillId: item.sourceWaybillId,
        purchaseLogistics: item.purchaseLogistics,
        needsSupplement: Boolean(item.needsSupplement),
        image: item.image || "",
        imageName: item.imageName || "",
        images: item.images || [],
        attachmentNames: item.attachmentNames?.length
            ? item.attachmentNames
            : attachments.map((attachment) => attachment.name),
        attachments,
        remark: item.remark || "",
        reserved1: item.reserved1 || "",
        reserved2: item.reserved2 || "",
        reserved3: item.reserved3 || "",
        reserved4: item.reserved4 || "",
        reserved5: item.reserved5 || "",
    };
};

const totalWaybills = computed(() => totalWaybillCount.value);
const visibleWaybills = computed(() => waybills.value);
const isPurchaseLogisticsWaybill = (waybill: WaybillItem) =>
    waybill.sourceType === "purchase-logistics";
const selectableWaybills = computed(() =>
    visibleWaybills.value.filter((item) => !item._isDeleted),
);
const allRowsSelected = computed(() =>
    selectableWaybills.value.length > 0
    && selectableWaybills.value.every((item) => selectedWaybillIds.value.includes(item.id)),
);

const canQuickInbound = computed(() => {
    if (activeDirection.value !== "receive" || isReadonly.value) return false;
    const selected = waybills.value.filter((w) => selectedWaybillIds.value.includes(w.id));
    return selected.some((w) => w.relatedOrderNo?.startsWith("CGD-"));
});

watch(totalWaybills, (total) => setTotalItems(total), { immediate: true });

const openImagePreview = (images: InventoryWaybillAttachment[], index: number, title: string) => {
    previewImages.value = images.map(img => ({ url: img.url, alt: title }));
    previewImageIndex.value = index;
    previewTitle.value = title;
    showImagePreview.value = true;
};

const openUploadedImagePreview = (file: UploadedPreview) => {
    if (!file.url) {
        return;
    }

    const images = uploadedImages.value
        .filter((image): image is UploadedPreview & { url: string } => Boolean(image.url))
        .map((image) => ({ name: image.name, url: image.url }));
    const previewIndex = images.findIndex((image) => image.url === file.url);

    if (previewIndex < 0) {
        return;
    }

    openImagePreview(images, previewIndex, file.name || waybillForm.trackingNo);
};

let waybillsRequestVersion = 0;
const loadWaybills = async () => {
    const requestVersion = ++waybillsRequestVersion;
    isLoadingWaybills.value = true;

    try {
        const response = await retrieveInventoryWaybills({
            direction: isSellerReadonly.value ? "send" : activeDirection.value,
            keyword: appliedSearchText.value || undefined,
            company: appliedCompany.value,
            businessType: appliedBusinessType.value,
            relatedOrderNo: appliedRelatedOrderNo.value || undefined,
            trackingNo: appliedTrackingNo.value || undefined,
            salesperson: isSellerReadonly.value ? undefined : appliedSalesperson.value || undefined,
            sortOrder: appliedSortOrder.value,
            startDate: appliedStartDate.value,
            endDate: appliedEndDate.value,
            page: currentPage.value,
            limit: pageSize.value,
        });
        if (requestVersion !== waybillsRequestVersion) return;

        if (response.code !== 200 || !response.data) {
            ElMessage.error(response.msg || "获取运单记录失败");
            waybills.value = [];
            totalWaybillCount.value = 0;
            return;
        }

        waybills.value = response.data.list.map(normalizeWaybill);
        totalWaybillCount.value = response.data.pagination.total;
    } catch {
        if (requestVersion !== waybillsRequestVersion) return;
        ElMessage.error("获取运单记录失败");
        waybills.value = [];
        totalWaybillCount.value = 0;
    } finally {
        if (requestVersion === waybillsRequestVersion) isLoadingWaybills.value = false;
    }
};

const switchDirection = async (direction: "send" | "receive") => {
    if (isSellerReadonly.value) direction = "send";
    if (activeDirection.value === direction) return;
    activeDirection.value = direction;
    selectedWaybillIds.value = [];
    waybillForm.direction = direction;
    waybillForm.businessType = direction === "receive"
        ? receiveBusinessTypeOptions[0]
        : sendBusinessTypeOptions[0];
    await reloadWaybillsFromFirstPage();
};

watch(
    [() => route.query.direction, isSellerReadonly],
    async ([direction]) => {
        if (isSellerReadonly.value) {
            await switchDirection("send");
            return;
        }
        if ((direction === "send" || direction === "receive") && direction !== activeDirection.value) {
            await switchDirection(direction);
        }
    },
);

const reloadWaybillsFromFirstPage = async () => {
    goToPage(1);
    await loadWaybills();
};

const applySearch = async () => {
    appliedSearchText.value = searchText.value.trim();
    await reloadWaybillsFromFirstPage();
};

const handlePageChange = async (page: number) => {
    goToPage(page);
    await loadWaybills();
};

const handleJumpToPage = async () => {
    jumpToInputPage();
    await loadWaybills();
};

watch(pageSize, async () => {
    await reloadWaybillsFromFirstPage();
});

watch(
    () => waybillForm.businessType,
    (type) => {
        if (!orderRelatedBusinessTypes.includes(type)) {
            waybillForm.relatedOrderNo = "";
        }
    },
);

const applyFilters = async () => {
    if (draftStartDate.value && draftEndDate.value && draftStartDate.value > draftEndDate.value) {
        ElMessage.warning("开始日期不能晚于结束日期");
        return;
    }

    isDateRangePickerOpen.value = false;
    appliedCompany.value = draftCompany.value;
    appliedBusinessType.value = draftBusinessType.value;
    appliedRelatedOrderNo.value = draftRelatedOrderNo.value.trim();
    appliedTrackingNo.value = draftTrackingNo.value.trim();
    appliedSalesperson.value = draftSalesperson.value.trim();
    appliedSortOrder.value = draftSortOrder.value;
    appliedStartDate.value = draftStartDate.value;
    appliedEndDate.value = draftEndDate.value;
    await reloadWaybillsFromFirstPage();
};

const resetFilters = async () => {
    draftCompany.value = "";
    appliedCompany.value = "";
    draftBusinessType.value = "";
    appliedBusinessType.value = "";
    draftRelatedOrderNo.value = "";
    appliedRelatedOrderNo.value = "";
    draftTrackingNo.value = "";
    appliedTrackingNo.value = "";
    draftSalesperson.value = "";
    appliedSalesperson.value = "";
    draftSortOrder.value = "desc";
    appliedSortOrder.value = "desc";
    draftStartDate.value = "";
    draftEndDate.value = "";
    appliedStartDate.value = "";
    appliedEndDate.value = "";
    isDateRangePickerOpen.value = false;
    await reloadWaybillsFromFirstPage();
};

const toggleDateRangePicker = () => {
    isDateRangePickerOpen.value = !isDateRangePickerOpen.value;
};

const clearDraftDateRange = () => {
    draftStartDate.value = "";
    draftEndDate.value = "";
};

const shiftCalendarMonth = (offset: number) => {
    calendarBaseDate.value = new Date(
        calendarBaseDate.value.getFullYear(),
        calendarBaseDate.value.getMonth() + offset,
        1,
    );
};

const selectCalendarDate = (day: CalendarDay) => {
    if (!day.value) {
        return;
    }

    if (!draftStartDate.value || draftEndDate.value) {
        draftStartDate.value = day.value;
        draftEndDate.value = "";
        return;
    }

    if (day.value < draftStartDate.value) {
        draftEndDate.value = draftStartDate.value;
        draftStartDate.value = day.value;
        return;
    }

    draftEndDate.value = day.value;
    isDateRangePickerOpen.value = false;
};

const selectToday = () => {
    const today = formatDateValue(new Date());

    draftStartDate.value = today;
    draftEndDate.value = today;
    calendarBaseDate.value = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    isDateRangePickerOpen.value = false;
};

const getCalendarDayClass = (day: CalendarDay) => {
    const value = day.value;

    return {
        empty: !value,
        selected: Boolean(value && (value === draftStartDate.value || value === draftEndDate.value)),
        "in-range": Boolean(
            value
            && draftStartDate.value
            && draftEndDate.value
            && value > draftStartDate.value
            && value < draftEndDate.value,
        ),
    };
};

const toggleSentAtPicker = () => {
    if (!isSentAtPickerOpen.value && waybillForm.sentAt) {
        const selectedDate = new Date(waybillForm.sentAt);

        if (!Number.isNaN(selectedDate.getTime())) {
            sentAtCalendarBaseDate.value = new Date(
                selectedDate.getFullYear(),
                selectedDate.getMonth(),
                1,
            );
        }
    }

    isSentAtPickerOpen.value = !isSentAtPickerOpen.value;
};

const shiftSentAtCalendarMonth = (offset: number) => {
    sentAtCalendarBaseDate.value = new Date(
        sentAtCalendarBaseDate.value.getFullYear(),
        sentAtCalendarBaseDate.value.getMonth() + offset,
        1,
    );
};

const selectSentAtDate = (day: CalendarDay) => {
    if (!day.value) {
        return;
    }

    waybillForm.sentAt = day.value;
    isSentAtPickerOpen.value = false;
};

const selectSentAtToday = () => {
    const today = new Date();

    waybillForm.sentAt = formatDateValue(today);
    sentAtCalendarBaseDate.value = new Date(today.getFullYear(), today.getMonth(), 1);
    isSentAtPickerOpen.value = false;
};

const getSentAtCalendarDayClass = (day: CalendarDay) => ({
    empty: !day.value,
    selected: Boolean(day.value && day.value === waybillForm.sentAt),
});

const handlePageClick = (event: MouseEvent) => {
    const target = event.target as Node;

    if (isDateRangePickerOpen.value && !dateRangeFilterRef.value?.contains(target)) {
        isDateRangePickerOpen.value = false;
    }

    if (isSentAtPickerOpen.value && !sentAtPickerRef.value?.contains(target)) {
        isSentAtPickerOpen.value = false;
    }
};

const toggleSelectAll = () => {
    const pageIds = selectableWaybills.value.map((item) => item.id);

    if (allRowsSelected.value) {
        selectedWaybillIds.value = selectedWaybillIds.value.filter((id) => !pageIds.includes(id));
        return;
    }

    selectedWaybillIds.value = [...new Set([...selectedWaybillIds.value, ...pageIds])];
};

const handleLogisticsError = (err: any, fallback: string) => {
    ElMessage.error(err?.data?.msg || err?.message || fallback);
};

const loadWarehouseOptions = async () => {
    if (warehouseOptionsLoaded.value) return;

    try {
        const warehouseRes = await retrieveInventoryWarehouses();
        const warehouses = Array.isArray(warehouseRes.data?.list) ? warehouseRes.data.list : [];
        const locationGroups = await Promise.all(warehouses.map(async (warehouse) => {
            if (!warehouse._id || warehouse.enableLocation !== true) return [];
            const locationRes = await retrieveInventoryLocations({ warehouseId: warehouse._id });
            return Array.isArray(locationRes.data?.list)
                ? buildInboundLocationTree(locationRes.data.list)
                : [];
        }));

        warehouseOptions.value = warehouses.map((warehouse, index) => ({
            id: warehouse._id || "",
            code: warehouse.code || "",
            name: warehouse.name || "",
            enableLocation: warehouse.enableLocation === true,
            children: locationGroups[index],
        }));
        warehouseOptionsLoaded.value = true;
    } catch (err: any) {
        warehouseOptions.value = [];
        handleLogisticsError(err, "获取仓库和库位失败");
    }
};

const openTraceDialog = (record: LogisticsTraceRecord) => {
    activeTraceRecord.value = record;
    showTraceDialog.value = true;
};

const closeTraceDialog = () => {
    showTraceDialog.value = false;
    activeTraceRecord.value = null;
};

const formatTraceDate = (value: string | Date | null | undefined) =>
    value ? new Date(value).toLocaleString("zh-CN", { hour12: false }) : "--";

const toAcceptanceFormItem = (
    item: PurchaseLogisticsAcceptanceItem,
    readonly: boolean,
): AcceptanceFormItem => ({
    ...item,
    expectedQuantity: Number(item.expectedQuantity || 0),
    receivedQuantity: Number(item.receivedQuantity || 0),
    damagedQuantity: Number(item.damagedQuantity || 0),
    inboundQuantity: Number(item.inboundQuantity || 0),
    remainingQuantity: Number(item.remainingQuantity ?? item.expectedQuantity ?? 0),
    warehouseId: item.warehouseId || "",
    locationId: item.locationId || "",
    targetWarehouse: [item.warehouseName, item.locationName].filter(Boolean).join(" / ")
        || (readonly ? "--" : ""),
});

const openAcceptanceDialog = async (waybill: WaybillItem) => {
    if (loadingAcceptanceWaybillId.value || !canAcceptLogistics.value) return;
    loadingAcceptanceWaybillId.value = waybill.id;

    try {
        const response = await getInventoryWaybillDetail(waybill.id);
        const record = response.data?.detail?.purchaseLogistics;
        if (response.code !== 200) {
            ElMessage.error(response.msg || "获取最新采购验收信息失败");
            return;
        }
        if (!record) {
            ElMessage.error("采购运单不存在或已变更，请刷新后重试");
            return;
        }
        if (record.acceptanceStatus !== "待验收") {
            openAcceptanceView(record);
            await loadWaybills();
            return;
        }
        if (record.transportStatus !== "待取货" && record.transportStatus !== "已签收") {
            ElMessage.warning("仅待取货或已签收的采购运单可填写验收单，请刷新后重试");
            await loadWaybills();
            return;
        }

        await loadWarehouseOptions();
        activeLogisticsRecord.value = record;
        acceptanceReadonly.value = false;
        acceptanceFormItems.value = record.availableItems.map((item) => toAcceptanceFormItem(item, false));
        acceptanceRemark.value = "";
        acceptanceAttachments.value = [];
        acceptanceImages.value = [];
        showAcceptanceDialog.value = true;
    } catch (err: any) {
        handleLogisticsError(err, "获取最新采购验收信息失败");
    } finally {
        loadingAcceptanceWaybillId.value = "";
    }
};

const openAcceptanceView = (record: PurchaseLogisticsRecord) => {
    activeLogisticsRecord.value = record;
    acceptanceReadonly.value = true;
    acceptanceFormItems.value = record.acceptanceItems.map((item) => toAcceptanceFormItem(item, true));
    acceptanceRemark.value = record.acceptanceRemark || "";
    acceptanceAttachments.value = [...(record.acceptanceAttachments || [])];
    acceptanceImages.value = [...(record.acceptanceImages || [])];
    showAcceptanceDialog.value = true;
};

const closeAcceptanceDialog = () => {
    if (isSubmittingAcceptance.value || isUploadingAcceptanceEvidence.value || isUploadingAcceptanceImages.value) return;
    showAcceptanceDialog.value = false;
    activeLogisticsRecord.value = null;
    acceptanceFormItems.value = [];
    acceptanceAttachments.value = [];
    acceptanceImages.value = [];
    if (acceptanceEvidenceInput.value) acceptanceEvidenceInput.value.value = "";
};

const normalizeAcceptanceQuantity = (value: unknown) => {
    const quantity = Number(value || 0);
    return Number.isFinite(quantity) ? Math.max(Number(quantity.toFixed(3)), 0) : 0;
};

const getAcceptanceInboundQuantity = (item: AcceptanceFormItem) => {
    if (acceptanceReadonly.value) return normalizeAcceptanceQuantity(item.inboundQuantity);
    return Math.max(
        normalizeAcceptanceQuantity(item.receivedQuantity)
            - normalizeAcceptanceQuantity(item.damagedQuantity),
        0,
    );
};

const isAcceptanceAbnormal = computed(() => acceptanceFormItems.value.some((item) =>
    normalizeAcceptanceQuantity(getAcceptanceInboundQuantity(item))
        !== normalizeAcceptanceQuantity(item.expectedQuantity),
));

const isAcceptanceEvidenceRequired = computed(() => acceptanceFormItems.value.some((item) =>
    normalizeAcceptanceQuantity(item.damagedQuantity) > 0,
));

const formatAcceptanceQuantity = (value: unknown) =>
    normalizeAcceptanceQuantity(value).toLocaleString("zh-CN", { maximumFractionDigits: 3 });

const selectAcceptanceWarehouse = (
    item: AcceptanceFormItem,
    warehouseId: string,
    locationId: string,
    label: string,
) => {
    item.warehouseId = warehouseId;
    item.locationId = locationId;
    item.targetWarehouse = label;
};

const readAcceptanceFiles = async (
    files: File[],
    target: { value: PurchaseLogisticsAcceptanceAttachment[] },
    uploading: { value: boolean },
    label: string,
) => {
    if (!files.length || uploading.value) return;

    const maxFileSize = 10 * 1024 * 1024;
    const validFiles = files.filter((file) => {
        if (file.size <= maxFileSize) return true;
        ElMessage.warning(`${label} ${file.name} 不能超过10MB`);
        return false;
    });
    if (!validFiles.length) return;

    uploading.value = true;
    let successCount = 0;
    try {
        for (const file of validFiles) {
            const formData = new FormData();
            formData.append("file", file);

            try {
                const res = await uploadInventoryAttachment(formData);
                if (res.code !== 200 || !res.data?.url) {
                    ElMessage.error(res.msg || `${label} ${file.name} 上传失败`);
                    continue;
                }

                target.value.push({
                    name: res.data.name || file.name,
                    url: res.data.url,
                    size: res.data.size || file.size,
                    type: res.data.type || file.type,
                });
                successCount += 1;
            } catch {
                ElMessage.error(`${label} ${file.name} 上传失败`);
            }
        }
    } finally {
        uploading.value = false;
    }

    if (successCount > 0) ElMessage.success(`${label}上传完成`);
};

const handleAcceptanceEvidenceChange = (event: Event) => {
    const input = event.target as HTMLInputElement;
    void readAcceptanceFiles(
        Array.from(input.files || []),
        acceptanceAttachments,
        isUploadingAcceptanceEvidence,
        "异常材料",
    );
    input.value = "";
};

const handleAcceptanceEvidenceDrop = (event: DragEvent) => {
    void readAcceptanceFiles(
        Array.from(event.dataTransfer?.files || []),
        acceptanceAttachments,
        isUploadingAcceptanceEvidence,
        "异常材料",
    );
};

const handleAcceptanceImageChange = (event: Event) => {
    const input = event.target as HTMLInputElement;
    void readAcceptanceFiles(
        Array.from(input.files || []),
        acceptanceImages,
        isUploadingAcceptanceImages,
        "验收图片",
    );
    input.value = "";
};

const handleAcceptanceImageDrop = (event: DragEvent) => {
    void readAcceptanceFiles(
        Array.from(event.dataTransfer?.files || []),
        acceptanceImages,
        isUploadingAcceptanceImages,
        "验收图片",
    );
};

const removeAcceptanceAttachment = (index: number) => {
    acceptanceAttachments.value.splice(index, 1);
};

const removeAcceptanceImage = (index: number) => {
    acceptanceImages.value.splice(index, 1);
};

const downloadAcceptanceAttachment = async (attachment: PurchaseLogisticsAcceptanceAttachment) => {
    try {
        await downloadAttachmentFile(attachment.url, attachment.name);
    } catch {
        ElMessage.error("附件下载失败，请稍后重试");
    }
};

const validateAcceptance = () => {
    if (!acceptanceFormItems.value.length) {
        ElMessage.warning("验收货品不能为空");
        return false;
    }

    for (const item of acceptanceFormItems.value) {
        const expected = Number(item.expectedQuantity);
        const received = Number(item.receivedQuantity);
        const damaged = Number(item.damagedQuantity);

        if (![expected, received, damaged].every(Number.isFinite)
            || expected < 0
            || received < 0
            || damaged < 0) {
            ElMessage.warning("验收数量不能为负数");
            return false;
        }

        if (normalizeAcceptanceQuantity(damaged) > normalizeAcceptanceQuantity(received)) {
            ElMessage.warning(`${item.productName}的不合格数量不能超过实际到货数量`);
            return false;
        }
        if (normalizeAcceptanceQuantity(received) > normalizeAcceptanceQuantity(item.remainingQuantity)) {
            ElMessage.warning(`${item.productName}的实际到货数量不能超过采购剩余${formatAcceptanceQuantity(item.remainingQuantity)}${item.unitName}`);
            return false;
        }
        if (getAcceptanceInboundQuantity(item) > 0 && (!item.warehouseId || !item.locationId)) {
            ElMessage.warning(`请选择${item.productName}的入库仓库和库位`);
            return false;
        }
    }

    if (!acceptanceImages.value.length) {
        ElMessage.warning("请上传验收图片");
        return false;
    }
    if (isAcceptanceEvidenceRequired.value && !acceptanceAttachments.value.some((file) =>
        String(file.name || "").trim() && String(file.url || "").trim().startsWith("/main/inventory/attachments/"),
    )) {
        ElMessage.warning("不合格数量大于0时必须上传异常材料");
        return false;
    }

    return true;
};

const submitAcceptance = async () => {
    if (!activeLogisticsRecord.value || isSubmittingAcceptance.value || !validateAcceptance()) return;
    isSubmittingAcceptance.value = true;

    try {
        const res = await acceptPurchaseLogistics({
            operation: "acceptPurchaseTransport",
            purchaseOrderId: activeLogisticsRecord.value.purchaseOrderId,
            waybillId: activeLogisticsRecord.value.waybillId,
            remark: acceptanceRemark.value.trim(),
            attachments: acceptanceAttachments.value.map((attachment) => ({ ...attachment })),
            images: acceptanceImages.value.map((image) => ({ ...image })),
            items: acceptanceFormItems.value.map((item) => ({
                productId: item.productId,
                expectedQuantity: normalizeAcceptanceQuantity(item.expectedQuantity),
                receivedQuantity: normalizeAcceptanceQuantity(item.receivedQuantity),
                damagedQuantity: normalizeAcceptanceQuantity(item.damagedQuantity),
                warehouseId: item.warehouseId || null,
                locationId: item.locationId || null,
            })),
        });

        if (res.code !== 200) {
            ElMessage.error(res.msg || "验收提交失败");
            return;
        }

        ElMessage.success(res.data?.detail.acceptanceStatus === "验收正常"
            ? "验收完成，已同步收件记录"
            : "验收异常，合格货品已入库");
        showAcceptanceDialog.value = false;
        activeLogisticsRecord.value = null;
        await loadWaybills();
    } catch (err: any) {
        handleLogisticsError(err, "验收提交失败");
    } finally {
        isSubmittingAcceptance.value = false;
    }
};

const resetWaybillForm = () => {
    waybillForm.direction = activeDirection.value;
    revokeImagePreviews();
    waybillForm.company = "";
    waybillForm.trackingNo = "";
    waybillForm.relatedOrderNo = "";
    selectedSalesOrderId.value = "";
    waybillForm.salesperson = "";
    waybillForm.goods = "";
    waybillForm.businessType = activeDirection.value === "receive"
        ? receiveBusinessTypeOptions[0]
        : sendBusinessTypeOptions[0];
    waybillForm.sentAt = "";
    sentAtCalendarBaseDate.value = new Date();
    isSentAtPickerOpen.value = false;
    waybillForm.senderAddress = "";
    waybillForm.receiverAddress = "";
    waybillForm.receiverName = "";
    waybillForm.images = [];
    waybillForm.attachmentNames = [];
    waybillForm.remark = "";
    uploadedImages.value = [];
    uploadedAttachments.value = [];

    if (imageInput.value) {
        imageInput.value.value = "";
    }

    if (attachmentInput.value) {
        attachmentInput.value.value = "";
    }
};

const openCreateDialog = () => {
    if (isReadonly.value) return;
    waybillDialogMode.value = "create";
    editingWaybillId.value = "";
    resetWaybillForm();
    showWaybillDialog.value = true;
};

const openEditDialog = (waybill: WaybillItem, mode: "edit" | "view" = "edit") => {
    if (isReadonly.value && mode !== "view") return;
    revokeImagePreviews();
    waybillDialogMode.value = mode;
    editingWaybillId.value = waybill.id;
    waybillForm.direction = waybill.direction;
    const clearSupplementPlaceholder = (value: string) =>
        value === supplementPlaceholder ? "" : value;

    waybillForm.company = clearSupplementPlaceholder(waybill.company);
    waybillForm.trackingNo = waybill.trackingNo;
    waybillForm.relatedOrderNo = clearSupplementPlaceholder(waybill.relatedOrderNo);
    selectedSalesOrderId.value = "";
    waybillForm.salesperson = clearSupplementPlaceholder(waybill.salesperson);
    waybillForm.goods = clearSupplementPlaceholder(mode === "view" || waybill.sourceType === "purchase-logistics"
        ? waybill.goodsDisplay || waybill.goods
        : waybill.goods);
    waybillForm.businessType = clearSupplementPlaceholder(waybill.businessType);
    waybillForm.sentAt = waybill.sentAt;
    waybillForm.senderAddress = clearSupplementPlaceholder(waybill.senderAddress);
    waybillForm.receiverAddress = clearSupplementPlaceholder(waybill.receiverAddress);
    waybillForm.receiverName = clearSupplementPlaceholder(waybill.receiverName);
    waybillForm.images = waybill.images || [];
    waybillForm.attachmentNames = [...waybill.attachmentNames];
    waybillForm.remark = clearSupplementPlaceholder(waybill.remark);
    uploadedImages.value = waybill.images?.map((img) => ({
        name: img.name,
        url: img.url,
    })) || [];
    uploadedAttachments.value = cloneWaybillAttachments(waybill);
    showWaybillDialog.value = true;
};

const openViewDialog = (waybill: WaybillItem) => {
    openEditDialog(waybill, "view");
};

const closeWaybillDialog = () => {
    isSentAtPickerOpen.value = false;
    showWaybillDialog.value = false;
};

const validateWaybillForm = () => {
    if (!waybillForm.company) {
        ElMessage.warning("请选择快递公司");
        return false;
    }

    if (!waybillForm.trackingNo.trim()) {
        ElMessage.warning("请输入运单号");
        return false;
    }

    if (!waybillForm.goods.trim()) {
        ElMessage.warning("请输入托寄物");
        return false;
    }

    if (requiresRelatedOrder.value && !waybillForm.relatedOrderNo.trim()) {
        ElMessage.warning("请输入订单号");
        return false;
    }

    if (waybillForm.direction === "send" && !waybillForm.remark.trim()) {
        ElMessage.warning("请输入备注");
        return false;
    }

    if (!waybillForm.sentAt) {
        ElMessage.warning(`请选择${directionTimeLabel.value}`);
        return false;
    }

    if (!waybillForm.receiverAddress.trim()) {
        ElMessage.warning("请输入收货地");
        return false;
    }

    if (!waybillForm.receiverName.trim()) {
        ElMessage.warning(`请输入${waybillForm.direction === "receive" ? "寄件人" : "收件人"}`);
        return false;
    }

    if (waybillForm.images.length === 0) {
        ElMessage.warning("请上传运单图片");
        return false;
    }

    return true;
};

const appendFormData = (formData: FormData, key: string, value: unknown) => {
    formData.append(key, value === undefined || value === null ? "" : String(value));
};

const buildWaybillFormData = () => {
    const formData = new FormData();

    if (editingWaybillId.value) {
        appendFormData(formData, "id", editingWaybillId.value);
    }

    appendFormData(formData, "company", waybillForm.company);
    appendFormData(formData, "direction", waybillForm.direction);
    appendFormData(formData, "trackingNo", waybillForm.trackingNo.trim());
    appendFormData(formData, "relatedOrderNo", waybillForm.relatedOrderNo.trim());
    appendFormData(formData, "salesperson", waybillForm.salesperson.trim());
    appendFormData(formData, "goods", waybillForm.goods.trim());
    appendFormData(formData, "businessType", waybillForm.businessType);
    appendFormData(formData, "sentAt", waybillForm.sentAt);
    appendFormData(formData, "senderAddress", waybillForm.senderAddress.trim());
    appendFormData(formData, "receiverAddress", waybillForm.receiverAddress.trim());
    appendFormData(formData, "receiverName", waybillForm.receiverName.trim());
    appendFormData(formData, "remark", waybillForm.remark.trim());

    // 发送图片数组
    appendFormData(formData, "images", JSON.stringify(waybillForm.images));

    // 发送附件数组
    const attachments = uploadedAttachments.value
        .filter((attachment) => attachment.url)
        .map((attachment) => ({
            name: attachment.name,
            url: attachment.url,
        }));
    appendFormData(formData, "attachments", JSON.stringify(attachments));

    return formData;
};

const confirmWaybillDialog = async () => {
    if (isReadonly.value || waybillDialogMode.value === "view") {
        closeWaybillDialog();
        return;
    }
    if (!validateWaybillForm()) {
        return;
    }

    isSubmittingWaybill.value = true;

    try {
        const payload = buildWaybillFormData();
        const response = waybillDialogMode.value === "edit"
            ? await updateInventoryWaybill(payload)
            : await addInventoryWaybill(payload);

        if (response.code !== 200) {
            ElMessage.error(response.msg || "保存运单记录失败");
            return;
        }

        ElMessage.success(waybillDialogMode.value === "edit" ? "编辑运单记录成功" : "新建运单记录成功");
        closeWaybillDialog();
        await reloadWaybillsFromFirstPage();
    } catch {
        ElMessage.error("保存运单记录失败");
    } finally {
        isSubmittingWaybill.value = false;
    }
};

const deleteWaybill = async (waybill: WaybillItem) => {
    if (isReadonly.value) return;
    try {
        await erpMessageBox.confirm(`是否确认删除运单 ${waybill.waybillNo}`, "删除运单", {
            type: "warning",
            confirmButtonText: "确认",
            cancelButtonText: "取消",
        });
    } catch {
        return;
    }

    try {
        const response = await deleteInventoryWaybill({ id: waybill.id });

        if (response.code !== 200) {
            ElMessage.error(response.msg || "删除运单记录失败");
            return;
        }

        selectedWaybillIds.value = selectedWaybillIds.value.filter((id) => id !== waybill.id);
        ElMessage.success("删除运单记录成功");
        await reloadWaybillsFromFirstPage();
    } catch {
        ElMessage.error("删除运单记录失败");
    }
};

const batchDeleteWaybills = async () => {
    if (isReadonly.value) return;
    const ids = selectedWaybillIds.value.filter(Boolean);

    if (!ids.length) {
        ElMessage.warning("请先选择需要删除的运单记录");
        return;
    }

    try {
        await erpMessageBox.confirm(`是否确认删除选中的 ${ids.length} 个运单记录？`, "批量删除运单记录", {
            type: "warning",
            confirmButtonText: "确认",
            cancelButtonText: "取消",
        });
    } catch {
        return;
    }

    try {
        const response = await deleteInventoryWaybill({ ids });

        if (response.code !== 200) {
            ElMessage.error(response.msg || "批量删除运单记录失败");
            return;
        }

        selectedWaybillIds.value = [];
        ElMessage.success("批量删除运单记录成功");
        await reloadWaybillsFromFirstPage();
    } catch {
        ElMessage.error("批量删除运单记录失败");
    }
};

const getWaybillAttachments = (waybill: WaybillItem) =>
    cloneWaybillAttachments(waybill).filter((attachment) =>
        Boolean(attachment.name || attachment.url),
    );

const downloadBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = filename || "附件";
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url));
};

const downloadWaybillAttachments = async (waybill: WaybillItem) => {
    if (isSellerReadonly.value) return;
    const attachments = getWaybillAttachments(waybill);

    if (!attachments.length) {
        ElMessage.warning("当前运单没有附件");
        return;
    }

    try {
        const blob = await downloadInventoryWaybillAttachments(waybill.id);
        const filename = attachments.length === 1
            ? attachments[0]?.name || `${waybill.waybillNo}-附件`
            : `${waybill.waybillNo}-附件.zip`;

        downloadBlob(blob, filename);
    } catch {
        ElMessage.error("附件下载失败，请稍后重试");
    }
};

const readImageFiles = async (files: File[]) => {
    const imageFiles = files.filter((file) => file.type.startsWith("image/"));

    if (!imageFiles.length) {
        ElMessage.warning("请选择图片文件");
        return;
    }

    ElMessage.info("正在上传图片...");

    // 逐个上传图片到图床
    for (const file of imageFiles) {
        const formData = new FormData();
        formData.append("image", file);

        try {
            const res: any = await uploadImage(formData);

            if (res.code === 200 && res.data?.path) {
                uploadedImages.value = [...uploadedImages.value, {
                    name: file.name,
                    url: res.data.path,
                }];
            } else {
                ElMessage.error(`图片 ${file.name} 上传失败`);
            }
        } catch {
            ElMessage.error(`图片 ${file.name} 上传失败`);
        }
    }

    // 同步第一张图片到表单
    syncImages();
    ElMessage.success("图片上传完成");
};

const syncImages = () => {
    waybillForm.images = uploadedImages.value
        .filter((img) => img.url)
        .map((img) => ({
            name: img.name,
            url: img.url!,
        }));
};

const handleImageFileChange = (event: Event) => {
    const input = event.target as HTMLInputElement;

    readImageFiles(Array.from(input.files || []));
    input.value = "";
};

const handleImageDrop = (event: DragEvent) => {
    readImageFiles(Array.from(event.dataTransfer?.files || []));
};

const removeImage = (index: number) => {
    const [removedFile] = uploadedImages.value.splice(index, 1);

    revokePreviewUrl(removedFile?.url);
    syncImages();
};

const readAttachmentFiles = async (files: File[]) => {
    if (!files.length) {
        return;
    }

    ElMessage.info("正在上传附件...");

    // 逐个上传附件到本地服务器
    for (const file of files) {
        const formData = new FormData();
        formData.append("file", file);

        try {
            const res: any = await uploadInventoryAttachment(formData);

            if (res.code === 200 && res.data?.url) {
                uploadedAttachments.value = [...uploadedAttachments.value, {
                    name: file.name,
                    url: res.data.url,
                }];
            } else {
                ElMessage.error(`附件 ${file.name} 上传失败`);
            }
        } catch {
            ElMessage.error(`附件 ${file.name} 上传失败`);
        }
    }

    waybillForm.attachmentNames = uploadedAttachments.value.map((file) => file.name);
    ElMessage.success("附件上传完成");
};

const handleAttachmentFileChange = (event: Event) => {
    const input = event.target as HTMLInputElement;

    readAttachmentFiles(Array.from(input.files || []));
    input.value = "";
};

const handleAttachmentDrop = (event: DragEvent) => {
    readAttachmentFiles(Array.from(event.dataTransfer?.files || []));
};

const removeAttachment = (index: number) => {
    uploadedAttachments.value.splice(index, 1);
    waybillForm.attachmentNames = uploadedAttachments.value.map((file) => file.name);
};

const getWaybillCellValue = (waybill: WaybillItem, key: WaybillColumnKey) => {
    if (key === "goods") {
        return waybill.goodsDisplay || waybill.goods || "--";
    }
    if (key === "sentAt") {
        return waybill.sentAt || "--";
    }

    if (key === "image") {
        return waybill.images?.[0]?.name || "--";
    }

    if (key === "transportStatus") {
        return getWaybillTransportRecord(waybill)?.transportStatus || "--";
    }

    if (key === "acceptanceStatus") {
        return waybill.purchaseLogistics?.acceptanceStatus || "--";
    }

    if (key === "acceptanceForm") {
        return waybill.purchaseLogistics ? "验收入库单" : "--";
    }

    return waybill[key] || "--";
};

const getWaybillTransportRecord = (waybill: WaybillItem): LogisticsTraceRecord | null => {
    if (waybill.purchaseLogistics) return waybill.purchaseLogistics;
    if (waybill.direction !== "receive" || !waybill.trackingNo) return null;
    return {
        courierCompany: waybill.company,
        trackingNo: waybill.trackingNo,
        transportInfo: waybill.transportInfo,
        transportTraces: waybill.transportTraces || [],
        transportStatus: waybill.transportStatus || "待发货",
    };
};

const getCellClass = (key: WaybillColumnKey) => ({
    "image-cell": key === "image",
    "remark-cell": key === "remark",
    "status-cell": key === "transportStatus" || key === "acceptanceStatus",
});

const shouldShowPopover = (waybill: WaybillItem, key: WaybillColumnKey) => {
    const text = getWaybillCellValue(waybill, key);

    return text !== "--" && text.length > 12;
};

const openImportDialog = () => {
    if (isReadonly.value) return;
    importFile.value = null;
    importResult.value = null;
    showImportDialog.value = true;
};

const closeImportDialog = () => {
    if (isImporting.value) return;
    showImportDialog.value = false;
    importFile.value = null;
    importResult.value = null;
    isImportDragover.value = false;
};

const openQuickInboundDialog = () => {
    if (isReadonly.value) return;
    const selected = waybills.value.filter((w) => selectedWaybillIds.value.includes(w.id));
    const cgdWaybills = selected.filter((w) => w.relatedOrderNo?.startsWith("CGD-"));
    if (cgdWaybills.length === 0) {
        ElMessage.warning("请选择包含采购单号的收件运单");
        return;
    }
    const uniqueOrderNos = [...new Set(cgdWaybills.map((w) => w.relatedOrderNo))];
    if (uniqueOrderNos.length > 1) {
        ElMessage.warning("请选择同一采购单的运单进行快捷入库");
        return;
    }
    const target = cgdWaybills[0];
    quickInboundTarget.value = {
        purchaseOrderNo: target.relatedOrderNo,
        courierCompany: target.company,
        trackingNo: target.trackingNo,
    };
    showQuickInboundDialog.value = true;
};

const closeQuickInboundDialog = () => {
    showQuickInboundDialog.value = false;
    quickInboundTarget.value = null;
};

const confirmQuickInbound = () => {
    closeQuickInboundDialog();
    reloadWaybillsFromFirstPage();
};

const removeImportFile = () => {
    if (isImporting.value) return;
    importFile.value = null;
    importResult.value = null;
};

const setImportFile = (file: File) => {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".xlsx")) {
        ElMessage.warning("请上传 Excel 文件（.xlsx）");
        return;
    }
    if (file.size > INVENTORY_IMPORT_MAX_FILE_SIZE_BYTES) {
        ElMessage.warning(INVENTORY_IMPORT_FILE_SIZE_MESSAGE);
        return;
    }
    importFile.value = file;
    importResult.value = null;
};

const handleImportFileChange = (event: Event) => {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file) setImportFile(file);
    input.value = "";
};

const handleImportDragover = () => {
    if (isImporting.value) return;
    isImportDragover.value = true;
};

const handleImportDragleave = () => {
    isImportDragover.value = false;
};

const handleImportDrop = (event: DragEvent) => {
    if (isImporting.value) return;
    isImportDragover.value = false;
    const droppedFiles = Array.from(event.dataTransfer?.files || []);
    droppedFiles.forEach(setImportFile);
};

const downloadWaybillImportTemplate = async () => {
    const XLSX = await import("xlsx");
    const headers = ["记录方向", "物流公司", "单号", "托寄物", "业务类型", "寄件时间", "发货地", "收货地", "收件人", "关联订单号", "销售人员", "图片URL", "图片名称", "备注"];
    const example = ["寄件", "顺丰", "SF1234567890", "无人机配件", "生产工具", "2026-06-30", "", "上海", "张三", "", "雪糕", "/uploads/example-waybill.jpg", "运单图片.jpg", "示例：运单导入"];
    const ws = XLSX.utils.aoa_to_sheet([headers, example]);
    ws["!cols"] = headers.map(() => ({ wch: 16 }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "运单记录导入模板");
    XLSX.writeFile(wb, "运单记录导入模板.xlsx");
};

const confirmImport = async () => {
    if (isReadonly.value || !importFile.value || isImporting.value) return;
    isImporting.value = true;
    try {
        const res = await importInventoryWaybills(importFile.value);
        if (res.code !== 200) {
            ElMessage.error(res.msg || "导入运单记录失败");
            return;
        }
        importResult.value = res.data || { successCount: 0, failCount: 0, errors: [] };
        if (importResult.value.failCount === 0) {
            ElMessage.success(`导入成功，共 ${importResult.value.successCount} 条`);
            await reloadWaybillsFromFirstPage();
        } else {
            ElMessage.warning(`导入完成：成功 ${importResult.value.successCount} 条，失败 ${importResult.value.failCount} 条`);
        }
    } catch (err: any) {
        ElMessage.error(err?.data?.msg || err?.message || "导入运单记录失败");
    } finally {
        isImporting.value = false;
    }
};

const exportWaybills = async () => {
    try {
        const blob = await exportInventoryWaybills({
            direction: isSellerReadonly.value ? "send" : activeDirection.value,
            keyword: selectedWaybillIds.value.length ? undefined : appliedSearchText.value || undefined,
            company: selectedWaybillIds.value.length ? undefined : appliedCompany.value || undefined,
            businessType: selectedWaybillIds.value.length ? undefined : appliedBusinessType.value || undefined,
            relatedOrderNo: selectedWaybillIds.value.length ? undefined : appliedRelatedOrderNo.value || undefined,
            trackingNo: selectedWaybillIds.value.length ? undefined : appliedTrackingNo.value || undefined,
            salesperson: isSellerReadonly.value || selectedWaybillIds.value.length
                ? undefined
                : appliedSalesperson.value || undefined,
            sortOrder: appliedSortOrder.value,
            startDate: selectedWaybillIds.value.length ? undefined : appliedStartDate.value || undefined,
            endDate: selectedWaybillIds.value.length ? undefined : appliedEndDate.value || undefined,
            ids: selectedWaybillIds.value.length ? selectedWaybillIds.value.join(",") : undefined,
        });
        downloadBlob(blob, selectedWaybillIds.value.length ? "选中运单记录.xlsx" : "运单记录.xlsx");
    } catch (err: any) {
        ElMessage.error(err?.data?.msg || err?.message || "导出运单记录失败");
    }
};

const openColumnConfigDialog = () => {
    showColumnConfigDialog.value = true;
};

const closeColumnConfigDialog = () => {
    showColumnConfigDialog.value = false;
};

const WAYBILL_COLUMN_CONFIG_STORAGE_KEY = "inventory.waybill.columnConfigs";

const confirmColumnConfig = () => {
    persistColumnConfigs();
    closeColumnConfigDialog();
};

const persistColumnConfigs = () => {
    const configs = columnConfigs.map((column) => ({
        key: column.key,
        visible: column.visible,
        locked: column.locked,
    }));
    localStorage.setItem(WAYBILL_COLUMN_CONFIG_STORAGE_KEY, JSON.stringify(configs));
};

const applyStoredColumnConfigs = () => {
    const rawConfigs = localStorage.getItem(WAYBILL_COLUMN_CONFIG_STORAGE_KEY);
    if (!rawConfigs) {
        return;
    }

    try {
        const configs = JSON.parse(rawConfigs) as Array<{ key: string; visible: boolean; locked: boolean }>;
        const configMap = new Map(configs.map((c) => [c.key, c]));

        columnConfigs.forEach((column) => {
            const stored = configMap.get(column.key);
            if (stored) {
                column.visible = stored.visible;
                column.locked = stored.locked;
            }
        });

        const orderedKeys = configs.map((c) => c.key);
        columnConfigs.sort((a, b) => {
            const indexA = orderedKeys.indexOf(a.key);
            const indexB = orderedKeys.indexOf(b.key);
            const orderA = indexA >= 0 ? indexA : 999;
            const orderB = indexB >= 0 ? indexB : 999;
            return orderA - orderB;
        });
        sortLockedColumnsFirst();
    } catch {
        localStorage.removeItem(WAYBILL_COLUMN_CONFIG_STORAGE_KEY);
    }
};

const toggleColumnVisible = (columnKey: string) => {
    const column = columnConfigs.find((config) => config.key === columnKey);

    if (column) {
        column.visible = !column.visible;
    }
};

const toggleAllColumnsVisible = () => {
    const nextVisible = !allColumnsVisible.value;

    availableColumnConfigs.value.forEach((column) => {
        column.visible = nextVisible;
    });
};

const sortLockedColumnsFirst = () => {
    const locked = columnConfigs.filter((column) => column.locked);
    const unlocked = columnConfigs.filter((column) => !column.locked);

    columnConfigs.splice(0, columnConfigs.length, ...locked, ...unlocked);
};

const toggleColumnLocked = (columnKey: string) => {
    const column = columnConfigs.find((config) => config.key === columnKey);

    if (!column) {
        return;
    }

    column.locked = !column.locked;
    sortLockedColumnsFirst();
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

const startColumnDrag = (columnKey: string) => {
    draggingColumnKey.value = columnKey as WaybillColumnKey;
};

const dropColumn = (targetColumnKey: string) => {
    if (!draggingColumnKey.value || draggingColumnKey.value === targetColumnKey) {
        return;
    }

    const fromIndex = columnConfigs.findIndex(
        (column) => column.key === draggingColumnKey.value,
    );
    const toIndex = columnConfigs.findIndex((column) => column.key === targetColumnKey);

    moveColumnConfig(fromIndex, toIndex);
    draggingColumnKey.value = null;
};

onMounted(() => {
    document.addEventListener("click", handlePageClick);
    applyStoredColumnConfigs();
    loadWaybills();
});

onBeforeUnmount(() => {
    document.removeEventListener("click", handlePageClick);
    revokeImagePreviews();
});
</script>

<style scoped>
button,
input,
select,
textarea {
    font: inherit;
}

button {
    appearance: none;
}

.topbar,
.filter-row,
.toolbar,
.toolbar-left,
.filter-actions {
    display: flex;
    align-items: center;
}

.waybill-tabs {
    display: flex;
    gap: 24px;
    height: 42px;
    align-items: flex-end;
    border-bottom: 1px solid #ebeef5;
    margin-bottom: 0;
}

.waybill-tabs button {
    height: 42px;
    padding: 0 4px;
    border: 0;
    border-bottom: 2px solid transparent;
    background: transparent;
    color: #606266;
    cursor: pointer;
}

.waybill-tabs button.active {
    color: #409eff;
    border-bottom-color: #409eff;
}

.topbar,
.toolbar {
    justify-content: space-between;
}

.filter-row {
    gap: 60px;
}

.filter-field {
    display: flex;
    align-items: center;
    gap: 12px;
    color: var(--waybill-text);
    font-size: 16px;
}

.filter-field select,
.form-row select {
    border: 1px solid var(--erp-color-border-default);
    border-radius: var(--erp-radius-control-default);
    outline: 0;
    color: var(--erp-color-text-primary);
    background-color: var(--erp-color-fill-default);
    font-size: var(--erp-typography-content1-font-size);
    appearance: none;
    background-image: var(--waybill-select-arrow);
    background-repeat: no-repeat;
    background-position: right 12px center;
    background-size: 12px 12px;
}

.filter-field select {
    width: 200px;
    height: var(--erp-size-control-height-sm);
    padding: 0 34px 0 12px;
}

.text-filter input {
    width: 180px;
    height: var(--erp-size-control-height-sm);
    padding: 0 12px;
    border: 1px solid var(--erp-color-border-default);
    border-radius: var(--erp-radius-control-default);
    color: var(--erp-color-text-primary);
    background: var(--erp-color-fill-default);
}

.date-range-picker {
    position: relative;
    z-index: 40;
}

.date-range-trigger {
    width: 200px;
    height: 26px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 0 8px 0 10px;
    border: 1px solid var(--waybill-muted);
    border-radius: 8px;
    color: var(--waybill-text);
    background: var(--erp-color-fill-default);
    font-size: 14px;
    cursor: pointer;
}

.date-range-trigger span {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.date-range-trigger .placeholder {
    color: var(--erp-color-text-primary);
}

.date-range-icon {
    width: 16px;
    height: 16px;
    flex: 0 0 16px;
    color: var(--waybill-text);
}

.date-range-panel {
    position: absolute;
    top: calc(100% + 8px);
    left: 0;
    z-index: 1000;
    width: 560px;
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    overflow: hidden;
    padding: 0;
    border: 1px solid var(--erp-color-border-muted);
    border-radius: 6px;
    background: var(--erp-color-fill-default);
    box-shadow: var(--erp-shadow-surface);
}

.calendar-panel {
    min-width: 0;
    padding: 18px 28px 20px;
}

.calendar-panel + .calendar-panel {
    border-left: 1px solid var(--erp-color-divider-default);
}

.calendar-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 20px;
}

.calendar-header h3 {
    margin: 0;
    color: var(--waybill-text);
    font-size: 14px;
    font-weight: 600;
}

.calendar-nav {
    display: flex;
    align-items: center;
    gap: 4px;
}

.date-range-panel .calendar-nav button,
.datetime-panel .calendar-nav button {
    width: 22px;
    height: 22px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    border: 0;
    color: var(--waybill-text);
    background: transparent;
    box-shadow: none;
    cursor: pointer;
}

.calendar-nav :deep(svg) {
    width: 14px;
    height: 14px;
}

.calendar-weekdays,
.calendar-days {
    display: grid;
    grid-template-columns: repeat(7, 1fr);
    text-align: center;
}

.calendar-weekdays {
    margin-bottom: 12px;
    color: var(--waybill-text);
    font-size: 13px;
    font-weight: 500;
}

.calendar-weekdays span,
.date-range-panel .calendar-day,
.datetime-panel .calendar-day {
    height: 30px;
    display: flex;
    align-items: center;
    justify-content: center;
}

.date-range-panel .calendar-day,
.datetime-panel .calendar-day {
    position: relative;
    z-index: 0;
    padding: 0;
    border: 0;
    border-radius: 0;
    color: var(--erp-color-text-secondary);
    background: transparent;
    box-shadow: none;
    font-size: 13px;
    cursor: pointer;
}

.date-range-panel .calendar-day.empty,
.datetime-panel .calendar-day.empty {
    cursor: default;
}

.date-range-panel .calendar-day.in-range,
.datetime-panel .calendar-day.in-range {
    background: var(--erp-color-fill-nav-selected);
    color: var(--waybill-blue);
}

.date-range-panel .calendar-day.selected,
.datetime-panel .calendar-day.selected {
    color: var(--erp-color-text-white);
}

.date-range-panel .calendar-day.selected::before,
.datetime-panel .calendar-day.selected::before {
    content: "";
    position: absolute;
    z-index: -1;
    width: 24px;
    height: 24px;
    border-radius: 50%;
    background: var(--waybill-blue);
}

.date-range-panel .today-button,
.datetime-panel .today-button {
    width: fit-content;
    display: block;
    margin: 14px auto 0;
    padding: 0;
    border: 0;
    color: var(--waybill-blue);
    background: transparent;
    box-shadow: none;
    font-size: 14px;
    cursor: pointer;
}

.filter-actions {
    margin-left: auto;
    gap: 12px;
}

.toolbar-left {
    gap: 8px;
}

.primary-button {
    border: 0;
    border-radius: 10px;
    background: var(--waybill-blue);
    color: var(--erp-color-text-white);
    cursor: pointer;
}

.primary-button,
.outline-button,
.muted-button,
.text-button {
    height: 32px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 4px;
    padding: 4px 8px;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
}

.outline-button {
    border: 1px solid var(--waybill-muted);
    border-radius: 10px;
    color: var(--waybill-text);
    background: var(--erp-color-fill-default);
}

.outline-button:disabled {
    color: var(--waybill-muted);
    cursor: not-allowed;
    opacity: 0.62;
}

.danger-button {
    border-color: var(--erp-color-border-error);
    color: var(--erp-color-text-status-error);
}

.danger-button:not(:disabled):hover {
    border-color: var(--erp-color-border-error);
    background: var(--erp-color-bg-status-error-subtle);
}

.muted-button {
    border: 0;
    border-radius: 10px;
    color: var(--erp-color-text-white);
    background: var(--erp-color-neutral-400);
}

.muted-button.active {
    background: var(--waybill-blue);
}

.text-button {
    border: 0;
    color: var(--waybill-text);
    background: transparent;
}

.button-icon {
    width: 20px;
    height: 20px;
}

.import-dialog {
    width: 560px;
    display: grid;
    grid-template-rows: 40px minmax(0, 1fr) 48px;
    gap: 16px;
    padding: 20px;
    border-radius: 8px;
    background: var(--erp-color-fill-default);
    box-shadow: var(--erp-shadow-surface);
}

.import-section-title {
    margin: 8px 0 12px;
    padding-bottom: 8px;
    border-bottom: 1px solid var(--erp-color-divider-subtle);
    color: var(--erp-color-text-secondary);
    font-size: 14px;
}

.import-upload-box {
    height: 118px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 10px;
    border: 1px dashed var(--erp-color-border-muted);
    border-radius: 8px;
    color: var(--erp-color-text-secondary);
    font-size: 14px;
    cursor: pointer;
    transition: border-color 0.2s, background 0.2s;
}

.import-upload-box.disabled {
    cursor: not-allowed;
    opacity: 0.65;
}

.import-upload-box:hover,
.import-upload-box.is-dragover {
    border-color: var(--waybill-blue);
    background: var(--erp-color-fill-nav-selected);
}

.import-upload-box input {
    display: none;
}

.upload-icon {
    width: 28px;
    height: 28px;
}

.import-file-attachment {
    min-height: 48px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 10px 12px;
    border: 1px solid var(--erp-color-divider-subtle);
    border-radius: 8px;
    background: var(--erp-color-fill-hover);
}

.import-file-info {
    min-width: 0;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    color: var(--erp-color-text-secondary-strong);
    font-size: 13px;
}

.import-file-info span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.import-file-icon {
    flex: 0 0 auto;
    color: var(--waybill-blue);
}

.import-file-remove {
    flex: 0 0 auto;
    border: 0;
    color: var(--erp-color-text-status-error);
    background: transparent;
    cursor: pointer;
}

.import-hint {
    margin: 8px 0 0;
    color: var(--erp-color-text-secondary);
    font-size: 12px;
}

.import-template-button {
    margin-top: 10px;
    padding: 0;
    border: 0;
    color: var(--waybill-blue);
    background: transparent;
    font-size: 13px;
    cursor: pointer;
}

.import-template-button:hover {
    text-decoration: underline;
}

.import-hint-list {
    display: grid;
    gap: 8px;
    color: var(--erp-color-text-secondary-strong);
    font-size: 13px;
}

.import-hint-list p {
    margin: 0;
}

.import-result {
    margin-top: 12px;
    padding: 10px;
    border-radius: 6px;
    background: var(--erp-color-fill-hover);
    font-size: 13px;
}

.import-errors {
    margin-top: 8px;
    max-height: 120px;
    overflow-y: auto;
    color: var(--erp-color-text-status-error);
}

.dialog-button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
}

.table-row {
    width: 100%;
    min-width: 0;
    display: grid;
    align-items: center;
}

.table-head {
    height: 40px;
    border-radius: 10px;
    background: var(--waybill-table-bg);
    font-size: 16px;
    font-weight: 600;
}

.data-row {
    height: 78px;
    margin-top: 10px;
    border-radius: 10px;
    background: var(--erp-color-fill-default);
    font-size: 14px;
    font-weight: 400;
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
    height: 40px;
    border-radius: 10px;
    background: var(--waybill-table-bg);
    font-size: 16px;
    font-weight: 600;
}

.selection-row,
.action-row {
    height: 78px;
    margin-top: 10px;
    border-radius: 10px;
    background: var(--erp-color-fill-default);
    font-size: 14px;
}

.table-cell {
    min-width: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0 12px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.ellipsis-text {
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.tracking-number-cell {
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 6px;
}

.supplement-tag {
    flex: 0 0 auto;
    padding: 2px 6px;
    border-radius: 4px;
    color: var(--erp-color-text-status-error);
    background: var(--erp-color-bg-status-error-subtle);
    font-size: 12px;
    line-height: 16px;
}

:global(.waybill-remark-popover .remark-popover-content) {
    line-height: 1.4;
    word-break: break-word;
    white-space: normal;
    color: var(--erp-color-text-primary);
    font-size: 14px;
}

.row-checkbox {
    width: 16px;
    height: 16px;
    accent-color: var(--waybill-blue);
}

.image-cell img {
    width: 82px;
    height: 52px;
    object-fit: cover;
    border-radius: 4px;
}

.clickable-image {
    cursor: pointer;
    transition: opacity 0.2s;

    &:hover {
        opacity: 0.8;
    }
}

.actions-cell {
    gap: 10px;
}

.icon-button {
    width: 24px;
    height: 24px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    border: 0;
    background: transparent;
    cursor: pointer;
}

.icon-button.blue {
    color: var(--waybill-blue);
}

.icon-button.delete {
    color: var(--erp-color-text-status-error);
}

.icon-button:disabled {
    color: var(--waybill-muted);
    cursor: not-allowed;
    opacity: 0.55;
}

.dialog-mask {
    position: fixed;
    inset: 0;
    /* Keep dialogs above the page filter/search stacking context. */
    z-index: 1000;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--erp-color-bg-overlay);
}

.waybill-dialog {
    width: 620px;
    max-height: calc(100vh - 56px);
    display: grid;
    grid-template-rows: 44px minmax(0, 1fr) 52px;
    padding: 12px;
    border-radius: 8px;
    background: var(--erp-color-fill-default);
    box-shadow: var(--erp-shadow-surface);
}

.dialog-body {
    min-height: 0;
    overflow-y: auto;
    padding: 18px 72px 10px 42px;
}

.form-row {
    width: 420px;
    min-height: 34px;
    display: grid;
    grid-template-columns: 96px minmax(0, 1fr);
    align-items: center;
    gap: 16px;
    margin: 0 auto 22px;
    color: var(--waybill-text);
    font-size: 14px;
}

.field-label {
    justify-self: end;
    white-space: nowrap;
}

.field-label.required::after {
    content: "*";
    color: var(--erp-color-text-required);
}

.form-row input,
.form-row select,
.form-row textarea {
    width: 100%;
    box-sizing: border-box;
    border: 1px solid var(--erp-color-border-default);
    border-radius: var(--erp-radius-control-default);
    outline: 0;
    color: var(--erp-color-text-primary);
    background: var(--erp-color-fill-default);
    font-size: var(--erp-typography-content1-font-size);
}

.form-row input,
.form-row select {
    height: var(--erp-size-control-height-sm);
}

.form-row input {
    padding: 0 10px;
}

.form-row select {
    padding: 0 34px 0 10px;
}

.form-row :deep(.searchable-select) {
    --searchable-select-height: var(--erp-size-control-height-sm);
    --searchable-select-border: var(--erp-color-border-default);
    --searchable-select-radius: var(--erp-radius-control-default);
    --searchable-select-font-size: var(--erp-typography-content1-font-size);
    --searchable-select-active-border: var(--erp-color-border-brand);
    --searchable-select-text: var(--erp-color-text-primary);

    width: 100%;
}

.form-row :deep(.searchable-select-input) {
    padding: 0 34px 0 10px;
}

.datetime-picker {
    position: relative;
    min-width: 0;
}

.datetime-trigger {
    width: 100%;
    height: var(--erp-size-control-height-sm);
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 0 10px;
    border: 1px solid var(--erp-color-border-default);
    border-radius: var(--erp-radius-control-default);
    color: var(--erp-color-text-primary);
    background: var(--erp-color-fill-default);
    box-shadow: none;
    font-size: var(--erp-typography-content1-font-size);
    cursor: pointer;
}

.datetime-trigger span {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.datetime-trigger .placeholder {
    color: var(--waybill-muted);
}

.datetime-trigger :deep(svg) {
    width: 18px;
    height: 18px;
    flex: 0 0 18px;
    color: var(--waybill-text);
}

.datetime-panel {
    position: absolute;
    top: calc(100% + 8px);
    left: 0;
    z-index: 60;
    width: 280px;
    overflow: hidden;
    padding: 0;
    border: 1px solid var(--erp-color-border-muted);
    border-radius: 10px;
    background: var(--erp-color-fill-default);
    box-shadow: var(--erp-shadow-surface);
}

.single-calendar-panel {
    padding: 18px 28px 20px;
}

.business-type-select {
    display: grid;
    gap: 8px;
}

.business-type-select p {
    width: 100%;
    margin: 0;
    color: var(--waybill-blue);
    font-size: 13px;
}

.textarea-row {
    min-height: 120px;
    align-items: start;
}

.form-row textarea {
    height: 112px;
    padding: 10px;
    resize: none;
    line-height: 1.5;
}

.form-row textarea::placeholder {
    color: var(--waybill-muted);
}

.upload-row {
    align-items: start;
}

.upload-field {
    min-width: 0;
}

.uploaded-file-list {
    display: grid;
    gap: 8px;
    margin-bottom: 8px;
}

.uploaded-file {
    min-width: 0;
    height: 30px;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 0 8px;
    border: 1px solid var(--erp-color-border-muted);
    border-radius: 7px;
    background: var(--erp-color-fill-nav-selected);
}

.uploaded-file.previewable-file {
    cursor: pointer;
}

.uploaded-file.previewable-file:focus-visible {
    outline: 2px solid var(--waybill-blue);
    outline-offset: 2px;
}

.uploaded-file :deep(svg) {
    width: 16px;
    height: 16px;
    flex: 0 0 16px;
    color: var(--waybill-blue);
}

.uploaded-file span {
    min-width: 0;
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.uploaded-file button {
    flex: 0 0 auto;
    padding: 0;
    border: 0;
    color: var(--erp-color-text-status-error);
    background: transparent;
    font-size: 13px;
    cursor: pointer;
}

.upload-box {
    height: 120px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 10px;
    border: 1px dashed var(--erp-color-border-muted);
    border-radius: 7px;
    color: var(--waybill-muted);
    background: var(--erp-color-fill-default);
    cursor: pointer;
}

.upload-box.attachment {
    height: 104px;
}

.upload-box input {
    display: none;
}

.upload-icon {
    width: 22px;
    height: 22px;
    color: var(--waybill-blue);
}

.upload-field p {
    margin: 8px 0 0;
    color: var(--waybill-muted);
    font-size: 13px;
}

.dialog-button {
    width: 84px;
    height: 34px;
    border-radius: 8px;
    font-size: 14px;
    cursor: pointer;
}

.dialog-button.cancel {
    border: 1px solid var(--erp-color-border-default);
    color: var(--erp-color-text-secondary-strong);
    background: var(--erp-color-fill-default);
}

.dialog-button.confirm {
    border: 1px solid var(--waybill-blue);
    color: var(--erp-color-text-white);
    background: var(--waybill-blue);
}

.waybill-page {
    --inventory-config-dialog-text: var(--erp-color-text-primary);
    --inventory-config-dialog-muted: var(--erp-color-text-placeholder);
    --inventory-config-dialog-table-bg: var(--erp-color-fill-table-header);
    --inventory-config-dialog-blue: var(--erp-color-action-primary);
    --waybill-blue: var(--erp-color-action-primary);
    --waybill-blue-light: var(--erp-color-fill-nav-selected);
    --waybill-table-bg: var(--erp-color-fill-table-header);
    --waybill-text: var(--erp-color-text-primary);
    --waybill-muted: var(--erp-color-text-placeholder);
    --waybill-soft: var(--erp-color-fill-control-secondary);
    --waybill-selection-width: 58px;
    --waybill-action-width: var(--erp-table-col-action);
    --waybill-select-arrow: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23262626' stroke-width='2.4' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E");
    --inventory-date-picker-panel-width: 288px;

    height: 100%;
    display: grid;
    grid-template-rows: 40px 42px minmax(56px, auto) 40px minmax(0, 1fr) 52px;
    gap: var(--erp-spacing-12);
    color: var(--erp-color-text-primary);
}

.topbar {
    height: auto;
    padding: 0;
    background: transparent;
}

.filter-row {
    position: relative;
    z-index: 100;
    gap: 14px;
    padding: var(--erp-spacing-8) var(--erp-spacing-12);
    border-radius: var(--erp-radius-surface-default);
    background: var(--erp-color-fill-default);
    min-width: 0;
    flex-wrap: wrap;
    overflow: visible;
}

.filter-field {
    gap: 8px;
    flex: 0 0 auto;
    white-space: nowrap;
    color: var(--erp-color-text-primary);
    font-size: var(--erp-typography-content1-font-size);
    line-height: var(--erp-typography-content1-line-height);
}

.filter-field select {
    width: 156px;
    height: var(--erp-size-control-height-sm);
    border-color: var(--erp-color-border-default);
    border-radius: var(--erp-radius-control-default);
    color: var(--erp-color-text-primary);
}

.date-range-trigger {
    width: 180px;
    height: var(--erp-size-control-height-sm);
    border-color: var(--erp-color-border-default);
    border-radius: var(--erp-radius-control-default);
    color: var(--erp-color-text-primary);
}

.filter-actions,
.toolbar-left {
    gap: 8px;
}

.toolbar,
.waybill-page :deep(.erp-table-frame),
.waybill-page :deep(.inventory-pagination) {
    position: relative;
    z-index: 1;
}

.filter-actions {
    margin-left: auto;
    flex: 0 0 auto;
    white-space: nowrap;
}

.text-filter input {
    width: 150px;
}

.sort-filter select {
    width: 148px;
}

.primary-button,
.outline-button,
.muted-button,
.text-button {
    height: var(--erp-size-control-height-sm);
    padding: var(--erp-spacing-4) var(--erp-spacing-8);
    border-radius: var(--erp-radius-control-default);
    font-size: var(--erp-typography-title3-font-size);
    font-weight: var(--erp-typography-title3-font-weight);
    line-height: var(--erp-typography-title3-line-height);
}

.primary-button,
.muted-button.active {
    background: var(--erp-color-action-primary);
}

.outline-button {
    border-color: var(--erp-color-border-default);
    color: var(--erp-color-text-primary);
}

.danger-button {
    border-color: var(--erp-color-border-error);
    color: var(--erp-color-text-status-error);
}

.danger-button:not(:disabled):hover {
    border-color: var(--erp-color-border-error);
    background: var(--erp-color-bg-status-error);
}

.danger-button:disabled {
    border-color: color-mix(in srgb, var(--erp-color-border-error) 70%, transparent);
    color: color-mix(in srgb, var(--erp-color-text-status-error) 70%, transparent);
    background: var(--erp-color-fill-default);
    opacity: 1;
}

.waybill-page :deep(.erp-table-frame .table-head) {
    height: 48px;
    margin: 0;
    border-radius: 0;
    background: var(--erp-color-fill-table-header);
}

.waybill-page :deep(.erp-table-frame .data-row) {
    height: 64px;
    margin: 0;
    border-radius: 0;
    border-bottom-color: var(--erp-color-divider-default);
    background: var(--erp-color-fill-default);
}

.waybill-page :deep(.erp-table-frame .selection-head),
.waybill-page :deep(.erp-table-frame .selection-row),
.waybill-page :deep(.erp-table-frame .action-head),
.waybill-page :deep(.erp-table-frame .action-row) {
    height: 100%;
    margin: 0;
    border-radius: 0;
    background: inherit;
}

.waybill-page :deep(.erp-table-frame .action-head) {
    background: var(--erp-color-fill-table-header);
}

.waybill-page :deep(.erp-table-frame .data-row:hover .action-row) {
    background: var(--erp-color-fill-hover);
}

.waybill-page :deep(.erp-table-frame .table-cell) {
    padding: 0 var(--erp-spacing-20);
}

.waybill-page :deep(.erp-table-frame .checkbox-cell) {
    padding: 0;
}

.waybill-page :deep(.erp-table-frame .erp-table-fixed-end) {
    position: sticky;
    right: 0;
    z-index: 4;
    background: inherit;
}

.waybill-locked-cell {
    position: sticky;
    z-index: 4;
    height: 100%;
    background: inherit;
}

.waybill-page :deep(.erp-table-frame .clickable-image) {
    width: 90px;
    height: 58px;
    object-fit: contain;
}

.waybill-dialog {
    width: 600px;
    min-width: 600px;
    max-width: 1240px;
    min-height: 300px;
    max-height: 800px;
    grid-template-rows: 52px minmax(0, 1fr) 64px;
    overflow: hidden;
    padding: 0;
    border: 1px solid var(--erp-color-border-muted);
    border-radius: var(--erp-radius-surface-dialog);
    background: var(--erp-color-fill-default);
    box-shadow: none;
}

.waybill-form-body {
    display: grid;
    gap: var(--erp-spacing-12);
}

.waybill-dialog .form-row {
    width: 384px;
    min-height: var(--erp-size-control-height-sm);
    grid-template-columns: 92px minmax(0, 1fr);
    gap: var(--erp-spacing-12);
    margin: 0 auto;
    color: var(--erp-color-text-primary);
    font-size: var(--erp-typography-content1-font-size);
    font-weight: var(--erp-typography-content1-font-weight);
    line-height: var(--erp-typography-content1-line-height);
}

.waybill-dialog .field-label {
    justify-self: end;
}

.waybill-dialog .textarea-row {
    min-height: 120px;
}

.waybill-dialog .form-row textarea {
    height: 120px;
}

.waybill-dialog .datetime-panel {
    border-color: var(--erp-color-border-muted);
    border-radius: var(--erp-radius-surface-default);
}

.import-dialog {
    min-width: 0;
    max-width: 95vw;
    max-height: 90vh;
    grid-template-rows: 52px minmax(0, 1fr) 64px;
    gap: 0;
    padding: 0;
    border: 1px solid var(--erp-color-border-muted);
    border-radius: var(--erp-radius-surface-dialog);
    background: var(--erp-color-fill-default);
    box-shadow: none;
}

.import-dialog :deep(.erp-dialog-frame__body) {
    padding: var(--erp-spacing-12);
    overflow: hidden;
}

.import-dialog-body {
    min-height: 0;
    display: grid;
    align-content: start;
    gap: var(--erp-spacing-12);
    padding: var(--erp-spacing-12);
    overflow: auto;
    border: 1px solid var(--erp-color-border-muted);
    border-radius: var(--erp-radius-surface-default);
    background: var(--erp-color-fill-default);
}

.import-dialog .import-section-title {
    margin: 0;
    padding-bottom: var(--erp-spacing-8);
    border-bottom-color: var(--erp-color-divider-default);
    color: var(--erp-color-text-primary);
    font-size: var(--erp-typography-title3-font-size);
    font-weight: var(--erp-typography-title3-font-weight);
    line-height: var(--erp-typography-title3-line-height);
}

.import-dialog .import-upload-box,
.import-dialog .import-file-attachment {
    border-color: var(--erp-color-border-default);
    border-radius: var(--erp-radius-control-default);
}

.import-dialog .import-upload-box:hover,
.import-dialog .import-upload-box.is-dragover {
    border-color: var(--erp-color-border-brand);
    background: var(--erp-color-fill-hover);
}

.import-dialog .import-hint,
.import-dialog .import-hint-list,
.import-dialog .import-file-info,
.import-dialog .import-template-button,
.import-dialog .import-result {
    color: var(--erp-color-text-secondary);
    font-size: var(--erp-typography-content2-font-size);
    line-height: var(--erp-typography-content2-line-height);
}

@media (max-width: 1200px) {
    .waybill-page {
        min-width: 900px;
    }

    .filter-row {
        gap: 24px;
    }
}
.transport-cell {
    display: grid;
    align-content: center;
    gap: 4px;
    min-width: 0;
}

.transport-latest {
    display: block;
    color: var(--erp-color-text-primary);
}

.trace-link {
    width: fit-content;
    padding: 0;
    border: 0;
    color: var(--erp-color-text-link);
    background: transparent;
    font-size: 12px;
    cursor: pointer;
}

.status-tag {
    display: inline-flex;
    align-items: center;
    min-height: 26px;
    padding: 2px 8px;
    border-radius: var(--erp-radius-control-default);
    color: var(--erp-color-text-status-review);
    background: var(--erp-color-bg-status-review);
}

.status-tag[data-status="验收正常"],
.status-tag[data-status="已签收"] {
    color: var(--erp-color-text-status-complete);
    background: var(--erp-color-bg-status-complete);
}

.status-tag[data-status="验收异常"] {
    color: var(--erp-color-text-status-error);
    background: var(--erp-color-bg-status-error-subtle);
}

.acceptance-dialog.erp-dialog-frame {
    max-width: calc(100vw - 32px);
    max-height: calc(100vh - 32px);
}

.acceptance-dialog-mask {
    z-index: 200;
}

.acceptance-dialog :deep(.erp-dialog-frame__body) {
    align-content: stretch;
    padding: var(--erp-spacing-16);
    overflow: hidden;
    background: var(--erp-color-bg-page);
}

.acceptance-dialog :deep(.erp-dialog-frame__actions) {
    padding: var(--erp-spacing-12) var(--erp-spacing-16);
}

.acceptance-body {
    min-width: 0;
    min-height: 0;
    height: 100%;
    display: grid;
    grid-template-rows: auto minmax(220px, 330px) auto;
    align-content: start;
    gap: var(--erp-spacing-16);
    overflow: auto;
}

.acceptance-section {
    min-width: 0;
    display: grid;
    border: 1px solid var(--erp-color-border-muted);
    border-radius: var(--erp-radius-surface-default);
    background: var(--erp-color-fill-default);
}

.acceptance-section-title {
    min-height: 48px;
    display: flex;
    align-items: center;
    margin: 0;
    padding: 0 var(--erp-spacing-16);
    border-bottom: 1px solid var(--erp-color-divider-subtle);
    color: var(--erp-color-text-primary);
    font-size: var(--erp-typography-title2-font-size);
    font-weight: var(--erp-typography-title2-font-weight);
    line-height: var(--erp-typography-title2-line-height);
}

.acceptance-basic-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(420px, 560px));
    justify-content: start;
    gap: var(--erp-spacing-16) var(--erp-spacing-24);
    padding: var(--erp-spacing-16) var(--erp-spacing-20);
}

.acceptance-order-field {
    grid-column: 1;
    grid-row: 1;
}

.acceptance-waybill-field {
    grid-column: 2;
    grid-row: 1;
}

.acceptance-remark {
    grid-column: 1;
    grid-row: 2;
}

.acceptance-images-field {
    grid-column: 2;
    grid-row: 2;
}

.acceptance-operator-field {
    grid-column: 1;
    grid-row: 3;
}

.acceptance-form-field {
    min-width: 0;
    display: grid;
    grid-template-columns: 92px minmax(0, 1fr);
    align-items: center;
    gap: var(--erp-spacing-12);
}

.acceptance-form-field > span {
    color: var(--erp-color-text-primary);
    text-align: right;
    white-space: nowrap;
}

.acceptance-form-field.required > span::after {
    color: var(--erp-color-text-required);
    content: "*";
}

.acceptance-form-field input,
.acceptance-form-field textarea,
.acceptance-row input {
    box-sizing: border-box;
    border: 1px solid var(--erp-color-border-default);
    border-radius: var(--erp-radius-control-default);
    outline: 0;
    color: var(--erp-color-text-primary);
    background: var(--erp-color-fill-default);
}

.acceptance-form-field input {
    width: 100%;
    height: var(--erp-size-control-height-md);
    padding: 0 var(--erp-spacing-12);
}

.acceptance-form-field input:read-only,
.acceptance-row input:read-only {
    border-color: var(--erp-color-border-muted);
    background: var(--erp-color-fill-disabled);
}

.acceptance-remark,
.acceptance-evidence-field {
    align-items: start;
}

.acceptance-remark > span,
.acceptance-evidence-field > span {
    padding-top: var(--erp-spacing-8);
}

.acceptance-remark textarea {
    min-height: 160px;
    padding: var(--erp-spacing-8) var(--erp-spacing-12);
    resize: vertical;
}

.acceptance-remark textarea:read-only {
    border-color: var(--erp-color-border-muted);
    background: var(--erp-color-fill-disabled);
    resize: none;
}

.acceptance-evidence-content {
    min-width: 0;
}

.acceptance-evidence-list {
    display: grid;
    gap: var(--erp-spacing-8);
    margin-bottom: var(--erp-spacing-8);
}

.acceptance-evidence-file {
    min-width: 0;
    min-height: 34px;
    display: grid;
    grid-template-columns: 18px minmax(0, 1fr) auto;
    align-items: center;
    gap: var(--erp-spacing-8);
    padding: 0 var(--erp-spacing-10);
    border: 1px solid var(--erp-color-border-muted);
    border-radius: var(--erp-radius-control-default);
    background: var(--erp-color-fill-secondary);
}

.acceptance-evidence-file :deep(svg) {
    width: 16px;
    height: 16px;
    color: var(--erp-color-action-primary);
}

.acceptance-evidence-file button {
    min-width: 0;
    overflow: hidden;
    padding: 0;
    border: 0;
    color: var(--erp-color-text-link);
    background: transparent;
    text-align: left;
    text-overflow: ellipsis;
    white-space: nowrap;
    cursor: pointer;
}

.acceptance-evidence-file .remove-button {
    color: var(--erp-color-text-status-error);
}

.acceptance-upload-box {
    width: 100%;
    min-height: 160px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--erp-spacing-8);
    border: 1px dashed var(--erp-color-border-default);
    border-radius: var(--erp-radius-control-default);
    color: var(--erp-color-text-placeholder);
    background: var(--erp-color-fill-default);
    cursor: pointer;
}

.acceptance-upload-box.disabled {
    background: var(--erp-color-fill-disabled);
    cursor: wait;
}

.acceptance-upload-box input {
    display: none;
}

.acceptance-upload-box :deep(svg) {
    width: 22px;
    height: 22px;
    color: var(--erp-color-action-primary);
}

.acceptance-evidence-content p {
    margin: var(--erp-spacing-8) 0 0;
    color: var(--erp-color-text-tertiary);
    font-size: var(--erp-typography-content2-font-size);
}

.acceptance-detail-section {
    min-height: 0;
    grid-template-rows: auto minmax(0, 1fr);
    overflow: hidden;
}

.acceptance-table-scroll {
    min-width: 0;
    min-height: 0;
    overflow: auto;
}

.acceptance-table {
    width: 100%;
    min-width: 1320px;
}

.acceptance-row {
    display: grid;
    grid-template-columns: 170px minmax(200px, 1fr) 120px 180px 120px 120px 130px minmax(240px, 1fr);
    align-items: center;
    gap: var(--erp-spacing-8);
    min-height: 64px;
    padding: var(--erp-spacing-8) var(--erp-spacing-16);
    border-bottom: 1px solid var(--erp-color-divider-subtle);
}

.acceptance-row:last-child {
    border-bottom: 0;
}

.acceptance-head {
    position: sticky;
    top: 0;
    z-index: 1;
    min-height: 48px;
    color: var(--erp-color-text-secondary);
    background: var(--erp-color-fill-table-header);
    font-weight: 600;
}

.acceptance-row input {
    width: 100%;
    height: var(--erp-size-control-height-sm);
    padding: 0 var(--erp-spacing-8);
}

.acceptance-row input:focus {
    border-color: var(--erp-color-border-brand);
}

.product-name {
    min-width: 0;
    display: flex;
    flex-direction: column;
}

.product-name small {
    color: var(--erp-color-text-tertiary);
}

.acceptance-waybill-info {
    min-width: 0;
    display: flex;
    flex-direction: column;
}

.acceptance-waybill-info small {
    overflow: hidden;
    color: var(--erp-color-text-tertiary);
    text-overflow: ellipsis;
    white-space: nowrap;
}

.inbound-quantity {
    color: var(--erp-color-text-status-complete);
    font-weight: 600;
}

.acceptance-action-button {
    width: 112px;
    height: var(--erp-size-control-height-md);
    padding: 0 var(--erp-spacing-16);
    font-size: var(--erp-typography-title2-font-size);
}

.acceptance-result-section {
    display: grid;
    justify-items: center;
    gap: var(--erp-spacing-12);
    padding-bottom: var(--erp-spacing-8);
}

.acceptance-result-section .acceptance-evidence-field {
    width: min(560px, 100%);
}

.acceptance-result-indicator {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--erp-spacing-8);
    min-height: 40px;
    color: var(--erp-color-text-status-complete);
    font-size: var(--erp-typography-title2-font-size);
    font-weight: var(--erp-typography-title2-font-weight);
}

.acceptance-result-indicator.abnormal {
    color: var(--erp-color-text-status-error);
}

.acceptance-result-indicator :deep(svg) {
    width: 22px;
    height: 22px;
}

@media (max-width: 900px) {
    .acceptance-basic-grid {
        grid-template-columns: minmax(0, 1fr);
    }

    .acceptance-order-field,
    .acceptance-waybill-field,
    .acceptance-operator-field,
    .acceptance-remark,
    .acceptance-images-field {
        grid-column: auto;
        grid-row: auto;
    }
}

@media (max-width: 640px) {
    .acceptance-dialog :deep(.erp-dialog-frame__body) {
        padding: var(--erp-spacing-8);
    }

    .acceptance-basic-grid {
        padding: var(--erp-spacing-12);
    }

    .acceptance-form-field {
        grid-template-columns: minmax(0, 1fr);
        gap: var(--erp-spacing-8);
    }

    .acceptance-form-field > span {
        padding-top: 0;
        text-align: left;
    }
}

.trace-dialog {
    display: grid;
    gap: 18px;
    padding: 4px 10px 12px;
}

.trace-dialog-head {
    display: flex;
    justify-content: space-between;
    padding-bottom: 14px;
    border-bottom: 1px solid var(--erp-color-border-muted);
    color: var(--erp-color-text-secondary);
}

.trace-dialog-head strong {
    color: var(--erp-color-text-primary);
}

.trace-list {
    position: relative;
    display: grid;
    padding-left: 10px;
}

.trace-list::before {
    position: absolute;
    top: 10px;
    bottom: 10px;
    left: 16px;
    width: 1px;
    background: var(--erp-color-border-muted);
    content: "";
}

.trace-item {
    position: relative;
    display: grid;
    grid-template-columns: 14px minmax(0, 1fr);
    gap: 12px;
    padding: 10px 0;
}

.trace-dot {
    z-index: 1;
    width: 12px;
    height: 12px;
    margin-top: 3px;
    border: 3px solid var(--erp-color-fill-default);
    border-radius: 50%;
    background: #cbd5e1;
    box-shadow: 0 0 0 1px #cbd5e1;
}

.trace-dot.current {
    background: #2563eb;
    box-shadow: 0 0 0 1px #2563eb;
}

.trace-item div {
    display: grid;
    gap: 5px;
}

.trace-item strong {
    color: var(--erp-color-text-primary);
    font-weight: 500;
}

.trace-item small {
    color: var(--erp-color-text-tertiary);
}

.trace-empty {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    min-height: 180px;
    color: var(--erp-color-text-tertiary);
}
</style>
