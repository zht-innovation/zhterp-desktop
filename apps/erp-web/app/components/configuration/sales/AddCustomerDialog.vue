<template>
    <div v-if="visible" class="modal-overlay">
        <div class="modal-row">
            <div class="modal-content">
            <div class="modal-header">
                <h3>{{ isEditMode ? '编辑客户' : '新增客户' }}</h3>
                <button class="close-btn" @click="handleClose">
                    <Icon name="heroicons:x-mark" />
                </button>
            </div>

            <template v-if="isEditMode">
                <div class="section-divider">
                    <span>基本信息</span>
                </div>

                <div class="form-row">
                    <div class="form-group full">
                        <label>姓名 <span class="required">*</span></label>
                        <input v-model="form.name" type="text" placeholder="请输入客户姓名" />
                    </div>
                </div>

                <div class="form-row">
                    <div class="form-group half">
                        <label>国家 <span class="required">*</span></label>
                        <input v-model="form.country" type="text" placeholder="国家" list="customer-country-options" />
                        <datalist id="customer-country-options">
                            <option v-for="country in countryOptions" :key="country" :value="country" />
                        </datalist>
                    </div>
                    <div class="form-group half">
                        <label>城市</label>
                        <input v-model="form.city" type="text" placeholder="城市" />
                    </div>
                </div>

                <div class="section-divider">
                    <span>联系方式</span>
                </div>
                <div class="form-hint">联系方式为必填项，如确实未知请填写“无”。</div>

                <div class="form-row">
                    <div class="form-group half">
                        <label>电话 <span class="required">*</span></label>
                        <input v-model="form.phone" type="text" placeholder="电话号码" />
                    </div>
                    <div class="form-group half">
                        <label>WhatsApp <span class="required">*</span></label>
                        <input v-model="form.whatsapp" type="text" placeholder="WhatsApp" />
                    </div>
                </div>

                <div class="form-row">
                    <div class="form-group half">
                        <label>邮箱 <span class="required">*</span></label>
                        <input v-model="form.email" type="text" placeholder="电子邮箱" />
                    </div>
                    <div class="form-group half">
                        <label>微信号 <span class="required">*</span></label>
                        <input v-model="form.wechat" type="text" placeholder="微信号" />
                    </div>
                </div>

                <div class="section-divider">
                    <span>公司信息</span>
                </div>
                <div class="form-hint">公司名称为必填项，如确实未知请填写“无”。</div>

                <div class="form-row">
                    <div class="form-group half">
                        <label>公司名称 <span class="required">*</span></label>
                        <input
                            v-model="form.company"
                            type="text"
                            placeholder="公司名称"
                            @focus="handleCompanyFocus"
                            @input="handleCompanyInput"
                        />
                    </div>
                    <div class="form-group half">
                        <label>公司详情</label>
                        <input v-model="form.companyDetail" type="text" placeholder="主营业务/详情" />
                    </div>
                </div>

                <div class="form-group">
                    <label>公司网站</label>
                    <input v-model="form.companyWebsite" type="text" placeholder="公司网站" />
                </div>

                <div class="section-divider">
                    <span>客户分类</span>
                </div>

                <div class="form-group">
                    <label>客户类型 <span class="required">*</span></label>
                    <div class="radio-group">
                        <label
                            v-for="type in customerTypes"
                            :key="type.value"
                            class="radio-item"
                            :class="{ active: form.customerType === type.value }"
                        >
                            <input type="radio" :value="type.value" v-model="form.customerType" />
                            <span>{{ type.label }}</span>
                        </label>
                    </div>
                </div>

                <div class="form-group">
                    <label>客户等级 <span class="required">*</span></label>
                    <div class="radio-group">
                        <label
                            v-for="level in customerLevels"
                            :key="level.value"
                            class="radio-item level-item"
                            :class="{ active: form.customerLevel === level.value }"
                        >
                            <input type="radio" :value="level.value" v-model="form.customerLevel" />
                            <span>{{ level.label }}</span>
                        </label>
                    </div>
                    <div class="form-hint" v-if="form.customerLevel">
                        {{ getLevelHint(form.customerLevel) }}
                    </div>
                </div>

                <div class="form-group">
                    <label>获客渠道 <span class="required">*</span></label>
                    <div class="form-row">
                        <div class="form-group half" style="margin-bottom: 0;">
                            <SearchableSelect
                                v-model="sourceLevel1"
                                :options="sourceOptions"
                                placeholder="请选择一级渠道"
                                @change="onSourceLevel1Change"
                            />
                        </div>
                        <div class="form-group half" style="margin-bottom: 0;" v-if="sourceLevel2Options.length">
                            <SearchableSelect
                                v-model="sourceLevel2"
                                :options="sourceLevel2Options"
                                placeholder="请选择二级渠道"
                                @change="onSourceLevel2Change"
                            />
                        </div>
                        <div class="form-group half" style="margin-bottom: 0;" v-if="sourceLevel3Options.length">
                            <SearchableSelect
                                v-model="sourceLevel3"
                                :options="sourceLevel3Options"
                                placeholder="请选择三级渠道"
                            />
                        </div>
                    </div>
                </div>

                <div class="form-group">
                    <label>自定义标签</label>
                    <div class="tags-container">
                        <span v-for="tag in form.customTags" :key="tag" class="tag blue closable">
                            {{ tag }}
                            <button class="tag-close" @click="handleCloseTag(tag)">×</button>
                        </span>
                        <input
                            v-if="inputVisible"
                            ref="InputRef"
                            v-model="inputValue"
                            class="tag-input"
                            @keyup.enter="handleInputConfirm"
                            @blur="handleInputConfirm"
                            placeholder="输入标签"
                        />
                        <button v-else class="add-tag-btn" @click="showInput">+ 添加标签</button>
                    </div>
                    <div class="form-hint">标签不限制字数</div>
                </div>

                <div class="section-divider">
                    <span>附件上传</span>
                </div>

                <div class="form-group">
                    <label>上传附件 <span class="required">*</span></label>
                    <div class="existing-attachments" v-if="existingAttachments.length > 0">
                        <div class="existing-title">已上传附件</div>
                        <div
                            class="existing-item"
                            v-for="item in existingAttachments"
                            :key="getAttachmentKey(item)"
                            @click="handleExistingAttachmentClick(item)"
                        >
                            <span class="existing-name">{{ getFileName(item) }}</span>
                            <Icon
                                :name="isImageAttachment(item) ? 'mdi:eye' : 'mdi:download'"
                                class="existing-action"
                            />
                            <button class="remove-existing" @click.stop="removeExistingAttachment(item)">删除</button>
                        </div>
                    </div>
                    <FileUploader v-model="form.attachments" :max-size="10" />
                    <div class="form-hint">必填项，支持上传图片、文档等文件，单个文件不超过10MB</div>
                </div>
            </template>

            <template v-else>
                <div class="extra-customer-list">
                    <div class="extra-customer-card shared-company-card">
                        <div class="extra-customer-header">
                            <div class="extra-customer-title">公司信息</div>
                        </div>

                        <div class="form-group">
                            <label>维护销售</label>
                            <template v-if="canAssignSales">
                                <div class="radio-group">
                                    <label class="radio-item" :class="{ active: assignType === 'public' }">
                                        <input type="radio" value="public" v-model="assignType" />
                                        <span>公共客户池</span>
                                    </label>
                                    <label class="radio-item" :class="{ active: assignType === 'salesperson' }">
                                        <input type="radio" value="salesperson" v-model="assignType" />
                                        <span>分配给销售</span>
                                    </label>
                                </div>
                                <SearchableSelect
                                    v-if="assignType === 'salesperson'"
                                    v-model="form.salesPersonId"
                                    :options="salespersonSelectOptions"
                                    :placeholder="salespeopleLoading ? '销售加载中' : '请选择销售'"
                                    :disabled="salespeopleLoading"
                                />
                            </template>
                            <input v-else :value="maintainSalesText" type="text" disabled />
                        </div>

                        <div class="form-hint">公司名称为必填项，如确实未知请填写“无”。</div>

                        <div class="form-row">
                            <div class="form-group half">
                                <label>公司名称 <span class="required">*</span></label>
                                <input
                                    v-model="companyForm.company"
                                    type="text"
                                    placeholder="公司名称"
                                    list="customer-company-options"
                                    @focus="handleCompanyFocus"
                                    @input="handleCompanyInput"
                                />
                                <datalist id="customer-company-options">
                                    <option v-for="item in companyOptions" :key="item.company" :value="item.company" />
                                </datalist>
                            </div>
                            <div class="form-group half">
                                <label>公司详情</label>
                                <input v-model="companyForm.companyDetail" type="text" placeholder="主营业务/详情" />
                            </div>
                        </div>

                        <div class="form-group">
                            <label>公司网站</label>
                            <input v-model="companyForm.companyWebsite" type="text" placeholder="公司网站" />
                        </div>
                    </div>

                    <div class="extra-customer-card">
                        <div class="extra-customer-header">
                            <div class="extra-customer-title">客户1</div>
                        </div>

                        <div class="section-divider">
                            <span>基本信息</span>
                        </div>

                        <div class="form-row">
                            <div class="form-group half">
                                <label>姓名 <span class="required">*</span></label>
                                <input v-model="form.name" type="text" placeholder="请输入客户姓名" />
                            </div>
                            <div class="form-group half">
                                <label>国家 <span class="required">*</span></label>
                                <input v-model="form.country" type="text" placeholder="国家" list="customer-country-options" />
                                <datalist id="customer-country-options">
                                    <option v-for="country in countryOptions" :key="country" :value="country" />
                                </datalist>
                            </div>
                        </div>

                        <div class="form-row">
                            <div class="form-group half">
                                <label>城市</label>
                                <input v-model="form.city" type="text" placeholder="城市" />
                            </div>
                        </div>

                        <div class="section-divider">
                            <span>联系方式</span>
                        </div>
                        <div class="form-hint">联系方式为必填项，如确实未知请填写“无”。</div>

                        <div class="form-row">
                            <div class="form-group half">
                                <label>电话 <span class="required">*</span></label>
                                <input v-model="form.phone" type="text" placeholder="电话号码" />
                            </div>
                            <div class="form-group half">
                                <label>WhatsApp <span class="required">*</span></label>
                                <input v-model="form.whatsapp" type="text" placeholder="WhatsApp" />
                            </div>
                        </div>

                        <div class="form-row">
                            <div class="form-group half">
                                <label>邮箱 <span class="required">*</span></label>
                                <input v-model="form.email" type="text" placeholder="电子邮箱" />
                            </div>
                            <div class="form-group half">
                                <label>微信号 <span class="required">*</span></label>
                                <input v-model="form.wechat" type="text" placeholder="微信号" />
                            </div>
                        </div>

                        <div class="section-divider">
                            <span>客户分类</span>
                        </div>

                        <div class="form-group">
                            <label>客户类型 <span class="required">*</span></label>
                            <div class="radio-group">
                                <label
                                    v-for="type in customerTypes"
                                    :key="type.value"
                                    class="radio-item"
                                    :class="{ active: form.customerType === type.value }"
                                >
                                    <input type="radio" :value="type.value" v-model="form.customerType" />
                                    <span>{{ type.label }}</span>
                                </label>
                            </div>
                        </div>

                        <div class="form-group">
                            <label>客户等级 <span class="required">*</span></label>
                            <div class="radio-group">
                                <label
                                    v-for="level in customerLevels"
                                    :key="level.value"
                                    class="radio-item level-item"
                                    :class="{ active: form.customerLevel === level.value }"
                                >
                                    <input type="radio" :value="level.value" v-model="form.customerLevel" />
                                    <span>{{ level.label }}</span>
                                </label>
                            </div>
                            <div class="form-hint" v-if="form.customerLevel">
                                {{ getLevelHint(form.customerLevel) }}
                            </div>
                        </div>

                        <div class="form-group">
                            <label>获客渠道 <span class="required">*</span></label>
                            <div class="form-row">
                                <div class="form-group half" style="margin-bottom: 0;">
                                    <SearchableSelect
                                        v-model="sourceLevel1"
                                        :options="sourceOptions"
                                        placeholder="请选择一级渠道"
                                        @change="onSourceLevel1Change"
                                    />
                                </div>
                                <div class="form-group half" style="margin-bottom: 0;" v-if="sourceLevel2Options.length">
                                    <SearchableSelect
                                        v-model="sourceLevel2"
                                        :options="sourceLevel2Options"
                                        placeholder="请选择二级渠道"
                                        @change="onSourceLevel2Change"
                                    />
                                </div>
                                <div class="form-group half" style="margin-bottom: 0;" v-if="sourceLevel3Options.length">
                                    <SearchableSelect
                                        v-model="sourceLevel3"
                                        :options="sourceLevel3Options"
                                        placeholder="请选择三级渠道"
                                    />
                                </div>
                            </div>
                        </div>

                        <div class="form-group">
                            <label>自定义标签</label>
                            <div class="tags-container">
                                <span v-for="tag in form.customTags" :key="tag" class="tag blue closable">
                                    {{ tag }}
                                    <button class="tag-close" @click="handleCloseTag(tag)">×</button>
                                </span>
                                <input
                                    v-if="inputVisible"
                                    ref="InputRef"
                                    v-model="inputValue"
                                    class="tag-input"
                                    @keyup.enter="handleInputConfirm"
                                    @blur="handleInputConfirm"
                                    placeholder="输入标签"
                                />
                                <button v-else class="add-tag-btn" @click="showInput">+ 添加标签</button>
                            </div>
                            <div class="form-hint">标签不限制字数</div>
                        </div>

                        <div class="section-divider">
                            <span>附件上传</span>
                        </div>

                        <div class="form-group">
                            <label>上传附件 <span class="required">*</span></label>
                            <FileUploader v-model="form.attachments" :max-size="10" />
                            <div class="form-hint">必填项，支持上传图片、文档等文件，单个文件不超过10MB</div>
                        </div>
                    </div>

                    <div
                        v-for="(customer, index) in extraCustomers"
                        :key="index"
                        class="extra-customer-card"
                    >
                        <div class="extra-customer-header">
                            <div class="extra-customer-title">客户{{ index + 2 }}</div>
                            <button class="remove-extra-btn" @click="removeExtraCustomer(index)">删除</button>
                        </div>

                        <div class="section-divider">
                            <span>基本信息</span>
                        </div>

                        <div class="form-row">
                            <div class="form-group half">
                                <label>姓名 <span class="required">*</span></label>
                                <input v-model="customer.name" type="text" placeholder="请输入客户姓名" />
                            </div>
                            <div class="form-group half">
                                <label>国家 <span class="required">*</span></label>
                                <input
                                    v-model="customer.country"
                                    type="text"
                                    placeholder="国家"
                                    list="customer-country-options"
                                />
                            </div>
                        </div>

                        <div class="form-row">
                            <div class="form-group half">
                                <label>城市</label>
                                <input v-model="customer.city" type="text" placeholder="城市" />
                            </div>
                        </div>

                        <div class="section-divider">
                            <span>联系方式</span>
                        </div>

                        <div class="form-row">
                            <div class="form-group half">
                                <label>电话 <span class="required">*</span></label>
                                <input v-model="customer.phone" type="text" placeholder="电话号码" />
                            </div>
                            <div class="form-group half">
                                <label>WhatsApp <span class="required">*</span></label>
                                <input v-model="customer.whatsapp" type="text" placeholder="WhatsApp" />
                            </div>
                        </div>

                        <div class="form-row">
                            <div class="form-group half">
                                <label>邮箱 <span class="required">*</span></label>
                                <input v-model="customer.email" type="text" placeholder="电子邮箱" />
                            </div>
                            <div class="form-group half">
                                <label>微信号 <span class="required">*</span></label>
                                <input v-model="customer.wechat" type="text" placeholder="微信号" />
                            </div>
                        </div>

                        <div class="section-divider">
                            <span>客户分类</span>
                        </div>

                        <div class="form-group">
                            <label>客户类型 <span class="required">*</span></label>
                            <div class="radio-group">
                                <label
                                    v-for="type in customerTypes"
                                    :key="type.value"
                                    class="radio-item"
                                    :class="{ active: customer.customerType === type.value }"
                                >
                                    <input type="radio" :value="type.value" v-model="customer.customerType" />
                                    <span>{{ type.label }}</span>
                                </label>
                            </div>
                        </div>

                        <div class="form-group">
                            <label>客户等级 <span class="required">*</span></label>
                            <div class="radio-group">
                                <label
                                    v-for="level in customerLevels"
                                    :key="level.value"
                                    class="radio-item level-item"
                                    :class="{ active: customer.customerLevel === level.value }"
                                >
                                    <input type="radio" :value="level.value" v-model="customer.customerLevel" />
                                    <span>{{ level.label }}</span>
                                </label>
                            </div>
                            <div class="form-hint" v-if="customer.customerLevel">
                                {{ getLevelHint(customer.customerLevel) }}
                            </div>
                        </div>

                        <div class="form-group">
                            <label>获客渠道 <span class="required">*</span></label>
                            <div class="form-row">
                                <div class="form-group half" style="margin-bottom: 0;">
                                    <SearchableSelect
                                        v-model="customer.sourceLevel1"
                                        :options="sourceOptions"
                                        placeholder="请选择一级渠道"
                                        @change="onExtraSourceLevel1Change(customer)"
                                    />
                                </div>
                                <div
                                    class="form-group half"
                                    style="margin-bottom: 0;"
                                    v-if="getSourceLevel2Options(customer.sourceLevel1).length"
                                >
                                    <SearchableSelect
                                        v-model="customer.sourceLevel2"
                                        :options="getSourceLevel2Options(customer.sourceLevel1)"
                                        placeholder="请选择二级渠道"
                                        @change="onExtraSourceLevel2Change(customer)"
                                    />
                                </div>
                                <div
                                    class="form-group half"
                                    style="margin-bottom: 0;"
                                    v-if="getSourceLevel3Options(customer.sourceLevel1, customer.sourceLevel2).length"
                                >
                                    <SearchableSelect
                                        v-model="customer.sourceLevel3"
                                        :options="getSourceLevel3Options(customer.sourceLevel1, customer.sourceLevel2)"
                                        placeholder="请选择三级渠道"
                                        @change="updateExtraCustomerSource(customer)"
                                    />
                                </div>
                            </div>
                        </div>

                        <div class="form-group">
                            <label>自定义标签</label>
                            <div class="tags-container">
                                <span v-for="tag in customer.customTags" :key="tag" class="tag blue closable">
                                    {{ tag }}
                                    <button class="tag-close" @click="handleExtraCloseTag(index, tag)">×</button>
                                </span>
                                <input
                                    v-if="customer.inputVisible"
                                    v-model="customer.inputValue"
                                    class="tag-input"
                                    @keyup.enter="handleExtraInputConfirm(index)"
                                    @blur="handleExtraInputConfirm(index)"
                                    placeholder="输入标签"
                                />
                                <button v-else class="add-tag-btn" @click="showExtraInput(index)">+ 添加标签</button>
                            </div>
                            <div class="form-hint">标签不限制字数</div>
                        </div>

                        <div class="section-divider">
                            <span>附件上传</span>
                        </div>

                        <div class="form-group">
                            <label>上传附件 <span class="required">*</span></label>
                            <FileUploader v-model="customer.attachments" :max-size="10" />
                            <div class="form-hint">必填项，支持上传图片、文档等文件，单个文件不超过10MB</div>
                        </div>
                    </div>

                    <div class="extra-customer-entry bottom">
                        <button
                            class="add-extra-btn"
                            :disabled="!companyForm.company.trim()"
                            @click="addExtraCustomer"
                        >
                            再添加一个客户
                        </button>
                    </div>
                </div>
            </template>

            <div class="modal-actions">
                <button v-if="!isEditMode" @click="openDrafts">
                    <Icon name="material-symbols:inventory-2-outline" class="btn-icon" />
                    草稿箱
                </button>
                <button v-if="!isEditMode" @click="saveDraft">保存草稿</button>
                <button @click="handleClose">取消</button>
                <button class="primary" @click="submitForm" :disabled="!isFormValid">
                    {{ isEditMode ? '保存' : '确定' }}
                </button>
            </div>
            </div>
            <transition name="draft-slide">
                <div v-if="showDrafts" class="draft-panel">
                    <div class="dialog-box">
                        <h3 class="dialog-title">草稿箱</h3>
                        <div class="dialog-content draft-list">
                            <div v-if="drafts.length === 0" class="empty-tip">暂无草稿</div>
                    <div v-else class="draft-items">
                        <div v-for="draft in drafts" :key="draft.id" class="draft-item">
                            <div class="draft-info">
                                <div class="draft-title">{{ draft.title }}</div>
                                <div class="draft-time">
                                    <Icon name="material-symbols:schedule" class="draft-time-icon" />
                                    <span>{{ formatDraftTime(draft.updatedAt) }}</span>
                                </div>
                            </div>
                            <div class="draft-actions">
                                <button class="btn-apply" @click="applyDraft(draft)">
                                    <Icon name="material-symbols:check-circle-outline" class="action-icon" />
                                    使用
                                </button>
                                <button class="btn-remove" @click="removeDraft(draft.id)">
                                    <Icon name="material-symbols:delete-outline" class="action-icon" />
                                    删除
                                </button>
                            </div>
                        </div>
                    </div>
                        </div>
                        <div class="dialog-actions">
                            <button class="btn-cancel" @click="showDrafts = false">关闭</button>
                        </div>
                    </div>
                </div>
            </transition>
        </div>
    </div>

    <AttachmentImagePreview
        v-model="showImagePreview"
        :title="previewFileName"
        :src="previewImageUrl"
    >
        <template #footer>
            <el-button @click="showImagePreview = false">关闭</el-button>
            <el-button type="primary" @click="downloadExistingAttachment(previewAttachmentPath, previewFileName)">下载</el-button>
        </template>
    </AttachmentImagePreview>
