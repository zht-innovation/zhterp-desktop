export interface ProductionWarning {
    id: string;
    key: string;
    dueDate: string;
    warningDays: 3 | 5;
    publishedAt: string;
    handlingMethod: string;
    handledBy: string;
    handledAt: string | null;
}
