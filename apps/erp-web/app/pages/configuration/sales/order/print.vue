<template>
    <div class="print-root">
        <div class="print-topbar no-print">
            <button class="back-button" @click="goBack">
                <Icon name="material-symbols:arrow-back-rounded" />
                返回
            </button>
            <span>订单记录</span>
            <Icon name="material-symbols:chevron-right-rounded" />
            <span>打印</span>
            <div class="topbar-spacer"></div>
            <div class="zoom-controls" aria-label="打印预览缩放">
                <button class="zoom-value" type="button" title="重置为 100%" @click="resetPreviewZoom">
                    {{ previewZoomPercent }}%
                </button>
                <button
                    class="zoom-button"
                    type="button"
                    title="缩小"
                    :disabled="previewZoomPercent <= MIN_PREVIEW_ZOOM"
                    @click="decreasePreviewZoom"
                >
                    <Icon name="lucide:minus" />
                </button>
                <input
                    v-model.number="previewZoomPercent"
                    class="zoom-slider"
                    type="range"
                    :min="MIN_PREVIEW_ZOOM"
                    :max="MAX_PREVIEW_ZOOM"
                    :step="PREVIEW_ZOOM_STEP"
                    :style="zoomSliderStyle"
                    aria-label="预览缩放比例"
                />
                <button
                    class="zoom-button"
                    type="button"
                    title="放大"
                    :disabled="previewZoomPercent >= MAX_PREVIEW_ZOOM"
                    @click="increasePreviewZoom"
                >
                    <Icon name="lucide:plus" />
                </button>
            </div>
        </div>

        <div class="print-main">
            <div class="preview-pane" :style="previewZoomStyle">
                <div v-if="orders.length === 0" class="empty-print no-print">暂无可打印订单</div>
                <article
                    v-for="(order, orderIndex) in orders"
                    :key="order._id || order.id || order.orderNo || orderIndex"
                    class="print-page"
                    :class="{ 'custom-print-page': isCustomTemplate }"
                >
                    <div v-if="options.watermark" class="watermark-grid">
                        <span v-for="index in 24" :key="index">{{ watermarkText }}</span>
                    </div>

                    <template v-if="isCustomTemplate">
                        <header class="document-header custom-document-header">
                            <div></div>
                            <h1>销售订单详情单</h1>
                            <div class="document-meta">
                                <p v-if="options.orderNo">订单编号: {{ order.orderNo || '--' }}</p>
                                <p v-if="options.printTime">打印日期: {{ printTime }}</p>
                                <p v-if="options.printer">打印人: {{ printerName }}</p>
                            </div>
                        </header>

                        <section v-if="hasVisiblePrintSection('customBasic')" class="document-section custom-section">
                            <h2>{{ formatSectionTitle('customBasic', '客户与订单基本信息') }}</h2>
                            <table class="info-table custom-info-table">
                                <tbody>
                                    <tr v-for="(row, rowIndex) in getVisibleFieldRows(getCustomBasicFields(order))" :key="`basic-${rowIndex}`">
                                        <template v-for="field in row" :key="field.key">
                                            <th>{{ field.label }}</th>
                                            <td>{{ field.value }}</td>
                                        </template>
                                        <template v-for="blank in 3 - row.length" :key="`basic-blank-${rowIndex}-${blank}`">
                                            <th></th>
                                            <td></td>
                                        </template>
                                    </tr>
                                </tbody>
                            </table>
                        </section>

                        <section v-if="hasVisiblePrintSection('customContract')" class="document-section custom-section">
                            <h2>{{ formatSectionTitle('customContract', '合同与财务应收信息') }}</h2>
                            <table class="info-table custom-info-table">
                                <tbody>
                                    <tr v-for="(row, rowIndex) in getVisibleFieldRows(getCustomContractFields(order))" :key="`contract-${rowIndex}`">
                                        <template v-for="field in row" :key="field.key">
                                            <th>{{ field.label }}</th>
                                            <td>{{ field.value }}</td>
                                        </template>
                                        <template v-for="blank in 3 - row.length" :key="`contract-blank-${rowIndex}-${blank}`">
                                            <th></th>
                                            <td></td>
                                        </template>
                                    </tr>
                                    <tr v-if="options.customReceivableRemark">
                                        <th>应收备注</th>
                                        <td colspan="5">{{ order.receivableRemark || '--' }}</td>
                                    </tr>
                                </tbody>
                            </table>
                        </section>

                        <section v-if="hasVisiblePrintSection('customRequirements')" class="document-section custom-section">
                            <h2>{{ formatSectionTitle('customRequirements', '交付与生产要求') }}</h2>
                            <table class="requirement-table">
                                <tbody>
                                    <tr v-if="options.sampleRequirement">
                                        <th>非标要求</th>
                                        <td>{{ order.sampleRequirement || '--' }}</td>
                                    </tr>
                                    <tr v-if="options.installationRequirement">
                                        <th>安装要求</th>
                                        <td>{{ order.installationRequirement || '--' }}</td>
                                    </tr>
                                    <tr v-if="options.testingRequirement">
                                        <th>测试要求</th>
                                        <td>{{ order.testingRequirement || '--' }}</td>
                                    </tr>
                                    <tr v-if="options.orderRemark">
                                        <th>订单备注</th>
                                        <td>{{ order.orderRemark || order.remark || '--' }}</td>
                                    </tr>
                                    <tr v-if="options.orderExampleImages">
                                        <th>示例图片</th>
                                        <td>
                                            <div
                                                v-if="getOrderImageUrls(order).length > 0"
                                                class="order-example-images"
                                                :class="{ 'single-image': getOrderImageUrls(order).length === 1 }"
                                            >
                                                <img
                                                    v-for="(image, imageIndex) in getOrderImageUrls(order)"
                                                    :key="`${image}-${imageIndex}`"
                                                    :src="resolveErpImageUrl(image)"
                                                    :alt="`示例图片${imageIndex + 1}`"
                                                />
                                            </div>
                                            <span v-else>--</span>
                                        </td>
                                    </tr>
                                </tbody>
                            </table>
                        </section>

                        <section v-if="hasVisiblePrintSection('customProducts')" class="document-section custom-section">
                            <h2>{{ formatSectionTitle('customProducts', '产品明细列表') }}</h2>
                            <table class="detail-table custom-product-table">
                                <thead>
                                    <tr v-if="visibleCustomProductColumns.length > 0">
                                        <th v-for="column in visibleCustomProductColumns" :key="column.key">{{ column.label }}</th>
                                    </tr>
                                    <tr v-else>
                                        <th>产品明细</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr v-if="visibleCustomProductColumns.length === 0">
                                        <td>未选择产品明细字段</td>
                                    </tr>
                                    <template v-else>
                                        <tr v-for="(product, productIndex) in getProducts(order)" :key="`${product.productCode || product.model || productIndex}-${productIndex}`">
                                            <td v-for="column in visibleCustomProductColumns" :key="column.key">
                                                <template v-if="column.key === 'customProductImage'">
                                                    <span class="custom-product-image">
                                                        <img v-if="product.image" :src="resolveErpImageUrl(product.image)" alt="" />
                                                        <span v-else></span>
                                                    </span>
                                                </template>
                                                <template v-else>
                                                    {{ getCustomProductValue(column.key, product, productIndex) }}
                                                </template>
                                            </td>
                                        </tr>
                                        <tr v-for="blank in getCustomProductBlankRows(order)" :key="`blank-product-${blank}`">
                                            <td v-for="column in visibleCustomProductColumns" :key="`${column.key}-${blank}`">&nbsp;</td>
                                        </tr>
                                    </template>
                                    <tr v-if="getProducts(order).length === 0">
                                        <td :colspan="customProductColumnCount">暂无产品明细</td>
                                    </tr>
                                    <tr v-if="options.customProductSubtotal" class="subtotal-row">
                                        <td :colspan="customProductColumnCount">合计总金额：{{ formatMoney(getOrderAmount(order)) }}</td>
                                    </tr>
                                </tbody>
                            </table>
                        </section>

                        <footer class="sign-row">
                            <div>发起人复核:<span></span></div>
                            <div>财务审核:<span></span></div>
                            <div>采购:<span></span></div>
                        </footer>
                    </template>

                    <template v-else>
                        <header class="document-header">
                            <div></div>
                            <h1>生产派工单</h1>
                            <div class="document-meta">
                                <p v-if="options.orderNo">订单编号: {{ order.orderNo || '--' }}</p>
                                <p v-if="options.printTime">打印时间: {{ printTime }}</p>
                                <p v-if="options.printer">打印人: {{ printerName }}</p>
                            </div>
                        </header>

                        <section v-if="hasVisiblePrintSection('productionHeader')" class="document-section">
                            <h2>{{ formatSectionTitle('productionHeader', '销售订单与排产信息') }}</h2>
                            <table class="info-table">
                                <tbody>
                                    <tr v-if="hasCheckedOption(productionHeaderMainOptionKeys)">
                                        <th v-if="options.salesperson">销售员</th>
                                        <td v-if="options.salesperson">{{ order.salespersonName || order.creator || '--' }}</td>
                                        <th v-if="options.orderDate">派单日期</th>
                                        <td v-if="options.orderDate">{{ formatDate(order.orderDate) }}</td>
                                        <th v-if="options.durationDays">合同交期</th>
                                        <td v-if="options.durationDays">{{ formatDuration(order) }}</td>
                                    </tr>
                                    <tr v-if="options.machineNo">
                                        <th>机器号</th>
                                        <td :colspan="infoMachineColspan">{{ order.machineNo || '--' }}</td>
                                    </tr>
                                </tbody>
                            </table>
                        </section>

                        <section v-if="hasVisiblePrintSection('productionDetail')" class="document-section">
                            <h2>{{ formatSectionTitle('productionDetail', '生产目标与一级领料BOM') }}</h2>
                            <table class="detail-table">
                                <colgroup>
                                    <col
                                        v-for="column in visibleDetailColumns"
                                        :key="column.key"
                                        :style="{ width: column.width }"
                                    />
                                </colgroup>
                                <thead>
                                    <tr>
                                        <th v-if="options.seq">序号</th>
                                        <th v-if="options.productCode">产品编号</th>
                                        <th v-if="options.productTarget">生产目标（型号）</th>
                                        <th v-if="options.productionQuantity">生产数量</th>
                                        <th v-if="options.primaryBom">所需一级BOM（仓管按此发料）</th>
                                        <th v-if="options.productRemark">产品备注</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr v-for="(product, index) in getProducts(order)" :key="`${product.productCode || product.model || index}-${index}`">
                                        <td v-if="options.seq">{{ index + 1 }}</td>
                                        <td v-if="options.productCode">{{ product.productCode || product.code || '--' }}</td>
                                        <td v-if="options.productTarget">{{ product.productName || product.name || product.model || '--' }}</td>
                                        <td v-if="options.productionQuantity">{{ formatQuantity(product.quantity) }} {{ product.unitName || product.unit || '台' }}</td>
                                        <td v-if="options.primaryBom" class="bom-cell">
                                            <template v-if="getBomLines(product).length">
                                                <p v-for="(line, lineIndex) in getBomLines(product)" :key="lineIndex">{{ line }}</p>
                                            </template>
                                            <span v-else>无</span>
                                        </td>
                                        <td v-if="options.productRemark">{{ product.remark || order.orderRemark || '--' }}</td>
                                    </tr>
                                    <tr v-if="getProducts(order).length === 0">
                                        <td :colspan="detailColumnCount">暂无产品明细</td>
                                    </tr>
                                </tbody>
                            </table>
                        </section>

                        <section v-if="hasVisiblePrintSection('productionRequirements')" class="document-section">
                            <h2>{{ formatSectionTitle('productionRequirements', '非标、安装及测试要求') }}</h2>
                            <table class="requirement-table">
                                <tbody>
                                    <tr v-if="options.sampleRequirement">
                                        <th>非标要求</th>
                                        <td>{{ order.sampleRequirement || '--' }}</td>
                                    </tr>
                                    <tr v-if="options.installationRequirement">
                                        <th>安装要求</th>
                                        <td>{{ order.installationRequirement || '--' }}</td>
                                    </tr>
                                    <tr v-if="options.testingRequirement">
                                        <th>测试要求</th>
                                        <td>{{ order.testingRequirement || '--' }}</td>
                                    </tr>
                                    <tr v-if="options.orderRemark">
                                        <th>订单备注</th>
                                        <td>{{ order.orderRemark || order.remark || '--' }}</td>
                                    </tr>
                                    <tr v-if="options.orderExampleImages">
                                        <th>示例图片</th>
                                        <td>
                                            <div
                                                v-if="getOrderImageUrls(order).length > 0"
                                                class="order-example-images"
                                                :class="{ 'single-image': getOrderImageUrls(order).length === 1 }"
                                            >
                                                <img
                                                    v-for="(image, imageIndex) in getOrderImageUrls(order)"
                                                    :key="`${image}-${imageIndex}`"
                                                    :src="resolveErpImageUrl(image)"
                                                    :alt="`示例图片${imageIndex + 1}`"
                                                />
                                            </div>
                                            <span v-else>--</span>
                                        </td>
                                    </tr>
                                </tbody>
                            </table>
                        </section>

                        <footer class="sign-row">
                            <div>发起人复核:<span></span></div>
                            <div>车间领料人:<span></span></div>
                            <div>仓库发料人:<span></span></div>
                        </footer>
                    </template>

                    <div class="print-page-number">第 {{ orderIndex + 1 }} 页 / 共 {{ orders.length }} 页</div>
                </article>
            </div>

            <aside class="settings-pane no-print">
                <div class="settings-header">
                    <div>
                        <strong>模板类型：{{ currentTemplateName }}</strong>
                        <p>{{ currentTemplateDescription }}</p>
                    </div>
                    <button @click="resetOptions">恢复初始</button>
                </div>

                <section class="settings-section">
                    <div class="settings-section-title">
                        <h3>默认选项</h3>
                        <label
                            class="section-toggle"
                            :class="{ disabled: isOptionGroupToggleDisabled(defaultOptionKeys) }"
                            title="全选/取消默认选项"
                        >
                            <input
                                type="checkbox"
                                :checked="isOptionGroupChecked(defaultOptionKeys)"
                                :indeterminate="isOptionGroupIndeterminate(defaultOptionKeys)"
                                :disabled="isOptionGroupToggleDisabled(defaultOptionKeys)"
                                aria-label="全选/取消默认选项"
                                @change="handleOptionGroupChange(defaultOptionKeys, $event)"
                            />
                        </label>
                    </div>
                    <label :class="{ disabled: !isSuperAdmin }"><input v-model="options.orderNo" type="checkbox" :disabled="!isSuperAdmin" /> 订单编号</label>
                    <label :class="{ disabled: !isSuperAdmin }"><input v-model="options.printTime" type="checkbox" :disabled="!isSuperAdmin" /> 打印时间</label>
                    <label :class="{ disabled: !isSuperAdmin }"><input v-model="options.printer" type="checkbox" :disabled="!isSuperAdmin" /> 打印人</label>
                    <label :class="{ disabled: !isSuperAdmin }"><input v-model="options.watermark" type="checkbox" :disabled="!isSuperAdmin" /> 水印</label>
                </section>

                <template v-if="isCustomTemplate">
                    <section class="settings-section">
                        <div class="settings-section-title">
                            <h3>客户与订单基本信息</h3>
                            <label class="section-toggle" title="全选/取消客户与订单基本信息">
                                <input
                                    type="checkbox"
                                    :checked="isOptionGroupChecked(customBasicOptionKeys)"
                                    :indeterminate="isOptionGroupIndeterminate(customBasicOptionKeys)"
                                    aria-label="全选/取消客户与订单基本信息"
                                    @change="handleOptionGroupChange(customBasicOptionKeys, $event)"
                                />
                            </label>
                        </div>
                        <label><input v-model="options.customCustomerName" type="checkbox" /> 客户姓名</label>
                        <label><input v-model="options.customCustomerCompany" type="checkbox" /> 客户公司</label>
                        <label><input v-model="options.customCustomerRegion" type="checkbox" /> 所属区域</label>
                        <label><input v-model="options.customOrderNo" type="checkbox" /> 订单编号</label>
                        <label><input v-model="options.customSalesperson" type="checkbox" /> 销售员</label>
                        <label><input v-model="options.customOrderType" type="checkbox" /> 订单类型</label>
                        <label><input v-model="options.customAmount" type="checkbox" /> 订单总金额</label>
                        <label><input v-model="options.customCurrency" type="checkbox" /> 币种</label>
                        <label><input v-model="options.customMachineNo" type="checkbox" /> 机器号</label>
                    </section>

                    <section class="settings-section">
                        <div class="settings-section-title">
                            <h3>合同与财务应收信息</h3>
                            <label class="section-toggle" title="全选/取消合同与财务应收信息">
                                <input
                                    type="checkbox"
                                    :checked="isOptionGroupChecked(customContractOptionKeys)"
                                    :indeterminate="isOptionGroupIndeterminate(customContractOptionKeys)"
                                    aria-label="全选/取消合同与财务应收信息"
                                    @change="handleOptionGroupChange(customContractOptionKeys, $event)"
                                />
                            </label>
                        </div>
                        <label><input v-model="options.customContractNo" type="checkbox" /> 合同编号</label>
                        <label><input v-model="options.customOrderDate" type="checkbox" /> 派单日期</label>
                        <label><input v-model="options.customDurationDays" type="checkbox" /> 合同交期</label>
                        <label><input v-model="options.customInvoiceStatus" type="checkbox" /> 发票状态</label>
                        <label><input v-model="options.customReceivableOrder" type="checkbox" /> 应收单号</label>
                        <label><input v-model="options.customReceivableDate" type="checkbox" /> 应收日期</label>
                        <label><input v-model="options.customIncomeCategory" type="checkbox" /> 收入类别</label>
                        <label><input v-model="options.customPlannedPaymentDate" type="checkbox" /> 计划回款日</label>
                        <label><input v-model="options.customPlannedPaymentAmount" type="checkbox" /> 计划回款金额</label>
                        <label><input v-model="options.customReceivableRemark" type="checkbox" /> 应收备注</label>
                    </section>

                    <section class="settings-section">
                        <div class="settings-section-title">
                            <h3>交付与生产要求</h3>
                            <label class="section-toggle" title="全选/取消交付与生产要求">
                                <input
                                    type="checkbox"
                                    :checked="isOptionGroupChecked(requirementOptionKeys)"
                                    :indeterminate="isOptionGroupIndeterminate(requirementOptionKeys)"
                                    aria-label="全选/取消交付与生产要求"
                                    @change="handleOptionGroupChange(requirementOptionKeys, $event)"
                                />
                            </label>
                        </div>
                        <label><input v-model="options.sampleRequirement" type="checkbox" /> 非标要求</label>
                        <label><input v-model="options.installationRequirement" type="checkbox" /> 安装要求</label>
                        <label><input v-model="options.testingRequirement" type="checkbox" /> 测试要求</label>
                        <label><input v-model="options.orderRemark" type="checkbox" /> 订单备注</label>
                        <label><input v-model="options.orderExampleImages" type="checkbox" /> 示例图片</label>
                    </section>

                    <section class="settings-section">
                        <div class="settings-section-title">
                            <h3>产品明细列表</h3>
                            <label class="section-toggle" title="全选/取消产品明细列表">
                                <input
                                    type="checkbox"
                                    :checked="isOptionGroupChecked(customProductOptionKeys)"
                                    :indeterminate="isOptionGroupIndeterminate(customProductOptionKeys)"
                                    aria-label="全选/取消产品明细列表"
                                    @change="handleOptionGroupChange(customProductOptionKeys, $event)"
                                />
                            </label>
                        </div>
                        <label><input v-model="options.customProductSeq" type="checkbox" /> 序号</label>
                        <label><input v-model="options.customProductCode" type="checkbox" /> 产品编号</label>
                        <label><input v-model="options.customProductModel" type="checkbox" /> 型号</label>
                        <label><input v-model="options.customProductImage" type="checkbox" /> 产品图片</label>
                        <label><input v-model="options.customProductQuantity" type="checkbox" /> 销售数量</label>
                        <label><input v-model="options.customProductUnit" type="checkbox" /> 单位</label>
                        <label><input v-model="options.customProductPrice" type="checkbox" /> 销售单价</label>
                        <label><input v-model="options.customProductTotal" type="checkbox" /> 销售总价</label>
                        <label><input v-model="options.customProductAvailable" type="checkbox" /> 可用量</label>
                        <label><input v-model="options.customProductSource" type="checkbox" /> 来源</label>
                        <label><input v-model="options.customProductMachineNo" type="checkbox" /> 机器号</label>
                        <label><input v-model="options.customProductRemark" type="checkbox" /> 备注</label>
                        <label><input v-model="options.customProductSubtotal" type="checkbox" /> 小计</label>
                    </section>
                </template>

                <template v-else>
                    <section class="settings-section">
                        <div class="settings-section-title">
                            <h3>表头</h3>
                            <label class="section-toggle" title="全选/取消表头">
                                <input
                                    type="checkbox"
                                    :checked="isOptionGroupChecked(productionHeaderOptionKeys)"
                                    :indeterminate="isOptionGroupIndeterminate(productionHeaderOptionKeys)"
                                    aria-label="全选/取消表头"
                                    @change="handleOptionGroupChange(productionHeaderOptionKeys, $event)"
                                />
                            </label>
                        </div>
                        <label><input v-model="options.salesperson" type="checkbox" /> 销售员</label>
                        <label><input v-model="options.orderDate" type="checkbox" /> 派单日期</label>
                        <label><input v-model="options.durationDays" type="checkbox" /> 合同交期</label>
                        <label><input v-model="options.machineNo" type="checkbox" /> 机器号</label>
                    </section>

                    <section class="settings-section">
                        <div class="settings-section-title">
                            <h3>明细</h3>
                            <label class="section-toggle" title="全选/取消明细">
                                <input
                                    type="checkbox"
                                    :checked="isOptionGroupChecked(productionDetailOptionKeys)"
                                    :indeterminate="isOptionGroupIndeterminate(productionDetailOptionKeys)"
                                    aria-label="全选/取消明细"
                                    @change="handleOptionGroupChange(productionDetailOptionKeys, $event)"
                                />
                            </label>
                        </div>
                        <label><input v-model="options.seq" type="checkbox" /> 序号</label>
                        <label><input v-model="options.productCode" type="checkbox" /> 产品编号</label>
                        <label><input v-model="options.productTarget" type="checkbox" /> 生产目标</label>
                        <label><input v-model="options.productionQuantity" type="checkbox" /> 生产数量</label>
                        <label><input v-model="options.primaryBom" type="checkbox" /> 所需一级BOM</label>
                        <label><input v-model="options.productRemark" type="checkbox" /> 产品备注</label>
                    </section>

                    <section class="settings-section">
                        <div class="settings-section-title">
                            <h3>表尾</h3>
                            <label class="section-toggle" title="全选/取消表尾">
                                <input
                                    type="checkbox"
                                    :checked="isOptionGroupChecked(requirementOptionKeys)"
                                    :indeterminate="isOptionGroupIndeterminate(requirementOptionKeys)"
                                    aria-label="全选/取消表尾"
                                    @change="handleOptionGroupChange(requirementOptionKeys, $event)"
                                />
                            </label>
                        </div>
                        <label><input v-model="options.sampleRequirement" type="checkbox" /> 非标要求</label>
                        <label><input v-model="options.installationRequirement" type="checkbox" /> 安装要求</label>
                        <label><input v-model="options.testingRequirement" type="checkbox" /> 测试要求</label>
                        <label><input v-model="options.orderRemark" type="checkbox" /> 订单备注</label>
                        <label><input v-model="options.orderExampleImages" type="checkbox" /> 示例图片</label>
                    </section>
                </template>

                <div class="settings-actions">
                    <button class="cancel" @click="goBack">取消</button>
                    <button class="confirm" :disabled="orders.length === 0" @click="printDocument">确认</button>
                </div>
            </aside>
        </div>
    </div>