</template>

<script setup lang="ts">
import { ref, reactive, computed, nextTick, watch } from 'vue'
import { countryOptions } from '~/utils/countryOptions'
import AttachmentImagePreview from '~/components/configuration/sales/AttachmentImagePreview.vue'
import {
    downloadAttachmentFile,
    isImageAttachment,
    toAbsoluteAttachmentUrl,
} from '~/utils/attachmentPreview'
import { retrieveCustomerCompanyOptions, type CustomerCompanyOption } from '~/composables/api/useCustomerApi'

const props = withDefaults(defineProps<{
    modelValue: boolean
    mode?: 'create' | 'edit'
    initialData?: {
        name?: string
        country?: string
        city?: string
        phone?: string
        whatsapp?: string
        wechat?: string
        email?: string
        company?: string
        companyDetail?: string
        companyWebsite?: string
        customerType?: string
        customerLevel?: string
        source?: string
        sourceDetail?: string
        customTags?: string[]
        attachments?: CustomerAttachment[]
    }
}>(), {
    mode: 'create'
})

type CustomerAttachment =
    | string
    | {
          path?: string
          originalName?: string
          name?: string
      }

import { retrieveSalespersonList } from '~/composables/api/useSalespersonApi'

const emit = defineEmits(['update:modelValue', 'submit'])

