import { describe, expect, it, vi } from 'vitest';
import { durationToMsProjMinutes, minutesToMsProjDuration } from '../src/duration.js';
import { exportMsProjXml } from '../src/index.js';
import { buildExportInputs, SIMPLE_FIXTURE } from './helpers.js';

describe('exportMsProjXml — basic structure', () => {
    it('emits a well-formed XML prologue + Project root', async () => {
        const inputs = await buildExportInputs(SIMPLE_FIXTURE);
        const xml = exportMsProjXml(inputs, { onLossy: () => {} });
        expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>')).toBe(
            true,
        );
        expect(xml).toContain('<Project xmlns="http://schemas.microsoft.com/project">');
        expect(xml.endsWith('</Project>')).toBe(true);
    });

    it('emits the Standard calendars block with fixed UIDs', async () => {
        const inputs = await buildExportInputs(SIMPLE_FIXTURE);
        const xml = exportMsProjXml(inputs, { onLossy: () => {} });
        expect(xml).toContain('<Calendars>');
        expect(xml).toContain('<Name>Standard</Name>');
        expect(xml).toContain('<UID>1</UID>');
        expect(xml).toContain('<UID>2</UID>');
        expect(xml).toContain('<IsBaseCalendar>1</IsBaseCalendar>');
    });

    it('every Task has a UID', async () => {
        const inputs = await buildExportInputs(SIMPLE_FIXTURE);
        const xml = exportMsProjXml(inputs, { onLossy: () => {} });
        const tasks = xml.match(/<Task>[\s\S]*?<\/Task>/g) ?? [];
        expect(tasks.length).toBeGreaterThan(0);
        for (const task of tasks) {
            expect(task).toMatch(/<UID>\d+<\/UID>/);
        }
    });

    it('milestones get Milestone=1 + Duration=PT0', async () => {
        const inputs = await buildExportInputs(SIMPLE_FIXTURE);
        const xml = exportMsProjXml(inputs, { onLossy: () => {} });
        const tasks = xml.match(/<Task>[\s\S]*?<\/Task>/g) ?? [];
        const doneTask = tasks.find((t) => t.includes('<Name>Done</Name>'));
        expect(doneTask).toBeDefined();
        expect(doneTask!).toContain('<Milestone>1</Milestone>');
        expect(doneTask!).toContain('<Duration>PT0H0M0S</Duration>');
    });

    it('swimlanes become summary tasks', async () => {
        const inputs = await buildExportInputs(SIMPLE_FIXTURE);
        const xml = exportMsProjXml(inputs, { onLossy: () => {} });
        const tasks = xml.match(/<Task>[\s\S]*?<\/Task>/g) ?? [];
        const lane = tasks.find((t) => t.includes('<Name>Build</Name>'));
        expect(lane).toBeDefined();
        expect(lane!).toContain('<Summary>1</Summary>');
    });

    it('items inside swimlanes get OutlineLevel ≥ 2', async () => {
        const inputs = await buildExportInputs(SIMPLE_FIXTURE);
        const xml = exportMsProjXml(inputs, { onLossy: () => {} });
        const tasks = xml.match(/<Task>[\s\S]*?<\/Task>/g) ?? [];
        const design = tasks.find((t) => t.includes('<Name>Design</Name>'));
        expect(design).toBeDefined();
        expect(design!).toMatch(/<OutlineLevel>2<\/OutlineLevel>/);
    });

    it('after-dependencies become PredecessorLink Type=1 (FS)', async () => {
        const inputs = await buildExportInputs(SIMPLE_FIXTURE);
        const xml = exportMsProjXml(inputs, { onLossy: () => {} });
        expect(xml).toContain('<PredecessorLink>');
        expect(xml).toContain('<Type>1</Type>');
    });

    it('owners become Resources + Assignments', async () => {
        const inputs = await buildExportInputs(SIMPLE_FIXTURE);
        const xml = exportMsProjXml(inputs, { onLossy: () => {} });
        expect(xml).toContain('<Resources>');
        expect(xml).toContain('<Name>Sam Chen</Name>');
        expect(xml).toContain('<Assignments>');
    });
});

describe('exportMsProjXml — determinism', () => {
    it('two calls produce identical bytes', async () => {
        const inputs = await buildExportInputs(SIMPLE_FIXTURE);
        const a = exportMsProjXml(inputs, { onLossy: () => {} });
        const b = exportMsProjXml(inputs, { onLossy: () => {} });
        expect(a).toBe(b);
    });

    it('respects an explicit startDate', async () => {
        const inputs = await buildExportInputs(SIMPLE_FIXTURE);
        const xml = exportMsProjXml(inputs, { startDate: '2026-06-15', onLossy: () => {} });
        expect(xml).toContain('<StartDate>2026-06-15T08:00:00</StartDate>');
    });

    it('rejects malformed startDate', async () => {
        const inputs = await buildExportInputs(SIMPLE_FIXTURE);
        expect(() =>
            exportMsProjXml(inputs, { startDate: 'not-a-date', onLossy: () => {} }),
        ).toThrow();
    });
});

describe('exportMsProjXml — lossy summary', () => {
    it('reports labels + description drops via the onLossy hook', async () => {
        const inputs = await buildExportInputs(SIMPLE_FIXTURE);
        const sink = vi.fn();
        exportMsProjXml(inputs, { onLossy: sink });
        expect(sink).toHaveBeenCalledTimes(1);
        const message = sink.mock.calls[0][0] as string;
        expect(message).toContain('nowline: msproj export dropped');
        expect(message).toContain('labels');
    });

    it('does NOT call onLossy when nothing was dropped', async () => {
        const fixture = `nowline v1

roadmap clean "Clean"

swimlane work "Work"
  item simple "Simple" duration:1w
`;
        const inputs = await buildExportInputs(fixture);
        const sink = vi.fn();
        exportMsProjXml(inputs, { onLossy: sink });
        expect(sink).not.toHaveBeenCalled();
    });
});

describe('duration mapping', () => {
    it('1w under Standard calendar = 5 working days = 2400 minutes', () => {
        expect(durationToMsProjMinutes('1w')).toBe(5 * 8 * 60);
    });
    it('xs = 1 day = 480 minutes', () => {
        expect(durationToMsProjMinutes('xs')).toBe(480);
    });
    it('blank duration defaults to 1d', () => {
        expect(durationToMsProjMinutes(undefined)).toBe(480);
    });
    it('minutesToMsProjDuration formats as PT<m>M0S', () => {
        expect(minutesToMsProjDuration(480)).toBe('PT480M0S');
        expect(minutesToMsProjDuration(0)).toBe('PT0M0S');
    });
});
