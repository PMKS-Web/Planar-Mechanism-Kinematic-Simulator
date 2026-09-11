import type { Provider } from '@angular/core';
import type { LinkHold } from '../../app/model/link';
import { ActiveObjService } from '../../app/services/active-obj.service';
import { GridUtilsService } from '../../app/services/grid-utils.service';
import { MechanismService } from '../../app/services/mechanism.service';

/**
 * The few members of `MechanismService` a block reaches for, and none of what
 * the real one would do with them.
 *
 * A story must never construct the real service: it owns the drawing, the
 * solvers and the undo history, and a gallery that builds one is testing the
 * app rather than showing a block. Each member here is named after the call a
 * block's source actually makes -- `color-picker`, `editable-title-block` and
 * `hold-field-block` between them.
 */
export function mechanismStub(hold: LinkHold = undefined): Provider {
  let current = hold;
  return {
    provide: MechanismService,
    useValue: {
      joints: [],
      links: [],
      forces: [],
      updateMechanism: () => undefined,
      isLockedTarget: () => false,
      toggleLock: () => undefined,
      holdOf: () => current,
      setHold: (_link: unknown, next: LinkHold) => {
        current = next;
      },
      cylinderOfLink: () => undefined,
    },
  };
}

/** `hold-field-block` asks which joints a Lock mark is holding. */
export function gridUtilsStub(frozenJointIds: string[] = []): Provider {
  return {
    provide: GridUtilsService,
    useValue: { frozenJointIds: () => new Set(frozenJointIds) },
  };
}

/** `editable-title-block` reads and renames the selected object. */
export function selectionStub(name: string): Provider {
  const selected = { name };
  return {
    provide: ActiveObjService,
    useValue: { getSelectedObj: () => selected },
  };
}
