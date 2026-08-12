import { BehaviorSubject } from 'rxjs';
import { SettingsService } from '../../services/settings.service';
import { MechanismService } from '../../services/mechanism.service';
import { NumberUnitParserService } from '../../services/number-unit-parser.service';
import { AnimationBarComponent } from './animation-bar.component';

describe('AnimationBarComponent timestamps', () => {
  function makeComponent(mechanismTimeStep = 0) {
    const position = new BehaviorSubject(0);
    const animate = vi.fn();
    // Real prototype over stub data: the component delegates its time lookups to the
    // service, so the service's own lookup logic has to run for these to mean anything.
    const mechanismService = Object.assign(Object.create(MechanismService.prototype), {
      // isMechanismValid, because the shared clock now follows the longest
      // *running* cycle: with several machines in a drawing, one that cannot
      // solve must not be the thing the scrubber is measured against.
      mechanisms: [
        {
          timeNum: [0, 0.2, 0.55],
          joints: [[], [], []],
          cyclePeriod: 0.55,
          isMechanismValid: () => true,
        },
      ],
      mechanismTimeStep,
      onMechPositionChange: position,
      animate,
    }) as any;
    const component = new AnimationBarComponent(
      mechanismService,
      new SettingsService(),
      new NumberUnitParserService()
    );
    AnimationBarComponent.animate = false;
    component.ngOnInit();
    return { component, position, animate, mechanismService };
  }

  it('displays and seeks using mechanism time instead of a fixed sample rate', () => {
    const { component, position, mechanismService } = makeComponent();

    // animate() sets the step before announcing it, and the component reads the
    // drawn time back off the service rather than trusting the emitted index.
    mechanismService.mechanismTimeStep = 1;
    position.next(1);
    // The value carries its own unit, like every other input.
    expect(component.timestepDisplay).toBe('0.20 s');
    expect(component.maxTime()).toBe(0.55);
    expect(component.nearestTimeStep(0.5)).toBe(2);
  });

  it('parses a unit-bearing time entry and snaps to the nearest step', () => {
    const { component, animate, mechanismService } = makeComponent();

    component.timestepDisplay = '0.5 s';
    mechanismService.mechanismTimeStep = 2;
    component.onNewTimeSubmit();

    expect(animate).toHaveBeenCalledWith(2, false);
    // The field is rewritten with the resolved value the mechanism landed on.
    expect(component.timestepDisplay).toBe('0.55 s');
  });

  it('clamps an out-of-range entry back into the motion window', () => {
    const { component, animate } = makeComponent();

    component.timestepDisplay = '9 s';
    component.onNewTimeSubmit();
    expect(animate).toHaveBeenCalledWith(2, false);

    component.timestepDisplay = '-4 s';
    component.onNewTimeSubmit();
    expect(animate).toHaveBeenLastCalledWith(0, false);
  });
});
