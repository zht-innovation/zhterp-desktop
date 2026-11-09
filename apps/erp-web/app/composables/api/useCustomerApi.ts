import type { CustomerTermRecord } from '~/utils/customerTerm'
import type { SalesOrderPaymentPlan } from '~~/shared/types/salesOrderPayment'

export type CustomerAddPayload = {
    name: string
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
    _assignSalespersonId?: string
}

export function addCustomer() {
    return (data: FormData) =>
        $fetch('/customer/add', {
            method: 'POST',
            headers: {
                Token: getToken() || '',
            },
            body: data,
        })
}

export function importCustomers() {
    return (data: FormData) =>
        $fetch('/customer/import', {
            method: 'POST',
            headers: {
                Token: getToken() || '',
            },
            body: data,
        })
}

export type CustomerRetrieveParams = {
    id?: string
    page?: number
    limit?: number
    onlyUnassigned?: boolean
    onlyAssigned?: boolean
    onlyDeleted?: boolean
    category?: string
    assignedTo?: string
    customerLevel?: string
}

export type CustomerRetrieveResponse = {
    code: number
    msg: string
    data: {
        customers: any[]
        pagination: {
            page: number
            limit: number
            total: number
            hasMore: boolean
        }
    }
}

export type SalesOrderPayload = {
    id?: string
    _id?: string
    orderNo?: string
    orderName?: string
    customerId?: string
    customerName?: string
    customerCompany?: string
    customerRegion?: string
    salespersonId?: string
    salespersonName?: string
    orderType?: string
    amount?: number
    totalAmount?: number
    dealAmount?: number
    orderAmount?: number
    currency?: string
    status?: string
    approvalTargetStatus?: string
    auditRecords?: any[]
    orderDate?: string
    durationDays?: number
    durationText?: string
    orderImages?: any[]
    attachments?: any[]
    machineNo?: string
    invoiceStatus?: string
    contractNo?: string
    sampleRequirement?: string
    installationRequirement?: string
    testingRequirement?: string
    orderRemark?: string
    paymentProgress?: number
    receivableOrder?: string
    hasReceivable?: boolean
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
    products?: any[]
    creator?: string
    remark?: string
    rejectionReason?: string
}

export type SalesOrderReceiptPayload = {
    salesOrderId: string
    amount: number
    paymentDate: string
    currency: string
    remark?: string
    attachments?: any[]
}

export type SalesOrderReceiptRetrieveParams = {
    keyword?: string
    status?: string
    page?: number
    limit?: number
}

export type SalesOrderRetrieveParams = {
    keyword?: string
    orderNo?: string
    customerId?: string
    salespersonId?: string
    status?: string
    orderType?: string
    startDate?: string
    endDate?: string
    includeDeleted?: boolean
    deletedOnly?: boolean
    draftOnly?: boolean
    approvalOnly?: boolean
    approvalResult?: 'pending' | 'rejected' | 'approved' | 'all'
    page?: number
    limit?: number
}

export type CustomerCompanyGroup = {
    companyKey: string
    companyName: string
    customerCount: number
}

export type CustomerCompanyGroupParams = CustomerRetrieveParams & {
    keyword?: string
}

export type CustomerCompanyGroupResponse = {
    code: number
    msg: string
    data: {
        groups: CustomerCompanyGroup[]
        totalCustomers: number
        pagination: {
            page: number
            limit: number
            totalGroups: number
            hasMore: boolean
        }
    }
}

export type CustomerCompanyCustomersParams = Omit<CustomerCompanyGroupParams, 'page' | 'limit'> & {
    companyKey: string
}

export type CustomerCompanyCustomersResponse = {
    code: number
    msg: string
    data: {
        companyKey: string
        customers: any[]
    }
}

export function retrieveCustomerList() {
    return (params: CustomerRetrieveParams = {}) =>
        $fetch<CustomerRetrieveResponse>('/customer/retrieve', {
            method: 'GET',
            headers: {
                Token: getToken() || '',
            },
            query: params,
        })
}

