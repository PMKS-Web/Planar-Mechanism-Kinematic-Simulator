import { Coord } from 'src/app/model/coord';

/** Which point on the end-effector link its coordinates describe. */
export enum COR {
  BACK = 'BACK',
  CENTER = 'CENTER',
  FRONT = 'FRONT',
}

/**
 * One position of the end-effector link.
 *
 * A position is a point and an angle; where the link's two ends land follows
 * from those plus the length and the reference point, both of which belong to
 * the design as a whole rather than to any one position. They are read through
 * callbacks so that changing either moves all three positions at once, which
 * is what a reader means by "the link is 6 cm long".
 */
export class SynthesisPose {
  private _posBack: Coord;
  private _posFront: Coord;

  constructor(
    public id: number,
    private _position: Coord,
    private _thetaRadians: number,
    private getCOR: () => COR,
    private getLength: () => number
  ) {
    this._posBack = new Coord(0, 0);
    this._posFront = new Coord(0, 0);
    this._thetaRadians %= Math.PI * 2;
    this.recompute();
  }

  get position(): Coord {
    return this._position;
  }

  set position(position: Coord) {
    this._position = position;
    this.recompute();
  }

  get thetaRadians(): number {
    return this._thetaRadians;
  }

  set thetaRadians(thetaRadians: number) {
    this._thetaRadians = thetaRadians;
    this.recompute();
  }

  get thetaDegrees(): number {
    return (this._thetaRadians * 180) / Math.PI;
  }

  set thetaDegrees(thetaDegrees: number) {
    this._thetaRadians = ((thetaDegrees % 360) * Math.PI) / 180;
    this.recompute();
  }

  get posBack(): Coord {
    return this._posBack;
  }

  get posFront(): Coord {
    return this._posFront;
  }

  /** Where the link's two ends are, given where this position is measured from. */
  recompute(): void {
    const half = this.getLength() / 2;
    const dx = Math.cos(this.thetaRadians) * half;
    const dy = Math.sin(this.thetaRadians) * half;

    if (this.getCOR() === COR.BACK) {
      this._posBack = new Coord(this.position.x, this.position.y);
      this._posFront = new Coord(this.position.x + dx * 2, this.position.y + dy * 2);
    } else if (this.getCOR() === COR.CENTER) {
      this._posBack = new Coord(this.position.x - dx, this.position.y - dy);
      this._posFront = new Coord(this.position.x + dx, this.position.y + dy);
    } else {
      this._posBack = new Coord(this.position.x - dx * 2, this.position.y - dy * 2);
      this._posFront = new Coord(this.position.x, this.position.y);
    }
  }
}
