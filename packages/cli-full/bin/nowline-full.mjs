#!/usr/bin/env node
// `nowline-full` shim. Delegates to @nowline/cli's main entry. The five
// optional @nowline/export-* packages are listed as dependencies of this
// package, so installing @nowline/cli-full from npm pulls in everything the
// CLI's dynamic format dispatch may import. The compiled-binary tier (m2c
// § 11) is the parallel mechanism for users who download the binary.

import('@nowline/cli').catch((err) => {
    process.stderr.write(`nowline-full: failed to load @nowline/cli: ${err?.message ?? err}\n`);
    process.exit(1);
});
