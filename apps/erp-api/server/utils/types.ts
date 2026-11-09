interface _Tags {
    zh: string,
    en: string
}

interface _Filters extends _Tags {
    values: Array<_Tags>
}

interface IndicesReq {
    cover: string,
    cover_en?: string,
    sub_title?: string,
    sub_title_en?: string,
    title: string,
    title_en: string,
    slug: string,
    timestamp: string,
    tags?: Array<_Tags>,
    path: Array<_Tags>,
    filters?: Array<_Filters>,
    [key: string]: any
}