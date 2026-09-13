export function resultFiles(forces: boolean): Record<string, string> {
  return {
    'run_pmks_analysis.m': `function results = run_pmks_analysis(make_plots,compare_reference)
% RUN_PMKS_ANALYSIS Independently solve the exported mechanism in base MATLAB.
% Unzip, change MATLAB's current folder to this folder, then run:
%   results = run_pmks_analysis;
% No reference file or experimental data is needed to solve the mechanism.
% Optional flags suppress figures/comparison for validate_pmks_package.
if nargin < 1, make_plots = true; end
if nargin < 2, compare_reference = true; end
m = mechanism_data();
validate_equations(m);
time = pmks.time_grid(m);
n = numel(m.initial); count = numel(time);
results.time = time(:); results.model = m; results.solved_frames = 0;
results.q = NaN(n,count); results.v = results.q; results.a = results.q;
results.jointPosition = NaN(numel(m.joints),2,count);
results.jointVelocity = results.jointPosition; results.jointAcceleration = results.jointPosition;
${
  forces
    ? `results.reaction = NaN(numel(m.joints),numel(m.bodies),2,count);
results.torque = NaN(count,1); results.lambda = NaN(numel(m.constraints)+1,count);
`
    : ''
}results.failure = ''; results.failure_frame = []; results.failure_identifier = '';
results.frame_solved = false(count,1);
q = m.initial;
for k = 1:count
    try
        [angle,omega,alpha] = pmks.driver(m,time(k));
        if k == 1, q = solve_position(m,q,angle);
        else, q = pmks.advance(m,q,time(k-1),time(k),0); end
        [v,J] = solve_velocity(m,q,angle,omega);
        a = solve_acceleration(m,q,v,angle,alpha);
        results.q(:,k) = q; results.v(:,k) = v; results.a(:,k) = a;
        for j = 1:numel(m.joints)
            joint = m.joints(j);
            [p,D,curvature] = pmks.point(m,q,v,joint.body,joint.local);
            results.jointPosition(j,:,k) = p';
            results.jointVelocity(j,:,k) = (D*v)';
            results.jointAcceleration(j,:,k) = (D*a+curvature)';
        end
${
  forces
    ? `        if ~strcmp(m.settings.force_mode,'none')
            [lambda,reactions] = solve_forces(m,q,a,J);
            results.torque(k) = lambda(end); results.reaction(:,:,:,k) = reactions;
            results.lambda(:,k) = lambda;
        end
`
    : ''
}
        results.solved_frames = k; results.frame_solved(k) = true;
    catch failure
        results.failure_frame = k; results.failure_identifier = failure.identifier;
        results.failure = sprintf('Stopped at t=%.12g s: %s',time(k),failure.message);
        warning('PMKS:Stopped','%s',results.failure); break;
    end
end
results.values = NaN(count,numel(m.channels));
for c = 1:numel(m.channels), results.values(:,c) = pmks.channel(results,m.channels(c)); end
results = named_results(results);
if make_plots, plot_results(results); end
fprintf('Solved %d of %d requested frames. Units: m, s, rad, kg, N, N*m.\\n',results.solved_frames,count);
% Optional verification is intentionally called after the independent solve.
if compare_reference && exist(fullfile(fileparts(mfilename('fullpath')),'pmks_reference.csv'),'file')
    try
        results.verification = compare_pmks(results);
    catch comparison_failure
        warning('PMKS:Verification','Independent results are available; verification failed: %s',comparison_failure.message);
    end
end
end
`,
    '+pmks/channel.m': `function value = channel(r,c)
% Read one named engineering result, always in its documented SI unit.
switch c.quantity
    case {'jointPosition','jointVelocity','jointAcceleration'}
        source = r.(c.quantity); vector = reshape(source(c.index,:,:),2,[])';
    case {'bodyPosition','bodyVelocity','bodyAcceleration','angle','omega','alpha'}
        b = r.model.bodies(c.index); i = b.offset;
        switch c.quantity
            case {'bodyPosition','angle'}, source = r.q;
            case {'bodyVelocity','omega'}, source = r.v;
            otherwise, source = r.a;
        end
        if any(strcmp(c.quantity,{'angle','omega','alpha'}))
            if b.dof ~= 3, value = NaN(size(r.time)); return; end
            value = source(i+2,:)';
            if strcmp(c.quantity,'angle'), value = value+b.initial_angle; end
            return;
        end
        vector = source(i:i+1,:)';
    case 'reaction'
        vector = reshape(r.reaction(c.index,c.body,:,:),2,[])';
    case 'torque'
        value = r.torque; return;
    otherwise, error('PMKS:Quantity','Unknown quantity %s.',c.quantity);
end
if c.component == 3, value = hypot(vector(:,1),vector(:,2));
else, value = vector(:,c.component); end
end
`,
    'plot_results.m': `function plot_results(r)
% At most four analysis figures plus one trajectory figure, using only selected channels.
% Each quantity/component gets a subplot; legends identify the selected joints/bodies.
channels = r.model.channels;
if isempty(channels), return; end
groups = {{'jointPosition','bodyPosition','angle'}, ...
    {'jointVelocity','bodyVelocity','omega'}, ...
    {'jointAcceleration','bodyAcceleration','alpha'}, {'reaction','torque'}};
names = {'Position','Velocity','Acceleration','Force'};
labels = struct('jointPosition','Joint position','bodyPosition','CoM position','angle','Link angle', ...
    'jointVelocity','Joint velocity','bodyVelocity','CoM velocity','omega','Angular velocity', ...
    'jointAcceleration','Joint acceleration','bodyAcceleration','CoM acceleration','alpha','Angular acceleration', ...
    'reaction','Joint reaction','torque','Driver torque');
components = {'X','Y','Magnitude'};
for g = 1:numel(groups)
    selected = find(ismember({channels.quantity},groups{g}));
    if isempty(selected), continue; end
    keys = arrayfun(@(c) sprintf('%s_%d',c.quantity,c.component),channels(selected),'UniformOutput',false);
    panels = unique(keys,'stable'); columns = min(3,ceil(sqrt(numel(panels)))); rows = ceil(numel(panels)/columns);
    figure('Name',names{g},'Units','normalized','Position',[0.05 0.1 0.9 0.8]);
    for u = 1:numel(panels)
        members = selected(strcmp(keys,panels{u})); first = channels(members(1));
        subplot(rows,columns,u); hold on;
        for k = members
            plot(r.time,r.values(:,k),'DisplayName',channels(k).label);
        end
        heading = labels.(first.quantity);
        if ~any(strcmp(first.quantity,{'angle','omega','alpha','torque'}))
            heading = [heading ' ' components{first.component}];
        end
        grid on; xlabel('Time (s)'); ylabel(first.unit,'Interpreter','none');
        title(heading); legend('show','Interpreter','none','Location','best');
    end
end
if ~isempty(r.model.channels) && any(strcmp({r.model.channels.quantity},'jointPosition'))
    figure('Name','Joint and tracer paths'); hold on;
    for j = 1:numel(r.model.joints)
        p = reshape(r.jointPosition(j,:,:),2,[])';
        plot(p(:,1),p(:,2),'DisplayName',r.model.joints(j).name);
    end
    axis equal; grid on; xlabel('X (m)'); ylabel('Y (m)'); legend('show','Interpreter','none');
end
end
`,
    'compare_pmks.m': `function report = compare_pmks(r)
% Verification only. Deleting pmks_reference.csv does not change the solution.
file = fullfile(fileparts(mfilename('fullpath')),'pmks_reference.csv');
report = [];
if ~exist(file,'file'), fprintf('No optional PMKS reference file.\\n'); return; end
data = dlmread(file,',',1,0);
if size(data,2) ~= numel(r.model.channels)+1, error('PMKS:Reference','Reference columns do not match this mechanism.'); end
for k = 1:numel(r.model.channels)
    c = r.model.channels(k); valid = isfinite(data(:,k+1));
    if ~any(valid), continue; end
    stats = pmks.compare(r.time,r.values(:,k),data(valid,[1,k+1]),0,c.period);
    stats.label = c.label; stats.unit = c.unit; stats.channel = k; report = [report;stats]; %#ok<AGROW>
    fprintf('%s: RMSE %.6g, bias %.6g, peak %.6g %s (%d compared)\\n', ...
        c.label,stats.rmse,stats.bias,stats.peak,c.unit,stats.count);
end
end
`,
    'compare_measurements.m': `function stats = compare_measurements(results,file,column,time_offset,units)
% Example: compare_measurements(results,'measurements.csv',1,0,'m')
% CSV header: Time,Value. Time is seconds from the initial pose.
% column selects results.model.channels(column); inspect its label and unit.
% time_offset is added to measured time. No fitting, extrapolation or outlier removal.
if nargin < 4, time_offset = 0; end
if nargin < 5, error('PMKS:Units','Specify the measurement unit explicitly.'); end
if column < 1 || column > numel(results.model.channels) || column ~= floor(column)
    error('PMKS:Column','Choose a valid result column.');
end
c = results.model.channels(column);
if ~strcmp(units,c.unit), error('PMKS:Units','Convert measurements to %s first.',c.unit); end
table = readtable(file);
if ~all(ismember({'Time','Value'},table.Properties.VariableNames))
    error('PMKS:Measurements','CSV needs Time,Value columns.');
end
stats = pmks.compare(results.time,results.values(:,column),[table.Time table.Value],time_offset,c.period);
figure('Name',c.label); plot(results.time,results.values(:,column),'DisplayName','MATLAB theoretical'); hold on;
plot(stats.time,stats.theoretical+stats.residual,'o','DisplayName','Measured'); grid on; legend('show');
xlabel('Time (s)'); ylabel(c.unit,'Interpreter','none'); title(c.label,'Interpreter','none');
fprintf('RMSE %.6g, bias %.6g, peak %.6g %s; %d compared, %d excluded.\\n', ...
    stats.rmse,stats.bias,stats.peak,c.unit,stats.count,stats.excluded);
end
`,
    '+pmks/compare.m': `function s = compare(time,value,measured,offset,period)
% Linear interpolation within valid adjacent samples only. Angles use shortest errors.
time = time(:); value = value(:);
if size(measured,2) ~= 2 || isempty(measured) || any(~isfinite(measured(:))) || ...
    any(diff(measured(:,1)) <= 0) || ~isscalar(offset) || ~isfinite(offset)
    error('PMKS:Measurements','Use finite values and strictly increasing measurement times.');
end
if period > 0
    for k = 2:numel(value)
        if isfinite(value(k)) && isfinite(value(k-1))
            value(k) = value(k-1)+mod(value(k)-value(k-1)+period/2,period)-period/2;
        end
    end
end
t = measured(:,1)+offset; theory = NaN(size(t));
for k = 1:numel(t)
    lo = find(time <= t(k),1,'last');
    if isempty(lo), continue; end
    if time(lo) == t(k), theory(k) = value(lo);
    elseif lo < numel(time) && isfinite(value(lo)) && isfinite(value(lo+1))
        f = (t(k)-time(lo))/(time(lo+1)-time(lo)); theory(k) = value(lo)+f*(value(lo+1)-value(lo));
    end
end
valid = isfinite(theory); s.count = sum(valid); s.excluded = sum(~valid);
if s.count == 0, error('PMKS:Overlap','No measurements overlap a valid theoretical interval.'); end
s.time = t(valid); s.theoretical = theory(valid); s.residual = measured(valid,2)-theory(valid);
if period > 0, s.residual = mod(s.residual+period/2,period)-period/2; end
scale = max(abs(s.residual));
if scale == 0, s.rmse = 0; else, s.rmse = scale*sqrt(mean((s.residual/scale).^2)); end
s.bias = mean(s.residual); s.peak = scale;
end
`,
  };
}
