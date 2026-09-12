# Four-bar path synthesis benchmark

Equal settings and seeds; production-generated targets; dimensions withheld. RMS is paired geometric error in internal PMKS units. Success means verified and normalized RMS ≤ 2.5%. Missing fits are excluded from error quantiles and included as failures in rates.

## Aggregate

```json
{
  "equal": {
    "cases": 24,
    "successRate": 0.4166666666666667,
    "verifiedRate": 1,
    "medianNormalizedRms": 0.025753548710176887,
    "meanNormalizedRms": 0.021510439454793157,
    "p90NormalizedRms": 0.03381480545424304,
    "worstNormalizedRms": 0.03560798983018553,
    "medianRuntimeMs": 1344.5671999999904,
    "p90RuntimeMs": 2803.9446000000025,
    "medianEvaluations": 14568
  },
  "free": {
    "cases": 24,
    "successRate": 1,
    "verifiedRate": 1,
    "medianNormalizedRms": 0.0039041865448702848,
    "meanNormalizedRms": 0.004103063250370679,
    "p90NormalizedRms": 0.00832614150239401,
    "worstNormalizedRms": 0.01704860127987194,
    "medianRuntimeMs": 15199.64439999999,
    "p90RuntimeMs": 24925.99669999999,
    "medianEvaluations": 13936
  }
}
```

| Case | Equal RMS/L | Free RMS/L | Free reduction | Equal / free seconds | Verified equal / free |
| --- | ---: | ---: | ---: | ---: | --- |
| crank-rocker | 2.575% | 0.391% | 84.831% | 6.84 / 56.39 | true / true |
| clockwise | 2.575% | 0.390% | 84.840% | 2.80 / 20.88 | true / true |
| other-assembly | 2.393% | 0.318% | 86.706% | 1.27 / 16.02 | true / true |
| double-crank | 0.377% | 0.053% | 86.050% | 1.48 / 24.93 | true / true |
| long-ground | 3.240% | 0.379% | 88.293% | 1.49 / 17.31 | true / true |
| short-coupler | 3.349% | 0.433% | 87.061% | 2.13 / 18.36 | true / true |
| long-coupler | 2.981% | 0.345% | 88.440% | 1.48 / 21.37 | true / true |
| tracer-on-bar | 2.257% | 0.183% | 91.872% | 4.52 / 23.46 | true / true |
| tracer-far | 3.297% | 1.011% | 69.355% | 1.47 / 12.78 | true / true |
| beyond-b | 2.042% | 0.145% | 92.910% | 1.08 / 13.88 | true / true |
| beyond-c | 2.150% | 0.525% | 75.580% | 1.73 / 12.37 | true / true |
| high-offset | 3.561% | 0.833% | 76.617% | 1.26 / 12.81 | true / true |
| near-toggle | 3.075% | 1.705% | 44.552% | 1.19 / 10.03 | true / true |
| nonuniform-speed | 3.381% | 0.706% | 79.132% | 1.10 / 10.80 | true / true |
| compact | 3.488% | 0.600% | 82.798% | 0.98 / 12.11 | true / true |
| large-relative-path | 0.126% | 0.013% | 89.435% | 0.97 / 11.34 | true / true |
| open-half | 0.237% | 0.158% | 33.289% | 0.92 / 11.02 | true / true |
| open-clockwise | 0.179% | 0.079% | 56.099% | 1.01 / 12.72 | true / true |
| non-grashof | 0.025% | 0.009% | 62.600% | 1.16 / 15.20 | true / true |
| non-grashof-cw | 0.012% | 0.009% | 27.116% | 1.34 / 26.20 | true / true |
| translated | 2.575% | 0.391% | 84.831% | 1.74 / 15.95 | true / true |
| rotated | 2.565% | 0.389% | 84.826% | 1.11 / 12.03 | true / true |
| scaled-small | 2.575% | 0.391% | 84.831% | 1.06 / 20.71 | true / true |
| scaled-large | 2.588% | 0.392% | 84.835% | 2.10 / 13.76 | true / true |

## Interpretation

All 24 cases improved (smallest reduction: 27.1%, reversed finite non-Grashof sweep).
Mean normalized RMS fell by 80.9%. The two methods had 24/24 verified best results;
2 alternate finalists in each mode failed the unchanged PMKS verification gate and were excluded.
There were no geometric duplicates among the retained independent-run finalists in this run;
unit tests exercise the near-duplicate filter explicitly.

The largest remaining error was the safe near-toggle case (1.705% free versus 3.075% equal).
Partial paths already had small equal-angle error, so their absolute improvement was smaller.
This controlled gallery demonstrates improvement, not a guarantee for arbitrary targets or seeds.

The source timing oracle is diagnostic only. Mean normalized-progress RMS was 0.03955 for equal
and 0.03723 for free: improved curve geometry does not imply recovery of the original crank's
speed law when the optimizer finds a different linkage. The oracle is never passed to synthesis.

The first reference timing was inflated by concurrent compilation and regression tests. Later
browser validation at the standard 16,000 budget took about 18 seconds, including cooperative
yields. Runtime is measured on this machine; it is not a portable performance guarantee.
The table uses upper empirical quantiles and includes all failures in success/verification rates.

[Machine-readable results](path-timing.json) include settings, source validation, timing oracles,
per-case geometry/error/size/timing measurements, production discrepancies, rejected finalists,
and search/inner-solver costs. [Method and reproduction](../path-synthesis-backend.md#benchmark-methodology-and-reproduction).
