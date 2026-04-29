// Shared types consumed by every @nowline/export-* package.
//
// Heavy deps (resvg, pdfkit, exceljs) live in the format packages, never
// here — see specs/handoffs/m2c.md § 1.

import type { PositionedRoadmap } from '@nowline/layout';
import type { NowlineFile, ResolveResult } from '@nowline/core';

/** Bundle of inputs every export function consumes. */
export interface ExportInputs {
    /** Positioned model produced by `layoutRoadmap()`. */
    model: PositionedRoadmap;
    /** Original AST — needed for XLSX / Mermaid / MS Project. */
    ast: NowlineFile;
    /** Include-resolved data — needed for XLSX joins. */
    resolved: ResolveResult;
    /**
     * Display path for the source. Use `'<stdin>'` when piped. Used in
     * footers / metadata; never for filesystem reads.
     */
    sourcePath: string;
    /**
     * Optional pinned timestamp. Exporters that would otherwise call
     * `new Date()` (PDF CreationDate, XLSX Created) MUST take this from
     * `ast.generated` first, then `today`, never `new Date()`.
     */
    today?: Date;
}

// PDF page sizing -----------------------------------------------------------

export type PdfPresetName =
    // Imperial / ANSI
    | 'letter'   //  8.5 x 11    in   (default)
    | 'legal'    //  8.5 x 14    in
    | 'tabloid'  // 11   x 17    in   (ANSI B portrait)
    | 'ledger'   // 17   x 11    in   (ANSI B landscape)
    // Metric / ISO 216 — A series
    | 'a5' | 'a4' | 'a3' | 'a2' | 'a1'
    // Metric / ISO 216 — B series
    | 'b5' | 'b4' | 'b3';

export type PdfLengthUnit = 'pt' | 'in' | 'mm' | 'cm';

export interface PdfLength {
    value: number;
    unit: PdfLengthUnit;
}

export type PdfPageSize =
    | { kind: 'preset'; name: PdfPresetName }
    | { kind: 'custom'; width: PdfLength; height: PdfLength }
    | { kind: 'content' };

export type PdfOrientation = 'portrait' | 'landscape' | 'auto';

// Font resolver -------------------------------------------------------------

/** Where the resolver landed when it stopped. */
export type FontSource = 'flag' | 'env' | 'headless' | 'probe' | 'bundled';

export type FontRole = 'sans' | 'mono';

export interface ResolvedFont {
    /** Friendly family name, e.g. 'DejaVu Sans', 'SF Pro'. */
    name: string;
    /** Full TTF/OTF bytes, ready for PDFKit / resvg consumption. */
    bytes: Uint8Array;
    /** Where in the resolver chain this font came from. */
    source: FontSource;
    /** Filesystem path; undefined for bundled / synthesized bytes. */
    path?: string;
    /** Face inside a `.ttc` collection, if applicable. */
    face?: string;
    /** True when the loaded font is an OpenType variable font (axes, no fixed instance). */
    isVariableFont?: boolean;
}

export interface ResolvedFontPair {
    sans: ResolvedFont;
    mono: ResolvedFont;
}