</template>

<script setup lang="ts">
import { resolveErpImageUrl } from "~/utils/attachmentPreview";
import { getSalesOrderPaymentPlans, getSalesOrderPaymentTotals } from "~~/shared/utils/salesOrderPayment";
import { getSalesOrderDeliveryDate } from "~~/shared/utils/salesOrderDelivery";

definePageMeta({
    layout: false,
})

type PrintOrder = Record<string, any>
type PrintTemplateType = 'production-dispatch' | 'custom'

const router = useRouter()
const userInfo = useState<any>('admin_info', () => ({}))
const orders = ref<PrintOrder[]>([])
const templateType = ref<PrintTemplateType>('production-dispatch')
const isSuperAdmin = computed(() => Number(userInfo.value?.role) === 0)
const isCustomTemplate = computed(() => templateType.value === 'custom')
const printerName = computed(() => userInfo.value?.nickname || userInfo.value?.username || '管理员')
const watermarkText = computed(() => printerName.value || '打印人')
const printTime = ref('')
const MIN_PREVIEW_ZOOM = 80
const MAX_PREVIEW_ZOOM = 180
const PREVIEW_ZOOM_STEP = 5
const previewZoomPercent = ref(100)
const previewZoom = computed(() => previewZoomPercent.value / 100)
const previewZoomStyle = computed(() => ({
    '--preview-zoom': String(previewZoom.value),
}))
const zoomSliderStyle = computed(() => ({
    '--zoom-progress': `${((previewZoomPercent.value - MIN_PREVIEW_ZOOM) / (MAX_PREVIEW_ZOOM - MIN_PREVIEW_ZOOM)) * 100}%`,
}))