export function addSalesOrder() {
    return (payload: SalesOrderPayload | FormData) =>
        $fetch('/sales-order/add', {
            method: 'POST',
            headers: {
                Token: getToken() || '',
            },
            body: payload,
        })
}

export function retrieveSalesOrderList() {
    return (params: SalesOrderRetrieveParams = {}) =>
        $fetch('/sales-order/retrieve', {
            method: 'GET',
            headers: {
                Token: getToken() || '',
            },
            query: params,
        })
}

export function retrieveSalesOrderApprovalStats() {
    return () =>
        $fetch('/sales-order/approval-stats', {
            method: 'GET',
            headers: {
                Token: getToken() || '',
            },
        })
}

export function importSalesOrders() {
    return (data: FormData) =>
        $fetch('/sales-order/import', {
            method: 'POST',
            headers: {
                Token: getToken() || '',
            },
            body: data,
        })
}

export function exportSalesOrders() {
    return (params: SalesOrderRetrieveParams = {}) =>
        $fetch<Blob>('/sales-order/export', {
            method: 'GET',
            headers: {
                Token: getToken() || '',
            },
            query: params,
            responseType: 'blob',
        })
}

export function updateSalesOrder() {
    return (payload: SalesOrderPayload | FormData) =>
        $fetch('/sales-order/update', {
            method: 'PUT',
            headers: {
                Token: getToken() || '',
            },
            body: payload,
        })
}

export function deleteSalesOrder() {
    return (payload: { id?: string; ids?: string[]; restore?: boolean; action?: 'purge-preview' | 'purge' }) =>
        $fetch('/sales-order/delete', {
            method: payload?.restore || payload?.action ? 'POST' : 'DELETE',
            headers: {
                Token: getToken() || '',
            },
            body: payload,
        })
}

export function auditSalesOrder() {
    return (payload: { id: string }) =>
        $fetch('/sales-order/audit', {
            method: 'POST',
            headers: {
                Token: getToken() || '',
            },
            body: payload,
        })
}

export function rejectSalesOrder() {
    return (payload: { id: string; reason: string }) =>
        $fetch('/sales-order/reject', {
            method: 'POST',
            headers: {
                Token: getToken() || '',
            },
            body: payload,
        })
}

export function revokeSalesOrderAudit() {
    return (payload: { id: string }) =>
        $fetch('/sales-order/revoke-audit', {
            method: 'PUT',
            headers: {
                Token: getToken() || '',
            },
            body: payload,
        })
}

export function addSalesOrderReceipt() {
    return (payload: SalesOrderReceiptPayload | FormData) =>
        $fetch('/sales-order-receipt/add', {
            method: 'POST',
            headers: {
                Token: getToken() || '',
            },
            body: payload,
        })
}

export function retrieveSalesOrderReceipts() {
    return (params: SalesOrderReceiptRetrieveParams = {}) =>
        $fetch('/sales-order-receipt/retrieve', {
            method: 'GET',
            headers: {
                Token: getToken() || '',
            },
            query: params,
        })
}

export function auditSalesOrderReceipt() {
    return (payload: { id: string }) =>
        $fetch('/sales-order-receipt/audit', {
            method: 'POST',
            headers: {
                Token: getToken() || '',
            },
            body: payload,
        })
}

export function retrieveCustomerCompanyGroups() {
    return (params: CustomerCompanyGroupParams = {}) =>
        $fetch<CustomerCompanyGroupResponse>('/customer/company-groups', {
            method: 'GET',
            headers: {
                Token: getToken() || '',
            },
            query: params,
        })
}

export function retrieveCompanyCustomers() {
    return (params: CustomerCompanyCustomersParams) =>
        $fetch<CustomerCompanyCustomersResponse>('/customer/company-customers', {
            method: 'GET',
            headers: {
                Token: getToken() || '',
            },
            query: params,
        })
}

export function retrieveCustomerDetail() {
    return (id: string) =>
        $fetch('/customer/detail', {
            method: 'GET',
            headers: {
                Token: getToken() || '',
            },
            query: { id },
        })
}

