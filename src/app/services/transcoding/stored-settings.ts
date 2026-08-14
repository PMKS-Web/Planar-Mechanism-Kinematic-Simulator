// Define all the settings attributes to be encoded and decoded

export enum EnumSetting {
  LENGTH_UNIT,
  ANGLE_UNIT,
  FORCE_UNIT,
  GLOBAL_UNIT,
}

export enum IntSetting {
  INPUT_SPEED,
  TIMESTEP,
}

export enum DecimalSetting {
  SCALE,
  /**
   * A driven prismatic joint's speed, in user length units per second.
   *
   * Appended, so URLs written before it decode with the token missing; the
   * decoder leaves those at zero and the builder reads zero as "this URL
   * predates the setting" and keeps the default. Zero is safe to spend that
   * way because a drive that does not move is not a speed anyone chose — the
   * panel refuses it.
   */
  LINEAR_INPUT_SPEED,
}

export enum BoolSetting {
  IS_INPUT_CW,
  /**
   * Dead slot. Written in an early era, then ignored once gravity was
   * hardcoded on, so the bit in circulating URLs carries whatever that era
   * wrote. Gravity lives in GRAVITY_OFF below — do not revive this slot, and
   * do not reorder it away: the flags are packed by position.
   */
  IS_GRAVITY,
  ANIMATING,
  IS_SHOW_MAJOR_GRID,
  IS_SHOW_MINOR_GRID,
  IS_SHOW_ID,
  IS_SHOW_COM,
  IS_FORCES,
  /**
   * Appended, and inverted on purpose: every URL written before this flag
   * existed unpacks it as false, and false has to keep meaning what those URLs
   * have always meant — gravity on. Turning gravity *off* is the choice worth
   * recording.
   */
  GRAVITY_OFF,
}
