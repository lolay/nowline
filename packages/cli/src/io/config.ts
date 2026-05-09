// Thin re-export of the shared `.nowlinerc` loader. The implementation
// lives in `@nowline/config` so the VS Code/Cursor extension can read the
// same files without depending on the CLI's heavier export-format graph.
export {
    type LoadConfigOptions,
    type LoadConfigResult,
    loadConfig,
    mergeConfig,
    type NowlineRc,
    parseConfig,
} from '@nowline/config';
