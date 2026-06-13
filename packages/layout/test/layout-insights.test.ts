import { describe, expect, it } from 'vitest';
import { collectLayoutInsights, layoutRoadmap } from '../src/index.js';
import { parseAndResolve } from './helpers.js';

describe('collectLayoutInsights', () => {
    it('reports NL.I1000 when a title spills past its bar', async () => {
        const src = `nowline v1

roadmap r "R" start:2026-01-05 scale:1w

swimlane eng "Engineering"
  item x "This title is far too long to fit inside a one-week bar" duration:1w
`;
        const { file, resolved } = await parseAndResolve(src);
        const layout = layoutRoadmap(file, resolved, { theme: 'light', width: 640 });
        const insights = collectLayoutInsights(layout, { locale: 'en-US' });
        expect(insights.some((i) => i.code === 'NL.I1000')).toBe(true);
    });

    it('reports NL.W1000 when today is outside the roadmap window', async () => {
        const src = `nowline v1

roadmap r "R" start:2026-01-01 length:4w

swimlane a "A"
  item x duration:1w
`;
        const { file, resolved } = await parseAndResolve(src);
        const today = new Date(Date.UTC(2027, 0, 1));
        const layout = layoutRoadmap(file, resolved, { theme: 'light', today });
        const insights = collectLayoutInsights(layout, { today, locale: 'en-US' });
        expect(insights.some((i) => i.code === 'NL.W1000')).toBe(true);
    });

    it('reports NL.I1002 for a very narrow bar', async () => {
        const src = `nowline v1

roadmap r "R" start:2026-01-05 scale:1d

swimlane eng "Engineering"
  item x "X" duration:1d
`;
        const { file, resolved } = await parseAndResolve(src);
        const layout = layoutRoadmap(file, resolved, { theme: 'light', width: 1280 });
        const insights = collectLayoutInsights(layout, { locale: 'en-US' });
        expect(insights.some((i) => i.code === 'NL.I1002')).toBe(true);
    });
});
