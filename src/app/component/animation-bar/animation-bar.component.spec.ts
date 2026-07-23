import { BehaviorSubject } from 'rxjs';
import { SettingsService } from '../../services/settings.service';
import { AnimationBarComponent } from './animation-bar.component';

describe('AnimationBarComponent timestamps', () => {
  it('displays and seeks using mechanism time instead of a fixed sample rate', () => {
    const position = new BehaviorSubject(0);
    const animate = vi.fn();
    const mechanismService = {
      mechanisms: [{ timeNum: [0, 0.2, 0.55], joints: [[], [], []] }],
      mechanismTimeStep: 0,
      onMechPositionChange: position,
      animate,
    } as any;
    const settings = new SettingsService();
    const component = new AnimationBarComponent({} as any, mechanismService, settings);
    AnimationBarComponent.animate = false;
    component.ngOnInit();

    position.next(1);
    expect(component.timestepDisplay).toBe(0.2);
    expect(component.maxTime()).toBe(0.55);
    expect(component.nearestTimeStep(0.5)).toBe(2);

    const form = { value: { timestep: 0.5 } };
    component.onNewTimeSubmit(form);
    expect(animate).toHaveBeenCalledWith(2, false);
    expect(form.value.timestep).toBe(0.5);
  });
});
