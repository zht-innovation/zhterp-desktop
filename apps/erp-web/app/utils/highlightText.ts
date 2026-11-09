export function escapeHtml(text: string) {
    return text.replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");
}

export function highlightTextHtml(text: string, keyword?: string) {
    if (!keyword) return escapeHtml(text);

    const pattern = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const parts = text.split(new RegExp(`(${pattern})`, "gi"));
    return parts.map((part, index) => index % 2
        ? `<mark class="search-highlight">${escapeHtml(part)}</mark>`
        : escapeHtml(part)).join("");
}
