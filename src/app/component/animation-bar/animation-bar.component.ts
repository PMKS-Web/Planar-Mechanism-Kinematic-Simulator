import {
  AfterViewInit,
  Component,
  OnDestroy,
  OnInit,
  ChangeDetectionStrategy,
} from '@angular/core';
// import {switchMapTo} from "rxjs";
import { MechanismService } from '../../services/mechanism.service';
import { SettingsService } from '../../services/settings.service';
import { NumberUnitParserService } from '../../services/number-unit-parser.service';
import { TimeUnit } from '../../model/utils';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-animation-bar',
  templateUrl: './animation-bar.component.html',
  styleUrls: ['./animation-bar.component.scss'],
  changeDetection: ChangeDetectionStrategy.Eager,
  standalone: false,
})
export class AnimationBarComponent implements OnInit, AfterViewInit, OnDestroy {
  userIsDragging: boolean = false;

  wasAnimating: boolean = false;

  static animate: boolean = false;

  static playButton: HTMLInputElement;
  static pauseButton: HTMLInputElement;
  static slider: HTMLInputElement;
  static sliderContainer: HTMLInputElement;
  static adjustAnimation: boolean;

  timestepDisplay: string = this.formatTime(0);
  private positionSub?: Subscription;

  constructor(
    public mechanismService: MechanismService,
    public settingsService: SettingsService,
    private nup: NumberUnitParserService
  ) {}

  ngOnInit(): void {
    //Subscribte to the emitter inside mechanismStateService
    this.positionSub = this.mechanismService.onMechPositionChange.subscribe((v) => {
      this.timestepDisplay = this.formatTime(this.timeAtStep(v));
    });
  }

  private formatTime(seconds: number): string {
    return this.nup.formatValueAndUnit(seconds, TimeUnit.SECOND);
  }

  // The bar is created and destroyed each time the Analyze tab opens.
  ngOnDestroy(): void {
    this.positionSub?.unsubscribe();
  }

  ngAfterViewInit() {
    AnimationBarComponent.playButton = <HTMLInputElement>document.getElementById('playBtn');
    AnimationBarComponent.pauseButton = <HTMLInputElement>document.getElementById('pauseBtn');
    AnimationBarComponent.slider = <HTMLInputElement>document.getElementById('slider');
    AnimationBarComponent.sliderContainer = <HTMLInputElement>(
      document.getElementById('sliderContainer')
    );
  }

  onNewTimeSubmit() {
    const [success, requested] = this.nup.parseTimeString(this.timestepDisplay, TimeUnit.SECOND);
    const clamped = Math.min(Math.max(success ? requested : 0, 0), this.maxTime());
    this.mechanismService.animate(this.nearestTimeStep(clamped), AnimationBarComponent.animate);

    if (this.mechanismService.mechanismTimeStep !== 0) {
      this.settingsService.animating.next(true);
    } else {
      this.settingsService.animating.next(false);
    }
    // Re-show the resolved, unit-formatted value the mechanism actually landed on.
    this.timestepDisplay = this.formatTime(
      this.timeAtStep(this.mechanismService.mechanismTimeStep)
    );
  }

  maxTimeSteps() {
    if (this.mechanismService.mechanisms.length === 0) {
      return 0;
    } else {
      return this.mechanismService.mechanisms[0].joints.length - 1;
    }
  }

  maxTime(): number {
    const times = this.mechanismService.mechanisms[0]?.timeNum ?? [];
    return times[times.length - 1] ?? 0;
  }

  timeAtStep(index: number): number {
    return this.mechanismService.mechanisms[0]?.timeNum[index] ?? 0;
  }

  nearestTimeStep(timeSeconds: number): number {
    const times = this.mechanismService.mechanisms[0]?.timeNum ?? [];
    if (times.length === 0) return 0;
    let nearest = 0;
    for (let index = 1; index < times.length; index++) {
      if (Math.abs(times[index] - timeSeconds) < Math.abs(times[nearest] - timeSeconds)) {
        nearest = index;
      }
    }
    return nearest;
  }

  // onDirectionChange() {
  //   AnimationBarComponent.direction = AnimationBarComponent.direction === 'ccw' ? 'cw' : 'ccw';
  //   ToolbarComponent.clockwise = AnimationBarComponent.direction === 'cw';
  //   this.mechanismService.updateMechanism();
  // }
  //
  // getDirection() {
  //   return AnimationBarComponent.direction;
  // }
  //
  // onSpeedChange() {
  //   switch (AnimationBarComponent.speed) {
  //     case 'slow':
  //       AnimationBarComponent.speed = 'medium';
  //       this.mechanismService.mechanismAnimationIncrement = 2;
  //       break;
  //     case 'medium':
  //       AnimationBarComponent.speed = 'fast';
  //       this.mechanismService.mechanismAnimationIncrement = 3;
  //       break;
  //     case 'fast':
  //       AnimationBarComponent.speed = 'slow';
  //       this.mechanismService.mechanismAnimationIncrement = 1;
  //       break;
  //   }
  // }

  startAnimation(state: string) {
    // console.log('startAnimation ' + state);
    switch (state) {
      case 'pause':
        AnimationBarComponent.animate = false;
        this.mechanismService.animate(
          this.mechanismService.mechanismTimeStep,
          AnimationBarComponent.animate
        );
        break;
      case 'play':
        AnimationBarComponent.animate = true;
        this.mechanismService.animate(
          this.mechanismService.mechanismTimeStep,
          AnimationBarComponent.animate
        );
        break;
    }
    if (this.mechanismService.mechanismTimeStep !== 0) {
      this.settingsService.animating.next(true);
    } else {
      this.settingsService.animating.next(false);
    }
  }

  invalidMechanism() {
    return !this.mechanismService.oneValidMechanismExists();
  }

  handleSpeedChange() {
    //Switch from 1 -> 2 -> 4 -> 1
    this.mechanismService.mechanismAnimationIncrement =
      (this.mechanismService.mechanismAnimationIncrement % 4) + 1;
    if (this.mechanismService.mechanismAnimationIncrement === 3)
      this.mechanismService.mechanismAnimationIncrement++;
  }

  sliderDown() {
    // console.log('slider down');
    this.userIsDragging = true;
    this.wasAnimating = AnimationBarComponent.animate;
    this.startAnimation('pause');
    setTimeout(() => {
      this.sliderChange();
    }, 0);
  }

  sliderUp() {
    // console.log('slider up');
    this.userIsDragging = false;
    if (this.wasAnimating) this.startAnimation('play');
  }

  sliderChange() {
    if (this.userIsDragging) {
      // console.log('real slider change');
      this.mechanismService.animate(
        Number(AnimationBarComponent.slider.value),
        AnimationBarComponent.animate
      );
    }
    if (this.mechanismService.mechanismTimeStep !== 0) {
      this.settingsService.animating.next(true);
    } else {
      this.settingsService.animating.next(false);
    }
  }

  getStaticAnimating() {
    return AnimationBarComponent.animate;
  }
}
