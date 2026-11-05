import type { ResolvedRenderOptions } from '../preview/option-resolver.js';

/**
 * What an export renders: a document's text and the options the preview's
 * chain resolved for it (`resolvePreviewOptions`). With a preview open it is
 * that preview's last render, so a saved or exported file is the diagram the
 * preview drew, unsaved edits included; with none open the export command
 * builds one the same way the preview would.
 */
export interface ExportSource {
    /** The document text, as the editor holds it (possibly unsaved). */
    text: string;
    /** The document's path: the base for includes and the default asset root. */
    sourcePath: string;
    options: ResolvedRenderOptions;
}
