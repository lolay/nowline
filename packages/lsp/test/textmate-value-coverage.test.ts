import {
    BUILTIN_CAPACITY_ICONS,
    BUILTIN_ICON_NAMES,
    BUILTIN_STATUSES,
    CALENDAR_DECLARATION_KEYS,
    CALENDAR_MODES,
    INCLUDE_MODES,
    NON_WORKING_DISPLAYS,
    STYLE_PROP_ENUMS,
} from '@nowline/core/internal';
import { describe, expect, it } from 'vitest';
// The validator's key tables are not on `@nowline/core/internal` (that barrel
// may not import the validator), so the test reads them from source, the way
// the keyword guard reads nowline.langium.
import {
    CALENDAR_FIELDS,
    DEFAULT_ENTITY_TYPES,
    DIRECTIVE_FIELDS,
    ENTITY_KNOWN_PROPS,
    ROADMAP_ONLY_STYLE_KEYS,
    SCALE_FIELDS,
    STYLE_PROP_KEYS,
    UNIVERSAL_ENTITY_PROPS,
    UTILIZATION_NONE,
} from '../../core/src/language/validator/tables.js';
import { scopeOf } from './textmate-tokenize.js';

// The TextMate grammar colours keys and values on its own, without the
// language server, so it lists every word by hand. These tests tokenize a
// line per value with the real grammar and check the scope each value of a
// core table ends up with, so a value the validator accepts cannot go
// uncoloured or pick up the wrong colour.
//
// Deliberately not coloured, because the grammar's value patterns match a
// word anywhere on a line, not only after its key, and these words are just
// as likely to be an author's ids:
//   - BUILTIN_ICON_NAMES and BUILTIN_CAPACITY_ICONS (`time`, `lock`,
//     `people`, ...): the same slot also takes a declared symbol id. `none`
//     is coloured as an enum; `person` and `calendar` are keywords anyway.
//   - COLOR_NAMES (`red`, `navy`, ...): colours are free-form too (hex,
//     coloured as a number). `none` is coloured as an enum.
//   - WEEKDAYS (`mon`, `sat`, ...): ids inside `every:[...]` and elsewhere.
// Free-form values (dates, durations, percentages, BCP-47 `locale:` tags,
// strings) have their own patterns and no closed set to check.

const ENUM = 'constant.language.enum.nowline';
const STATUS = 'constant.language.status.nowline';
const INCLUDE_MODE = 'constant.language.include-mode.nowline';
const KEY = 'entity.other.attribute-name.nowline';
const STYLE_KEY = 'entity.other.attribute-name.style.nowline';
const KEYWORD = 'keyword.control.nowline';

describe('TextMate: core value tables', () => {
    it('colours every built-in status as a status', () => {
        for (const status of BUILTIN_STATUSES) {
            expect(scopeOf(`  item api status:${status}`, status), status).toBe(STATUS);
        }
    });

    it('colours every style enum value as an enum, after its own key', () => {
        for (const [key, values] of Object.entries(STYLE_PROP_ENUMS)) {
            for (const value of values) {
                const line = `default roadmap ${key}:${value}`;
                expect(scopeOf(line, key), line).toBe(STYLE_KEY);
                expect(scopeOf(line, value), line).toBe(ENUM);
            }
        }
    });

    it('colours the non-working display values as enums', () => {
        for (const value of NON_WORKING_DISPLAYS) {
            expect(scopeOf(`default roadmap non-working:${value}`, value), value).toBe(ENUM);
        }
    });

    it('colours the calendar modes as enums', () => {
        for (const mode of CALENDAR_MODES) {
            const line = `roadmap r "R" start:2026-01-05 calendar:${mode}`;
            expect(scopeOf(line, mode), mode).toBe(ENUM);
        }
    });

    it('colours the include modes as include modes', () => {
        for (const mode of INCLUDE_MODES) {
            for (const key of ['config', 'roadmap']) {
                const line = `include "shared.nowline" ${key}:${mode}`;
                expect(scopeOf(line, mode), line).toBe(INCLUDE_MODE);
            }
        }
    });

    it('colours none, the utilization opt-out and the icon and colour reset', () => {
        expect(scopeOf(`swimlane s utilization-warn-at:${UTILIZATION_NONE}`, 'none')).toBe(ENUM);
        expect(BUILTIN_ICON_NAMES).toContain('none');
        expect(BUILTIN_CAPACITY_ICONS).toContain('none');
        expect(scopeOf('default item icon:none', 'none')).toBe(ENUM);
        expect(scopeOf('  bg: none', 'none')).toBe(ENUM);
    });

    it('colours every default entity type as a keyword', () => {
        for (const type of DEFAULT_ENTITY_TYPES) {
            expect(scopeOf(`default ${type} style:s`, type), type).toBe(KEYWORD);
        }
    });
});

describe('TextMate: core key tables', () => {
    it('colours every style key as a style key', () => {
        for (const key of STYLE_PROP_KEYS) {
            expect(scopeOf(`default item ${key}:x`, key), key).toBe(STYLE_KEY);
            expect(scopeOf(`  ${key}: x`, key), key).toBe(STYLE_KEY);
        }
        for (const key of ROADMAP_ONLY_STYLE_KEYS) expect(STYLE_PROP_KEYS).toContain(key);
    });

    it('colours every entity property key as a key', () => {
        // `description` is a sub-directive (`description "text"`); the
        // validator tolerates `description:` as a common typo, so the
        // grammar does not colour that form.
        const keys = new Set(
            [...Object.values(ENTITY_KNOWN_PROPS).flatMap((set) => [...set])].concat(
                [...UNIVERSAL_ENTITY_PROPS].filter((key) => key !== 'description'),
            ),
        );
        expect(keys).toContain('utilization-over-at');
        for (const key of keys) {
            expect(scopeOf(`  item x ${key}:y`, key), key).toBe(KEY);
        }
    });

    it('colours the calendar and scale block keys as keys', () => {
        for (const key of [...CALENDAR_FIELDS, ...SCALE_FIELDS]) {
            expect(scopeOf(`  ${key}: 5`, key), key).toBe(KEY);
        }
    });

    it('colours the calendar declaration keys as keys', () => {
        for (const key of CALENDAR_DECLARATION_KEYS) {
            expect(scopeOf(`non-working w ${key}:2026-01-01`, key), key).toBe(KEY);
        }
    });

    it('colours the directive and its keys on a directive line with properties', () => {
        for (const key of DIRECTIVE_FIELDS) {
            const line = `nowline v1 ${key}:fr-CA`;
            expect(scopeOf(line, 'nowline'), line).toBe('keyword.control.directive.nowline');
            expect(scopeOf(line, 'v1'), line).toBe('constant.numeric.version.nowline');
            expect(scopeOf(line, key), line).toBe(KEY);
        }
    });
});
