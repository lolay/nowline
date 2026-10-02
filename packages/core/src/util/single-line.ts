/**
 * Collapse explicit line breaks to a single space.
 *
 * A quoted title can carry real line breaks (`"Technology\nSelection"`
 * parses to a string with a newline in it, and the renderer paints it on
 * two lines). Anything that echoes a title inside ONE line of text, such
 * as a validator message or an editor outline entry, shows it with each
 * run of breaks (and the whitespace around it) replaced by one space, so
 * the example reads `Technology Selection`.
 *
 * A string with no CR or LF is returned untouched.
 */
export function singleLine(text: string): string {
    return /[\r\n]/.test(text) ? text.replace(/\s*[\r\n]+\s*/g, ' ').trim() : text;
}
