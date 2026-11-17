export type DesktopBusinessKind = "sales" | "purchase" | "product";

export interface DesktopDetailSection {
    title: string;
    fields?: Array<{ label: string; value: string }>;
    columns?: string[];
    rows?: string[][];
    images?: Array<{ src: string; alt: string }>;
}

export interface DesktopDetailSnapshot {
    title: string;
    subtitle: string;
    capturedAt: string;
    sections: DesktopDetailSection[];
}

export interface DesktopBusinessRequest {
    label: string;
    generation: number;
    requestId: number;
    kind: DesktopBusinessKind;
    id: string;
}

export interface DesktopBusinessView {
    snapshot: DesktopDetailSnapshot;
    refreshing: boolean;
    error: string | null;
}
