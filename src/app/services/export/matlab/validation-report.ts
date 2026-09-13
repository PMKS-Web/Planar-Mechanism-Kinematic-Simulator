/** Generic reporting helpers; they summarize residuals and never solve another mechanism. */
export const VALIDATION_REPORT_FILES: Record<string, string> = {
  '+pmks/residual_metrics.m': `function metric = residual_metrics(residual,scale,absolute,relative)
% One column per frame, one row per scalar equation. Missing frames stay NaN.
% Acceptance per entry: abs(residual) <= absolute + relative*(abs(A)*abs(x)+abs(b)).
% Position uses only the absolute tolerance. RMS is root-mean-square, not standard deviation.
valid = isfinite(residual) & isfinite(scale);
x = abs(residual(valid)); metric.samples = numel(x);
metric.maxResidual = NaN; metric.rmsResidual = NaN; metric.maxToleranceRatio = NaN;
metric.withinTolerance = false;
if ~isempty(x)
    metric.maxResidual = max(x);
    if metric.maxResidual==0, metric.rmsResidual = 0;
    else, metric.rmsResidual = metric.maxResidual*sqrt(mean((x/metric.maxResidual).^2)); end
    metric.maxToleranceRatio = max(x./(absolute+relative*scale(valid)));
    metric.withinTolerance = metric.maxToleranceRatio<=1;
end
metric.byRow = struct('maxResidual',{},'rmsResidual',{});
for row = 1:size(residual,1)
    x = abs(residual(row,valid(row,:)));
    peak = NaN; rms_value = NaN;
    if ~isempty(x)
        peak = max(x);
        if peak==0, rms_value = 0; else, rms_value = peak*sqrt(mean((x/peak).^2)); end
    end
    metric.byRow(row) = struct('maxResidual',peak,'rmsResidual',rms_value);
end
end
`,
  '+pmks/validation_text.m': `function text = validation_text(r)
% Human-readable report also returned as report.text. No file writing here.
lines = {'PMKS MATLAB Package Validation','==============================', ...
    ['Mechanism: ' r.mechanism], ...
    sprintf('Frames requested: %d',r.frames.requested), ...
    sprintf('Frames solved: %d',r.frames.solved), ...
    sprintf('Kinematic frames solved: %d',r.frames.kinematicsSolved), ...
    sprintf('Failed/incomplete frames: %d (%d unattempted)',r.frames.failed,r.frames.unattempted), ...
    sprintf('NaN/Inf count in raw arrays: %d / %d',r.frames.nanCount,r.frames.infCount)};
if isnan(r.frames.firstFailed), lines{end+1} = 'First failed frame: none';
else, lines{end+1} = sprintf('First failed frame: %d (t=%.12g s)',r.frames.firstFailed,r.frames.firstFailedTime); end
lines = [lines, {'','Kinematics (aggregate SI row units; per-row values/units in report struct)'}];
for name = {'position','velocity','acceleration'}
    m = r.(name{1});
    lines{end+1} = sprintf('%s: max %.6g, RMS %.6g, tolerance ratio %.6g',name{1},m.maxResidual,m.rmsResidual,m.maxToleranceRatio);
end
if isfield(r,'force')
    lines{end+1} = ''; lines{end+1} = 'Force equilibrium (force rows N; moment rows N*m)';
    lines{end+1} = sprintf('All rows: max %.6g, RMS %.6g, tolerance ratio %.6g',r.force.maxResidual,r.force.rmsResidual,r.force.maxToleranceRatio);
    bodies = fieldnames(r.force.byBody);
    for k = 1:numel(bodies)
        body = r.force.byBody.(bodies{k});
        line = sprintf('%s: max Fx %.6g N, max Fy %.6g N',bodies{k},body.Fx.maxResidual,body.Fy.maxResidual);
        if isfield(body,'moment'), line = [line sprintf(', max moment %.6g N*m',body.moment.maxResidual)]; end
        lines{end+1} = line;
    end
end
lines = [lines, {'','Conditioning', ...
    sprintf('Minimum rcond(J): %.6g; worst frame: %g (t=%.12g s)',r.conditioning.minRcond,r.conditioning.worstFrame,r.conditioning.worstTime), ...
    sprintf('Minimum row-scaled rcond(J): %.6g',r.conditioning.minScaledRcond), ...
    '',['Optional PMKS comparison: ' r.pmks.status]}];
for k = 1:numel(r.pmks.channels)
    s = r.pmks.channels(k);
    lines{end+1} = sprintf('%s: RMSE %.6g, bias %.6g, peak %.6g %s; %d compared, %d excluded', ...
        s.label,s.rmse,s.bias,s.peak,s.unit,s.count,s.excluded);
end
lines{end+1} = '';
lines{end+1} = sprintf('Tolerances: position abs %.3g; other equations abs %.3g + rel %.3g*(abs(A)*abs(x)+abs(b)).',r.tolerances.absolute,r.tolerances.absolute,r.tolerances.relative);
lines{end+1} = sprintf('Condition warning below row-scaled rcond %.3g. PMKS comparison: position/angle %.3g; other channels %.3g times max(1,peak compared theory).',r.tolerances.nearSingular,r.tolerances.comparisonPosition,r.tolerances.comparisonOther);
if ~isempty(r.failure), lines{end+1} = ['Solver failure: ' r.failureIdentifier ' ' r.failure]; end
for k = 1:numel(r.messages), lines{end+1} = ['Note: ' r.messages{k}]; end
lines{end+1} = ['CORE STATUS: ' r.coreStatus]; lines{end+1} = ['STATUS: ' r.status];
text = [strjoin(lines,sprintf('\\n')) sprintf('\\n')];
end
`,
};