const defaultOptions = {
    orderNo: true,
    printTime: true,
    printer: true,
    watermark: true,
    salesperson: true,
    orderDate: true,
    durationDays: true,
    machineNo: true,
    seq: true,
    productCode: true,
    productTarget: true,
    productionQuantity: true,
    primaryBom: true,
    productRemark: false,
    sampleRequirement: true,
    installationRequirement: true,
    testingRequirement: true,
    orderRemark: true,
    orderExampleImages: true,
    customCustomerName: true,
    customCustomerCompany: true,
    customCustomerRegion: true,
    customOrderNo: true,
    customSalesperson: true,
    customOrderType: true,
    customAmount: true,
    customCurrency: true,
    customMachineNo: true,
    customContractNo: true,
    customOrderDate: true,
    customDurationDays: true,
    customInvoiceStatus: true,
    customReceivableOrder: true,
    customReceivableDate: true,
    customIncomeCategory: true,
    customPlannedPaymentDate: true,
    customPlannedPaymentAmount: true,
    customReceivableRemark: true,
    customProductSeq: true,
    customProductCode: true,
    customProductModel: true,
    customProductImage: true,
    customProductQuantity: true,
    customProductUnit: true,
    customProductPrice: true,
    customProductTotal: true,
    customProductAvailable: true,
    customProductSource: true,
    customProductMachineNo: true,
    customProductRemark: true,
    customProductSubtotal: true,
}
type OptionKey = keyof typeof defaultOptions
type CustomField = {
    key: OptionKey
    label: string
    value: string
}
type CustomProductColumn = {
    key: OptionKey
    label: string
}

