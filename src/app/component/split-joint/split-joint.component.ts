import {
  Component,
  ElementRef,
  OnDestroy,
  OnInit,
  afterNextRender,
  inject,
  input,
  signal,
} from '@angular/core';
import { MatCheckbox } from '@angular/material/checkbox';
import { PrisJoint, RealJoint } from '../../model/joint';
import { SplitJointPlan } from '../../model/split-joint';
import { SplitJointService } from '../../services/split-joint.service';
import { ButtonComponent } from '../BLOCKS/button/button.component';
import { SegmentedComponent } from '../BLOCKS/segmented/segmented.component';

/** Checking links is a draft; the named Separate actions commit one structural edit. */
@Component({
  selector: 'app-split-joint',
  templateUrl: './split-joint.component.html',
  styleUrl: './split-joint.component.scss',
  imports: [MatCheckbox, ButtonComponent, SegmentedComponent],
})
export class SplitJointComponent implements OnInit, OnDestroy {
  readonly joint = input.required<RealJoint>();
  protected readonly splits = inject(SplitJointService);
  private host = inject<ElementRef<HTMLElement>>(ElementRef);
  protected readonly picked = signal<string[]>([]);
  protected readonly mode = signal<'detach' | 'guide'>('detach');
  protected readonly connections = ['Attached Links', 'Slot Carrier'];

  constructor() {
    afterNextRender(() => {
      this.host.nativeElement.scrollIntoView({ block: 'nearest' });
      this.host.nativeElement
        .querySelector<HTMLElement>('input, button')
        ?.focus({ preventScroll: true });
    });
  }

  ngOnInit(): void {
    const bodies = this.splits.bodiesFor(this.joint());
    this.picked.set(bodies.length > 1 ? [bodies[bodies.length - 1].id] : []);
    if (bodies.length < 2 && this.splits.canDisconnectGuide(this.joint())) this.mode.set('guide');
  }

  ngOnDestroy(): void {
    this.splits.cancel();
  }

  protected get plan(): SplitJointPlan {
    return this.mode() === 'detach' ? { kind: 'detach', links: this.picked() } : { kind: 'guide' };
  }

  protected get refusal(): string | undefined {
    return this.splits.refusalFor(this.joint(), this.plan);
  }

  protected get isSlider(): boolean {
    return this.joint() instanceof PrisJoint;
  }

  protected pick(id: string, checked: boolean): void {
    this.mode.set('detach');
    this.picked.update((current) =>
      checked ? [...current, id] : current.filter((one) => one !== id)
    );
  }

  protected apply(): void {
    this.splits.split(this.joint(), this.plan);
  }

  protected separateAll(): void {
    this.splits.split(this.joint(), { kind: 'all' });
  }
}
