import { BodyDocument } from './body-document';
import { Point } from './body-frame';

/** Marker length scales with framing so a unit change cannot shrink joint marks on the saved view. */
export function scaleBodyProject(
  document: BodyDocument,
  length: number
): Pick<BodyDocument, 'settings' | 'view' | 'synthesis'> {
  const point = <T extends Point>(value: T): T => ({
    ...value,
    x: value.x * length,
    y: value.y * length,
  });
  return {
    settings: {
      ...document.settings,
      objectScale: document.settings.objectScale * length,
      defaultDrive: {
        ...document.settings.defaultDrive,
        linear: document.settings.defaultDrive.linear * length,
      },
    },
    ...(document.synthesis
      ? {
          synthesis: {
            ...document.synthesis,
            length: document.synthesis.length * length,
            poses: document.synthesis.poses.map(point),
            region: {
              ...point(document.synthesis.region),
              width: document.synthesis.region.width * length,
              height: document.synthesis.region.height * length,
            },
            generated: {
              ...document.synthesis.generated,
              attachments: document.synthesis.generated.attachments.map((item) => ({
                ...item,
                at: point(item.at),
              })),
            },
          },
        }
      : {}),
    ...(document.view
      ? {
          view: {
            ...document.view,
            ...(document.view.camera
              ? {
                  camera: {
                    center: point(document.view.camera.center),
                    span: document.view.camera.span * length,
                  },
                }
              : {}),
            ...(document.view.backdrop
              ? {
                  backdrop: {
                    ...document.view.backdrop,
                    center: point(document.view.backdrop.center),
                    width: document.view.backdrop.width * length,
                  },
                }
              : {}),
          },
        }
      : {}),
  };
}
