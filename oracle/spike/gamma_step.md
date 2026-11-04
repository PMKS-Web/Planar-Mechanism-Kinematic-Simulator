# How gamma is differenced (measured 2026-11-03)

Norton four-bar at theta2 = 40 deg, omega2 = 25, alpha2 = 15. Error in alpha3 and alpha4 against the
closed form (`benchmarks/derivations/closed_form_kinematics.py`), with the step moving the mechanism
`scale * length_scale` along q', and two Richardson levels.

| scale | second difference of Phi(q) | first difference of Exudyn's velocity-level Phi_q q' |
| --- | --- | --- |
| 1e-1 | 1.0e-8, 8.3e-9 | **4.3e-12, 7.2e-12** |
| 1e-2 | 3.3e-6, 5.2e-6 | 6.5e-11, 1.1e-10 |
| 1e-3 | 1.9e-4, 4.5e-4 | 1.5e-9, 2.6e-10 |
| 1e-4 | 1.7e-3, 4.0e-3 | 7.3e-9, 1.1e-8 |

Rounding dominates as the step shrinks, and a first difference loses only one power of h to it
where a second loses two. The oracle uses the velocity-level first difference at scale 0.1.

Also found: `ComputeJacobianAE` and `ComputeMassMatrix` add into the solver's stored matrix rather
than overwriting it, so `exudyn_model.py` zeroes both before every call.
