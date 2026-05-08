export * from './generated/ast.js';
export * from './generated/module.js';
export { createNowlineServices, NowlineModule } from './language/nowline-module.js';
export type { NowlineServices, NowlineAddedServices } from './language/nowline-module.js';
export { NowlineValidator, registerValidationChecks } from './language/nowline-validator.js';
export {
    resolveIncludes,
    type ResolveResult,
    type ResolveDiagnostic,
    type ResolvedConfig,
    type ResolvedContent,
    type IsolatedRegion,
    type IncludeMode,
    type ResolveIncludesOptions,
} from './language/include-resolver.js';
export {
    tr,
    registerBundle,
    type MessageBundle,
    type MessageArgs,
} from './i18n/index.js';
export { type MessageCode, ALL_CODES } from './i18n/codes.js';
