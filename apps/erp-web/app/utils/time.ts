export default function formatDate(oldDate:string | number) {
    // 方式1 转换为'yyyy-MM-dd HH:mm:ss'
    function add0(num:any) { return num < 10 ? '0' + num : num } // 个位数的值在前面补0
    const date = new Date(oldDate)
    const Y = date.getFullYear()
    const M = date.getMonth() + 1
    const D = date.getDate()
    const h = date.getHours()
    const m = date.getMinutes()
    const s = date.getSeconds()

    return Y + '-' + add0(M) + '-' + add0(D) + ' \xa0\xa0 ' + add0(h) + ':' + add0(m) + ':' + add0(s)

    // 方式2 转换为'yyyy/MM/dd HH:mm:ss'
    // return new Date(oldDate).toLocaleString()
}

type DateInput = string | number | Date | null | undefined;

const padDatePart = (value: number) => String(value).padStart(2, "0");

const splitDateRange = (value: string) => {
    const parts = value.split(/\s*\\?[~～]\s*/);
    if (parts.length !== 2 || parts.some((part) => !part)) {
        return null;
    }

    return parts;
};

export const formatLocalDate = (value: DateInput) => {
    if (!value) {
        return "";
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return String(value);
    }

    return `${date.getFullYear()}-${padDatePart(date.getMonth() + 1)}-${padDatePart(date.getDate())}`;
};

export const formatLocalDateTime = (value: DateInput, withSeconds = false) => {
    if (!value) {
        return "";
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return String(value);
    }

    const dateText = formatLocalDate(date);
    const timeText = [
        padDatePart(date.getHours()),
        padDatePart(date.getMinutes()),
        ...(withSeconds ? [padDatePart(date.getSeconds())] : []),
    ].join(":");

    return `${dateText} ${timeText}`;
};

export const formatLocalDateRange = (value: string) => {
    if (!value) {
        return "";
    }

    const range = splitDateRange(value);
    if (!range) {
        return formatLocalDate(value);
    }

    return `${formatLocalDate(range[0])} ~ ${formatLocalDate(range[1])}`;
};

export const getDateSortTimestamp = (value: string) => {
    if (!value) {
        return 0;
    }

    const range = splitDateRange(value);
    const date = new Date(range?.[1] || value);
    const timestamp = date.getTime();

    return Number.isNaN(timestamp) ? 0 : timestamp;
};
