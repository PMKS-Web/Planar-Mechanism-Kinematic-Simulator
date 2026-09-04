// Unit enums live in their own module (re-exported by utils.ts) so that
// SettingsService can import them without pulling in the rest of utils.ts,
// which reaches Joint/Link/NewGridComponent and would otherwise close a
// module cycle through coord.ts that breaks class initialization.
export enum LengthUnit {
  INCH = 0,
  CM = 1,
  METER = 2,
  NULL = 3,
}

export enum AngleUnit {
  DEGREE = 10,
  RADIAN = 11,
  NULL = 12,
}

export enum ForceUnit {
  LBF = 20,
  NEWTON = 21,
  NULL = 22,
  /**
   * A metric *display* unit, appended rather than ordered beside NEWTON: the
   * URL codec writes an enum as its key's index, so anything inserted ahead of
   * NULL renames the value every circulating link already carries.
   *
   * Storage stays lbf under English and newtons otherwise -- what the solver's
   * unit factors and every URL are written against -- so this unit, like
   * InertiaUnit.G_CM2, exists only at the input/label boundary.
   */
  KGF = 23,
}

// Mass and inertia are shown in whichever unit pairs with the current length
// unit, so these mirror LengthUnit's inch/cm/meter ordering.
export enum MassUnit {
  LBM = 40,
  GRAM = 41,
  KG = 42,
  NULL = 43,
}

export enum InertiaUnit {
  LBM_IN2 = 50,
  KG_CM2 = 51,
  KG_M2 = 52,
  NULL = 53,
  /**
   * The metric *display* unit: g pairs with g·cm², where g beside kg·cm² read
   * as two different systems in one panel. Storage stays KG_CM2 — the solver's
   * unit factors and every URL in circulation are written against it — so this
   * unit exists only at the input/label boundary.
   */
  G_CM2 = 54,
}

export enum TimeUnit {
  MILLISECOND = 70,
  SECOND = 71,
  MINUTE = 72,
  NULL = 73,
}

export enum AngularVelocityUnit {
  RPM = 60,
  DEG_PER_SEC = 61,
  RAD_PER_SEC = 62,
  NULL = 63,
}

export enum GlobalUnit {
  ENGLISH = 30,
  METRIC = 31,
  SI = 32,
  NULL = 33,
}
