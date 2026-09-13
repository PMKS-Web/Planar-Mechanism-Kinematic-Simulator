# Gear integration and remote preservation

> **Status:** Reference — final integration audit on `feature/gears`, September 12, 2026.

## Staging and prerequisites

A normal `git fetch origin` found remote staging at
`acba1b770a20551b37a9b2f24b459c224c8ed0fc`. Local `staging` remains
`968a046aedffdd273a3350654b4f44bc85b811d3`, 47 commits behind, with no unique commits.
Neither branch was advanced by this integration. No commits have been added to remote
staging since the gear stabilization baseline at `acba1b77`.

The four worksheet prerequisites are **not in staging**, by ancestry or equivalent
patch (`git cherry` marks each as unique). Tree inspection also finds no
`solver-explanation.service.ts` or the worked-worksheet components on staging.
The exact shared APIs needed by gear explanation therefore remain explicit commits:

| Commit | Classification |
| --- | --- |
| `82e7c451` | Shared worksheet: solver diagrams and equations |
| `4c03c712` | Shared worksheet: worked derivation presentation |
| `8c5858ef` | Shared worksheet: force signs and independent kinematic loops |
| `aa10245f` | Shared worksheet: visual loop and moment conventions |

These are prerequisite worksheet work, not gear functionality. Their only dependency
delta is KaTeX 0.18.7 and its Commander dependency, with KaTeX styling in `angular.json`.
The integration introduces no new dependency or lockfile change beyond those reviewed
prerequisites.

## Preserved history and integration method

The existing lineage is linear:

```text
origin/staging acba1b77
  → four shared worksheet commits → aa10245f
  → eight V1 commits → daef9908
  → three compound V1.1 commits → d5e30998
  → Mechanical Clock → 5ba57705
```

`feature/gears` was created in a separate worktree from the fetched `origin/staging`.
Since staging is already an ancestor of the complete stack, `git merge --ff-only
feature/gears-clock-example` advanced **only the new feature branch** through the
existing commits. No merge commit, cherry-pick duplication, rebase, reset or protected
branch rewrite was needed. This is current staging plus the reviewed prerequisites
and gear feature, with no newer staging content to reconcile and no conflicts.

| Order | Commit | Change and scope |
| --- | --- | --- |
| 1–4 | Above | Shared worksheet prerequisites |
| 5 | `6a7de2be` | Behavior-preserving playback, fingerprint and angle helper extraction |
| 6 | `bfeb9b6d` | MotionGen verification CSV-header CRLF fix; test reader only, not a production parser change |
| 7 | `9c610afb` | V1 computation, prescribed body motion and complete constraint audits |
| 8 | `b9ef4772` | V1 editing, G1 persistence, lifecycle, analysis and exports |
| 9 | `305af4a7` | Gear examples, component stories, browser workflows and handoffs |
| 10 | `8140b099` | Deterministic document ordering and mixed-mechanism force-export exclusions |
| 11 | `a2dd95a7` | LF text checkout policy for reproducible Windows checks |
| 12 | `daef9908` | V1 acceptance checkpoint |
| 13 | `342eda38` | Compound gears through shared physical host ownership |
| 14 | `c4243e16` | Compound attachment editing, planes and shaft selection |
| 15 | `d5e30998` | Compound train example and acceptance evidence |
| 16 | `5ba57705` | Solver-driven Mechanical Clock and general worksheet route explanation |

The Open/history fix is intentionally retained in the V1 production commit: a file
arrival must become a history entry before the first edit can be undone. Analysis
sampling, partitioning, exports, selection and codec edits are required gear integration
surfaces. The helper extraction and LF policy remain distinct reviewable commits.

The later concurrent worksheet commits `7ef1f2ed`, `b9b8c513` and `218d9075` are not
ancestors and did not enter the gear stack. Other analysis-results-table work and the
original shared checkout's uncommitted files are excluded. The original worktree was
not reset, switched, cleaned or staged.

Protected branch heads remain:

- `feature/gears-v1`: `daef9908065ada3b11421f2fb46c441406a4e9f9`.
- `feature/gears-compound`: `d5e3099895955a4ade1d70b1962ecc3a9a826037`.
- `feature/gears-clock-example`: `5ba57705abcda4b8d491d579de3c8b950ad62e38`.

All three protected worktrees were clean before integration. Their histories and
worktrees are retained. The final integration adds only this audit, verification
records and documentation cleanup; no physics or compatibility fix is required.

## Final feature delta and cleanliness

