const data = await fetch('/samples.json').then((response) => response.json());
const control = (id) => document.getElementById(id);
let current,
  frame = 0,
  playing = false,
  lastTime;
function choose() {
  current = data.cases.find(
    (one) =>
      one.id === control('fixture').value && one.direction === Number(control('direction').value)
  );
  frame = 0;
  control('scrub').max = current.samples.length - 1;
  render();
}
function render() {
  const index = Math.min(current.samples.length - 1, Math.round(frame));
  const sample = current.samples[index],
    points = sample.points;
  const scale = Number(control('speed').value) / 60;
  const circle = (x, y, r, attributes) => `<circle cx="${x}" cy="${y}" r="${r}" ${attributes}/>`;
  const line = (a, b, attributes) =>
    `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" ${attributes}/>`;
  let geometry = '',
    labels = '';
  current.gears.forEach((gear, i) => {
    const center = points[gear.centerJointId],
      r = (gear.teeth * gear.module) / 2;
    const angle = sample.angles[gear.id].angle;
    const color = i ? '#d06c24' : '#4054b2';
    geometry += circle(
      center.x,
      center.y,
      r,
      `fill="${color}" fill-opacity=".07" stroke="${color}" stroke-width=".035"`
    );
    for (let tooth = 0; tooth < gear.teeth; tooth++) {
      const theta = angle + (tooth * 2 * Math.PI) / gear.teeth;
      geometry += line(
        { x: center.x + (r - 0.06) * Math.cos(theta), y: center.y + (r - 0.06) * Math.sin(theta) },
        { x: center.x + (r + 0.06) * Math.cos(theta), y: center.y + (r + 0.06) * Math.sin(theta) },
        `stroke="${color}" stroke-width=".025"`
      );
    }
    labels += `<text x="${center.x}" y="${-center.y + 0.4}" text-anchor="middle" font-size=".22" fill="${color}">${gear.teeth}T</text>`;
  });
  current.links.forEach((link) => {
    geometry += line(
      points[link.points[0]],
      points[link.points[1]],
      'stroke="#324451" stroke-width=".085" stroke-linecap="round"'
    );
  });
  Object.entries(points).forEach(([id, point]) => {
    geometry += circle(point.x, point.y, 0.07, 'fill="white" stroke="#324451" stroke-width=".025"');
    labels += `<text x="${point.x + 0.1}" y="${-point.y - 0.12}" font-size=".2">${id}</text>`;
  });
  control('drawing').setAttribute(
    'viewBox',
    current.id === 'five' ? '-8 -6 15 12' : '-4.5 -3.3 10.5 7'
  );
  control('drawing').innerHTML = `<g transform="scale(1,-1)">${geometry}</g>${labels}`;
  control('scrub').value = index;
  control('time').textContent =
    `${(sample.time / scale).toFixed(3)} / ${(current.period / scale).toFixed(2)} s`;
  control('travel').textContent = `${(sample.q / (2 * Math.PI)).toFixed(3)} turns`;
  const output = sample.angles.G2;
  control('angle').textContent = `${((output.angle * 180) / Math.PI).toFixed(1)}°`;
  control('omega').textContent = `${(((output.velocity * 30) / Math.PI) * scale).toFixed(1)} RPM`;
  control('alpha').textContent = `${(output.acceleration * scale ** 2).toFixed(2)} rad/s²`;
  control('speedValue').textContent = `${control('speed').value} RPM`;
  const point = points.D;
  control('point').textContent =
    `Output attachment D: velocity (${point.velocity.map((v) => (v * scale).toFixed(3)).join(', ')}); acceleration (${point.acceleration.map((a) => (a * scale ** 2).toFixed(3)).join(', ')}), in fixture length units per second and per second squared.`;
}
control('fixture').onchange = choose;
control('direction').onchange = choose;
control('speed').oninput = render;
control('play').onclick = () => {
  playing = !playing;
  control('play').textContent = playing ? 'Pause' : 'Play';
};
control('reset').onclick = () => {
  frame = 0;
  render();
};
control('scrub').oninput = () => {
  playing = false;
  control('play').textContent = 'Play';
  frame = Number(control('scrub').value);
  render();
};
function tick(now) {
  if (playing && lastTime !== undefined) {
    frame +=
      ((((now - lastTime) / 1000) * Number(control('speed').value)) / 60 / current.period) *
      (current.samples.length - 1);
    frame %= current.samples.length - 1;
    render();
  }
  lastTime = now;
  requestAnimationFrame(tick);
}
choose();
requestAnimationFrame(tick);
