# Independent friction reference

`reference.csv` is vendored from PMKS-Web/PMKS_Verification, from the experimental
`verification/friction/` contract. `provenance.json` records the source commit and the SHA256
of UTF-8 CSV bytes with line endings normalized to LF. It is separate from reviewed v1 data.

The Python reference independently solves guide equilibrium in closed form. Its 560 rows cover
both crank directions, both transverse-load directions, and guide-only versus combined
guide/bearing friction. PMKS's `friction-reference.spec.ts` compares all rows using the actual
force solver, in meters and centimeters, and verifies the provenance hash.

To regenerate, in PMKS_Verification run:

```text
python verification/friction/reference.py --output verification/friction/reference.csv
python verification/friction/reference.py --check verification/friction/reference.csv
```

Commit the reference change there, copy the CSV here, and update the commit/hash metadata.
Do not regenerate expected values from PMKS's solver. The separate MATLAB matrix implementation
and manual workflow are provided in PMKS_Verification, but MATLAB has **not** been run for this
revision. Python execution must not be represented as MATLAB validation.

The local verification checkout is `artifacts/PMKS_Verification` in the friction worktree.
It is an independent Git repository with its own local `feature/friction` commit; the artifact
directory is ignored by the application repository. Keep that checkout until its commit has
been published or preserved elsewhere. Neither repository was pushed during this audit.

See [the friction design notes](../../../docs/friction-design.md) for equations, static-friction
limits, the inherited In-motion inertia restriction, and the full verification scope.
