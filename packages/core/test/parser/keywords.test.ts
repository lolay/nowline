import { describe, it, expect } from 'vitest';
import { parse } from '../helpers.js';

describe('every keyword', () => {
    it('parses anchor with bare id + date', async () => {
        const r = await parse(`roadmap r
anchor kickoff 2026-01-06
swimlane s
  item x
`, { validate: false });
        expect(r.parserErrors).toEqual([]);
    });

    it('parses anchor with title + date', async () => {
        const r = await parse(`roadmap r
anchor kickoff "Kickoff" 2026-01-06
swimlane s
  item x
`, { validate: false });
        expect(r.parserErrors).toEqual([]);
    });

    it('parses milestone without date', async () => {
        const r = await parse(`roadmap r
swimlane s
  item x
milestone beta "Beta" depends:x
`, { validate: false });
        expect(r.parserErrors).toEqual([]);
    });

    it('parses milestone with date and multiple depends', async () => {
        const r = await parse(`roadmap r
swimlane s
  item x
  item y
milestone ga "GA" date:2026-06-01 depends:[x, y]
`, { validate: false });
        expect(r.parserErrors).toEqual([]);
    });

    it('parses footnote with single on', async () => {
        const r = await parse(`roadmap r
swimlane s
  item x
footnote "Note" on:x
`, { validate: false });
        expect(r.parserErrors).toEqual([]);
    });

    it('parses footnote with multiple on', async () => {
        const r = await parse(`roadmap r
swimlane s
  item x
  item y
footnote "Note" on:[x, y]
`, { validate: false });
        expect(r.parserErrors).toEqual([]);
    });

    it('parses parallel with items', async () => {
        const r = await parse(`roadmap r
swimlane s
  parallel
    item a duration:1w
    item b duration:2w
`, { validate: false });
        expect(r.parserErrors).toEqual([]);
    });

    it('parses group with items', async () => {
        const r = await parse(`roadmap r
swimlane s
  group g "Group"
    item a duration:1w
`, { validate: false });
        expect(r.parserErrors).toEqual([]);
    });

    it('parses parallel with groups', async () => {
        const r = await parse(`roadmap r
swimlane s
  parallel
    group g1 "G1"
      item a duration:1w
    group g2 "G2"
      item b duration:1w
`, { validate: false });
        expect(r.parserErrors).toEqual([]);
    });

    it('parses team with nested persons and teams', async () => {
        const r = await parse(`roadmap r
person sam "Sam"
team eng "Engineering"
  team platform "Platform"
    person sam
  team mobile "Mobile"
swimlane s
  item x
`, { validate: false });
        expect(r.parserErrors).toEqual([]);
    });

    it('parses nowline directive variants', async () => {
        for (const version of ['v1', 'v2', 'v10']) {
            const r = await parse(`nowline ${version}\nroadmap r\nswimlane s\n  item x\n`, { validate: false });
            expect(r.parserErrors).toEqual([]);
            expect(r.ast.directive?.version).toBe(version);
        }
    });

    it('parses unit and estimates declarations', async () => {
        const r = await parse(`config
scale weeks
unit sprints = 2w
estimates xs=1d s=3d m=1w l=2w xl=1m
roadmap r
swimlane s
  item x
`, { validate: false });
        expect(r.parserErrors).toEqual([]);
    });

    it('parses style declaration with indented properties', async () => {
        const r = await parse(`config
style enterprise "Enterprise"
  bg: blue
  fg: navy
  border: solid
roadmap r
swimlane s
  item x
`, { validate: false });
        expect(r.parserErrors).toEqual([]);
    });

    it('parses defaults block', async () => {
        const r = await parse(`config
defaults
  item duration:m status:planned
  swimlane padding:sm
roadmap r
swimlane s
  item x
`, { validate: false });
        expect(r.parserErrors).toEqual([]);
    });
});
