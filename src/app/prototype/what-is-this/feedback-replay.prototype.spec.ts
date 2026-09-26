// PROTOTYPE runner, not a test. Replays the project URLs users attached to
// in-app feedback through today's codec, solver and readiness checks, to see
// what the app would now tell them. Skipped unless PMKS_FEEDBACK_REPLAY names a
// JSONL file of { id, date, message, project_url } rows; the URLs never enter
// the repository.
//   PMKS_FEEDBACK_REPLAY=/path/feedback.jsonl npx ng test --watch=false \
//     --include=src/app/prototype/what-is-this/feedback-replay.prototype.spec.ts
import '../../model/joint';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { StringTranscoder } from '../../services/transcoding/string-transcoder';
import { MechanismBuilder } from '../../services/transcoding/mechanism-builder';
import { SettingsService } from '../../services/settings.service';
import { ActiveObjService } from '../../services/active-obj.service';
import { MechanismService } from '../../services/mechanism.service';
import { PrisJoint, RealJoint } from '../../model/joint';
import { Mechanism } from '../../model/mechanism/mechanism';
import { partitionMechanisms } from '../../model/mechanism/mechanism-partition';
import { readinessOf } from '../../model/mechanism/readiness';
import { unassignedIssues } from '../../model/mechanism/unassigned-issues';
import { textOf } from '../../model/prose';
import { SetupIssue } from '../../model/mechanism/setup-issue';
import { MODEL_SCALE } from '../../model/render-scale';

interface Row {
  id: string;
  date: string;
  message: string;
  project_url: string | null;
}

function payloadOf(url: string): string {
  const query = url.slice(url.indexOf('?') + 1).split('#')[0];
  try {
    return decodeURIComponent(query);
  } catch {
    return query;
  }
}

function replay(url: string) {
  const decoder = new StringTranscoder();
  decoder.decodeURL(payloadOf(url));
  const settings = new SettingsService();
  const target = {
    joints: [],
    links: [],
    forces: [],
    mechanismTimeStep: 0,
  } as unknown as MechanismService;
  new MechanismBuilder(target, decoder, settings, new ActiveObjService()).build(true, false);
  const partitioning = partitionMechanisms(target.joints, target.links, target.forces);
  const machines = partitioning.mechanisms.map((partition) => {
    const driven = partition.ownJoints.find(
      (joint): joint is RealJoint => joint instanceof RealJoint && joint.input
    );
    const signed =
      driven && driven.driveSpeed !== 0
        ? driven.driveSpeed
        : (settings.isInputCW.value ? -1 : 1) *
          (driven instanceof PrisJoint
            ? settings.linearInputSpeed.value
            : settings.inputSpeed.value);
    const mechanism = new Mechanism(
      partition.joints,
      partition.links,
      partition.forces,
      [],
      settings.isGravity.value,
      'cm',
      driven instanceof PrisJoint ? signed * MODEL_SCALE : (signed * Math.PI) / 30,
      'adaptive',
      new Set(partition.ownJoints.map((joint) => joint.id))
    );
    const readiness = readinessOf(partition, mechanism, {
      strokeWarning: () => undefined,
      describeSpeed: () => `${Math.abs(signed)}`,
      drawing: () => target,
    });
    return {
      joints: partition.ownJoints.length,
      links: partition.links.length,
      dof: mechanism.dof,
      solved: mechanism.isMechanismValid(),
      samples: mechanism.joints.length,
      failure: mechanism.failure ?? null,
      ready: readiness.ready,
      checks: readiness.checks.map(issueRow),
    };
  });
  return {
    joints: target.joints.length,
    links: target.links.length,
    machines,
    unassigned: unassignedIssues(partitioning.unassigned, target.joints).map(issueRow),
  };
}

/** An issue as a row of plain text: what it is, and the fixes it offers. */
function issueRow(issue: SetupIssue) {
  return {
    severity: issue.severity,
    title: issue.title,
    summary: textOf(issue.summary),
    fixes: issue.fixes.map(textOf),
  };
}

const source = process.env['PMKS_FEEDBACK_REPLAY'];
const run = source ? it : it.skip;

describe('feedback replay', () => {
  run('replays every attached project URL', () => {
    const rows: Row[] = readFileSync(source!, 'utf8')
      .split('\n')
      .filter((line) => line.trim())
      .map((line) => JSON.parse(line));
    const results = rows
      .filter((row) => row.project_url)
      .map((row) => {
        try {
          return { id: row.id, date: row.date, message: row.message, ...replay(row.project_url!) };
        } catch (error) {
          return { id: row.id, date: row.date, message: row.message, error: String(error) };
        }
      });
    const out = `${process.cwd()}/artifacts/feedback-replay`;
    mkdirSync(out, { recursive: true });
    writeFileSync(`${out}/results.json`, JSON.stringify(results, null, 2));
    expect(results.length).toBeGreaterThan(0);
  });
});
