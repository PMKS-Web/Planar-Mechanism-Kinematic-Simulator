import type { Provider } from '@angular/core';
import { Subject } from 'rxjs';
import type { EditRefusal } from '../../app/model/edit-permission';
import type { LinkHold, RealLink } from '../../app/model/link';
import { ActiveObjService } from '../../app/services/active-obj.service';
import { EditPermissionService } from '../../app/services/edit-permission.service';
import { GridUtilsService } from '../../app/services/grid-utils.service';
import {
  KeyboardShortcutsService,
  ShortcutId,
} from '../../app/services/keyboard-shortcuts.service';
import { MechanismService } from '../../app/services/mechanism.service';
import { SettingsService } from '../../app/services/settings.service';
import { SelectedTabService } from '../../app/selected-tab.service';

/**
 * The few members of `MechanismService` a block reaches for, and none of what
 * the real one would do with them.
 *
 * A story must never construct the real service: it owns the drawing, the
 * solvers and the undo history, and a gallery that builds one is testing the
 * app rather than showing a block. Each member here is named after the call a
 * block's source actually makes -- `color-picker`, `editable-title-block`,
 * `hold-field-block` and the two banners between them.
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
      pauseInPlace: () => undefined,
      easeToStart: () => undefined,
    },
  };
}

/** `hold-field-block` and `app-lock-banner` ask which joints a Lock mark is holding. */
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

/** `app-lock-banner` asks whether a link is selected, and which one. */
export function linkSelectionStub(link: RealLink): Provider {
  return {
    provide: ActiveObjService,
    useValue: { objType: 'Link', selectedLink: link, getSelectedObj: () => link },
  };
}

/** `app-edit-banner` asks the permission model what to say; a story says it instead. */
export function editPermissionStub(banner: EditRefusal | null = null): Provider {
  return {
    provide: EditPermissionService,
    useValue: { editingBanner: () => banner },
  };
}

/** The banner's way out stops playback; here there is none to stop. */
export function settingsStub(): Provider {
  return {
    provide: SettingsService,
    useValue: { animating: { next: () => undefined } },
  };
}

export function tabsStub(): Provider {
  return {
    provide: SelectedTabService,
    useValue: { setTab: () => undefined },
  };
}

/**
 * The shortcut registry, as the tip directive and the context menu see it:
 * the keys a shortcut is written as, and a stream of presses that never fires.
 */
export function shortcutsStub(keys = ''): Provider {
  return {
    provide: KeyboardShortcutsService,
    useValue: {
      keysFor: () => keys,
      tip: (name: string) => (keys ? `${name} (${keys})` : name),
      pressed: new Subject<ShortcutId>(),
    },
  };
}
