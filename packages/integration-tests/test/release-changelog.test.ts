// Unit tests for .github/scripts/release-changelog.mjs — the pure
// `promoteUnreleased` function is imported directly so these run without any
// filesystem side-effects.  IO / main() is exercised by the integration gate
// (`make test` / CI); the unit tests here cover the transformation logic.

import { describe, expect, it } from 'vitest';
// @ts-expect-error — .mjs script; no .d.mts yet, Vitest resolves it fine
import { promoteUnreleased } from '../../../.github/scripts/release-changelog.mjs';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const DATE = '2026-07-01';

const CHANGELOG_WITH_ENTRIES = `# Changelog

All notable changes.

## [Unreleased]

### Added

- Some new feature.

### Fixed

- A bug fix.

## [0.7.0] - 2026-06-09

### Added

- Old feature.
`;

const CHANGELOG_EMPTY_UNRELEASED = `# Changelog

## [Unreleased]

## [0.7.0] - 2026-06-09

### Added

- Old feature.
`;

const CHANGELOG_NO_PRIOR_SECTIONS = `# Changelog

## [Unreleased]

### Added

- Only entry.
`;

// Mirrors the real root CHANGELOG: the preamble mentions the literal
// "## [Unreleased]" inside backticks, which must NOT be mistaken for the
// section heading (regression guard for the indexOf -> line-anchored fix).
const CHANGELOG_WITH_PREAMBLE_MENTION = `# Changelog

Contributors append entries to \`## [Unreleased]\`; maintainers move them into a
new \`## [vX.Y.Z]\` section as part of the release-cut commit.

## [Unreleased]

### Added

- Real entry.

## [0.7.0] - 2026-06-09

### Added

- Old feature.
`;

// VS Code extension CHANGELOG uses a different heading style for historical
// entries (no square brackets) but still has a standard ## [Unreleased] top.
const CHANGELOG_VSCODE_STYLE = `# Changelog

## [Unreleased]

### Added

- A new setting.

## 0.3.0 — Unreleased

Historical entry.
`;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('promoteUnreleased', () => {
    it('moves [Unreleased] entries into a new versioned section', () => {
        const result = promoteUnreleased(CHANGELOG_WITH_ENTRIES, '0.8.0', DATE);

        // New section exists with the right heading
        expect(result).toContain('## [0.8.0] - 2026-07-01');

        // Entries appear under the new section
        expect(result).toContain('### Added\n\n- Some new feature.');
        expect(result).toContain('### Fixed\n\n- A bug fix.');

        // [Unreleased] skeleton is left in place and is now empty
        const unreleasedIdx = result.indexOf('## [Unreleased]');
        const versionedIdx = result.indexOf('## [0.8.0]');
        expect(unreleasedIdx).toBeLessThan(versionedIdx);

        // Content between [Unreleased] and [0.8.0] should be only whitespace
        const between = result.slice(unreleasedIdx + '## [Unreleased]'.length, versionedIdx);
        expect(between.trim()).toBe('');

        // Previous release section still present and unchanged
        expect(result).toContain('## [0.7.0] - 2026-06-09');

        // File header is preserved
        expect(result.startsWith('# Changelog')).toBe(true);
    });

    it('proceeds without throwing when [Unreleased] is empty', () => {
        const result = promoteUnreleased(CHANGELOG_EMPTY_UNRELEASED, '0.8.0', DATE);

        // Section heading is emitted even with no content
        expect(result).toContain('## [0.8.0] - 2026-07-01');

        // Empty [Unreleased] skeleton remains
        expect(result).toContain('## [Unreleased]');

        // Prior release still intact
        expect(result).toContain('## [0.7.0] - 2026-06-09');
    });

    it('handles a changelog with no prior versioned sections', () => {
        const result = promoteUnreleased(CHANGELOG_NO_PRIOR_SECTIONS, '0.1.0', DATE);

        expect(result).toContain('## [0.1.0] - 2026-07-01');
        expect(result).toContain('- Only entry.');
        expect(result).toContain('## [Unreleased]');
    });

    it('handles VS Code extension style (non-bracket legacy section headings)', () => {
        const result = promoteUnreleased(CHANGELOG_VSCODE_STYLE, '0.8.0', DATE);

        expect(result).toContain('## [0.8.0] - 2026-07-01');
        expect(result).toContain('- A new setting.');

        // Legacy heading is preserved verbatim in the remainder
        expect(result).toContain('## 0.3.0 — Unreleased');
    });

    it('ignores an inline ## [Unreleased] mention in the preamble', () => {
        const result = promoteUnreleased(CHANGELOG_WITH_PREAMBLE_MENTION, '0.8.0', DATE);

        // The real entry was moved, not the preamble prose.
        expect(result).toContain('## [0.8.0] - 2026-07-01\n\n### Added\n\n- Real entry.');

        // The preamble prose is preserved verbatim ahead of the heading.
        expect(result).toContain('Contributors append entries to `## [Unreleased]`');

        // Exactly one real (line-anchored) [Unreleased] heading remains, and it
        // sits before the new version section.
        const headings = result.match(/^## \[Unreleased\]$/gm) ?? [];
        expect(headings).toHaveLength(1);
        expect(result.search(/^## \[Unreleased\]$/m)).toBeLessThan(result.indexOf('## [0.8.0]'));

        // Prior release untouched.
        expect(result).toContain('## [0.7.0] - 2026-06-09');
    });

    it('throws when no ## [Unreleased] heading is found', () => {
        const noUnreleased = '# Changelog\n\n## [0.7.0] - 2026-06-09\n\n- Stuff.\n';
        expect(() => promoteUnreleased(noUnreleased, '0.8.0', DATE)).toThrow('"## [Unreleased]"');
    });

    it('throws when the target version section already exists', () => {
        const alreadyReleased = `# Changelog\n\n## [Unreleased]\n\n## [0.8.0] - ${DATE}\n\n- stuff.\n`;
        expect(() => promoteUnreleased(alreadyReleased, '0.8.0', DATE)).toThrow('"## [0.8.0]"');
    });
});
