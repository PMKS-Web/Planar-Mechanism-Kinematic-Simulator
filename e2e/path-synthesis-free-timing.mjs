/** The full insertion/history/playback workflow, exercised with monotone free timing. */
process.env.PMKS_PATH_TIMING = 'monotone-free-timing';
process.env.PMKS_PATH_OUTPUT = 'artifacts/path-free-timing/browser';
await import('./path-synthesis-backend.mjs');