const visible = computed({
    get: () => props.modelValue,
    set: (val) => emit('update:modelValue', val)
})

const isEditMode = computed(() => props.mode === 'edit')

type CustomerDialogForm = {
    name: string
    country: string
    city: string
    phone: string
    whatsapp: string
    wechat: string
    email: string
    company: string
    companyDetail: string
    companyWebsite: string
    customerType: string
    customerLevel: string
    source: string[]
    customTags: string[]
    salesPersonId: string
    attachments: File[]
}

const createCompanyForm = () => ({
    company: '',
    companyDetail: '',
    companyWebsite: ''
})

const createCustomerForm = (): CustomerDialogForm => ({
    name: '',
    country: '',
    city: '',
    phone: '',
    whatsapp: '',
    wechat: '',
    email: '',
    company: '',
    companyDetail: '',
    companyWebsite: '',
    customerType: '',
    customerLevel: '',
    source: [],
    customTags: [],
    salesPersonId: '',
    attachments: []
})

const buildSubmitCustomers = (
    companyForm: ReturnType<typeof createCompanyForm>,
    customers: CustomerDialogForm[]
) => {
    return customers.map((customer) => ({
        ...customer,
        company: companyForm.company,
        companyDetail: companyForm.companyDetail,
        companyWebsite: companyForm.companyWebsite,
        source: [...customer.source],
        customTags: [...customer.customTags],
        attachments: [...customer.attachments]
    }))
}

