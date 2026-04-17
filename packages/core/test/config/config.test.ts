import { describe, it, expect } from 'vitest';
import { parse } from '../helpers.js';
import {
    isScaleDeclaration,
    isStyleDeclaration,
    isLabelDeclaration,
    isStatusDeclaration,
    isDefaultsDeclaration,
    isEstimatesDeclaration,
    isUnitDeclaration,
} from '../../src/generated/ast.js';

describe('config section', () => {
    it('parses scale declaration', async () => {
        const r = await parse(`config\nscale weeks\nroadmap r\nswimlane s\n  item x duration:1w\n`, { validate: false });
        expect(r.parserErrors).toEqual([]);
        const scale = r.ast.configEntries.find(isScaleDeclaration);
        expect(scale?.value).toBe('weeks');
    });

    it('parses unit declaration', async () => {
        const r = await parse(`config\nunit sprints = 2w\nroadmap r\nswimlane s\n  item x duration:1w\n`, { validate: false });
        expect(r.parserErrors).toEqual([]);
        const unit = r.ast.configEntries.find(isUnitDeclaration);
        expect(unit?.name).toBe('sprints');
        expect(unit?.value).toBe('2w');
    });

    it('parses estimates declaration (multiple mappings)', async () => {
        const r = await parse(
            `config\nestimates xs=1d s=3d m=1w l=2w xl=1m\nroadmap r\nswimlane s\n  item x duration:1w\n`,
            { validate: false },
        );
        expect(r.parserErrors).toEqual([]);
        const est = r.ast.configEntries.find(isEstimatesDeclaration);
        expect(est?.mappings).toHaveLength(5);
        expect(est?.mappings.map((m) => m.name)).toEqual(['xs', 's', 'm', 'l', 'xl']);
    });

    it('parses custom status declarations', async () => {
        const r = await parse(
            `config\nstatus awaiting-review\nstatus in-review\nroadmap r\nswimlane s\n  item x duration:1w\n`,
            { validate: false },
        );
        expect(r.parserErrors).toEqual([]);
        const statuses = r.ast.configEntries.filter(isStatusDeclaration);
        expect(statuses.map((s) => s.name)).toEqual(['awaiting-review', 'in-review']);
    });

    it('parses style with indented properties', async () => {
        const r = await parse(
            `config\nstyle ent "Enterprise"\n  bg: blue\n  fg: navy\n  border: solid\nroadmap r\nswimlane s\n  item x duration:1w\n`,
            { validate: false },
        );
        expect(r.parserErrors).toEqual([]);
        const style = r.ast.configEntries.find(isStyleDeclaration);
        expect(style?.name).toBe('ent');
        expect(style?.properties.map((p) => p.key)).toEqual(['bg', 'fg', 'border']);
    });

    it('parses label referencing a style', async () => {
        const r = await parse(
            `config\nstyle ent\n  bg: blue\nlabel security "Security" style:ent\nroadmap r\nswimlane s\n  item x duration:1w\n`,
            { validate: false },
        );
        expect(r.parserErrors).toEqual([]);
        const label = r.ast.configEntries.find(isLabelDeclaration);
        expect(label?.name).toBe('security');
        expect(label?.properties.find((p) => p.key === 'style')?.value).toBe('ent');
    });

    it('parses defaults block with multiple entity types', async () => {
        const r = await parse(
            `config\ndefaults\n  item duration:1w status:planned\n  swimlane padding:sm\n  roadmap font:sans\nroadmap r\nswimlane s\n  item x duration:1w\n`,
            { validate: false },
        );
        expect(r.parserErrors).toEqual([]);
        const defaults = r.ast.configEntries.find(isDefaultsDeclaration);
        expect(defaults?.entries.map((e) => e.entityType)).toEqual(['item', 'swimlane', 'roadmap']);
    });

    it('allows config-only file (no roadmap)', async () => {
        const r = await parse(`config\nscale weeks\nstyle ent\n  bg: blue\n`, { validate: false });
        expect(r.parserErrors).toEqual([]);
        expect(r.ast.roadmapDecl).toBeUndefined();
    });
});