export type CustomerTermResponse = {
    code: number
    msg: string
    data: {
        records: CustomerTermRecord[]
        pagination: {
            page: number
            limit: number
            total: number
            hasMore: boolean
        }
    }
}

export function retrieveCustomerTermLog() {
    return (params: { customerId: string; page?: number; limit?: number }) =>
        $fetch<CustomerTermResponse>('/customer/term-log', {
            method: 'GET',
            headers: {
                Token: getToken() || '',
            },
            query: params,
        })
}

export type CustomerCompanyOption = {
    company: string
    companyDetail: string
    companyWebsite: string
}

export type CustomerCompanyOptionsResponse = {
    code: number
    msg: string
    data: {
        companies: CustomerCompanyOption[]
    } | null
}

export function retrieveCustomerCompanyOptions() {
    return (params: { keyword?: string; limit?: number; id?: string } = {}) =>
        $fetch<CustomerCompanyOptionsResponse>('/customer/company-options', {
            method: 'GET',
            headers: {
                Token: getToken() || '',
                'x-skip-loading': '1',
            },
            query: params,
        })
}

export function changeSalesperson() {
    return (payload: { customerId: string; newSalespersonId: string; appDays: number }) =>
        $fetch('/customer/changesales', {
            method: 'PUT',
            headers: {
                Token: getToken() || '',
            },
            body: payload,
        })
}

export function unassignCustomer() {
    return (payload: { customerId: string }) =>
        $fetch('/customer/unassign', {
            method: 'PUT',
            headers: {
                Token: getToken() || '',
            },
            body: payload,
        })
}

export function extendContact() {
    return (payload: { ids: string[], extendDays: number }) =>
        $fetch('/customer/extend', {
            method: 'POST',
            headers: {
                Token: getToken() || '',
            },
            body: payload,
        })
}

export type CustomerUpdatePayload = {
    id: string
    avatar?: string
    name?: string
    customerType?: string
    customerLevel?: string
    company?: string
    companyDetail?: string
    companyWebsite?: string
    email?: string
    phone?: string
    whatsapp?: string
    wechat?: string
    source?: string
    sourceDetail?: string
    country?: string
    city?: string
    customTags?: string[]
}

export function updateCustomer() {
    return (payload: CustomerUpdatePayload | FormData) =>
        $fetch('/customer/update', {
            method: 'PUT',
            headers: {
                Token: getToken() || '',
            },
            body: payload,
        })
}

export function getCustomerStats() {
    return () =>
        $fetch('/customer/stats', {
            method: 'GET',
            headers: {
                Token: getToken() || '',
            },
        })
}

// 放入回收站（假删除）
export function fakeDelCustomer() {
    return (ids: string[]) =>
        $fetch('/customer/fakedel', {
            method: 'PUT',
            headers: {
                Token: getToken() || '',
            },
            body: { ids },
        })
}

// 永久删除客户
export function deleteCustomer() {
    return (ids: string[]) =>
        $fetch('/customer/delete', {
            method: 'DELETE',
            headers: {
                Token: getToken() || '',
            },
            body: { ids },
        })
}

// 恢复客户
export function recoverCustomer() {
    return (ids: string[]) =>
        $fetch('/customer/recover', {
            method: 'PUT',
            headers: {
                Token: getToken() || '',
            },
            body: { ids },
        })
}

export type CustomerSearchParams = {
    keyword: string
    page?: number
    limit?: number
    assignedTo?: string
    customerLevel?: string
}

export type CustomerSearchResponse = {
    code: number
    msg: string
    data: {
        customers: any[]
        pagination: {
            page: number
            limit: number
            total: number
            hasMore: boolean
        }
        keyword: string
    }
}

export function searchCustomer() {
    return (params: CustomerSearchParams) =>
        $fetch<CustomerSearchResponse>('/customer/search', {
            method: 'GET',
            headers: {
                Token: getToken() || '',
            },
            query: params,
        })
}
