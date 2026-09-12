import { ExportTable } from './export-table.service';

/** MATLAB scripts need identifier-like filenames; the drawer previews this same name. */
export function matlabFileName(stem: string, suffix = ''): string {
  const clean = (text: string) => text.replace(/[^a-zA-Z0-9_]/g, '_');
  const tail = suffix ? `_${clean(suffix).slice(0, 20)}` : '';
  return `pmks_${(clean(stem) || 'analysis').slice(0, 58 - tail.length)}${tail}.m`;
}

/** MATLAB character literals cannot interpret a part's name as code or TeX. */
export function matlabString(value: string): string {
  return `'${value.replace(/[\r\n\u2028\u2029]/g, ' ').replace(/'/g, "''")}'`;
}

export function matlabMatrix(rows: number[][]): string {
  if (!rows.length) return '[]';
  return `[\n${rows
    .map(
      (row) =>
        '  ' +
        row
          .map((value) => {
            if (Number.isNaN(value) || value === undefined) return 'NaN';
            if (value === Infinity) return 'Inf';
            if (value === -Infinity) return '-Inf';
            return String(value);
          })
          .join(' ')
    )
    .join(';\n')}\n]`;
}

/** Full precision PMKS references, named plots, and an editable experimental comparison. */
export function matlabResults(table: ExportTable, projectUrl: string): string {
  const rows = table.times.map((time, i) => [time, ...table.columns.map((column) => column[i])]);
  const periods = table.plots.flatMap((plot) => plot.series.map(() => plot.anglePeriod ?? 0));
  return `% PMKS+ analysis: ${table.name.replace(/[\r\n]/g, ' ')}
% Generated from the selected quantities and this machine's own clock.
% Reference results are sampled by PMKS, not independently solved by MATLAB.
% Run the whole script in MATLAB R2016b or newer; no toolbox is required.
% Inspired by PMKS_Verification's initialization, plots and RMSE workflow:
% https://github.com/PMKS-Web/PMKS_Verification
% All lengths, angles, forces and torques use the units in the labels below.
% Missing/singular solver results remain NaN. No rounding is applied.
project_url = ${matlabString(projectUrl)};
reference = ${matlabMatrix(rows)};
time = reference(:, 1);
values = reference(:, 2:end);
labels = {${table.heads.slice(1).map(matlabString).join(', ')}};
angle_periods = ${matlabMatrix([periods])};

%% Plot the selected PMKS theoretical results
for column = 1:size(values, 2)
    figure('Name', labels{column});
    plot(time, values(:, column), '-', 'DisplayName', 'PMKS theoretical');
    xlabel('Time (s)'); ylabel(labels{column}, 'Interpreter', 'none');
    title(labels{column}, 'Interpreter', 'none'); grid on;
    legend('show', 'Interpreter', 'none');
end

%% Compare a measured quantity (edit these four inputs and run again)
% Each row is [time_in_seconds measured_value], in the selected column's units.
% Example: measured = [0 1.25; 0.1 1.32];
% Time 0 is the mechanism's start pose; use the drawing's origin/directions.
measured = zeros(0, 2);
measurement_column = 1; % Index into labels (time is not a value column).
time_offset = 0; % Compared time = measured time + this explicit offset.
% Angular positions use the shortest angular residual; rates do not wrap.
if ~isempty(measured)
    comparison = pmks_compare(time, values(:, measurement_column), measured, ...
        time_offset, angle_periods(measurement_column));
    fprintf('RMSE: %.12g (%s)\\n', comparison.rmse, labels{measurement_column});
    fprintf('%d compared; %d excluded. Mean error: %.12g; peak absolute error: %.12g\\n', ...
        size(comparison.points, 1), comparison.excluded, comparison.bias, comparison.peak_error);
    figure('Name', 'Measured vs theoretical');
    plot(time, values(:, measurement_column), '-', 'DisplayName', 'PMKS theoretical'); hold on;
    plot(comparison.points(:, 1), comparison.points(:, 2), 'o', 'DisplayName', 'Measured');
    xlabel('Time (s)'); ylabel(labels{measurement_column}, 'Interpreter', 'none');
    title('Measured vs theoretical'); grid on; legend('show');
end
`;
}

export const MATLAB_COMPARISON_FUNCTION = `
function result = pmks_compare(time, theory, measured, offset, period)
    assert(size(measured, 2) == 2 && all(isfinite(measured(:))), ...
        'Measured data must have two finite numeric columns.');
    assert(all(diff(measured(:, 1)) > 0), 'Measured times must increase without duplicates.');
    assert(isfinite(offset) && isscalar(offset), 'The time offset must be finite.');
    assert(all(isfinite(time)) && all(diff(time) > 0), 'Theoretical times must increase.');
    points = zeros(0, 4); % compared time, measured value, interpolated theory, residual
    for k = 1:size(measured, 1)
        t = measured(k, 1) + offset;
        if t < time(1) || t > time(end), continue; end
        right = find(time >= t, 1);
        predicted = theory(right);
        if time(right) ~= t
            left = right - 1;
            if ~isfinite(theory(left)) || ~isfinite(predicted), continue; end
            delta = predicted - theory(left);
            if period > 0, delta = mod(delta + period/2, period) - period/2; end
            predicted = theory(left) + (t-time(left))/(time(right)-time(left))*delta;
        end
        if ~isfinite(predicted), continue; end
        residual = measured(k, 2) - predicted;
        if period > 0, residual = mod(residual + period/2, period) - period/2; end
        assert(isfinite(residual), 'The measured difference exceeds the numeric range.');
        points(end+1, :) = [t measured(k, 2) predicted residual]; %#ok<AGROW>
    end
    assert(~isempty(points), 'No measurements overlap valid theoretical samples.');
    result.points = points;
    result.excluded = size(measured, 1) - size(points, 1);
    result.peak_error = max(abs(points(:, 4)));
    result.rmse = 0;
    if result.peak_error > 0
        result.rmse = result.peak_error * sqrt(mean((points(:, 4)/result.peak_error).^2));
    end
    result.bias = mean(points(:, 4));
end
`;