type ExtraCustomerForm = CustomerDialogForm & {
    sourceLevel1: string
    sourceLevel2: string
    sourceLevel3: string
    inputValue: string
    inputVisible: boolean
}

const companyForm = reactive(createCompanyForm())
const form = reactive(createCustomerForm())
const createExtraCustomerForm = (data: Partial<ExtraCustomerForm> = {}): ExtraCustomerForm => ({
    ...createCustomerForm(),
    sourceLevel1: '',
    sourceLevel2: '',
    sourceLevel3: '',
    inputValue: '',
    inputVisible: false,
    ...data,
    source: Array.isArray(data.source) ? [...data.source] : [],
    customTags: Array.isArray(data.customTags) ? [...data.customTags] : [],
    attachments: []
})
const extraCustomers = ref<ExtraCustomerForm[]>([])

const existingAttachments = ref<CustomerAttachment[]>([])
const removedAttachments = ref<string[]>([])
const showImagePreview = ref(false)
const previewFileName = ref('')
const previewImageUrl = ref('')
const previewAttachmentPath = ref('')

const salespeople = ref<any[]>([])
const salespeopleLoading = ref(false)
const salespeopleLoaded = ref(false)
const companyOptions = ref<CustomerCompanyOption[]>([])
const companyOptionsLoading = ref(false)
const COMPANY_OPTIONS_LIMIT = 30
const COMPANY_SEARCH_DEBOUNCE_MS = 250
let companySearchToken = 0
let companySearchTimer: ReturnType<typeof setTimeout> | null = null

const salespersonSelectOptions = computed(() =>
    salespeople.value
        .map((sp) => ({
            label: String(sp?.name || sp?.username || '').trim(),
            value: String(sp?._id || sp?.id || '').trim(),
        }))
        .filter((option) => option.label && option.value),
)
const userInfo = useState<any>('admin_info', () => ({}))
const salespersonId = useState<string | null>('salesperson_id', () => null)
const isSalesperson = computed(() => Number(userInfo.value.role) === 3)
const canAssignSales = computed(() => Number(userInfo.value.role) <= 2)
const assignType = ref<'public' | 'salesperson'>('public')
const maintainSalesText = computed(() => (isSalesperson.value ? '本人' : '暂无（公共客户池）'))
const showDrafts = ref(false)
const drafts = ref<CustomerDraft[]>([])
const DRAFT_STORAGE_KEY = 'customer_drafts'

type CustomerDraft = {
    id: string
    title: string
    data: any
    createdAt: number
    updatedAt: number
}

// 客户类型选项
const customerTypes = [
    { value: 'B端客户', label: 'B端客户 (企业/贸易商)' },
    { value: 'B端客户-院校', label: 'B端客户 (院校)' },
    { value: 'C端客户', label: 'C端客户 (个人)' },
    { value: 'G端客户', label: 'G端客户 (政府)' },
    { value: '战略合作', label: '战略合作 (代理商)' },
]

// 客户等级选项
const customerLevels = [
    { value: '优质客户', label: '优质客户' },
    { value: '一般客户', label: '一般客户' },
    { value: '潜在客户', label: '潜在客户' },
    { value: '问题客户', label: '问题客户' },
    { value: '风险客户', label: '风险客户' },
]

const getLevelHint = (level: string) => {
    const hints: Record<string, string> = {
        '优质客户': '已成单, 沟通融洽',
        '一般客户': '已成单, 订单不大',
        '潜在客户': '未成单, 有望近期成交',
        '问题客户': '沟通不顺, 合作价值低',
        '风险客户': '已买过但售后谈崩，或抄袭产品',
    }
    return hints[level] || ''
}

const sourceOptions = [
    {
        value: '社交媒体',
        label: '社交媒体',
        children: [
            {
                value: '国内',
                label: '国内',
                children: [
                    { value: '微信订阅号/视频号', label: '微信订阅号/视频号' },
                    { value: '小红书', label: '小红书' },
                    { value: '哔哩哔哩', label: '哔哩哔哩' },
                ]
            },
            {
                value: '国外',
                label: '国外',
                children: [
                    { value: 'Youtube', label: 'Youtube' },
                    { value: 'Facebook', label: 'Facebook' },
                    { value: 'Tiktok', label: 'Tiktok' },
                    { value: 'Linkedin', label: 'Linkedin' },
                    { value: 'Instagram', label: 'Instagram' },
                ]
            }
        ]
    },
    { value: '自建站', label: '自建站' },
    { value: '私域流量', label: '私域流量' },
    { value: '电商吸引', label: '电商吸引' },
    { value: '转介绍', label: '转介绍' },
    { value: '展会活动', label: '展会活动' },
]

