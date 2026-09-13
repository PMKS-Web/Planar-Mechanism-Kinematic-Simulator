import { ChangeDetectionStrategy, Component, DoCheck, OnDestroy, inject } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { validateGearAssembly } from '../../model/mechanism/gear-validation';
import { gearBodyFor } from '../../model/mechanism/gear-drive';
import { Gear, gearPitchRadius, gearPlane } from '../../model/gear';
import { RealLink } from '../../model/link';
import { RealJoint } from '../../model/joint';
import { MODEL_SCALE } from '../../model/render-scale';
import { MechanismService } from '../../services/mechanism.service';
import { ActiveObjService } from '../../services/active-obj.service';
import { GearEditorService } from '../../services/gear-editor.service';
import { PanelSectionComponent } from '../BLOCKS/panel-section/panel-section.component';
import { TitleBlock } from '../BLOCKS/title/title.component';
import { InputComponent } from '../BLOCKS/input/input.component';
import { ButtonComponent } from '../BLOCKS/button/button.component';
import { EditBannerComponent } from '../edit-panel/edit-banner.component';
import { GearFieldsComponent } from './gear-fields.component';
import { GearShaftChoicesComponent } from './gear-shaft-choices.component';
import { GearMeshSummaryComponent } from './gear-mesh-summary.component';
import { SettingsService } from '../../services/settings.service';
import { NumberUnitParserService } from '../../services/number-unit-parser.service';

