// PDF exporter — vector PDF via PDFKit + @kittl/svg-to-pdfkit.
//
// Spec: specs/handoffs/m2c.md § 4 "PDF — vector PDF via PDFKit".
//
// The handoff calls for a per-emitter walk of `PositionedRoadmap` rendered
// directly to PDFKit primitives. For m2c we instead reuse the existing SVG
// renderer and embed its output into PDFKit via `@kittl/svg-to-pdfkit`. The
// trade-off is documented in `packages/export-pdf/README.md`:
//
//   - Pros: every visual detail the SVG renderer ever supports works in PDF
//     for free; no double-implementation of the renderer; ~150 LOC vs
//     ~1500 LOC.
//   - Cons: we route through SVGtoPDF's parsing layer, so any rendering bug
//     in svg-to-pdfkit shows up in our output. We pin the version and treat
//     any divergence from the SVG renderer as a bug.
//
// Determinism contract:
//   - PDFKit `info.CreationDate` / `ModDate`: pinned to `inputs.today` (UTC),
//     never `new Date()`.
//   - PDFKit auto-generated `/ID`: PDFKit derives the ID from `info` only
//     (since 0.13), so a fixed CreationDate yields a stable ID.
//   - `pdfVersion: '1.7'` pins the PDF spec.
//   - Producer / Creator strings are explicit, version-stable.
//   - Fonts: registered explicitly via PDFKit `registerFont(name, bytes,
//     family?)` so glyph subsets are byte-identical across hosts.

import { PassThrough } from 'node:stream';
import SVGtoPDF from '@kittl/svg-to-pdfkit';
import type {
    ExportInputs,
    PdfOrientation,
    PdfPageSize,
    ResolvedFontPair,
} from '@nowline/export-core';
import {
    fitContent,
    parsePageSize,
    type ResolvedPage,
    resolveFonts,
    resolvePage,
    validateMargin,
} from '@nowline/export-core';
import PDFDocument from 'pdfkit';

export interface PdfOptions {
    pageSize?: PdfPageSize | string;
    orientation?: PdfOrientation;
    /** Page margin in PDF points. Default 36 (½ inch). */
    marginPt?: number;
    fonts?: ResolvedFontPair;
    /** Author baked into the PDF Info dict. */
    author?: string;
    /** Title baked into the PDF Info dict. Defaults to roadmap title. */
    title?: string;
    /** Subject. Defaults to the source filename. */
    subject?: string;
    /** Producer string. Defaults to `nowline (m2c)`. */
    producer?: string;
    /**
     * Disable PDFKit deflate compression. Tests use this to inspect the Info
     * dict / MediaBox / etc. without round-tripping through zlib. Production
     * paths should leave compression enabled.
     */
    compress?: boolean;
}

interface ResolvedPdfOptions {
    pageSize: PdfPageSize;
    orientation: PdfOrientation;
    marginPt: number;
    fonts: ResolvedFontPair;
}

export async function exportPdf(
    inputs: ExportInputs,
    svg: string,
    options: PdfOptions = {},
): Promise<Uint8Array> {
    const resolved = await resolveOptions(options);

    const page = resolvePage({
        pageSize: resolved.pageSize,
        orientation: resolved.orientation,
        contentWidthPt: inputs.model.width,
        contentHeightPt: inputs.model.height,
        marginPt: resolved.marginPt,
    });
    validateMargin(resolved.marginPt, page);

    const fit = fitContent({
        page,
        contentWidthPt: inputs.model.width,
        contentHeightPt: inputs.model.height,
        marginPt: resolved.marginPt,
    });

    const today = inputs.today ?? new Date(Date.UTC(2026, 0, 5)); // deterministic Monday default
    const creationDate = new Date(
        Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate(), 0, 0, 0, 0),
    );

    const doc = new PDFDocument({
        autoFirstPage: false,
        compress: options.compress ?? true,
        pdfVersion: '1.7',
        info: {
            Title: options.title ?? (inputs.model.header.title || 'Nowline Roadmap'),
            Author: options.author ?? inputs.model.header.author ?? '',
            Subject: options.subject ?? inputs.sourcePath,
            Producer: options.producer ?? 'nowline (m2c)',
            Creator: options.producer ?? 'nowline (m2c)',
            CreationDate: creationDate,
            ModDate: creationDate,
        } as PDFKit.DocumentInfo & { CreationDate?: Date; ModDate?: Date },
    });

    // Register the resolved font pair once, by family name. PDFKit accepts
    // ArrayBuffer / Buffer / Uint8Array directly. Fontkit handles VF detection
    // internally; the bytes are embedded as-is.
    const sansBuffer = bufferOf(resolved.fonts.sans.bytes);
    const monoBuffer = bufferOf(resolved.fonts.mono.bytes);
    doc.registerFont('Sans', sansBuffer, resolved.fonts.sans.face);
    doc.registerFont('Mono', monoBuffer, resolved.fonts.mono.face);
    doc.font('Sans');

    doc.addPage({
        size: [page.widthPt, page.heightPt],
        margin: 0,
    });

    SVGtoPDF(doc, svg, fit.offsetX, fit.offsetY, {
        width: inputs.model.width * fit.factor,
        height: inputs.model.height * fit.factor,
        preserveAspectRatio: 'xMidYMid meet',
        useCSS: false,
        assumePt: false,
        fontCallback: (family: string) => {
            // Map any sans-ish family to "Sans", mono-ish to "Mono".
            if (/mono|courier|consolas|menlo|monaco/i.test(family)) return 'Mono';
            return 'Sans';
        },
    });

    return await streamToBytes(doc);
}

function streamToBytes(doc: PDFKit.PDFDocument): Promise<Uint8Array> {
    return new Promise((resolve, reject) => {
        const chunks: Buffer[] = [];
        const stream = new PassThrough();
        stream.on('data', (chunk: Buffer) => chunks.push(chunk));
        stream.on('end', () => {
            const total = Buffer.concat(chunks);
            resolve(new Uint8Array(total.buffer, total.byteOffset, total.byteLength));
        });
        stream.on('error', reject);
        doc.pipe(stream);
        doc.end();
    });
}

async function resolveOptions(options: PdfOptions): Promise<ResolvedPdfOptions> {
    const pageSize: PdfPageSize =
        typeof options.pageSize === 'string'
            ? parsePageSize(options.pageSize)
            : (options.pageSize ?? { kind: 'preset', name: 'letter' });
    const orientation = options.orientation ?? 'auto';
    const marginPt = options.marginPt ?? 36;
    const fonts = options.fonts ?? (await resolveFontsFor());
    return { pageSize, orientation, marginPt, fonts };
}

async function resolveFontsFor(): Promise<ResolvedFontPair> {
    const result = await resolveFonts();
    return { sans: result.sans, mono: result.mono };
}

function bufferOf(bytes: Uint8Array): Buffer {
    return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

export type { ResolvedPage };
