# MATLAB verification data

Reference kinematics and force traces for five mechanism configurations from
the reviewed `reference-data/v1` contract in
[PMKS-Web/PMKS_Verification](https://github.com/PMKS-Web/PMKS_Verification).
The specs in `src/tests/verification/` rebuild each mechanism with the PMKS+
model classes (fixtures in `src/test-utils/verification/fixtures.ts`) and
compare every trusted solver output against these series. Joint and angular
kinematics are covered in all five cases. CoM kinematics are covered for the
slider-crank tracer, Stephenson III Example 2, and Watt I. Dynamics are covered
for Stephenson III Example 2 and Watt I only.

Regenerate with:

```sh
git clone https://github.com/PMKS-Web/PMKS_Verification /tmp/PMKS_Verification
git -C /tmp/PMKS_Verification checkout 932951a5316b16bfa41b937b04592c974143c4bb
node scripts/generate-verification-data.mjs /tmp/PMKS_Verification
```

The generator refuses any other commit, requires that commit to be reachable
from `PMKS_Verification/master`, and reads only `reference-data/v1`. It rejects
legacy `CSVOutput` paths and stale pre-fork trust labels. Each generated dataset
embeds the verification and PMKS-fork provenance, trust, capabilities,
tolerances, exclusions, and exact sample/sweep metadata. Generated TypeScript is
formatted for review and committed, so CI has no network dependency.

The embedded tolerances are PMKSWeb comparison tolerances, not the tighter
cross-source promotion limits used in `PMKS_Verification`. PMKSWeb rounds
coordinates to four decimals at each simulated one-degree step; the position
floor and derivative-relative terms account for the resulting accumulated
noise. There are no case-specific tolerance overrides in the five suites.

Rows are 1-degree input-crank increments starting from the initial position.
The specs align with the contract's explicit input angle and sweep direction,
consume duplicate endpoints independently, and require every eligible row to
match. Any PMKSWeb-specific toggle-boundary omission is named in its spec with
both source rows and application timesteps.

Teaching-case CoMs are `diagnostic-only`; teaching dynamics are
`not-applicable`. The generator deliberately omits both from trusted suites.
The E/G/H teaching accelerations, teaching-slider CoM transport, and
slider-tracer sign defects were fixed before v1 promotion, so their old
expected-failure exclusions are gone. Stephenson III Example 1 remains deferred
until PMKS+'s LoopSolver finds its second loop without a test override. OTIS is
outside this PR's five-case scope.
