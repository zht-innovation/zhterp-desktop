export type SalespersonUpsertPayload = {
    name?: string
    nameCn?: string
    nameEn?: string
    joinDate?: string | Date
    joinDesc?: string
    country?: string
    city?: string
    phone?: string
    whatsapp?: string
    email?: string
    region?: string
    language?: string
    languages?: string[]
    markets?: string[]
    domains?: string[]
    _dealCount?: number
    plans?: string[]
    plansUpdatedAt?: string | Date
}

export function retrieveSalespersonList() {
    return () =>
        $fetch('/salesperson/retrieve', {
            method: 'GET',
            headers: {
                Token: getToken() || '',
            },
        })
}

export function addSalesperson() {
    return (payload: SalespersonUpsertPayload) =>
        $fetch('/salesperson/add', {
            method: 'POST',
            headers: {
                Token: getToken() || '',
            },
            body: payload,
        })
}

export function updateSalesperson() {
    return (payload: SalespersonUpsertPayload) =>
        $fetch('/salesperson/update', {
            method: 'PUT',
            headers: {
                Token: getToken() || '',
            },
            body: payload,
        })
}

export function fakeDelSalesperson() {
    return (ids: string[]) =>
        $fetch('/salesperson/fakedel', {
            method: 'PUT',
            headers: {
                Token: getToken() || '',
            },
            body: { ids },
        })
}

export function deleteSalesperson() {
    return (ids: string[]) =>
        $fetch('/salesperson/delete', {
            method: 'DELETE',
            headers: {
                Token: getToken() || '',
            },
            body: { ids },
        })
}

export type SalespersonSearchParams = {
    keyword: string
    page?: number
    limit?: number
}

export type SalespersonSearchResponse = {
    code: number
    msg: string
    data: {
        salespeople: any[]
        pagination: {
            page: number
            limit: number
            total: number
            hasMore: boolean
        }
        keyword: string
    }
}

export function searchSalesperson() {
    return (params: SalespersonSearchParams) =>
        $fetch<SalespersonSearchResponse>('/salesperson/search', {
            method: 'GET',
            headers: {
                Token: getToken() || '',
            },
            query: params,
        })
}
