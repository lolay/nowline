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

/**
 * Collapse explicit line breaks (a `\n` in an item title) to a single
 * space. MS Project task and resource names are single-line fields, so a
 * raw line feed in `<Name>` would import as a stray control character
 * instead of a break; a space keeps the words apart.
 */
export function singleLine(value: string): string {
    return /[\r\n]/.test(value) ? value.replace(/\s*[\r\n]+\s*/g, ' ').trim() : value;
}

export function tag(name: string, value: string | number | boolean): string {
    return `<${name}>${escapeXml(String(value))}</${name}>`;
}

export function selfTag(name: string): string {
    return `<${name}/>`;
}
