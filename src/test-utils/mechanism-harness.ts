import { Injector, runInInjectionContext } from '@angular/core';
import { PrisJoint, RealJoint, RevJoint } from '../app/model/joint';
import { ActiveObjService } from '../app/services/active-obj.service';
import { ColorService } from '../app/services/color.service';
import { DragStateService } from '../app/services/drag-state.service';
import { GridUtilsService } from '../app/services/grid-utils.service';
import { MechanismService } from '../app/services/mechanism.service';
import { NotificationService } from '../app/services/notification.service';
import { NumberUnitParserService } from '../app/services/number-unit-parser.service';
import { SaveHistoryService } from '../app/services/save-history.service';
import { SelectedTabService } from '../app/selected-tab.service';
import { SettingsService } from '../app/services/settings.service';
import { SvgGridService } from '../app/services/svg-grid.service';
import { SynthesisBuilderService } from '../app/services/synthesis/synthesis-builder.service';
import { silentNotifications } from './notification-stub';

/**
 * A real `MechanismService` with its dependencies stubbed just enough to run
 * structural edits — welds, merges, deletions — without a DOM.
 *
 * Shared rather than copied per spec: the wiring below is what decides whether
 * a weld can happen at all, so two specs with two copies of it can disagree
 * about what they are testing while both stay green.
 */
export interface MechanismHarness {
  service: MechanismService;
  /** The harness's own injector, for specs that need a sibling service. */
  injector: Injector;
  active: ActiveObjService;
  /** The service's own settings, for specs that flip gravity or units. */
  settings: SettingsService;
  /**
   * How many undo entries the service has asked for.
   *
   * "One gesture, one entry" is an invariant Phase 1 established, and it is
   * also the only way to see the difference between an edit that was refused
   * and one that happened and was then undone by a reconcile.
   */
  saveCount: () => number;
}

export function createMechanismHarness(): MechanismHarness {
  if (!ColorService.instance) new ColorService();
  let saves = 0;
  // A real injector with every token listed explicitly: the services resolve
  // their dependencies with inject(), and a missing provider fails loudly at
  // the get() instead of a catch-all stub making a missing service look like a
  // working one until it is called.
  const history = {
    save: () => {
      saves += 1;
    },
  };
  const injector = Injector.create({
    providers: [
      { provide: SettingsService, deps: [] },
      { provide: NumberUnitParserService, deps: [] },
      { provide: ActiveObjService, deps: [] },
      { provide: DragStateService, deps: [] },
      { provide: SelectedTabService, deps: [] },
      { provide: NotificationService, useFactory: silentNotifications, deps: [] },
      { provide: SaveHistoryService, useValue: history },
      { provide: SynthesisBuilderService, deps: [] },
      { provide: SvgGridService, deps: [] },
      { provide: GridUtilsService, deps: [] },
      { provide: MechanismService, deps: [] },
    ],
  });
  const service = injector.get(MechanismService);
  return {
    service,
    injector,
    active: injector.get(ActiveObjService),
    settings: injector.get(SettingsService),
    saveCount: () => saves,
  };
}

/** Run `factory` with the harness-style injector active, for classes that inject(). */
export function withTestInjector<T>(
  providers: Parameters<typeof Injector.create>[0]['providers'],
  factory: () => T
): T {
  return runInInjectionContext(Injector.create({ providers }), factory);
}

/**
 * Fill in `links` and `connectedJoints` from link membership.
 *
 * Not optional bookkeeping: `canBeWelded` reads `links.length`, so a joint left
 * unwired declines every weld — and a test that welds nothing passes for
 * reasons that have nothing to do with what it claims to check.
 */
export function wireGraph(service: MechanismService): void {
  const real = service.joints.filter(
    (joint) => joint instanceof RevJoint || joint instanceof PrisJoint
  ) as RealJoint[];
  real.forEach((joint) => {
    joint.links = [];
    joint.connectedJoints = [];
  });
  service.links.forEach((link) => {
    link.joints.forEach((joint) => {
      (joint as RealJoint).links.push(link);
      link.joints.forEach((other) => {
        if (other.id !== joint.id) (joint as RealJoint).connectedJoints.push(other);
      });
    });
  });
}
