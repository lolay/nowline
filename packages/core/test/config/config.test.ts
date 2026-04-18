import { describe, it, expect } from 'vitest';
import { parse } from '../helpers.js';
import {
    isScaleBlock,
    isCalendarBlock,
    isStyleDeclaration,
    isDefaultDeclaration,
    isLabelDeclaration,
    isStatusDeclaration,
    isDurationDeclaration,
} from '../../src/generated/ast.js';

describe('config section', () => {
    it('parses scale block with indented properties', async () => {
        const r = await parse(
            `config
scale
  name: weeks
  label-every: 2
  label: "W{n}"
roadmap r
swimlane s
  item x duration:1w
`,
            { validate: false },
        );
        expect(r.parserErrors).toEqual([]);
        const scale = r.ast.configEntries.find(isScaleBlock);
        expect(scale?.properties.map((p) => p.key)).toEqual(['name', 'label-every', 'label']);
        expect(scale?.properties.find((p) => p.key === 'name')?.value).toBe('weeks');
        expect(scale?.properties.find((p) => p.key === 'label-every')?.value).toBe('2');
    });

    it('parses calendar block with days-per-* properties', async () => {
        const r = await parse(
            `config
calendar
  days-per-week: 5
  days-per-month: 22
  days-per-quarter: 65
  days-per-year: 260
roadmap r calendar:custom
swimlane s
  item x duration:1w
`,
            { validate: false },
        );
        expect(r.parserErrors).toEqual([]);
        const cal = r.ast.configEntries.find(isCalendarBlock);
        expect(cal?.properties.map((p) => p.key)).toEqual([
            'days-per-week',
            'days-per-month',
            'days-per-quarter',
            'days-per-year',
        ]);
        expect(cal?.properties.find((p) => p.key === 'days-per-week')?.value).toBe('5');
    });

    it('parses flat default declarations', async () => {
        const r = await parse(
            `config
default item shadow:subtle
default swimlane padding:sm spacing:none
default roadmap padding:md header-height:md font:sans
default parallel bracket:none
roadmap r
swimlane s
  item x duration:1w
`,
            { validate: false },
        );
        expect(r.parserErrors).toEqual([]);
        const defaults = r.ast.configEntries.filter(isDefaultDeclaration);
        expect(defaults.map((d) => d.entityType)).toEqual(['item', 'swimlane', 'roadmap', 'parallel']);
        expect(defaults[0].properties.map((p) => p.key)).toEqual(['shadow']);
    });

    it('parses style with indented properties', async () => {
        const r = await parse(
            `config
style ent "Enterprise"
  bg: blue
  fg: navy
  border: solid
roadmap r
swimlane s
  item x duration:1w
`,
            { validate: false },
        );
        expect(r.parserErrors).toEqual([]);
        const style = r.ast.configEntries.find(isStyleDeclaration);
        expect(style?.name).toBe('ent');
        expect(style?.properties.map((p) => p.key)).toEqual(['bg', 'fg', 'border']);
    });

    it('parses label declarations in roadmap section', async () => {
        const r = await parse(
            `config
style ent
  bg: blue
roadmap r
label security "Security" style:ent
swimlane s
  item x duration:1w
`,
            { validate: false },
        );
        expect(r.parserErrors).toEqual([]);
        const label = r.ast.roadmapEntries.find(isLabelDeclaration);
        expect(label?.name).toBe('security');
        expect(label?.properties.find((p) => p.key === 'style')?.value).toBe('ent');
    });

    it('parses custom status declarations in roadmap section', async () => {
        const r = await parse(
            `roadmap r
status awaiting-review
status in-review
swimlane s
  item x duration:1w status:awaiting-review
`,
            { validate: false },
        );
        expect(r.parserErrors).toEqual([]);
        const statuses = r.ast.roadmapEntries.filter(isStatusDeclaration);
        expect(statuses.map((s) => s.name)).toEqual(['awaiting-review', 'in-review']);
    });

    it('parses duration declarations with length: in roadmap section', async () => {
        const r = await parse(
            `roadmap r
duration xs length:1d
duration sm length:3d
duration md length:1w
swimlane s
  item x duration:md
`,
            { validate: false },
        );
        expect(r.parserErrors).toEqual([]);
        const durations = r.ast.roadmapEntries.filter(isDurationDeclaration);
        expect(durations.map((d) => d.name)).toEqual(['xs', 'sm', 'md']);
        expect(
            durations[0].properties.find((p) => p.key === 'length')?.value,
        ).toBe('1d');
    });

    it('allows config-only file (no roadmap)', async () => {
        const r = await parse(
            `config
scale
  name: weeks
style ent
  bg: blue
`,
            { validate: false },
        );
        expect(r.parserErrors).toEqual([]);
        expect(r.ast.roadmapDecl).toBeUndefined();
    });
});