const options = reactive({ ...defaultOptions })

const defaultOptionKeys = ['orderNo', 'printTime', 'printer', 'watermark'] as const
const customBasicOptionKeys = [
    'customCustomerName',
    'customCustomerCompany',
    'customCustomerRegion',
    'customOrderNo',
    'customSalesperson',
    'customOrderType',
    'customAmount',
    'customCurrency',
    'customMachineNo',
] as const
const customContractOptionKeys = [
    'customContractNo',
    'customOrderDate',
    'customDurationDays',
    'customInvoiceStatus',
    'customReceivableOrder',
    'customReceivableDate',
    'customIncomeCategory',
    'customPlannedPaymentDate',
    'customPlannedPaymentAmount',
    'customReceivableRemark',
] as const
const requirementOptionKeys = [
    'sampleRequirement',
    'installationRequirement',
    'testingRequirement',
    'orderRemark',
    'orderExampleImages',
] as const
const customProductOptionKeys = [
    'customProductSeq',
    'customProductCode',
    'customProductModel',
    'customProductImage',
    'customProductQuantity',
    'customProductUnit',
    'customProductPrice',
    'customProductTotal',
    'customProductAvailable',
    'customProductSource',
    'customProductMachineNo',
    'customProductRemark',
    'customProductSubtotal',
] as const
const productionHeaderMainOptionKeys = ['salesperson', 'orderDate', 'durationDays'] as const
const productionHeaderOptionKeys = [...productionHeaderMainOptionKeys, 'machineNo'] as const
const productionDetailOptionKeys = [
    'seq',
    'productCode',
    'productTarget',
    'productionQuantity',
    'primaryBom',
    'productRemark',
] as const
const defaultOptionKeySet = new Set<OptionKey>(defaultOptionKeys)

