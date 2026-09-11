import { boolean, finite, id, list, literal, object, point, pose, text } from './shape';

export const settings = object({
  angleUnit: literal('deg', 'rad'),
  forceUnit: literal('N', 'kgf', 'lbf'),
  gravity: boolean,
  forceAnalysis: literal('static', 'dynamic'),
  showMajorGrid: boolean,
  showMinorGrid: boolean,
  showIds: boolean,
  objectScale: finite,
  defaultDrive: object({ angular: finite, linear: finite }),
});
export const synthesis = object({
  stage: literal('chooser', 'working'),
  length: finite,
  reference: literal('back', 'center', 'front'),
  endsOnly: boolean,
  allowDefect: boolean,
  constrain: boolean,
  poses: list(pose, 3),
  region: object({ x: finite, y: finite, width: finite, height: finite }),
  generated: object({
    bodies: list(id),
    joints: list(id),
    attachments: list(object({ id, at: point })),
    partial: boolean,
  }),
});
export const view = object(
  {},
  {
    camera: object({ center: point, span: finite }),
    backdrop: object({
      asset: text(256),
      label: text(),
      center: point,
      width: finite,
      angle: finite,
      opacity: finite,
    }),
  }
);
