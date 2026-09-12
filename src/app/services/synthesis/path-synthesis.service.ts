import { Injectable, inject, signal } from '@angular/core';
import { SynthesisBuilderService } from './synthesis-builder.service';
import { MechanismService } from '../mechanism.service';
import { EditPermissionService } from '../edit-permission.service';
import { SelectedTabService, TabID } from '../../selected-tab.service';
import {
  CorrespondenceMode,
  DEFAULT_FREE_TIMING_SETTINGS,
  DEFAULT_PATH_SETTINGS,
  PathSynthesisResult,
} from '../../model/synthesis/path-types';
import { searchPath } from '../../model/synthesis/path-engine';
import { preparePath } from '../../model/synthesis/path-target';
import { pathMechanism, validatePathResult } from '../../model/synthesis/pmks-path-adapter';
import { LoadingService } from '../loading.service';
import { evaluateFourBar, fourBarPose } from '../../model/synthesis/four-bar';

/** Owns transient numerical results; only targets and created normal mechanisms enter history. */
@Injectable({ providedIn: 'root' })
export class PathSynthesisService {
  private design = inject(SynthesisBuilderService);
  private mechanism = inject(MechanismService);
  private permission = inject(EditPermissionService);
  private tabs = inject(SelectedTabService);
  private loading = inject(LoadingService);
  readonly busy = signal(false);
  readonly evaluations = signal(0);
  readonly message = signal('');
  readonly correspondence = signal<CorrespondenceMode>('monotone-free-timing');
  setCorrespondence(mode: CorrespondenceMode): void {
    if (mode === this.correspondence()) return;
    if (this.busy()) this.cancel();
    this.correspondence.set(mode);
  }
  get timingSummary(): string {
    const result = this.result,
      p = result?.best?.parameters;
    return p
      ? `Fitted sweep: ${((p.sweep * 180) / Math.PI).toFixed(1)}° ${p.direction}. ${result!.rankedCandidates?.length ?? 1} distinct verified candidates.`
      : '';
  }
  private curveCandidate?: PathSynthesisResult['best'];
  private previewCurve: { x: number; y: number }[] = [];
  get generatedTrajectory() {
    const candidate = this.candidate;
    if (candidate !== this.curveCandidate) {
      this.curveCandidate = candidate;
      const evaluated =
        candidate && evaluateFourBar(candidate.parameters, 513, !!this.result?.target?.closed);
      this.previewCurve = evaluated && evaluated.valid ? evaluated.poses.map((pose) => pose.P) : [];
    }
    return this.previewCurve;
  }
  private generation = 0;
  private resultKey = '';
  private solved?: PathSynthesisResult;
  private created = false;
  private refusalKey = '';
  private targetRefusal = '';

  private key(): string {
    const path = this.design.path;
    return JSON.stringify([
      this.correspondence(),
      path.closed,
      path.smooth,
      path.points.map((p) => [p.x, p.y]),
    ]);
  }

  private target() {
    return {
      points: this.design.path.points.map((p) => ({ x: p.x, y: p.y })),
      closed: this.design.path.closed,
      interpolation: this.design.path.smooth ? ('catmull-rom' as const) : ('polyline' as const),
    };
  }

  get result(): PathSynthesisResult | undefined {
    return this.resultKey === this.key() ? this.solved : undefined;
  }
  get candidate() {
    return this.result?.best;
  }
  get statusMessage(): string {
    return this.solved && this.resultKey !== this.key()
      ? 'The target or path timing changed. Synthesize again to update the fit.'
      : this.message();
  }
  get startPose() {
    const p = this.candidate?.parameters;
    if (!p) return undefined;
    const pose = fourBarPose(p, p.theta0);
    return typeof pose === 'string' ? undefined : pose;
  }

  get refusal(): string {
    if (this.busy()) return 'A four-bar search is running. Cancel it before starting another.';
    const key = this.key();
    if (key !== this.refusalKey) {
      const prepared = preparePath(this.target(), DEFAULT_PATH_SETTINGS.sampleCount);
      this.targetRefusal = prepared.valid ? '' : prepared.message;
      this.refusalKey = key;
    }
    return this.targetRefusal;
  }

  get createRefusal(): string {
    if (!this.candidate || this.candidate.production.status !== 'passed')
      return 'Synthesize a verified four-bar before creating it.';
    if (this.created)
      return 'The mechanism was created. Use Edit to inspect it, or run a new search.';
    return this.permission.poseRefusal('build')?.long ?? '';
  }

  cancel = (): void => {
    this.generation++;
    this.message.set('Search cancelled.');
  };

  synthesize = (): void => {
    void this.run();
  };

  private async run(): Promise<void> {
    if (this.refusal) return;
    const generation = ++this.generation,
      key = this.key();
    this.resultKey = key;
    this.solved = undefined;
    this.created = false;
    this.busy.set(true);
    this.message.set('Searching for a four-bar…');
    this.evaluations.set(0);
    const cancelled = () => generation !== this.generation || key !== this.key();
    const run = searchPath(
      {
        family: 'four-bar',
        target: this.target(),
        correspondence: { kind: this.correspondence() },
        direction: 'either',
        settings: {
          ...(this.correspondence() === 'monotone-free-timing'
            ? DEFAULT_FREE_TIMING_SETTINGS
            : DEFAULT_PATH_SETTINGS),
        },
      },
      { cancelled }
    );
    try {
      let step = run.next();
      while (!step.done) {
        this.evaluations.set(step.value.evaluations);
        // Bound each work slice; timers let pointer events, cancellation, and painting run.
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
        const until = performance.now() + 12;
        do {
          step = run.next();
        } while (!step.done && performance.now() < until);
      }
      if (cancelled()) {
        this.message.set('Search cancelled because the target changed or Cancel was pressed.');
        return;
      }
      this.message.set('Verifying the candidate with PMKS…');
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      if (cancelled()) return;
      this.solved = validatePathResult(step.value);
      this.evaluations.set(this.solved.diagnostics.evaluations);
      const candidate = this.solved.best;
      this.message.set(
        candidate
          ? candidate.errors.normalizedRms <= DEFAULT_PATH_SETTINGS.acceptableNormalizedRms
            ? 'Four-bar found and verified with PMKS.'
            : 'Search limit reached. The best verified four-bar is shown; its fit needs improvement.'
          : this.solved.status === 'production-validation-failed'
            ? 'The candidates did not pass PMKS verification. Try another target shape.'
            : 'No feasible four-bar was found within the search budget. Try another target shape.'
      );
    } catch {
      this.message.set('The search could not finish. The target path is still available to edit.');
    } finally {
      this.busy.set(false);
    }
  }

  create = (): void => {
    if (this.createRefusal) return;
    const candidate = this.candidate!,
      key = this.key();
    // Reserve immediately so repeated presses cannot queue duplicate insertion.
    this.created = true;
    void this.loading
      .during('Creating the synthesized four-bar…', () => {
        if (key !== this.key() || this.permission.poseRefusal('build')) {
          this.created = false;
          return;
        }
        const ids: string[] = [];
        for (let i = 0; i < 5; i++) ids.push(this.mechanism.determineNextLetter(ids));
        const entities = pathMechanism(candidate.parameters, ids);
        this.mechanism.rewindToStart();
        this.mechanism.mergeToJoints(entities.joints);
        this.mechanism.mergeToLinks(entities.links);
        this.mechanism.updateMechanism(true);
        this.tabs.setTab(TabID.EDIT);
      })
      .catch(() => {
        this.created = false;
        this.message.set('The mechanism could not be created.');
      });
  };
}
