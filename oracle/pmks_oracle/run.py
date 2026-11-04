"""Command line: solve problem files into reference files.

    uv run python -m pmks_oracle.run PROBLEM.json [PROBLEM.json ...] --out DIR

Each PROBLEM.json becomes DIR/<id>.reference.json. The generator's own source
is hashed into every reference, so a change to the oracle makes every
reference stale, just as a change to a problem makes its own reference stale.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
from pathlib import Path

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
    text = json.dumps(data, indent=1, sort_keys=True, ensure_ascii=False, allow_nan=False)
    path.write_text(text + "\n", encoding="utf-8")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("problems", nargs="+", type=Path)
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args(argv)
    args.out.mkdir(parents=True, exist_ok=True)
    generator = generator_info(source_sha256())
    failures = 0
    for path in args.problems:
        raw = json.loads(path.read_text(encoding="utf-8"))
        try:
            reference = solve(load_problem(raw), generator)
        except Exception as error:  # noqa: BLE001 - one bad case must not hide the others
            failures += 1
            print(f"FAILED {path.name}: {error}", file=sys.stderr)
            continue
        write_json(args.out / f"{raw['id']}.reference.json", reference)
        print(f"solved {raw['id']}", file=sys.stderr)
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
