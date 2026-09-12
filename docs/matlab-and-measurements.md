# MATLAB scripts and measured data

> **Status:** Reference — MATLAB export and experimental comparison in the analysis modes.

## Generate a script

In Kinematic or Force mode, open **Export Data**, choose the parts and quantities, then select
**MATLAB Script (.m)** and press **Export**. Each selected mechanism gets its own script and time
column. More than two scripts arrive together in a ZIP archive.

The filename preview uses a `pmks_` prefix, letters, digits and underscores so MATLAB can run
the script. Long names are shortened while keeping the mechanism suffix distinct.

Run the whole script in MATLAB R2016b or newer. No toolbox or separate copy of
[PMKS_Verification](https://github.com/PMKS-Web/PMKS_Verification) is required. It contains:

- Full-precision PMKS reference samples and plots of the selected quantities. Labels include
  units; missing or singular solver values remain `NaN`.
- An editable experimental comparison: set `measured` to rows of `[time value]`, select
  `measurement_column` (index into `labels`), and set `time_offset` in seconds.
- An independent **kinematic** solver when the geometry is supported. It solves rigid-body
  constraints using Newton iteration, then solves velocity and acceleration using the constraint
  Jacobian. It uses the mechanism's initial geometry, not PMKS output positions or rates.

Independent kinematics supports a constant-speed, grounded revolute input, rigid bodies joined
by pins, and fixed guides with free-turning sliders. Compound bodies and tracer points belong
to their root rigid body. Floating slots, welded sliders, cylinders, slider inputs and reversing
inputs export reference results, plots and RMSE only; the drawer and script state that limit.
Singular or nonconvergent poses stop the independent solve with a warning and leave the remaining
samples as `NaN`. It does not choose a branch through a toggle. Force results are PMKS references,
not an independent MATLAB force solve.

Independent results live in `geometry`. `body_ids`, `joint_ids`, and `solved_frames` describe their
order and valid extent. Translations use the project length unit; independent angular quantities
use radians. Each body's rotation coordinate starts at zero; `geometry.link_angle` adds its
initial absolute orientation. Reference results retain the selected display units.

This follows the initialization, plots and RMSE organization in PMKS_Verification, including the
February 7, 2025 teaching-lab slider work. It does not copy sensor-specific paths, automatic
offsets, extrapolation or outlier filtering.

## Compare measurements in PMKS

Select a joint or link, expand its quantity, and press **Compare Measurements**. Select X, Y or
magnitude where offered. Paste two columns using commas, tabs or whitespace:

```text
Time,Value
0,1.25
0.1,1.32
0.2,1.47
```

Time is in seconds; the measured value uses the displayed unit. Match the drawing's origin,
axes, positive direction, and the chosen joint/body reaction convention. The header is optional.
Decimals use a period. Up to 10,000 rows are accepted; both numbers must be finite and times must
increase without duplicates.

Set **Time Offset (s)** to align the clocks:

`compared time = measured time + offset`

For example, an experiment starting at 12 seconds matches the mechanism's start pose with an
offset of −12 seconds. **Calculate RMSE** interpolates theoretical values linearly to those
times and shows the measured points over the theoretical curve. It reports RMSE, mean signed
error, peak absolute error, and compared/excluded counts. RMSE is
`sqrt(mean((measured − theoretical)^2))`, in the quantity's unit.

Out-of-range samples and gaps in the theoretical curve are excluded and counted. No samples are
extrapolated, no outliers are removed, and no automatic alignment or cycle repetition occurs.
Angular positions interpolate and compare by the shortest rotation; their overlay uses
equivalent angles on a continuous branch. Angular rates do not wrap.

Editing the data, component or offset removes the old result. A rebuilt mechanism or changed
analysis settings/units requires comparing again. Measured values are never silently converted.
Collapsing a quantity retains its input, but leaving the analysis panel or changing the selected
part may discard it. Measurements stay in this panel session: they are not saved in project
links or included automatically in an exported script.

## Verification

`measurement-comparison.spec.ts` tests interpolation, offsets, RMSE, missing samples, invalid
input and angular wrapping. `matlab-writer.spec.ts` checks exported numeric literals and
constraints against the teaching-lab four-bar and slider-crank pose histories, and checks scope
refusals for reversing six-bars. `e2e/matlab-measurements.mjs` checks downloads, overlays, known
RMSE, input refusals, stale results and phone layout.

These tests validate script generation and model data. Executing the generated `.m` file also
requires validation in a MATLAB runtime, which is not part of the app's test runner.
