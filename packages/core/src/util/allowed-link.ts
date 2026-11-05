/**
 * Whether a `link:` value is an absolute `http://` or `https://` URL, or a
 * `mailto:` URL.
 *
 * `link:` is documented as a URL, and the renderer writes it into an SVG
 * `<a href>` that the embed, the preview shell and the HTML export put in a
 * live DOM. Any other scheme (`javascript:`, `data:`, `vbscript:`) or a
 * relative path would navigate somewhere the author's readers can't vet, so
 * the validator rejects it (`NL.E0414`) and layout and the renderer drop it.
 */
export function isAllowedLink(value: string): boolean {
    return /^(https?:\/\/|mailto:)[^\s]/i.test(value);
}
