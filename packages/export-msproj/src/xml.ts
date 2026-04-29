// XML escape utilities. We don't use a generic XML library because the
// output structure is fixed and small; manual emission keeps the package
// dependency-free per Resolution 1.

export function escapeXml(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

export function tag(name: string, value: string | number | boolean): string {
    return `<${name}>${escapeXml(String(value))}</${name}>`;
}

export function selfTag(name: string): string {
    return `<${name}/>`;
}
