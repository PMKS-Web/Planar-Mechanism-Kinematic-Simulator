/** Explicit long-running benchmark; no platform-specific shell assignment or extra dependency. */
import { spawnSync } from 'node:child_process';
const run = spawnSync(
  process.execPath,
  [
    'node_modules/@angular/cli/bin/ng.js',
    'test',
    '--watch=false',
    '--include=src/tests/verification/path-benchmark.spec.ts',
  ],
  { stdio: 'inherit', env: { ...process.env, PMKS_PATH_BENCHMARK: '1' } }
);
if (run.error) throw run.error;
process.exitCode = run.status ?? 1;