const customProductColumns: CustomProductColumn[] = [
    { key: 'customProductSeq', label: '序号' },
    { key: 'customProductCode', label: '产品编号' },
    { key: 'customProductModel', label: '型号' },
    { key: 'customProductImage', label: '图片' },
    { key: 'customProductQuantity', label: '销售数量' },
    { key: 'customProductUnit', label: '单位' },
    { key: 'customProductPrice', label: '销售单价' },
    { key: 'customProductTotal', label: '小计金额' },
    { key: 'customProductAvailable', label: '可用量' },
    { key: 'customProductSource', label: '来源' },
    { key: 'customProductMachineNo', label: '机器号' },
    { key: 'customProductRemark', label: '备注' },
]

const detailColumns = [
    { key: 'seq', weight: 6 },
    { key: 'productCode', weight: 15 },
    { key: 'productTarget', weight: 21 },
    { key: 'productionQuantity', weight: 13 },
    { key: 'primaryBom', weight: 33 },
    { key: 'productRemark', weight: 12 },
] as const

const customPrintSectionGroups = [
    { key: 'customBasic', optionKeys: customBasicOptionKeys },
    { key: 'customContract', optionKeys: customContractOptionKeys },
    { key: 'customRequirements', optionKeys: requirementOptionKeys },
    { key: 'customProducts', optionKeys: customProductOptionKeys },
] as const
const productionPrintSectionGroups = [
    { key: 'productionHeader', optionKeys: productionHeaderOptionKeys },
    { key: 'productionDetail', optionKeys: productionDetailOptionKeys },
    { key: 'productionRequirements', optionKeys: requirementOptionKeys },
] as const

const currentTemplateName = computed(() =>
    isCustomTemplate.value ? '自定义模板' : '生产派工与领料模板',
)
const currentTemplateDescription = computed(() =>
    isCustomTemplate.value
        ? '请选择在“打印单”上显示的内容'
        : '请选择在“生产派工与领料单”上显示的内容',
)

const isDefaultOptionKey = (key: OptionKey) => defaultOptionKeySet.has(key)
const isOptionToggleDisabled = (key: OptionKey) => !isSuperAdmin.value && isDefaultOptionKey(key)
const checkedOptionCount = (keys: readonly OptionKey[]) =>
    keys.filter((key) => Boolean(options[key])).length
const hasCheckedOption = (keys: readonly OptionKey[]) => checkedOptionCount(keys) > 0
const isOptionGroupChecked = (keys: readonly OptionKey[]) =>
    keys.length > 0 && keys.every((key) => Boolean(options[key]))
const isOptionGroupIndeterminate = (keys: readonly OptionKey[]) => {
    const count = checkedOptionCount(keys)
    return count > 0 && count < keys.length
}
const isOptionGroupToggleDisabled = (keys: readonly OptionKey[]) =>
    keys.length > 0 && keys.every((key) => isOptionToggleDisabled(key))
const handleOptionGroupChange = (keys: readonly OptionKey[], event: Event) => {
    const checked = Boolean((event.target as HTMLInputElement | null)?.checked)
    keys.forEach((key) => {
        if (!isOptionToggleDisabled(key)) {
            options[key] = checked
        }
    })
}
const activePrintSectionGroups = computed(() =>
    isCustomTemplate.value ? customPrintSectionGroups : productionPrintSectionGroups,
)
const visiblePrintSectionKeys = computed(() =>
    activePrintSectionGroups.value
        .filter((section) => hasCheckedOption(section.optionKeys))
        .map((section) => section.key),
)
const hasVisiblePrintSection = (key: string) =>
    visiblePrintSectionKeys.value.some((sectionKey) => sectionKey === key)
const formatSectionTitle = (key: string, label: string) => {
    const visibleIndex = visiblePrintSectionKeys.value.findIndex((sectionKey) => sectionKey === key)
    const fallbackIndex = activePrintSectionGroups.value.findIndex((section) => section.key === key)
    const sectionNumber = String((visibleIndex >= 0 ? visibleIndex : fallbackIndex) + 1).padStart(2, '0')
    return `${sectionNumber} | ${label}`
}