@Component({
  selector: 'app-gear-panel',
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [
    ReactiveFormsModule,
    PanelSectionComponent,
    TitleBlock,
    InputComponent,
    ButtonComponent,
    EditBannerComponent,
    GearFieldsComponent,
    GearShaftChoicesComponent,
    GearMeshSummaryComponent,
  ],
  template: `
    <panel-section [frozen]="!!editor.refusal()">
      <title-block>{{ mesh ? 'Gear Mesh' : 'Gear' }}</title-block>
      @if (editor.refusal()) {
        <app-edit-banner panelAttached />
      }
      <div class="gearFields">
        @if (gear; as g) {
          <app-gear-fields [form]="form" [unit]="unit" />
          <p>Module: {{ number(g.module / scale) }} · Host: {{ g.hostLinkId }}</p>
          <p>Gears mesh in the same axial plane. Gears on this shaft share one rotation.</p>
          <p>{{ driveDescription(g) }}</p>
          @if (isInput(g)) {
            <input-block [formGroup]="form" _formControl="speed" unit="rpm" dataField="gear-speed"
              >Input Speed</input-block
            >
          }
          <button-block [click]="selectCenter" icon="my_location">Edit Center</button-block>
          <button-block [click]="selectHost" icon="edit">Select Host Body</button-block>
          <button-block
            [click]="attachAnother"
            icon="add"
            [disabled]="!!attachRefusal"
            [tooltip]="attachRefusal"
            >Attach Another Gear</button-block
          >
          @if (siblings.length > 1) {
            <app-gear-shaft-choices
              [gears]="siblings"
              [selectedId]="g.id"
              (picked)="gearAction($event)()"
            />
          }
          @for (issue of issues; track $index) {
            <p role="status">{{ issue }}</p>
          }
          @if (error) {
            <p role="alert">{{ error }}</p>
          }
          <button-block [click]="startMesh" icon="link">Mesh With…</button-block>
          @if (choosing) {
            @for (other of partners; track other.id) {
              <button-block [click]="chooseAction(other.id)" icon="settings"
                >{{ other.name || other.id }} · {{ other.teeth }}T
                @if (plane(other) || mechanism.gears.some(isCompoundGear(other))) {
                  · Plane {{ plane(other) + 1 }}
                }
              </button-block>
            }
            <button-block [click]="cancelMesh">Cancel</button-block>
          }
          @if (partner; as other) {
            <app-gear-mesh-summary
              [a]="g"
              [b]="other"
              [actual]="spacing(g, other)"
              [required]="required(g, other)"
              [unit]="unit"
              [diagnostics]="previewIssues"
              [canCommit]="true"
              (committed)="commitMesh()"
            />
          }
          @for (relationship of relationships; track relationship.id) {
            <button-block [click]="meshAction(relationship.id)" icon="link"
              >Inspect Mesh</button-block
            >
          }
          <p>Pitch geometry is symbolic. The reference arm can have a different radius.</p>
          <button-block [click]="removeGear" color="warn" icon="delete">Delete Gear</button-block>
        }
        @if (mesh; as m) {
          @if (meshGear(m.gearAId); as a) {
            @if (meshGear(m.gearBId); as b) {
              <app-gear-mesh-summary
                [a]="a"
                [b]="b"
                [actual]="spacing(a, b)"
                [required]="required(a, b)"
                [unit]="unit"
                [diagnostics]="issues"
              />
              <button-block [click]="gearAction(a.id)">Select Gear A</button-block>
              <button-block [click]="gearAction(b.id)">Select Gear B</button-block>
              <button-block [click]="removeMesh" color="warn" icon="link_off"
                >Remove Mesh</button-block
              >
            }
          }
        }
      </div>
    </panel-section>
  `,
  styles: [
    `
      .gearFields {
        padding: 8px 15px;
        min-width: 0;
      }
      p {
        font-size: 12px;
        margin: 8px 0;
        white-space: normal;
        overflow-wrap: anywhere;
        color: var(--text-secondary);
      }
      button-block {
        display: block;
        margin: 8px 0;
      }
      [role='alert'],
      [role='status'] {
        color: var(--danger-dark);
      }
    `,
  ],
})
export class GearPanelComponent implements DoCheck, OnDestroy {
  protected mechanism = inject(MechanismService);
  protected active = inject(ActiveObjService);
  protected editor = inject(GearEditorService);
  private settings = inject(SettingsService);
  private nup = inject(NumberUnitParserService);
  protected get unit() {
    return this.nup.unitLabel(this.settings.lengthUnit.value);
  }
  protected scale = MODEL_SCALE;
  protected form = new FormGroup({
    name: new FormControl('', { updateOn: 'blur' }),
    teeth: new FormControl('', { updateOn: 'blur' }),
    diameter: new FormControl('', { updateOn: 'blur' }),
    speed: new FormControl('', { updateOn: 'blur' }),
    plane: new FormControl('', { updateOn: 'blur' }),
  });
  protected choosing = false;
  protected partnerId?: string;
  protected previewIssues: string[] = [];
  protected error = '';
  private held = '';
  private subscription = new Subscription();
  constructor() {
    for (const key of ['name', 'teeth', 'diameter', 'speed', 'plane'] as const)
      this.subscription.add(
        this.form.controls[key].valueChanges.subscribe((value) => {
          const gear = this.gear;
          if (!gear) return;
          const number = Number(value);
          let accepted = true;
          if (key === 'speed') {
            accepted = Number.isFinite(number) && number !== 0;
            if (accepted)
              this.mechanism.editingAtStartPose(() => {
                this.mechanism.setDriveSpeed(this.center(gear) as RealJoint, number);
                this.mechanism.updateMechanism(true);
              });
          } else
            accepted = this.editor.edit(
              gear.id,
              key === 'name'
                ? { name: value ?? '' }
                : key === 'teeth'
                  ? { teeth: number }
                  : key === 'plane'
                    ? { plane: number - 1 }
                    : { module: (number * MODEL_SCALE) / gear.teeth }
            );
          this.error = accepted
            ? ''
            : key === 'speed'
              ? 'Enter a finite nonzero input speed in rpm.'
              : key === 'plane'
                ? 'Enter an axial plane from 1 to 128.'
                : 'Enter a positive whole tooth count and a positive finite pitch diameter.';
          this.held = '';
          this.partnerId = undefined;
        })
      );
  }
  ngOnDestroy() {
    this.subscription.unsubscribe();
  }
  ngDoCheck() {
    const gear = this.gear;
    const held = JSON.stringify([
      gear,
      gear && this.mechanism.driveSpeedOf(this.center(gear) as RealJoint),
    ]);
    if (held === this.held) return;
    this.held = held;
    if (gear)
      this.form.setValue(
        {
          name: gear.name ?? '',
          teeth: String(gear.teeth),
          diameter: this.number((gear.module * gear.teeth) / MODEL_SCALE),
          speed: String(this.mechanism.driveSpeedOf(this.center(gear) as RealJoint)),
          plane: String(gearPlane(gear) + 1),
        },
        { emitEvent: false }
      );
  }
  protected get gear() {
    return this.active.objType === 'Gear' ? this.meshGear(this.active.selectedGearId!) : undefined;
  }
  protected get mesh() {
    return this.active.objType === 'GearMesh'
      ? this.mechanism.gearMeshes.find((m) => m.id === this.active.selectedMeshId)
      : undefined;
  }
  protected meshGear(id: string) {
    return this.mechanism.gears.find((g) => g.id === id);
  }
  protected get partners() {
    return this.mechanism.gears.filter((g) => g.hostLinkId !== this.gear?.hostLinkId);
  }
  protected plane = gearPlane;
  protected isCompoundGear(gear: Gear) {
    return (other: Gear) => other.id !== gear.id && other.hostLinkId === gear.hostLinkId;
  }
  protected get siblings() {
    return this.mechanism.gears.filter((g) => g.hostLinkId === this.gear?.hostLinkId);
  }
  protected get attachRefusal() {
    const host = this.mechanism.links.find((l) => l.id === this.gear?.hostLinkId);
    return host instanceof RealLink ? this.editor.attachRefusal(host) : 'Select a rigid gear host.';
  }
  protected attachAnother = () => {
    const host = this.mechanism.links.find((l) => l.id === this.gear?.hostLinkId);
    if (host instanceof RealLink) this.editor.attach(host);
  };
  protected get partner() {
    return this.partnerId ? this.meshGear(this.partnerId) : undefined;
  }
  protected get relationships() {
    return this.mechanism.gearMeshes.filter(
      (m) => m.gearAId === this.gear?.id || m.gearBId === this.gear?.id
    );
  }
  protected get issues() {
    const gear = this.gear ?? (this.mesh && this.meshGear(this.mesh.gearAId));
    const at = this.mechanism.partitions.findIndex((p) =>
      p.transmission?.gears.some((g) => g.id === gear?.id)
    );
    return (
      this.mechanism.mechanisms[at]?.gearDiagnostics.map((d) => d.message) ??
      validateGearAssembly(this.mechanism.transmission, this.mechanism.joints, this.mechanism.links)
        .filter((d) => d.ids.includes(gear?.id ?? ''))
        .map((d) => d.message)
    );
  }
  protected center(g: Gear) {
    return this.mechanism.joints.find((j) => j.id === g.centerJointId)!;
  }
  protected isInput(g: Gear) {
    return (this.center(g) as RealJoint).input;
  }
  protected driveDescription(g: Gear) {
    if (this.isInput(g)) return 'Root input';
    const solved = this.mechanism.mechanisms.find((m) =>
      m.transmission.gears.some((item) => item.id === g.id)
    );
    const body = gearBodyFor(solved?.gearDrive, g.id);
    const root = solved?.transmission.gears.find(
      (gear) => gear.centerJointId === solved.gearDrive?.inputJointId
    );
    return body
      ? `Driven by ${root?.name || root?.id || solved!.gearDrive!.inputJointId} · Ratio ${this.number(body.multiplier)}`
      : 'No compiled drive';
  }
  protected number(n: number) {
    return Number(n.toPrecision(8)).toString();
  }
  protected spacing(a: Gear, b: Gear) {
    const ca = this.center(a),
      cb = this.center(b);
    return Math.hypot(cb.x - ca.x, cb.y - ca.y) / MODEL_SCALE;
  }
  protected required(a: Gear, b: Gear) {
    return (gearPitchRadius(a) + gearPitchRadius(b)) / MODEL_SCALE;
  }
  protected selectCenter = () => this.active.updateSelectedObj(this.center(this.gear!));
  protected selectHost = () =>
    this.active.updateSelectedObj(this.mechanism.links.find((l) => l.id === this.gear!.hostLinkId));
  protected startMesh = () => {
    this.choosing = true;
    this.partnerId = undefined;
  };
  protected cancelMesh = () => {
    this.choosing = false;
    this.partnerId = undefined;
  };
  protected chooseAction(id: string) {
    return () => {
      this.partnerId = id;
      this.choosing = false;
      this.previewIssues = this.editor.meshIssues(this.gear!.id, id);
    };
  }
  protected commitMesh = () => {
    if (this.editor.mesh(this.gear!.id, this.partnerId!)) this.partnerId = undefined;
    else this.previewIssues = this.editor.meshIssues(this.gear!.id, this.partnerId!);
  };
  protected meshAction(id: string) {
    return () => this.active.selectGearMesh(id);
  }
  protected gearAction(id: string) {
    return () => {
      this.partnerId = undefined;
      this.active.selectGear(id);
    };
  }
  protected removeGear = () => this.editor.removeGear(this.gear!.id);
  protected removeMesh = () => this.editor.removeMesh(this.mesh!.id);
}
