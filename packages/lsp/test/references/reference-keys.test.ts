import {
    ENTITY_KNOWN_PROPS,
    STYLE_PROP_KEYS,
    UNIVERSAL_ENTITY_PROPS,
} from '@nowline/core/internal';
import { describe, expect, it } from 'vitest';
import { REFERENCE_PROP_KEYS } from '../../src/references/ast-utils.js';

// The LSP navigates, renames and completes ids only under REFERENCE_PROP_KEYS.
// A key there that the validator doesn't accept offers editor help for a
// property that only draws an unknown-property warning (`depends:` and
// `team:` once did).
describe('REFERENCE_PROP_KEYS', () => {
    it('lists only keys the validator accepts', () => {
        const accepted = new Set([
            ...Object.values(ENTITY_KNOWN_PROPS).flatMap((set) => [...set]),
            ...UNIVERSAL_ENTITY_PROPS,
            // `icon:` and `capacity-icon:` take a symbol id on style and
            // default lines.
            ...STYLE_PROP_KEYS,
            // The wave rules own `wave:`, so the unknown-property check
            // skips it rather than list it per entity.
            'wave',
        ]);
        expect([...REFERENCE_PROP_KEYS].filter((key) => !accepted.has(key))).toEqual([]);
    });
});
