import { describe, expect, it } from 'vitest';
import { parseLinkIcon } from '../src/nodes/item-measure.js';

// r1.f5: validation rejects a disallowed link (NL.E0414), and layout drops it too,
// so a caller that renders without validating never gets a live non-http href.
describe('parseLinkIcon', () => {
    it.each([
        ['https://linear.app/acme/issue/ENG-1', 'linear'],
        ['https://github.com/acme/auth/pull/87', 'github'],
        ['https://acme.atlassian.net/browse/ENG-1', 'jira'],
        ['http://intranet.example/spec', 'generic'],
        ['mailto:ops@acme.example', 'generic'],
    ])('keeps %s as a %s link', (link, icon) => {
        expect(parseLinkIcon(link)).toEqual({ icon, href: link });
    });

    it.each([
        'javascript:alert(document.domain)',
        'JavaScript:alert(1)',
        'data:text/html,<b>x</b>',
        'javascript:fetch("https://github.com")',
        './docs/spec.md',
        '//evil.example',
        'mailto:',
    ])('drops %s: no icon, no href', (link) => {
        expect(parseLinkIcon(link)).toEqual({ icon: 'none' });
    });

    it('draws no icon without a link', () => {
        expect(parseLinkIcon(undefined)).toEqual({ icon: 'none' });
    });
});