// 级联选择状态
const sourceLevel1 = ref('')
const sourceLevel2 = ref('')
const sourceLevel3 = ref('')

const getSourceLevel2Options = (level1: string) => {
    const opt = sourceOptions.find((o) => o.value === level1)
    return opt?.children || []
}

const getSourceLevel3Options = (level1: string, level2: string) => {
    const opt = getSourceLevel2Options(level1).find((o: any) => o.value === level2)
    return opt?.children || []
}

const sourceLevel2Options = computed(() => {
    return getSourceLevel2Options(sourceLevel1.value)
})

const sourceLevel3Options = computed(() => {
    return getSourceLevel3Options(sourceLevel1.value, sourceLevel2.value)
})

const onSourceLevel1Change = () => {
    sourceLevel2.value = ''
    sourceLevel3.value = ''
    updateFormSource()
}

const onSourceLevel2Change = () => {
    sourceLevel3.value = ''
    updateFormSource()
}

const updateFormSource = () => {
    const arr: string[] = []
    if (sourceLevel1.value) arr.push(sourceLevel1.value)
    if (sourceLevel2.value) arr.push(sourceLevel2.value)
    if (sourceLevel3.value) arr.push(sourceLevel3.value)
    form.source = arr
}

watch(sourceLevel3, updateFormSource)

const updateExtraCustomerSource = (customer: ExtraCustomerForm) => {
    const arr: string[] = []
    if (customer.sourceLevel1) arr.push(customer.sourceLevel1)
    if (customer.sourceLevel2) arr.push(customer.sourceLevel2)
    if (customer.sourceLevel3) arr.push(customer.sourceLevel3)
    customer.source = arr
}

const onExtraSourceLevel1Change = (customer: ExtraCustomerForm) => {
    customer.sourceLevel2 = ''
    customer.sourceLevel3 = ''
    updateExtraCustomerSource(customer)
}

const onExtraSourceLevel2Change = (customer: ExtraCustomerForm) => {
    customer.sourceLevel3 = ''
    updateExtraCustomerSource(customer)
}

const clearCompanySearchTimer = () => {
    if (companySearchTimer) {
        clearTimeout(companySearchTimer)
        companySearchTimer = null
    }
}

const fetchCompanyOptions = async (keyword: string) => {
    if (isEditMode.value) return []
    const currentToken = ++companySearchToken
    try {
        companyOptionsLoading.value = true
        const res = await retrieveCustomerCompanyOptions()({
            keyword,
            limit: COMPANY_OPTIONS_LIMIT,
            ...(isSalesperson.value && salespersonId.value ? { id: salespersonId.value } : {}),
        })
        if (currentToken !== companySearchToken) return []
        const list = res?.data?.companies ?? []
        const normalized = Array.isArray(list)
            ? list.filter((item) => Boolean(item?.company?.trim()))
            : []
        companyOptions.value = normalized
        return normalized
    } catch (err) {
        console.error('获取公司选项失败:', err)
        companyOptions.value = []
        return []
    } finally {
        if (currentToken === companySearchToken) {
            companyOptionsLoading.value = false
        }
    }
}

const syncCompanyAutofill = (companyInput: string, list: CustomerCompanyOption[]) => {
    const company = companyInput.trim()
    if (!company) return
    const matched = list.find((item) => item.company?.trim() === company)
    if (!matched) return
    companyForm.companyDetail = matched.companyDetail || ''
    companyForm.companyWebsite = matched.companyWebsite || ''
}

const handleCompanyFocus = async () => {
    if (isEditMode.value) return
    clearCompanySearchTimer()
    const list = await fetchCompanyOptions(companyForm.company?.trim() || '')
    syncCompanyAutofill(companyForm.company || '', list)
}

const handleCompanyInput = () => {
    if (isEditMode.value) return
    clearCompanySearchTimer()
    companySearchTimer = setTimeout(async () => {
        const list = await fetchCompanyOptions(companyForm.company?.trim() || '')
        syncCompanyAutofill(companyForm.company || '', list)
    }, COMPANY_SEARCH_DEBOUNCE_MS)
}

// 表单验证
const isCreateCustomerValid = (customer: CustomerDialogForm) => {
    const contactValid = !!(
        customer.phone?.trim() &&
        customer.whatsapp?.trim() &&
        customer.email?.trim() &&
        customer.wechat?.trim()
    )
    const attachmentValid = customer.attachments.length > 0
    return !!(
        customer.name &&
        customer.country &&
        customer.customerType &&
        customer.customerLevel &&
        customer.source.length > 0 &&
        contactValid &&
        attachmentValid
    )
}

const isFormValid = computed(() => {
    if (isEditMode.value) {
        const contactValid = !!(
            form.phone?.trim() &&
            form.whatsapp?.trim() &&
            form.email?.trim() &&
            form.wechat?.trim()
        )
        const companyValid = !!form.company?.trim()
        const attachmentValid =
            existingAttachments.value.length > 0 || form.attachments.length > 0

        return !!(
            form.name &&
            form.source.length > 0 &&
            contactValid &&
            companyValid &&
            attachmentValid
        )
    }
    if (!companyForm.company?.trim()) return false
    if (!isCreateCustomerValid(form)) return false
    if (canAssignSales.value && assignType.value === 'salesperson') {
        if (!form.salesPersonId) return false
    }
    return extraCustomers.value.every((customer) => isCreateCustomerValid(customer))
})

watch(
    () => visible.value,
    async (isOpen) => {
        if (!isOpen || !canAssignSales.value || salespeopleLoaded.value || salespeopleLoading.value) return
        try {
            salespeopleLoading.value = true
            const res: any = await retrieveSalespersonList()()
            const list = res?.data?.salesperson ?? []
            salespeople.value = Array.isArray(list) ? list.filter((sp) => !sp?._isFakeDel) : []
            salespeopleLoaded.value = true
        } catch (err: any) {
            ElMessage.error(err?.data?.msg || err?.message || '获取销售列表失败')
        } finally {
            salespeopleLoading.value = false
        }
    }
)

// Tag logic
const inputValue = ref('')
const inputVisible = ref(false)
const InputRef = ref()

const handleCloseTag = (tag: string) => {
    form.customTags.splice(form.customTags.indexOf(tag), 1)
}

const showInput = () => {
    inputVisible.value = true
    nextTick(() => {
        InputRef.value?.focus()
    })
}

const handleInputConfirm = () => {
    if (inputValue.value) {
        if (!form.customTags.includes(inputValue.value)) {
            form.customTags.push(inputValue.value)
            inputValue.value = ''
            inputVisible.value = false
        } else {
            inputValue.value = ''
            inputVisible.value = false
        }
    } else {
        inputVisible.value = false
    }
}

const addExtraCustomer = () => {
    if (!companyForm.company?.trim()) return
    extraCustomers.value.push(createExtraCustomerForm())
}

const removeExtraCustomer = (index: number) => {
    extraCustomers.value.splice(index, 1)
}