const checkedDetailKeys = computed(() => [
    options.seq,
    options.productCode,
    options.productTarget,
    options.productionQuantity,
    options.primaryBom,
    options.productRemark,
])
const detailColumnCount = computed(() => checkedDetailKeys.value.filter(Boolean).length || 1)
const visibleDetailColumns = computed(() => {
    const columns = detailColumns.filter((column) => Boolean(options[column.key]))
    const totalWeight = columns.reduce((sum, column) => sum + column.weight, 0) || 1
    return columns.map((column) => ({
        ...column,
        width: `${((column.weight / totalWeight) * 100).toFixed(2)}%`,
    }))
})
const infoHeaderPairCount = computed(() => [
    options.salesperson,
    options.orderDate,
    options.durationDays,
].filter(Boolean).length)
const infoMachineColspan = computed(() => Math.max(1, infoHeaderPairCount.value * 2 - 1))
const visibleCustomProductColumns = computed(() =>
    customProductColumns.filter((column) => Boolean(options[column.key])),
)
const customProductColumnCount = computed(() => Math.max(1, visibleCustomProductColumns.value.length))

const enforceDefaultOptionLock = () => {
    if (isSuperAdmin.value) return
    defaultOptionKeys.forEach((key) => {
        options[key] = true
    })
}

watch(isSuperAdmin, enforceDefaultOptionLock, { immediate: true })

const formatDate = (value?: string | Date | null) => {
    if (!value) return '--'
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return '--'
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
}

const formatDateTime = (date = new Date()) => {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    const hour = String(date.getHours()).padStart(2, '0')
    const minute = String(date.getMinutes()).padStart(2, '0')
    return `${year}-${month}-${day} ${hour}:${minute}`
}

const formatDuration = (order: PrintOrder) => getSalesOrderDeliveryDate(order) || '--'

const formatQuantity = (value: unknown) => {
    const num = Number(value || 0)
    if (!Number.isFinite(num)) return '0'
    return Number.isInteger(num) ? String(num) : num.toFixed(2)
}

const formatMoney = (value: unknown) => {
    const num = Number(value || 0)
    if (!Number.isFinite(num)) return '0.00'
    return num.toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    })
}

const formatOptionalMoney = (value: unknown) => {
    if (value === undefined || value === null || value === '') return '--'
    return formatMoney(value)
}

const currencyLabels: Record<string, string> = {
    CNY: 'RMB（人民币）',
    RMB: 'RMB（人民币）',
    USD: 'USD（美元）',
    EUR: 'EUR（欧元）',
    JPY: 'JPY（日元）',
    GBP: 'GBP（英镑）',
}

const formatCurrency = (value: unknown) => {
    const text = String(value || '').trim()
    if (!text) return '--'
    return currencyLabels[text] || text
}

const getProducts = (order: PrintOrder) =>
    Array.isArray(order.products) ? order.products : []

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

const getOrderImageUrls = (order: PrintOrder) => {
    const orderImages = Array.isArray(order.orderImages) ? order.orderImages : []
    const imageItems = orderImages.length > 0
        ? orderImages
        : getProducts(order).map((product) => product?.image).filter(Boolean)
    return imageItems
        .map((image) => normalizeImageUrl(getAttachmentUrl(image)))
        .filter(Boolean)
}

const getProductTotal = (product: PrintOrder) => {
    const explicitTotal = Number(product.totalPrice ?? product.totalAmount)
    if (Number.isFinite(explicitTotal) && explicitTotal > 0) return explicitTotal
    const price = Number(product.salePrice || product.price || 0)
    const quantity = Number(product.quantity || 0)
    const total = price * quantity
    return Number.isFinite(total) && total > 0 ? total : 0
}

const getOrderAmount = (order: PrintOrder) => {
    const amount = Number(order.amount ?? order.totalAmount ?? order.dealAmount ?? order.orderAmount)
    if (Number.isFinite(amount) && amount > 0) return amount
    return getProducts(order).reduce((sum, product) => sum + getProductTotal(product), 0)
}

const getBomLines = (product: PrintOrder) => {
    const rawLines = Array.isArray(product.primaryBomLines) ? product.primaryBomLines : []
    return rawLines.map(formatBomLine).filter(Boolean)
}

const pickBomQuantity = (line: Record<string, any>) =>
    line.quantity ?? line.qty ?? line.count ?? line.demandQuantity ?? line.requiredQuantity

const formatBomLine = (line: any) => {
    if (line && typeof line === 'object') {
        const model = String(
            line.model || line.modelCode || line.productModel || line.productCode || line.code || line.name || '',
        ).trim()
        const quantity = pickBomQuantity(line)
        const unit = String(line.unitName || line.unit || line.unitCode || '').trim()
        if (!model) return ''
        if (quantity === undefined || quantity === null || quantity === '') return model
        return `${model} × ${formatQuantity(quantity)}${unit ? ` ${unit}` : ''}`
    }

    const text = String(line || '')
        .replace(/^\s*\d+\s*[.、)）]\s*/, '')
        .trim()
    if (!text) return ''

    const matched = text.match(/^(?:\[([^\]]+)\]\s*)?(.+?)\s*[×xX*]\s*([+-]?\d+(?:\.\d+)?)\s*([^\s]*)\s*$/)
    if (!matched) return text

    const model = String(matched[1] || matched[2] || '').trim()
    const quantity = matched[3]
    const unit = String(matched[4] || '').trim()
    return `${model} × ${formatQuantity(quantity)}${unit ? ` ${unit}` : ''}`
}

const getVisibleFieldRows = (fields: CustomField[], rowSize = 3) => {
    const visibleFields = fields.filter((field) => Boolean(options[field.key]))
    const rows: CustomField[][] = []
    for (let index = 0; index < visibleFields.length; index += rowSize) {
        rows.push(visibleFields.slice(index, index + rowSize))
    }
    return rows
}

const getCustomBasicFields = (order: PrintOrder): CustomField[] => [
    { key: 'customCustomerName', label: '客户姓名', value: order.customerName || '--' },
    { key: 'customCustomerCompany', label: '客户公司', value: order.customerCompany || '--' },
    { key: 'customCustomerRegion', label: '所属区域', value: order.customerRegion || '--' },
    { key: 'customOrderNo', label: '订单编号', value: order.orderNo || '--' },
    { key: 'customSalesperson', label: '发起人', value: order.creator || order.salespersonName || '--' },
    { key: 'customOrderType', label: '订单类型', value: order.orderType || '--' },
    { key: 'customAmount', label: '订单总金额', value: formatMoney(getOrderAmount(order)) },
    { key: 'customCurrency', label: '币种', value: formatCurrency(order.currency) },
    { key: 'customMachineNo', label: '机器号', value: order.machineNo || '--' },
]

