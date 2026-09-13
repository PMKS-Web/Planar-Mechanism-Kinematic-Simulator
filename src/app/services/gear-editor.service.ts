import { Injectable, inject } from '@angular/core';
import { RealJoint, RevJoint } from '../model/joint';
import { RealLink } from '../model/link';
import { Gear, GearMesh, gearPlane, MAX_GEAR_PLANES } from '../model/gear';
import { MODEL_SCALE } from '../model/render-scale';
import { MAX_GEARS, MAX_GEAR_MESHES } from '../model/mechanism/gear-validation';
import { compileGearDrive } from '../model/mechanism/gear-drive';
import { partitionMechanisms } from '../model/mechanism/mechanism-partition';
import { MechanismService } from './mechanism.service';
import { ActiveObjService } from './active-obj.service';
import { EditPermissionService } from './edit-permission.service';

@Injectable({ providedIn: 'root' })
export class GearEditorService {
  private mechanism = inject(MechanismService);
  private active = inject(ActiveObjService);
  private permission = inject(EditPermissionService);

  refusal(): string | undefined {
    return this.permission.refusal('structure')?.long;
  }

  createRefusal(): string | undefined {
    return this.mechanism.gears.length >= MAX_GEARS
      ? 'The document has reached the 128-gear limit.'
      : this.refusal();
  }

  attachRefusal(host: RealLink): string | undefined {
    if (this.mechanism.gears.length >= MAX_GEARS)
      return 'The document has reached the 128-gear limit.';
    const centers = host.joints.filter((j) => j instanceof RevJoint && j.ground);
    if (
      host.subset.length ||
      centers.length !== 1 ||
      !host.joints.some((j) => j instanceof RealJoint && !j.ground)
    )
      return 'Choose a simple body with one grounded revolute center and a moving reference point.';
    return this.refusal();
  }

  create(center: { x: number; y: number }): Gear | undefined {
    if (
      this.refusal() ||
      this.mechanism.gears.length >= MAX_GEARS ||
      ![center.x, center.y].every(Number.isFinite)
    )
      return undefined;
    return this.mechanism.editingAtStartPose(() => {
      const a = this.mechanism.determineNextLetter();
      const b = this.mechanism.determineNextLetter([a]);
      const axis = new RevJoint(a, center.x, center.y, this.mechanism.gears.length === 0, true);
      const reference = new RevJoint(b, center.x + MODEL_SCALE, center.y);
      const host = new RealLink(a + b, [axis, reference]);
      axis.links = [host];
      reference.links = [host];
      axis.connectedJoints = [reference];
      reference.connectedJoints = [axis];
      this.mechanism.joints.push(axis, reference);
      this.mechanism.links.push(host);
      return this.attachNow(host);
    });
  }

  attach(host: RealLink): Gear | undefined {
    if (this.attachRefusal(host)) return undefined;
    return this.mechanism.editingAtStartPose(() => this.attachNow(host));
  }

  private attachNow(host: RealLink): Gear {
    const siblings = this.mechanism.gears.filter((g) => g.hostLinkId === host.id);
    const first = siblings[0];
    const occupied = new Set(siblings.map(gearPlane));
    let plane = 0;
    while (occupied.has(plane)) plane++;
    const gear: Gear = {
      id: 'G-' + crypto.randomUUID(),
      name: `Gear ${this.mechanism.gears.length + 1}`,
      hostLinkId: host.id,
      centerJointId:
        first?.centerJointId ?? host.joints.find((j) => j instanceof RevJoint && j.ground)!.id,
      referenceJointId:
        first?.referenceJointId ?? host.joints.find((j) => j instanceof RealJoint && !j.ground)!.id,
      teeth: 20,
      module: first?.module ?? 0.1 * MODEL_SCALE,
      ...(plane ? { plane } : {}),
    };
    this.mechanism.gears.push(gear);
    this.mechanism.updateMechanism(true);
    this.active.selectGear(gear.id);
    return gear;
  }

  edit(id: string, patch: Partial<Pick<Gear, 'teeth' | 'module' | 'name' | 'plane'>>): boolean {
    if (this.refusal()) return false;
    const old = this.mechanism.gears.find((g) => g.id === id);
    if (!old) return false;
    const next = { ...old, ...patch };
    if (
      !Number.isSafeInteger(next.teeth) ||
      next.teeth <= 0 ||
      !Number.isFinite(next.module) ||
      next.module <= 0 ||
      !Number.isFinite(next.teeth * next.module) ||
      !Number.isInteger(gearPlane(next)) ||
      gearPlane(next) < 0 ||
      gearPlane(next) >= MAX_GEAR_PLANES ||
      (next.name?.length ?? 0) > 200
    )
      return false;
    this.mechanism.editingAtStartPose(() => {
      this.mechanism.gears = this.mechanism.gears.map((g) => (g.id === id ? next : g));
      this.mechanism.updateMechanism(true);
    });
    return true;
  }

  meshIssues(a: string, b: string): string[] {
    return this.mechanism.editingAtStartPose(() => {
      const mesh: GearMesh = { id: 'preview-mesh', gearAId: a, gearBId: b, kind: 'external' };
      const assembly = {
        gears: this.mechanism.gears,
        meshes: [...this.mechanism.gearMeshes, mesh],
      };
      if (assembly.meshes.length > MAX_GEAR_MESHES)
        return ['The document has reached the 256-mesh limit.'];
      const partitions = partitionMechanisms(
        this.mechanism.joints,
        this.mechanism.links,
        this.mechanism.forces,
        assembly
      );
      const partition = partitions.mechanisms.find((p) =>
        p.transmission?.meshes.some((m) => m.id === mesh.id)
      );
      if (!partition?.transmission) return ['Ground both gear centers before creating this mesh.'];
      const compiled = compileGearDrive(partition.transmission, partition.joints, partition.links);
      return compiled.ok ? [] : compiled.diagnostics.map((d) => d.message);
    });
  }

  mesh(a: string, b: string): boolean {
    if (this.refusal() || this.meshIssues(a, b).length) return false;
    this.mechanism.editingAtStartPose(() => {
      this.mechanism.gearMeshes.push({
        id: 'GM-' + crypto.randomUUID(),
        gearAId: a,
        gearBId: b,
        kind: 'external',
      });
      this.mechanism.updateMechanism(true);
    });
    return true;
  }

  removeGear(id: string): void {
    if (this.refusal()) return;
    this.mechanism.editingAtStartPose(() => {
      this.mechanism.gears = this.mechanism.gears.filter((g) => g.id !== id);
      this.mechanism.gearMeshes = this.mechanism.gearMeshes.filter(
        (m) => m.gearAId !== id && m.gearBId !== id
      );
      this.mechanism.updateMechanism(true);
    });
    this.active.updateSelectedObj(null);
  }

  removeMesh(id: string): void {
    if (this.refusal()) return;
    this.mechanism.editingAtStartPose(() => {
      this.mechanism.gearMeshes = this.mechanism.gearMeshes.filter((m) => m.id !== id);
      this.mechanism.updateMechanism(true);
    });
    this.active.updateSelectedObj(null);
  }
}
