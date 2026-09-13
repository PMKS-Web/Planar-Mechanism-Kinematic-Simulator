import { AnalysisExportModel } from '../../../model/analysis-export';
import { EquationPlan } from './equation-plan';
import { VALIDATION_REPORT_FILES } from './validation-report';

/** Residual tolerances concern equation closure, not agreement with rounded PMKS samples. */
export const VALIDATION_TOLERANCES = {
  absolute: 1e-8,
  relative: 1e-8,
  nearSingular: 1e-8,
  comparisonPosition: 1e-6,
  comparisonOther: 1e-4,
};

export function runtimeValidation(m: AnalysisExportModel, p: EquationPlan): Record<string, string> {
  const forces = m.settings.forceMode !== 'none';
  const bodyReports = forces
    ? p.forceRows
        .map((row) => {
          const body = p.bodies[row.body],
            field = ['Fx', 'Fy', 'moment'][row.axis],
            index = row.coordinate + 1;
          return `report.force.byBody.${body}.${field} = pmks.residual_metrics(F(${index},:),FS(${index},:),tol.absolute,tol.relative);`;
        })
        .join('\n')
    : '';
  return {
    ...VALIDATION_REPORT_FILES,
    'validate_pmks_package.m': `function report = validate_pmks_package(compare_reference,report_file)
% VALIDATE_PMKS_PACKAGE Run THIS generated MATLAB solver, then check its equations.
%   report = validate_pmks_package;
%   report = validate_pmks_package(false); % No optional PMKS cross-check.
%   report = validate_pmks_package(true,'pmks_validation_report.txt');
% No figures or files are created by default. The optional CSV never supplies a solution.
if nargin < 1, compare_reference = true; end
if nargin < 2, report_file = ''; end
report = pmks.validation_report();
try
    m = mechanism_data(); report.mechanism = m.name;
    report.frames.requested = numel(pmks.time_grid(m));
    results = run_pmks_analysis(false,false);
    report = pmks.validate_results(results);
    reference = fullfile(fileparts(mfilename('fullpath')),'pmks_reference.csv');
    if exist(reference,'file') && ~compare_reference
        report.pmks.status = 'SKIPPED';
    elseif exist(reference,'file')
        try
            report.pmks.channels = compare_pmks(results);
            report.pmks.status = 'PASS';
            if isempty(report.pmks.channels)
                report.pmks.status = 'WARN';
                report.messages{end+1} = 'The optional reference has no usable selected channels.';
            end
            for k = 1:numel(report.pmks.channels)
                s = report.pmks.channels(k); c = m.channels(s.channel);
                position = any(strcmp(c.quantity,{'jointPosition','bodyPosition','angle'}));
                if position, limit = report.tolerances.comparisonPosition;
                else, limit = report.tolerances.comparisonOther; end
                limit = limit*max(1,max(abs(s.theoretical)));
                report.pmks.channels(k).tolerance = limit;
                report.pmks.channels(k).withinTolerance = s.peak <= limit;
                if s.peak > limit
                    report.pmks.status = 'WARN';
                    report.messages{end+1} = ['Optional PMKS comparison exceeds tolerance: ' c.label];
${
  forces
    ? `                    if strcmp(m.settings.force_mode,'dynamic') && any(strcmp(c.quantity,{'reaction','torque'}))
                        report.messages{end+1} = 'Dynamic-force differences may reflect the known PMKS canvas-scale/mass-property issue. MATLAB retains physical SI equations; this cross-check does not mark its equilibrium wrong.';
                    end
`
    : ''
}                end
            end
        catch comparison_failure
            report.pmks.status = 'WARN';
            report.messages{end+1} = ['Optional comparison could not complete: ' comparison_failure.message];
        end
    end
catch failure
    report.coreStatus = 'FAIL'; report.failure = failure.message;
    report.failureIdentifier = failure.identifier;
    report.frames.failed = report.frames.requested;
    if report.frames.requested>0, report.frames.firstFailed = 1; end
    report.messages{end+1} = ['Analysis/validation could not complete: ' failure.message];
end
report.status = report.coreStatus;
if strcmp(report.status,'PASS') && strcmp(report.pmks.status,'WARN'), report.status = 'WARN'; end
report.text = pmks.validation_text(report);
if ~isempty(report_file)
    [fid,message] = fopen(report_file,'w');
    if fid < 0
        report.messages{end+1} = ['Could not save validation report: ' message];
        if strcmp(report.status,'PASS'), report.status = 'WARN'; end
        report.text = pmks.validation_text(report);
    else
        cleanup = onCleanup(@() fclose(fid));
        fprintf(fid,'%s',report.text);
    end
end
fprintf('%s',report.text);
end
`,
    '+pmks/validation_report.m': `function report = validation_report()
% Defaults also produce a useful report when setup fails before frame one.
report.status = 'FAIL'; report.coreStatus = 'FAIL'; report.mechanism = '';
report.messages = {}; report.failure = ''; report.failureIdentifier = '';
report.tolerances = struct('absolute',${VALIDATION_TOLERANCES.absolute},'relative',${VALIDATION_TOLERANCES.relative}, ...
    'nearSingular',${VALIDATION_TOLERANCES.nearSingular},'comparisonPosition',${VALIDATION_TOLERANCES.comparisonPosition},'comparisonOther',${VALIDATION_TOLERANCES.comparisonOther});
report.frames = struct('requested',0,'solved',0,'kinematicsSolved',0,'failed',0,'unattempted',0, ...
    'firstFailed',NaN,'firstFailedTime',NaN,'nanCount',0,'infCount',0,'nanInfCount',0,'equationFailures',0);
report.position = pmks.residual_metrics([],[],report.tolerances.absolute,0);
report.velocity = report.position; report.acceleration = report.position;
report.conditioning = struct('minRcond',NaN,'minScaledRcond',NaN,'worstFrame',NaN,'worstTime',NaN);
report.pmks = struct('status','NOT INCLUDED','channels',[]);
end
`,
    '+pmks/validate_results.m': `function report = validate_results(r)
% Re-evaluate the ACTUAL generated equations at each solved frame. No separate derivation.
report = pmks.validation_report(); m = r.model; tol = report.tolerances;
report.mechanism = m.name; report.failure = r.failure; report.failureIdentifier = r.failure_identifier;
count = numel(r.time); report.frames.requested = count;
raw = [r.q;r.v;r.a;reshape(r.jointPosition,[],count); ...
    reshape(r.jointVelocity,[],count);reshape(r.jointAcceleration,[],count)];
kinematic_valid = all(isfinite(raw),1);
${
  forces
    ? `force_raw = [r.lambda;reshape(r.reaction,[],count);r.torque'];
force_valid = kinematic_valid & all(isfinite(force_raw),1);
raw = [raw;force_raw];
complete = r.frame_solved(:)' & force_valid;
`
    : `complete = r.frame_solved(:)' & kinematic_valid;
`
}report.frames.kinematicsSolved = sum(kinematic_valid); report.frames.solved = sum(complete);
report.frames.failed = count-report.frames.solved;
report.frames.nanCount = sum(isnan(raw(:))); report.frames.infCount = sum(isinf(raw(:)));
report.frames.nanInfCount = report.frames.nanCount+report.frames.infCount;
% Counts use raw stored arrays, excluding duplicate named aliases and optional reference data.
first = find(~complete,1);
if ~isempty(first), report.frames.firstFailed = first; report.frames.firstFailedTime = r.time(first); end
if ~isempty(r.failure_frame), report.frames.unattempted = count-r.failure_frame; end
rows = numel(m.constraints)+1;
C = NaN(rows,count); V = C; VS = C; Acc = C; AccS = C;
${forces ? 'F = NaN(numel(m.initial),count); FS = F;\n' : ''}condition = NaN(1,count); scaled_condition = condition;
for k = find(kinematic_valid)
    try
        q = r.q(:,k); v = r.v(:,k); a = r.a(:,k);
        [angle,omega,alpha] = pmks.driver(m,r.time(k));
        [c,J] = position_equations(m,q,v,angle);
        [Jv,b_velocity] = velocity_equations(m,q,angle,omega);
        [Ja,b_acceleration] = acceleration_equations(m,q,v,angle,alpha);
        C(:,k) = c; V(:,k) = Jv*v-b_velocity; Acc(:,k) = Ja*a-b_acceleration;
        VS(:,k) = abs(Jv)*abs(v)+abs(b_velocity);
        AccS(:,k) = abs(Ja)*abs(a)+abs(b_acceleration);
        values = [c;V(:,k);Acc(:,k);VS(:,k);AccS(:,k)];
        assert(all(isfinite(values)),'PMKS:Validation','Nonfinite equation residual or scale.');
        condition(k) = rcond(J);
        scaled_condition(k) = rcond(bsxfun(@rdivide,J,max(abs(J),[],2)));
${
  forces
    ? `        if force_valid(k)
            [A_force,b_force] = force_equations(m,q,a,J);
            F(:,k) = A_force*r.lambda(:,k)-b_force;
            FS(:,k) = abs(A_force)*abs(r.lambda(:,k))+abs(b_force);
            assert(all(isfinite([F(:,k);FS(:,k)])),'PMKS:Validation','Nonfinite force residual or scale.');
        end
`
    : ''
}    catch failure
        report.frames.equationFailures = report.frames.equationFailures+1;
        report.messages{end+1} = sprintf('Frame %d equation check failed: %s',k,failure.message);
    end
end
% Aggregate residuals mix scalar row units; per-row statistics retain engineering meaning.
report.position = pmks.residual_metrics(C,zeros(size(C)),tol.absolute,0);
report.position.rowUnits = [repmat({'m'},1,rows-1),{'rad'}];
report.velocity = pmks.residual_metrics(V,VS,tol.absolute,tol.relative);
report.velocity.rowUnits = [repmat({'m/s'},1,rows-1),{'rad/s'}];
report.acceleration = pmks.residual_metrics(Acc,AccS,tol.absolute,tol.relative);
report.acceleration.rowUnits = [repmat({'m/s^2'},1,rows-1),{'rad/s^2'}];
${
  forces
    ? `report.force = pmks.residual_metrics(F,FS,tol.absolute,tol.relative);
report.force.rowUnits = {${p.forceRows.map((row) => `'${row.axis === 2 ? 'N*m' : 'N'}'`).join(',')}};
${bodyReports}
`
    : ''
}valid_condition = find(isfinite(condition));
if ~isempty(valid_condition)
    [report.conditioning.minRcond,i] = min(condition(valid_condition));
    report.conditioning.worstFrame = valid_condition(i);
    report.conditioning.worstTime = r.time(valid_condition(i));
    report.conditioning.minScaledRcond = min(scaled_condition(valid_condition));
end
report.coreStatus = 'PASS';
if report.frames.failed>0
    report.coreStatus = 'WARN';
    report.messages{end+1} = 'Partial completion: failed frames include the unsolved remainder after the solver stopped.';
end
if report.conditioning.minScaledRcond < tol.nearSingular
    report.coreStatus = 'WARN';
    report.messages{end+1} = 'Near-singular solved configuration; conditioning is a warning, not an equation failure.';
end
bad_residual = ~report.position.withinTolerance || ~report.velocity.withinTolerance || ~report.acceleration.withinTolerance;
${forces ? 'bad_residual = bad_residual || ~report.force.withinTolerance;\n' : ''}if report.frames.solved==0 || report.frames.equationFailures>0 || any(r.frame_solved(:)' & ~complete) || bad_residual
    report.coreStatus = 'FAIL';
    report.messages{end+1} = 'Core validation failed: no complete frames, an invalid completed frame, or equations outside tolerance. Inspect residuals and failure details.';
end
report.status = report.coreStatus;
end
`,
  };
}
