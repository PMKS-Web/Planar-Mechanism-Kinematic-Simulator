"""Command line: solve problem files into reference files.

    uv run python -m pmks_oracle.run PROBLEM.json [PROBLEM.json ...] --out DIR [--prune]

Each PROBLEM.json becomes DIR/<id>.reference.json. The generator's own source
is hashed into every reference, so a change to the oracle makes every
reference stale, just as a change to a problem makes its own reference stale.

A reference already in DIR is left alone when the new solve reproduces it
(`agree.py`): the same problem and generator, and every number within what
rounding on another platform can move. So regenerating on macOS or on Linux
rewrites only what has changed, and a clean `git status` after a regeneration
means every committed reference reproduces.

With PMKS_ORACLE_NUMBERS_ONLY=1 a reference whose numbers reproduce is left
alone even when the generator differs: the upstream nightly solves with the
newest Exudyn patch release and asks only whether any number moved.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import sys
from pathlib import Path

import exudyn as exu

from . import agree
from .problem import load_problem
from .reference import generator_info, solve

PACKAGE = Path(__file__).resolve().parent


def source_sha256() -> str:
    h = hashlib.sha256()
    for path in sorted(PACKAGE.glob("*.py")):
        h.update(path.name.encode())
        h.update(path.read_bytes())
    lock = PACKAGE.parent / "uv.lock"
    if lock.exists():
        h.update(lock.read_bytes())
    return h.hexdigest()


def write_json(path: Path, data: dict) -> None:
    # One line: these files are generated, compared by a spec, and never read by hand.
    text = json.dumps(data, sort_keys=True, separators=(",", ":"), ensure_ascii=False, allow_nan=False)
    path.write_text(text + "\n", encoding="utf-8")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("problems", nargs="+", type=Path)
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument(
        "--prune",
        action="store_true",
        help="delete references in --out whose problem is not among PROBLEMS",
    )
    args = parser.parse_args(argv)
    args.out.mkdir(parents=True, exist_ok=True)
    # Exudyn announces every solver it initializes; one reference per machine
    # makes that hundreds of lines.
    exu.config.printToConsole = False
    generator = generator_info(source_sha256())
    numbers_only = os.environ.get("PMKS_ORACLE_NUMBERS_ONLY") == "1"
    failures = 0
    for path in args.problems:
        data = path.read_bytes()
        raw = json.loads(data.decode("utf-8"))
        try:
            # The bytes are hashed, not a re-serialization: the exporter that wrote
            # them is TypeScript, and the two languages print some floats differently.
            reference = solve(load_problem(raw), generator, hashlib.sha256(data).hexdigest())
        except Exception as error:  # noqa: BLE001 - one bad case must not hide the others
            failures += 1
            print(f"FAILED {path.name}: {error}", file=sys.stderr)
            continue
        target = args.out / f"{raw['id']}.reference.json"
        if target.exists():
            try:
                old = json.loads(target.read_text(encoding="utf-8"))
                agree.check(raw, old, reference, same_generator=not numbers_only)
                print(f"reproduced {raw['id']}", file=sys.stderr)
                continue
            except (agree.Disagreement, KeyError, TypeError) as change:
                print(f"changed {raw['id']}: {change}", file=sys.stderr)
        write_json(target, reference)
        print(f"solved {raw['id']}", file=sys.stderr)
    if args.prune:
        wanted = {json.loads(p.read_text(encoding="utf-8"))["id"] for p in args.problems}
        for old in args.out.glob("*.reference.json"):
            if old.name.removesuffix(".reference.json") not in wanted:
                old.unlink()
                print(f"pruned {old.name}", file=sys.stderr)
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
