# The numerical oracle

An independent solver for PMKS+'s verification mechanisms, built on [Exudyn](https://exudyn.readthedocs.io/).
[`docs/numerical-oracle-plan.md`](../docs/numerical-oracle-plan.md) is the plan and records why
Exudyn was chosen.

Everything here is pinned in `uv.lock`. Install [uv](https://docs.astral.sh/uv/), then, from this
directory:

```bash
uv sync                      # once
uv run pytest                # the raw benchmark cases
uv run python -m pmks_oracle.run benchmarks/cases/*.problem.json --out /tmp/refs
```

Do not run Python with `-I` here: it drops this directory from the import path.

| Path | Holds |
| --- | --- |
| `pmks_oracle/problem.py` | The problem schema, `pmks-oracle-problem/1`, in SI units |
| `pmks_oracle/exudyn_model.py` | A problem as Exudyn bodies, joints, loads and a driver |
| `pmks_oracle/analysis.py` | Positions, velocities, accelerations and inverse dynamics on Exudyn's constraint equations |
| `pmks_oracle/sweep.py` | The walk along the configuration curve: grid samples, toggles, slot ends, closure |
| `pmks_oracle/mobility.py` | Rank of the constraint Jacobian, before and after the driver |
| `pmks_oracle/reference.py` | The reference file, `pmks-oracle-reference/1` |
| `pmks_oracle/agree.py` | Whether a new solve reproduces a committed reference, to within another platform's rounding |
| `pmks_oracle/run.py` | The command line: problems in, references out, keeping each one it reproduces (`PMKS_ORACLE_NUMBERS_ONLY=1`: even under another generator) |
| `benchmarks/cases/` | Raw benchmark problems, each with the values it must reproduce |
| `benchmarks/derivations/` | The scripts that derive or re-derive those values |
| `spike/` | The Phase 0 library trial: the scripts, and pinned conda environments for Simbody and PyChrono |
