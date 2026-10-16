// Browser entry for the true-width prototype: one staging per source feeds both
// today's renderer and the proposed one, so they always draw the same schedule.
import { isNoOpIncludeDiagnosticMessage, noOpIncludeReadFile } from '@nowline/browser';
import { createNowlineServices } from '@nowline/core';
import { renderSvg, stageRoadmap } from '@nowline/renderer';
import { renderProposed } from './proposed.js';

let services;

function describe(raw) {
    if (raw.origin === 'lexer' || raw.origin === 'parser') {
        const e = raw.error;
        const line = e.line ?? e.token?.startLine;
        return `${line ? `Line ${line}: ` : ''}${e.message}`;
    }
    const d = raw.diagnostic ?? raw;
    const line = d.range ? d.range.start.line + 1 : undefined;
    return `${line ? `Line ${line}: ` : ''}${d.message}`;
}

export async function render(source, { theme = 'light', today, path = '/prototype.nowline', files = {} } = {}) {
    services ??= createNowlineServices();
    const todayDate = today ? new Date(`${today}T00:00:00Z`) : null;
    const stage = await stageRoadmap({
        source,
        sourcePath: path,
        services,
        // Includes resolve against the embedded sample set; anything else is skipped.
        readSource: async (abs) => (abs in files ? files[abs] : noOpIncludeReadFile(abs)),
        isToleratedIncludeError: (d) => isNoOpIncludeDiagnosticMessage(d.message),
        layout: { theme, today: todayDate },
    });
    if (stage.kind === 'invalid') return { errors: stage.diagnostics.map(describe) };
    if (stage.kind === 'include-error') {
        return { errors: [...(stage.legacy ? [stage.legacy] : []), ...stage.routed].map((d) => d.message) };
    }
    const todaySvg = await renderSvg(stage.model, {});
    let proposedSvg;
    let proposedError;
    try {
        proposedSvg = renderProposed({ ast: stage.ast, resolved: stage.resolved, schedule: stage.schedule, today: todayDate });
    } catch (err) {
        proposedError = String(err?.stack ?? err);
    }
    return { todaySvg, proposedSvg, proposedError };
}