const handleExtraCloseTag = (index: number, tag: string) => {
    const customer = extraCustomers.value[index]
    customer.customTags.splice(customer.customTags.indexOf(tag), 1)
}

const showExtraInput = (index: number) => {
    extraCustomers.value[index].inputVisible = true
}

const handleExtraInputConfirm = (index: number) => {
    const customer = extraCustomers.value[index]
    const value = customer.inputValue.trim()
    if (value && !customer.customTags.includes(value)) {
        customer.customTags.push(value)
    }
    customer.inputValue = ''
    customer.inputVisible = false
}

const handleClose = () => {
    visible.value = false
}

const getAttachmentPath = (attachment: CustomerAttachment) =>
    typeof attachment === 'string' ? attachment : attachment?.path || ''

const decodeFileName = (name: string) => {
    if (!name) return ''
    try {
        return decodeURIComponent(name)
    } catch (e) {
        return name
    }
}

const getFileName = (attachment: CustomerAttachment) => {
    if (!attachment) return ''
    if (typeof attachment === 'object') {
        const original = attachment.originalName || attachment.name || ''
        if (original) return decodeFileName(original)
    }
    const path = getAttachmentPath(attachment)
    if (!path) return ''
    const name = path.split(/[/\\]/).pop() || ''
    return decodeFileName(name)
}

const getAttachmentKey = (attachment: CustomerAttachment) =>
    getAttachmentPath(attachment) || getFileName(attachment) || ''

const removeExistingAttachment = (attachment: CustomerAttachment) => {
    const path = getAttachmentPath(attachment)
    if (!path) return
    existingAttachments.value = existingAttachments.value.filter(
        (item) => getAttachmentPath(item) !== path
    )
    if (!removedAttachments.value.includes(path)) {
        removedAttachments.value.push(path)
    }
}

const downloadExistingAttachment = async (path: string, filename?: string) => {
    if (!path) return
    try {
        await downloadAttachmentFile(path, filename)
    } catch (error) {
        console.error('下载附件失败:', error)
        ElMessage.error('下载附件失败')
    }
}

const handleExistingAttachmentClick = (attachment: CustomerAttachment) => {
    const path = getAttachmentPath(attachment)
    if (!path) return
    if (!isImageAttachment(attachment)) {
        downloadExistingAttachment(path, getFileName(attachment))
        return
    }
    previewImageUrl.value = toAbsoluteAttachmentUrl(path, window.location.origin)
    previewFileName.value = getFileName(attachment)
    previewAttachmentPath.value = path
    showImagePreview.value = true
}

const setSourceLevels = (source?: string, sourceDetail?: string) => {
    sourceLevel1.value = source || ''
    sourceLevel2.value = ''
    sourceLevel3.value = ''

    if (!source || !sourceDetail) {
        updateFormSource()
        return
    }

    const level1 = sourceOptions.find((o) => o.value === source)
    if (!level1?.children?.length) {
        updateFormSource()
        return
    }

    const level2Match = level1.children.find((child: any) => child.value === sourceDetail)
    if (level2Match) {
        sourceLevel2.value = level2Match.value
        updateFormSource()
        return
    }

    const level2WithChild = level1.children.find((child: any) =>
        Array.isArray(child.children) && child.children.some((sub: any) => sub.value === sourceDetail)
    )
    if (level2WithChild) {
        sourceLevel2.value = level2WithChild.value
        sourceLevel3.value = sourceDetail
    }
    updateFormSource()
}

const initForm = (data?: typeof props.initialData) => {
    Object.assign(companyForm, createCompanyForm())
    Object.assign(form, createCustomerForm(), {
        name: data?.name || '',
        country: data?.country || '',
        city: data?.city || '',
        phone: data?.phone || '',
        whatsapp: data?.whatsapp || '',
        wechat: data?.wechat || '',
        email: data?.email || '',
        company: data?.company || '',
        companyDetail: data?.companyDetail || '',
        companyWebsite: data?.companyWebsite || '',
        customerType: data?.customerType || '',
        customerLevel: data?.customerLevel || '',
        source: [] as string[],
        customTags: Array.isArray(data?.customTags) ? [...data!.customTags!] : [],
        attachments: [] as File[]
    })
    existingAttachments.value = Array.isArray(data?.attachments) ? [...data!.attachments!] : []
    removedAttachments.value = []
    inputValue.value = ''
    inputVisible.value = false
    extraCustomers.value = []
    setSourceLevels(data?.source, data?.sourceDetail)
}

const resetForm = () => {
    clearCompanySearchTimer()
    Object.assign(companyForm, createCompanyForm())
    Object.assign(form, createCustomerForm())
    assignType.value = 'public'
    sourceLevel1.value = ''
    sourceLevel2.value = ''
    sourceLevel3.value = ''
    existingAttachments.value = []
    removedAttachments.value = []
    inputValue.value = ''
    inputVisible.value = false
    extraCustomers.value = []
}

const loadDrafts = () => {
    if (!import.meta.client) return
    try {
        const raw = localStorage.getItem(DRAFT_STORAGE_KEY)
        drafts.value = raw ? JSON.parse(raw) : []
    } catch {
        drafts.value = []
    }
}

const persistDrafts = () => {
    if (!import.meta.client) return
    localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(drafts.value))
}

const saveDraft = () => {
    const title = form.name?.trim() || '未命名草稿'
    const payload = {
        name: form.name,
        country: form.country,
        city: form.city,
        phone: form.phone,
        whatsapp: form.whatsapp,
        wechat: form.wechat,
        email: form.email,
        company: companyForm.company,
        companyDetail: companyForm.companyDetail,
        companyWebsite: companyForm.companyWebsite,
        customerType: form.customerType,
        customerLevel: form.customerLevel,
        source: [...form.source],
        customTags: [...form.customTags],
        salesPersonId: form.salesPersonId,
        assignType: assignType.value,
        sourceLevel1: sourceLevel1.value,
        sourceLevel2: sourceLevel2.value,
        sourceLevel3: sourceLevel3.value,
        extraCustomers: extraCustomers.value.map((customer) => ({
            name: customer.name,
            country: customer.country,
            city: customer.city,
            phone: customer.phone,
            whatsapp: customer.whatsapp,
            wechat: customer.wechat,
            email: customer.email,
            customerType: customer.customerType,
            customerLevel: customer.customerLevel,
            source: [...customer.source],
            customTags: [...customer.customTags],
            sourceLevel1: customer.sourceLevel1,
            sourceLevel2: customer.sourceLevel2,
            sourceLevel3: customer.sourceLevel3,
        })),
    }
    const now = Date.now()
    drafts.value.unshift({
        id: `${now}-${Math.random().toString(36).slice(2, 8)}`,
        title,
        data: payload,
        createdAt: now,
        updatedAt: now,
    })
    persistDrafts()
    ElMessage.success('草稿已保存')
}

const openDrafts = () => {
    loadDrafts()
    showDrafts.value = true
}