The complete delta includes external fixed-axis gears, simple/idler trains, compound
shafts and axial planes, production editing and selection, G1 persistence, continuous
multi-turn results, general worksheet explanations, exports, component-gallery states
and five production examples. It includes the explicit shared worksheet prerequisites
listed above. Internal gears, rack and pinion, planetary gears, gear forces, synthesis
and tooth-contact physics remain outside this task.

The content audit found one machine-specific portable-Node path in inherited worksheet
documentation. It was replaced with portable instructions in a follow-on commit; the
protected history was not rewritten. Localhost addresses remain only in intentional
documentation and developer test/preview tools, not production UI. Browser evidence,
downloads, logs, builds and installed dependencies remain under ignored directories.

## Clock invariant and final verification

Mechanical Clock retains A12 → B48 and C15 → D45, module 0.1 cm/tooth and 3 cm
spacing. AB and EF are independent concentric hosts, CD carries both intermediate
gears, planes are 1 and 2, and the ordinary hands remain 5 and 3.4 cm long.
At −60 rpm input, the compiler gives −5 rpm hour motion, +1/12 ratio, 12 input turns
and 4,321 samples. Endpoint travel is −4,320° / +1,080° / −360°; intermediate hour
travel magnitudes after 1/3/6/12 input turns are 30°/90°/180°/360°. Reverse input
preserves the positive ratio and B/C agree at every sample.

The dial remains the existing non-physical background, restored by the library card
or backdrop fragment and excluded from ordinary G1 documents/history.

All required checks ran from this staging-based integration worktree:

| Check | Result |
| --- | --- |
| Full automated suite | 255 files, 2,658 tests passed |
| Focused gear suite | 16 files, 125 tests passed |
| `npm run check` | Passed; existing 15 ESLint warnings, no new warnings |
| Production build | Passed; existing CommonJS and stylesheet-budget warnings |
| Storybook build | Passed; existing large-chunk warnings |
| `git diff --check` against staging | Passed |
| `gear-production.mjs` | Passed |
| `gear-results.mjs` | Passed |
| `compound-gears.mjs` | Passed |
| `mechanical-clock.mjs` | Passed; 22 filmstrip frames, four gear graphs and worksheet |
| `gear-gallery.mjs` | All 24 existing gear states passed |
| `template-backdrops.mjs` | All five checks passed |
| `solver-explanation.mjs` | Passed |
| `worksheet-conventions.mjs` | Passed |

The full-suite count increases by one relative to the clock checkpoint because
`docs-links.spec.ts` checks this new document. No preexisting test or runtime source
file was changed during integration.

Visual inspection covered the simple pair, gear-driven four-bar, idler, compound
train and clock. The clock inspection covered clockwise motion, shared intermediate
motion, start/quarter/half/full cycle, both central hands, gear/shaft selection,
angular graphs, the exact compound derivation and the narrow layout. The clock was
left open in a separate disposable Chrome context on the integrated local server.
The Codex browser inventory exposed no enabled surfaces; the repository's documented
Playwright fallback supplied the native interactions and PNG evidence. The optional
contact-sheet helper assumes a macOS Python path and was skipped on Windows; actual
filmstrip PNGs were inspected individually. No app change was needed for that helper.

The final content scan found no credentials, machine-specific paths or local usernames
in the changed working-tree files. No generated screenshots, logs, downloads or other
artifacts are tracked. Package files remain identical to the clock checkpoint.
The only follow-on commit records this audit, indexes it, points the project guidance
to the integration branch and replaces the inherited machine-specific documentation
command with portable instructions.
Local app: `http://localhost:4338`; local gallery: `http://localhost:4339`.
Logs and the final audit are in `artifacts/integration/`; native browser suites retain
their usual artifact subfolders within this worktree.

Only a normal push of `feature/gears` is authorized. No force push, staging merge,
pull request or deletion of historical branches is part of this task.


## Remote preservation

Destination: `origin/feature/gears`, in the existing PMKS-Web repository. The push
uses `git push --set-upstream origin feature/gears`, with no force option and an
explicit feature-branch ref. The final local and remote identity check is recorded in
`artifacts/integration/remote-verification.json` after the push and reported in the
handoff. The historical branch names remain local protected checkpoints; their exact
commit objects are also reachable through the preserved integration history.

The next development step is to choose and specify the next gear capability on a
new branch from this verified integration checkpoint. Internal gears are a reasonable
bounded next design discussion; moving-axis/planetary behavior needs its own design.
No such work was started here, and a PR remains an explicit future decision.
