// Ambient declaration for the untyped @kittl/svg-to-pdfkit fork. The original
// `svg-to-pdfkit` ships its own d.ts but the @kittl fork (the actively
// maintained version we depend on) does not. Mirror the surface we use.

declare module '@kittl/svg-to-pdfkit' {
    interface SVGtoPDFOptions {
        width?: number;
        height?: number;
        preserveAspectRatio?: string;
        useCSS?: boolean;
        assumePt?: boolean;
        precision?: number;
        fontCallback?: (
            family: string,
            isBold: boolean,
            isItalic: boolean,
        ) => string;
        imageCallback?: (link: string) => string;
        documentCallback?: (doc: PDFKit.PDFDocument) => PDFKit.PDFDocument;
        warningCallback?: (message: string) => void;
        colorCallback?: (color: number[] | string) => number[] | string;
    }

    function SVGtoPDF(
        doc: PDFKit.PDFDocument,
        svg: string,
        x?: number,
        y?: number,
        options?: SVGtoPDFOptions,
    ): void;

    export default SVGtoPDF;
}