const applyDraft = (draft: CustomerDraft) => {
    const data = draft.data || {}
    Object.assign(companyForm, {
        company: data.company || '',
        companyDetail: data.companyDetail || '',
        companyWebsite: data.companyWebsite || '',
    })
    Object.assign(form, {
        name: data.name || '',
        country: data.country || '',
        city: data.city || '',
        phone: data.phone || '',
        whatsapp: data.whatsapp || '',
        wechat: data.wechat || '',
        email: data.email || '',
        company: '',
        companyDetail: '',
        companyWebsite: '',
        customerType: data.customerType || '',
        customerLevel: data.customerLevel || '',
        source: Array.isArray(data.source) ? data.source : [],
        customTags: Array.isArray(data.customTags) ? data.customTags : [],
        salesPersonId: data.salesPersonId || '',
    })
    assignType.value = data.assignType || 'public'
    sourceLevel1.value = data.sourceLevel1 || ''
    sourceLevel2.value = data.sourceLevel2 || ''
    sourceLevel3.value = data.sourceLevel3 || ''
    extraCustomers.value = Array.isArray(data.extraCustomers)
        ? data.extraCustomers.map((customer: any) =>
              createExtraCustomerForm({
                  name: customer.name || '',
                  country: customer.country || '',
                  city: customer.city || '',
                  phone: customer.phone || '',
                  whatsapp: customer.whatsapp || '',
                  wechat: customer.wechat || '',
                  email: customer.email || '',
                  customerType: customer.customerType || '',
                  customerLevel: customer.customerLevel || '',
                  source: Array.isArray(customer.source) ? customer.source : [],
                  customTags: Array.isArray(customer.customTags) ? customer.customTags : [],
                  sourceLevel1: customer.sourceLevel1 || '',
                  sourceLevel2: customer.sourceLevel2 || '',
                  sourceLevel3: customer.sourceLevel3 || '',
              })
          )
        : []
    updateFormSource()
    showDrafts.value = false
}

const removeDraft = (id: string) => {
    drafts.value = drafts.value.filter(d => d.id !== id)
    persistDrafts()
}

const formatDraftTime = (timestamp: number) => {
    const date = new Date(timestamp)
    if (Number.isNaN(date.getTime())) return ''
    const y = date.getFullYear()
    const m = String(date.getMonth() + 1).padStart(2, '0')
    const d = String(date.getDate()).padStart(2, '0')
    const h = String(date.getHours()).padStart(2, '0')
    const min = String(date.getMinutes()).padStart(2, '0')
    return `${y}-${m}-${d} ${h}:${min}`
}

const toCustomerPayload = (customer: CustomerDialogForm) => ({
    name: customer.name,
    country: customer.country,
    city: customer.city,
    phone: customer.phone,
    whatsapp: customer.whatsapp,
    wechat: customer.wechat,
    email: customer.email,
    company: customer.company,
    companyDetail: customer.companyDetail,
    companyWebsite: customer.companyWebsite,
    customerType: customer.customerType,
    customerLevel: customer.customerLevel,
    source: [...customer.source],
    customTags: [...customer.customTags],
    salesPersonId: customer.salesPersonId,
    attachments: [...customer.attachments]
})

const submitForm = async () => {
    if (!isFormValid.value) return
    if (isEditMode.value) {
        emit('submit', {
            ...form,
            assignType: assignType.value,
            removedAttachments: removedAttachments.value
        })
    } else {
        const customers = buildSubmitCustomers(
            companyForm,
            [
                toCustomerPayload(form),
                ...extraCustomers.value.map((customer) => toCustomerPayload({
                    ...customer,
                    salesPersonId: form.salesPersonId
                }))
            ]
        )

        emit('submit', {
            customers,
            assignType: assignType.value,
            salesPersonId: form.salesPersonId
        })
    }
    visible.value = false
    resetForm()
}

watch(
    () => visible.value,
    async (isOpen) => {
        if (!isOpen) {
            clearCompanySearchTimer()
            return
        }
        clearCompanySearchTimer()
        if (isEditMode.value) {
            initForm(props.initialData)
            companyOptions.value = []
            companySearchToken += 1
        } else {
            resetForm()
            loadDrafts()
            companyOptions.value = []
            companySearchToken += 1
        }
        if (canAssignSales.value) {
            assignType.value = 'public'
        }
    }
)
</script>

<style lang="less" scoped>
::-webkit-scrollbar {
    display: none;
}

.modal-overlay {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0,0,0,0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
}

.modal-row {
    display: flex;
    align-items: center;
    gap: 24px;
}

