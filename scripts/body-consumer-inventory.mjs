import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import ts from 'typescript';
const revision = process.argv[2] || '6d371c82';
const git = (...args) =>
  execFileSync('git', args, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
const commit = git('rev-parse', `${revision}^{commit}`).trim();
const files = git('ls-tree', '-r', '--name-only', commit, '--', 'src/app')
  .trim()
  .split('\n')
  .filter((file) => /\.(ts|html)$/.test(file) && !file.endsWith('.spec.ts'));
const signals = [
  ['point graph', /\.(?:joints|links|connectedJoints|subset)\b/],
  ['legacy record', /\b(?:RealLink|RealJoint|RevJoint|PrisJoint|SliderBlock)\b/],
  ['legacy authority', /\b(?:MechanismService|ActiveObjService|GridUtilsService|SvgGridService)\b/],
  ['scale boundary', /\b(?:MODEL_SCALE|OBJECT_SCALE)\b/],
  [
    'canvas registration',
    /\b(?:canvasHandle|registerCanvasHandle|jointDragState|JointDragState|modeChangeHooks|registerModeChangeHooks)\b/,
  ],
];
const rows = [];
for (const file of files) {
  const source = git('show', `${commit}:${file}`),
    tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  const operations = [];
  function visit(node) {
    if (
      ts.isFunctionDeclaration(node) ||
      ts.isMethodDeclaration(node) ||
      ts.isGetAccessorDeclaration(node) ||
      ts.isSetAccessorDeclaration(node) ||
      ts.isConstructorDeclaration(node)
    ) {
      operations.push({
        start: node.getStart(tree),
        end: node.end,
        name:
          node.name?.getText(tree) ||
          (ts.isConstructorDeclaration(node) ? 'constructor' : '<function>'),
      });
    }
    ts.forEachChild(node, visit);
  }
  if (file.endsWith('.ts')) visit(tree);
  let offset = 0;
  source.split('\n').forEach((line, index) => {
    const matched = signals.filter(([, pattern]) => pattern.test(line)).map(([name]) => name);
    if (matched.length) {
      const enclosing = operations
        .filter((operation) => operation.start <= offset + line.length && operation.end >= offset)
        .sort((a, b) => a.end - a.start - (b.end - b.start))[0];
      rows.push([
        file,
        index + 1,
        enclosing?.name || (file.endsWith('.html') ? '<template>' : '<module>'),
        matched.join('; '),
        line.trim().replaceAll('\t', ' '),
        'pending S6/S7 semantic disposition',
      ]);
    }
    offset += line.length + 1;
  });
}
writeFileSync(
  'docs/bodies-and-joints-consumers-current.tsv',
  [
    'file\tline\toperation\tsignals\tsource\tdisposition',
    ...rows.map((row) => row.join('\t')),
  ].join('\n') + '\n'
);
const summary = {
  commit,
  sites: rows.length,
  files: new Set(rows.map((row) => row[0])).size,
  patterns: signals.map(([name, pattern]) => ({ name, pattern: pattern.source })),
  note: 'A mechanical superset, including declarations and comments. Close this scan and the frozen S0 semantic inventory separately; a missing match does not prove removal.',
};
writeFileSync(
  'docs/bodies-and-joints-consumers-current.json',
  JSON.stringify(summary, null, 2) + '\n'
);
console.log(summary);
