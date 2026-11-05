import * as vscode from 'vscode';

/**
 * The text of `uri` as the editor holds it, so unsaved edits (and untitled
 * documents, which have no file) render and export as shown. Falls back to the
 * file on disk when the document isn't open.
 */
export async function readDocumentText(uri: vscode.Uri): Promise<string> {
    const open = vscode.workspace.textDocuments.find((d) => d.uri.toString() === uri.toString());
    if (open) return open.getText();
    const bytes = await vscode.workspace.fs.readFile(uri);
    return new TextDecoder('utf-8').decode(bytes);
}
