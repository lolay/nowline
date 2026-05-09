export {
    displayLabel,
    getProp,
    getProps,
    hasProp,
    type PropertyHost,
    roadmapTitle,
} from './ast-helpers.js';
export {
    BUNDLED_MONO_PATH,
    BUNDLED_SANS_PATH,
    clearBundledCache,
    loadBundledMono,
    loadBundledSans,
} from './fonts/bundled.js';
export {
    ALIASES,
    aliasCandidate,
    type FontCandidate,
    isAlias,
    type PlatformProbe,
    probeListFor,
} from './fonts/probe-list.js';

export {
    FontResolveError,
    type ResolveOptions,
    type ResolveResult,
    resolveFonts,
} from './fonts/resolve.js';

export { isVariableFontBytes } from './fonts/sfns.js';
export {
    type ContentScale,
    fitContent,
    isPdfPresetName,
    PageSizeParseError,
    parsePageSize,
    presetDimensions,
    presetNames,
    type ResolvedPage,
    resolvePage,
    validateMargin,
} from './pdf-page.js';
export type {
    ExportInputs,
    FontRole,
    FontSource,
    PdfLength,
    PdfLengthUnit,
    PdfOrientation,
    PdfPageSize,
    PdfPresetName,
    ResolvedFont,
    ResolvedFontPair,
} from './types.js';
export {
    LengthParseError,
    lengthToPoints,
    parseLength,
    pointsToLength,
} from './units.js';
