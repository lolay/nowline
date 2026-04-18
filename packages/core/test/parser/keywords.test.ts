import { describe, it, expect } from 'vitest';
import { parse } from '../helpers.js';

describe('every keyword', () => {
    it('parses anchor with bare id + date:', async () => {
        const r = await parse(`roadmap r start:2026-01-01
anchor kickoff date:2026-01-06
swimlane s
  item x duration:1w
`, { validate: false });
        expect(r.parserErrors).toEqual([]);
    });

    it('parses anchor with title + date:', async () => {
        const r = await parse(`roadmap r start:2026-01-01
anchor kickoff "Kickoff" date:2026-01-06
swimlane s
  item x duration:1w
`, { validate: false });
        expect(r.parserErrors).toEqual([]);
    });

    it('parses milestone with after:', async () => {
        const r = await parse(`roadmap r
swimlane s
  item x duration:1w
milestone beta "Beta" after:x
`, { validate: false });
        expect(r.parserErrors).toEqual([]);
    });

    it('parses milestone with date and multiple after:', async () => {
        const r = await parse(`roadmap r start:2026-01-01
swimlane s
  item x duration:1w
  item y duration:1w
milestone ga "GA" date:2026-06-01 after:[x, y]
`, { validate: false });
        expect(r.parserErrors).toEqual([]);
    });

    it('parses footnote with single on:', async () => {
        const r = await parse(`roadmap r
swimlane s
  item x duration:1w
footnote note "Note" on:x
`, { validate: false });
        expect(r.parserErrors).toEqual([]);
    });

    it('parses footnote with multiple on:', async () => {
        const r = await parse(`roadmap r
swimlane s
  item x duration:1w
  item y duration:1w
footnote note "Note" on:[x, y]
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
  item x duration:1w
`, { validate: false });
        expect(r.parserErrors).toEqual([]);
    });

    it('parses nowline directive variants', async () => {
        for (const version of ['v1', 'v2', 'v10']) {
            const r = await parse(`nowline ${version}\nroadmap r\nswimlane s\n  item x duration:1w\n`, { validate: false });
            expect(r.parserErrors).toEqual([]);
            expect(r.ast.directive?.version).toBe(version);
        }
    });

    it('parses scale block', async () => {
        const r = await parse(`config
scale
  name: weeks
  label-every: 2
roadmap r
swimlane s
  item x duration:1w
`, { validate: false });
        expect(r.parserErrors).toEqual([]);
    });

    it('parses calendar block', async () => {
        const r = await parse(`config
calendar
  days-per-week: 5
  days-per-month: 22
  days-per-quarter: 65
  days-per-year: 260
roadmap r calendar:custom
swimlane s
  item x duration:1w
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
  item x duration:1w
`, { validate: false });
        expect(r.parserErrors).toEqual([]);
    });

    it('parses flat default declarations', async () => {
        const r = await parse(`config
default item shadow:subtle
default swimlane padding:sm
roadmap r
swimlane s
  item x duration:1w
`, { validate: false });
        expect(r.parserErrors).toEqual([]);
    });

    it('parses roadmap-section duration/status/label declarations', async () => {
        const r = await parse(`roadmap r
duration xs length:1d
status awaiting-review
label security "Security"
swimlane s
  item x duration:xs status:awaiting-review labels:security
`, { validate: false });
        expect(r.parserErrors).toEqual([]);
    });
});
