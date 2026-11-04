import * as path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// #243: `npm install -g` fails on a stock ubuntu-latest runner, because the
// global prefix is /usr/local and npm links the CLI's man pages into
// /usr/local/share/man, which the runner user can't create. The Action
// installs into a prefix under $RUNNER_TEMP instead and puts its bin on PATH.

vi.mock('@actions/exec', () => ({
    exec: vi.fn(async () => 0),
    getExecOutput: vi.fn(),
}));
vi.mock('@actions/core', () => ({
    addPath: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
}));

import * as core from '@actions/core';
import * as exec from '@actions/exec';

import { cliInstallPlan, ensureCli } from '../src/cli.js';

const RUNNER_TEMP = path.join(path.sep, 'runner', '_temp');

function reportVersion(stdout: string, exitCode = 0): void {
    vi.mocked(exec.getExecOutput).mockResolvedValue({ exitCode, stdout, stderr: '' });
}

describe('cliInstallPlan', () => {
    const plan = cliInstallPlan('1.2.3', RUNNER_TEMP);

    it('never installs globally', () => {
        expect(plan.npmArgs).not.toContain('-g');
        expect(plan.npmArgs).not.toContain('--global');
    });

    it('installs the requested version into a prefix under the runner temp dir', () => {
        expect(plan.prefix).toBe(path.join(RUNNER_TEMP, 'nowline-cli', '1.2.3'));
        expect(plan.npmArgs[0]).toBe('install');
        expect(plan.npmArgs).toContain('@nowline/cli@1.2.3');
        const at = plan.npmArgs.indexOf('--prefix');
        expect(plan.npmArgs[at + 1]).toBe(plan.prefix);
    });

    it('puts the prefix node_modules/.bin on PATH', () => {
        expect(plan.binDir).toBe(path.join(plan.prefix, 'node_modules', '.bin'));
    });
});

describe('ensureCli', () => {
    const savedTemp = process.env.RUNNER_TEMP;

    beforeEach(() => {
        vi.clearAllMocks();
        process.env.RUNNER_TEMP = RUNNER_TEMP;
    });

    afterEach(() => {
        if (savedTemp === undefined) delete process.env.RUNNER_TEMP;
        else process.env.RUNNER_TEMP = savedTemp;
    });

    it('installs into $RUNNER_TEMP, not globally, and adds the bin to PATH', async () => {
        reportVersion('0.9.0');
        await ensureCli('1.2.3');

        const plan = cliInstallPlan('1.2.3', RUNNER_TEMP);
        expect(exec.exec).toHaveBeenCalledTimes(1);
        expect(exec.exec).toHaveBeenCalledWith('npm', plan.npmArgs);
        expect(core.addPath).toHaveBeenCalledWith(plan.binDir);
    });

    it('installs when no nowline is on PATH', async () => {
        vi.mocked(exec.getExecOutput).mockRejectedValue(new Error('Unable to locate executable'));
        await ensureCli('1.2.3');
        expect(exec.exec).toHaveBeenCalledWith('npm', cliInstallPlan('1.2.3', RUNNER_TEMP).npmArgs);
    });

    it('skips the install when nowline on PATH is already the requested version', async () => {
        reportVersion('1.2.3\n');
        await ensureCli('1.2.3');
        expect(exec.exec).not.toHaveBeenCalled();
        expect(core.addPath).not.toHaveBeenCalled();
    });
});