.modal-content {
    background: #fff;
    padding: 24px;
    border-radius: 16px;
    width: 600px;
    box-shadow: 0 10px 25px rgba(0,0,0,0.1);
    max-height: 90vh;
    overflow-y: auto;

    .modal-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 20px;

        h3 {
            margin: 0;
            font-size: 18px;
            color: #111827;
        }

        .close-btn {
            background: none;
            border: none;
            cursor: pointer;
            color: #9CA3AF;
            font-size: 20px;
            padding: 4px;

            &:hover {
                color: #374151;
            }
        }
    }

    .form-row {
        display: flex;
        gap: 16px;
        flex-wrap: wrap;
    }

    .form-group {
        margin-bottom: 16px;
        
        &.half {
            flex: 1;
            min-width: 200px;
        }

        &.full {
            width: 100%;
        }
        
        label {
            display: block;
            margin-bottom: 8px;
            font-size: 14px;
            color: #374151;
            font-weight: 500;

            .required {
                color: #EF4444;
            }
        }

        input, textarea, select {
            width: 100%;
            padding: 8px 12px;
            border: 1px solid #E5E7EB;
            border-radius: 8px;
            font-size: 14px;
            box-sizing: border-box;
            
            &:focus {
                outline: none;
                border-color: #4E8AF4;
            }

            &:disabled {
                background-color: #F3F4F6;
                cursor: not-allowed;
            }
        }

        .select-input {
            appearance: none;
            background-image: url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e");
            background-position: right 8px center;
            background-repeat: no-repeat;
            background-size: 20px;
            padding-right: 32px;
            background-color: #fff;
        }

        .radio-group {
            display: flex;
            flex-wrap: wrap;
            gap: 8px;

            .radio-item {
                display: flex;
                align-items: center;
                padding: 6px 12px;
                border: 1px solid #E5E7EB;
                border-radius: 20px;
                cursor: pointer;
                transition: all 0.2s;

                input[type="radio"] {
                    display: none;
                }

                span {
                    font-size: 13px;
                    color: #374151;
                }

                &:hover {
                    border-color: #4E8AF4;
                }

                &.active {
                    background-color: #4E8AF4;
                    border-color: #4E8AF4;

                    span {
                        color: #fff;
                    }
                }

                &.level-item.active {
                    &:has(input[value="优质客户"]) {
                        background-color: #10B981;
                        border-color: #10B981;
                    }
                    &:has(input[value="一般客户"]) {
                        background-color: #3B82F6;
                        border-color: #3B82F6;
                    }
                    &:has(input[value="潜在客户"]) {
                        background-color: #F59E0B;
                        border-color: #F59E0B;
                    }
                    &:has(input[value="问题客户"]) {
                        background-color: #6B7280;
                        border-color: #6B7280;
                    }
                    &:has(input[value="风险客户"]) {
                        background-color: #EF4444;
                        border-color: #EF4444;
                    }
                }
            }
        }

        .existing-attachments {
            background: #F9FAFB;
            border: 1px solid #E5E7EB;
            border-radius: 10px;
            padding: 10px 12px;
            margin-bottom: 12px;

            .existing-title {
                font-size: 12px;
                color: #6B7280;
                margin-bottom: 6px;
            }

            .existing-item {
                display: flex;
                align-items: center;
                justify-content: flex-start;
                gap: 12px;
                padding: 6px 0;
                border-top: 1px dashed #E5E7EB;
                cursor: pointer;

                &:first-of-type {
                    border-top: none;
                }

                .existing-name {
                    flex: 1;
                    min-width: 0;
                    font-size: 13px;
                    color: #374151;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    white-space: nowrap;
                }

                .existing-action {
                    color: #4E8AF4;
                    font-size: 16px;
                    width: 18px;
                    flex-shrink: 0;
                }

                .remove-existing {
                    flex-shrink: 0;
                    background: none;
                    border: none;
                    color: #EF4444;
                    font-size: 12px;
                    cursor: pointer;
                }
            }
        }
    }

    .tags-container {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        align-items: center;

        .tag {
            padding: 4px 12px;
            border-radius: 16px;
            font-size: 13px;
            display: inline-flex;
            align-items: center;
            gap: 4px;

            &.blue {
                background: #EFF6FF;
                color: #3B82F6;
            }

            &.closable .tag-close {
                background: none;
                border: none;
                cursor: pointer;
                font-size: 14px;
                color: #3B82F6;
                padding: 0;
                margin-left: 2px;

                &:hover {
                    color: #1D4ED8;
                }
            }
        }

        .tag-input {
            width: 80px;
            padding: 4px 8px;
            border: 1px solid #E5E7EB;
            border-radius: 16px;
            font-size: 13px;

            &:focus {
                outline: none;
                border-color: #4E8AF4;
            }
        }

        .add-tag-btn {
            padding: 4px 12px;
            border: 1px dashed #E5E7EB;
            border-radius: 16px;
            background: none;
            cursor: pointer;
            font-size: 13px;
            color: #9CA3AF;

            &:hover {
                border-color: #4E8AF4;
                color: #4E8AF4;
            }
        }
    }

    .modal-actions {
        display: flex;
        justify-content: flex-end;
        gap: 12px;
        margin-top: 24px;

        button {
            padding: 8px 16px;
            border-radius: 6px;
            border: 1px solid #E5E7EB;
            background: #fff;
            cursor: pointer;
            font-size: 14px;
            display: inline-flex;
            align-items: center;
            gap: 6px;

            &.primary {
                background: #4E8AF4;
                color: #fff;
                border-color: #4E8AF4;

                &:disabled {
                    opacity: 0.6;
                    cursor: not-allowed;
                }
            }
        }
    }

    .extra-customer-entry {
        margin-bottom: 16px;

        &.bottom {
            margin-bottom: 0;
        }

        .add-extra-btn {
            padding: 8px 14px;
            border: 1px solid #4E8AF4;
            border-radius: 8px;
            background: #EFF6FF;
            color: #2563EB;
            cursor: pointer;
            font-size: 14px;

            &:disabled {
                cursor: not-allowed;
                opacity: 0.6;
            }
        }
    }

    .extra-customer-list {
        display: flex;
        flex-direction: column;
        gap: 16px;
        margin-top: 20px;

        .extra-customer-card {
            border: 1px solid #E5E7EB;
            border-radius: 16px;
            padding: 20px;
            background: #FAFBFF;

            &.shared-company-card {
                background: #FFFFFF;
            }
        }

        .extra-customer-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 12px;
            margin-bottom: 8px;
        }

        .extra-customer-title {
            font-size: 16px;
            font-weight: 600;
            color: #111827;
        }

        .remove-extra-btn {
            border: none;
            background: none;
            color: #EF4444;
            cursor: pointer;
            font-size: 13px;
        }
    }
}

.draft-list {
    background: #f9fafb;
    border-radius: 12px;
    padding: 12px;
    border: 1px solid #e5e7eb;

    .draft-items {
        display: flex;
        flex-direction: column;
        gap: 14px;
        max-height: 300px;
        overflow-y: auto;
    }

    .draft-item {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 12px 14px;
        border: 1px solid #e2e8f0;
        border-radius: 12px;
        background: #fff;
        box-shadow: 0 6px 16px rgba(15, 23, 42, 0.08);
        position: relative;
        transition: box-shadow 0.2s ease, border-color 0.2s ease, transform 0.2s ease;

        &:hover {
            border-color: #4E8AF4;
            box-shadow: 0 10px 20px rgba(15, 23, 42, 0.12);
            transform: translateY(-1px);
        }
    }

    .draft-title {
        font-size: 15px;
        font-weight: 600;
        color: #111827;
    }

    .draft-time {
        font-size: 12px;
        color: #6b7280;
        margin-top: 4px;
        display: inline-flex;
        align-items: center;
        gap: 6px;

        :deep(svg) {
            font-size: 14px;
        }
    }

    .draft-actions {
        display: flex;
        gap: 10px;
    }

    .btn-apply,
    .btn-remove {
        padding: 8px 16px;
        border-radius: 6px;
        border: 1px solid #E5E7EB;
        background: #fff;
        cursor: pointer;
        font-size: 14px;
        display: inline-flex;
        align-items: center;
        gap: 6px;
        color: #374151;
        transition: all 0.2s ease;

        &:hover {
            border-color: #4E8AF4;
            color: #1F2937;
        }
    }

    .btn-apply {
        background: #4E8AF4;
        color: #fff;
        border-color: #4E8AF4;

        &:hover {
            background: #3B7BEF;
            border-color: #3B7BEF;
            color: #fff;
        }
    }

    .btn-remove {
        &:hover {
            border-color: #EF4444;
            color: #EF4444;
        }
    }

    .empty-tip {
        color: #94a3b8;
        font-size: 14px;
        text-align: center;
        padding: 24px 0;
    }

    :deep(.action-icon svg),
    :deep(.draft-time-icon svg) {
        font-size: 16px;
    }
}

.draft-panel {
    z-index: 1100;
}

.dialog-box {
    background: #fff;
    padding: 22px;
    border-radius: 16px;
    width: 520px;
    max-width: 90vw;
    box-shadow: 0 18px 40px rgba(15, 23, 42, 0.18);
}

.dialog-title {
    margin: 0 0 12px;
    font-size: 17px;
    color: #111827;
}

.dialog-content {
    max-height: 360px;
    overflow-y: auto;
}

.dialog-actions {
    display: flex;
    justify-content: flex-end;
    margin-top: 16px;
    gap: 8px;
}

.btn-cancel {
    padding: 6px 12px;
    border-radius: 6px;
    border: 1px solid #e5e7eb;
    background: #fff;
    cursor: pointer;
}

.draft-slide-enter-active,
.draft-slide-leave-active {
    transition: all 0.25s ease;
}

.draft-slide-enter-from,
.draft-slide-leave-to {
    opacity: 0;
    transform: translateX(40px);
}

.form-hint {
    margin-top: 6px;
    margin-bottom: 6px;
    font-size: 12px;
    color: #9CA3AF;
    line-height: 1.5;
}

.section-divider {
    display: flex;
    align-items: center;
    margin: 20px 0 16px;
    
    span {
        padding: 0 12px;
        font-size: 14px;
        font-weight: 600;
        color: #4E8AF4;
        white-space: nowrap;
    }

    &::before,
    &::after {
        content: '';
        flex: 1;
        height: 1px;
        background: #E5E7EB;
    }

    &:first-of-type {
        margin-top: 0;
    }
}
</style>