const formatPlannedPayments = (order: PrintOrder, field: 'date' | 'amount') => {
    const plans = getSalesOrderPaymentPlans(order)
    if (!plans.length) return '--'
    const values: string[] = []
    for (let index = 0; index < plans.length; index += 1) {
        const plan = plans[index]!
        const value = field === 'date' ? formatDate(plan.date) : `${formatOptionalMoney(plan.amount)} ${plan.currency || '--'}`
        values.push(plans.length > 1 ? `第${index + 1}笔：${value}` : value)
    }
    if (field === 'amount') {
        const totals = getSalesOrderPaymentTotals({ plannedPayments: plans });
        values.push(`分币种合计：${totals.map((total) => `${total.currency || '--'} ${formatOptionalMoney(total.amount)}`).join('；')}`);
    }
    return values.join('；')
}

const getCustomContractFields = (order: PrintOrder): CustomField[] => [
    { key: 'customContractNo', label: '合同编号', value: order.contractNo || '--' },
    { key: 'customOrderDate', label: '派单日期', value: formatDate(order.orderDate) },
    { key: 'customDurationDays', label: '合同交期', value: formatDuration(order) },
    { key: 'customInvoiceStatus', label: '发票状态', value: order.invoiceStatus || '--' },
    { key: 'customReceivableOrder', label: '应收单号', value: order.receivableOrder || '--' },
    { key: 'customReceivableDate', label: '应收日期', value: formatDate(order.receivableDate) },
    { key: 'customIncomeCategory', label: '收入类别', value: order.incomeCategory || '--' },
    { key: 'customPlannedPaymentDate', label: '计划回款日', value: formatPlannedPayments(order, 'date') },
    {
        key: 'customPlannedPaymentAmount',
        label: '回款金额',
        value: order.hasReceivable ? formatPlannedPayments(order, 'amount') : '--',
    },
]

const getCustomProductValue = (key: OptionKey, product: PrintOrder, index: number) => {
    switch (key) {
        case 'customProductSeq':
            return String(index + 1)
        case 'customProductCode':
            return product.productCode || product.code || '--'
        case 'customProductModel':
            return product.model || product.productName || product.name || '--'
        case 'customProductQuantity':
            return formatQuantity(product.quantity)
        case 'customProductUnit':
            return product.unitName || product.unit || '--'
        case 'customProductPrice':
            return formatMoney(product.salePrice || product.price)
        case 'customProductTotal':
            return formatMoney(getProductTotal(product))
        case 'customProductAvailable':
            return formatQuantity(product.availableQuantity)
        case 'customProductSource':
            return product.source || '--'
        case 'customProductMachineNo':
            return product.machineNo || '--'
        case 'customProductRemark':
            return product.remark || '--'
        default:
            return '--'
    }
}

const getCustomProductBlankRows = (order: PrintOrder) =>
    getProducts(order).length > 0 ? Math.max(0, 4 - getProducts(order).length) : 0

const resetOptions = () => {
    Object.assign(options, defaultOptions)
    enforceDefaultOptionLock()
}

const goBack = () => {
    router.push('/configuration/sales/order')
}
const updatePreviewZoom = (value: number) => {
    const normalized = Math.round(Number(value || 100) / PREVIEW_ZOOM_STEP) * PREVIEW_ZOOM_STEP
    previewZoomPercent.value = Math.min(MAX_PREVIEW_ZOOM, Math.max(MIN_PREVIEW_ZOOM, normalized))
}
const decreasePreviewZoom = () => updatePreviewZoom(previewZoomPercent.value - PREVIEW_ZOOM_STEP)
const increasePreviewZoom = () => updatePreviewZoom(previewZoomPercent.value + PREVIEW_ZOOM_STEP)
const resetPreviewZoom = () => updatePreviewZoom(100)

const printDocument = async () => {
    printTime.value = formatDateTime()
    await nextTick()
    window.print()
}

onMounted(() => {
    printTime.value = formatDateTime()
    try {
        const raw = sessionStorage.getItem('sales-order-print-data')
        const parsed = raw ? JSON.parse(raw) : null
        templateType.value = parsed?.template === 'custom' ? 'custom' : 'production-dispatch'
        orders.value = Array.isArray(parsed?.orders) ? parsed.orders : []
    } catch {
        templateType.value = 'production-dispatch'
        orders.value = []
    }
})
</script>

<style lang="less" scoped>
.print-root {
    min-height: 100vh;
    background: #f1f5f9;
    color: #1f2937;
}

.print-topbar {
    height: 44px;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 0 16px;
    background: #fff;
    color: #64748b;
    font-size: 13px;
    border-bottom: 1px solid #e5e7eb;
}

.topbar-spacer {
    flex: 1;
}

.back-button {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    border: none;
    background: transparent;
    color: #64748b;
    cursor: pointer;
}

.zoom-controls {
    display: flex;
    align-items: center;
    gap: 12px;
    padding-left: 14px;
    border-left: 1px solid #e5e7eb;
}

.zoom-value {
    width: 58px;
    border: none;
    background: transparent;
    color: #334155;
    font-size: 18px;
    line-height: 1;
    text-align: right;
    cursor: pointer;
}

.zoom-button {
    width: 30px;
    height: 30px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: none;
    border-radius: 6px;
    background: transparent;
    color: #1f2937;
    font-size: 20px;
    cursor: pointer;

    &:hover:not(:disabled) {
        background: #f1f5f9;
    }

    &:disabled {
        color: #cbd5e1;
        cursor: not-allowed;
    }
}

.zoom-slider {
    width: 190px;
    height: 4px;
    border-radius: 999px;
    appearance: none;
    background: linear-gradient(
        to right,
        #2f8df7 0%,
        #2f8df7 var(--zoom-progress),
        #d1d5db var(--zoom-progress),
        #d1d5db 100%
    );
    outline: none;
    cursor: pointer;
}

.zoom-slider::-webkit-slider-thumb {
    width: 18px;
    height: 18px;
    border: 3px solid #ffffff;
    border-radius: 50%;
    appearance: none;
    background: #ffffff;
    box-shadow: 0 0 0 1px #cbd5e1, 0 2px 7px rgba(15, 23, 42, 0.22);
}

.zoom-slider::-moz-range-thumb {
    width: 14px;
    height: 14px;
    border: 3px solid #ffffff;
    border-radius: 50%;
    background: #ffffff;
    box-shadow: 0 0 0 1px #cbd5e1, 0 2px 7px rgba(15, 23, 42, 0.22);
}

.print-main {
    height: calc(100vh - 44px);
    display: grid;
    grid-template-columns: 1fr 380px;
    overflow: hidden;
}

.preview-pane {
    --preview-zoom: 1;
    padding: 24px 28px;
    overflow: auto;
}

.empty-print {
    height: 280px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #94a3b8;
    background: #fff;
    border-radius: 8px;
}

