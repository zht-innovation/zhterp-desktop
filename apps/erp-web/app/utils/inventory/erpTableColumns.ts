interface ErpTableColumnWidthSource {
    width: number;
    widthVar?: string;
    grow?: boolean;
    locked?: boolean;
}

export const getErpTableColumnWidth = ({ width, widthVar }: ErpTableColumnWidthSource) =>
    widthVar ? `var(${widthVar}, ${width}px)` : `${width}px`;

export const getErpTableGridColumn = (
    column: ErpTableColumnWidthSource,
) => {
    const width = getErpTableColumnWidth(column);

    return column.grow && !column.locked ? `minmax(${width}, 1fr)` : width;
};

export const getErpTableMinimumWidth = (
    columns: ErpTableColumnWidthSource[],
    leadingColumns: string[] = [],
    trailingColumns: string[] = [],
) => `calc(${[...leadingColumns, ...columns.map(getErpTableColumnWidth), ...trailingColumns].join(" + ")})`;
