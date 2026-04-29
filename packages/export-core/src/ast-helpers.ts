// Tiny AST property helpers shared by lossy exporters (Mermaid, MS Project,
// XLSX). The Langium-generated AST stores DSL properties as
// `EntityProperty[]` with `{ key, value?, values[] }`. Walking that shape
// directly is verbose; these helpers keep the exporters readable.

import type { EntityProperty, RoadmapDeclaration } from '@nowline/core';

export type PropertyHost = {
    properties?: EntityProperty[];
    title?: string;
    name?: string;
};

/** Return the single-value `value` for `key`, or undefined. */
export function getProp(host: PropertyHost, key: string): string | undefined {
    const prop = host.properties?.find((p) => p.key === key);
    if (!prop) return undefined;
    if (prop.value !== undefined) return prop.value;
    if (prop.values && prop.values.length > 0) return prop.values[0];
    return undefined;
}

/** Return the multi-value list for `key` (e.g. `after:[a, b]`), or empty. */
export function getProps(host: PropertyHost, key: string): readonly string[] {
    const prop = host.properties?.find((p) => p.key === key);
    if (!prop) return [];
    if (prop.values && prop.values.length > 0) return prop.values;
    if (prop.value !== undefined) return [prop.value];
    return [];
}

export function hasProp(host: PropertyHost, key: string): boolean {
    return host.properties?.some((p) => p.key === key) ?? false;
}

/** Display label: title if present, otherwise name (id), otherwise '<unnamed>'. */
export function displayLabel(host: PropertyHost): string {
    if (host.title && host.title.trim()) return host.title;
    if (host.name && host.name.trim()) return host.name;
    return '<unnamed>';
}

/** Roadmap title falls back to declaration name. */
export function roadmapTitle(decl: RoadmapDeclaration | undefined): string {
    if (!decl) return 'Roadmap';
    return decl.title?.trim() || decl.name?.trim() || 'Roadmap';
}