.print-page {
    position: relative;
    width: 794px;
    min-height: 1123px;
    margin: 0 auto 24px;
    padding: 56px 48px 72px;
    display: flex;
    flex-direction: column;
    background: #fff;
    box-shadow: 0 2px 16px rgba(15, 23, 42, 0.08);
    overflow: hidden;
    zoom: var(--preview-zoom);
}

.custom-print-page {
    padding: 48px 48px 76px;
}

.watermark-grid {
    position: absolute;
    inset: 0;
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    grid-auto-rows: 120px;
    pointer-events: none;
    color: rgba(148, 163, 184, 0.12);
    font-size: 24px;
    font-weight: 700;
    transform: rotate(-35deg);
    transform-origin: center;

    span {
        display: flex;
        align-items: center;
        justify-content: center;
    }
}

.document-header,
.document-section,
.sign-row {
    position: relative;
    z-index: 1;
}

.document-header {
    display: grid;
    grid-template-columns: 1fr 220px 1fr;
    align-items: start;
    margin-bottom: 22px;

    h1 {
        margin: 0;
        padding-bottom: 10px;
        border-bottom: 3px solid #111827;
        text-align: center;
        font-size: 28px;
        letter-spacing: 0;
    }
}

.custom-document-header {
    grid-template-columns: 1fr 240px 1fr;
    margin-bottom: 18px;
}

.document-meta {
    justify-self: end;
    color: #64748b;
    font-size: 12px;
    line-height: 1.7;

    p {
        margin: 0;
    }
}

.document-section {
    margin-bottom: 16px;

    h2 {
        margin: 0 0 10px;
        padding: 9px 12px;
        border-left: 4px solid #3f8cff;
        background: #f5f7fb;
        font-size: 15px;
        font-weight: 700;
    }
}

.custom-section {
    margin-bottom: 13px;

    h2 {
        padding: 8px 12px;
        font-size: 14px;
    }
}

table {
    width: 100%;
    border-collapse: collapse;
    table-layout: fixed;
    font-size: 12px;

    th,
    td {
        border: 1px solid #e2e8f0;
        padding: 10px 12px;
        vertical-align: middle;
        word-break: break-word;
    }

    th {
        background: #eef2f7;
        font-weight: 700;
    }
}

.info-table {
    th {
        width: 78px;
        text-align: center;
    }
}

.custom-info-table {
    font-size: 11px;

    th,
    td {
        padding: 8px 10px;
    }
}

.detail-table {
    th,
    td {
        text-align: center;
    }

    .bom-cell {
        text-align: left;
        line-height: 1.5;

        p {
            margin: 0;
        }
    }
}

.custom-product-table {
    font-size: 10px;

    th,
    td {
        padding: 6px 6px;
    }
}

.custom-product-image {
    width: 30px;
    height: 22px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: #e5e7eb;

    img {
        width: 100%;
        height: 100%;
        object-fit: contain;
    }

    span {
        display: block;
        width: 100%;
        height: 100%;
    }
}

.subtotal-row {
    td {
        font-weight: 700;
        text-align: center;
    }
}

.requirement-table {
    th {
        width: 78px;
        text-align: center;
    }

    td {
        line-height: 1.6;
    }
}

.order-example-images {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
    min-height: 220px;
    align-items: flex-start;

    &.single-image {
        grid-template-columns: minmax(0, 1fr);
    }

    img {
        width: 100%;
        height: 220px;
        object-fit: contain;
        border: 1px solid #e2e8f0;
        background: #fff;
    }

    &.single-image img {
        height: 280px;
    }
}

.sign-row {
    margin-top: auto;
    padding-top: 24px;
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 52px;
    font-size: 13px;

    div {
        display: flex;
        align-items: flex-end;
        gap: 8px;
        white-space: nowrap;
    }

    span {
        flex: 1;
        min-width: 0;
        height: 18px;
        border-bottom: 1px solid #111827;
    }
}

.print-page-number {
    position: absolute;
    left: 48px;
    right: 48px;
    bottom: 28px;
    z-index: 2;
    color: #64748b;
    font-size: 11px;
    text-align: center;
}

.settings-pane {
    position: relative;
    padding: 26px 24px 0;
    background: #fff;
    border-left: 1px solid #e5e7eb;
    overflow: auto;
}

.settings-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
    margin-bottom: 24px;

    strong {
        font-size: 14px;
    }

    p {
        margin: 8px 0 0;
        color: #64748b;
        font-size: 12px;
    }

    button {
        flex: none;
        height: 32px;
        border: none;
        border-radius: 8px;
        padding: 0 12px;
        background: #39a7f2;
        color: #fff;
        cursor: pointer;
    }
}

.settings-section {
    margin-bottom: 24px;
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 14px 18px;

    .settings-section-title {
        grid-column: 1 / -1;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
    }

    h3 {
        margin: 0;
        color: #475569;
        font-size: 13px;
        font-weight: 600;
    }

    label {
        display: flex;
        align-items: center;
        gap: 8px;
        color: #475569;
        font-size: 13px;

        &.disabled {
            color: #94a3b8;
            cursor: not-allowed;
        }
    }

    .section-toggle {
        flex: none;
        width: 18px;
        height: 18px;
        justify-content: center;
        cursor: pointer;

        &.disabled {
            cursor: not-allowed;
        }

        input {
            margin: 0;
        }
    }

    input {
        width: 14px;
        height: 14px;
        accent-color: #39a7f2;

        &:disabled {
            opacity: 0.6;
            cursor: not-allowed;
        }
    }
}

.settings-actions {
    position: sticky;
    bottom: 0;
    z-index: 3;
    margin: 8px -24px 0;
    padding: 14px 24px 18px;
    display: flex;
    justify-content: flex-end;
    gap: 12px;
    background: #fff;
    border-top: 1px solid #e5e7eb;

    button {
        width: 78px;
        height: 32px;
        border-radius: 8px;
        cursor: pointer;

        &:disabled {
            opacity: 0.6;
            cursor: not-allowed;
        }
    }

    .cancel {
        border: 1px solid #d1d5db;
        background: #fff;
        color: #9ca3af;
    }

    .confirm {
        border: none;
        background: #39a7f2;
        color: #fff;
    }
}

@media print {
    @page {
        size: A4;
        margin: 0;
    }

    .no-print,
    .settings-pane {
        display: none !important;
    }

    .print-root,
    .print-main,
    .preview-pane {
        display: block;
        height: auto;
        padding: 0;
        overflow: visible;
        background: #fff;
    }

    .print-page {
        width: 210mm;
        min-height: 297mm;
        margin: 0;
        padding: 16mm 14mm 18mm;
        box-shadow: none;
        page-break-after: always;
        zoom: 1 !important;
    }

    .print-page:last-child {
        page-break-after: auto;
    }
}
</style>
