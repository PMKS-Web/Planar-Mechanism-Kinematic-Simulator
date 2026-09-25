"""Recount saved experiments without making model calls. Usage: audit.py EXPLAIN_WORKTREE."""
import collections
import hashlib
import json
import pathlib
import subprocess
import sys

root = pathlib.Path(sys.argv[1]).resolve()
docs = root / 'docs'
generation = docs / 'generate-experiment'

def read(path):
    return json.loads(path.read_text())

groups = collections.defaultdict(collections.Counter)
manifest = {}
for path in sorted((generation / 'generated').glob('*.json')):
    raw = read(path)
    key = '__'.join(path.stem.split('__')[1:])
    counts = groups[key]
    candidates = raw.get('candidates', [])
    counts['saved_requests'] += 1
    counts['requests_with_candidates'] += bool(candidates)
    counts['candidates'] += len(candidates)
    counts['candidates_with_trace'] += sum(
        any(j.get('trace') for j in c.get('joints', [])) for c in candidates)
    counts['candidates_with_named_link'] += sum(
        any(l.get('name') for l in c.get('links', [])) for c in candidates)
    manifest[path.name] = hashlib.sha256(path.read_bytes()).hexdigest()

historical = collections.defaultdict(collections.Counter)
passing = collections.defaultdict(set)
first = collections.defaultdict(set)
for row in read(generation / 'verified.json'):
    key = '__'.join(pathlib.Path(row['file']).stem.split('__')[1:])
    historical[key]['report_rows'] += 1
    if row['index'] >= 0:
        historical[key]['tested_candidates'] += 1
        historical[key]['passing_candidates'] += bool(row.get('ok'))
    if row.get('ok'):
        passing[key].add(row['file'])
        if row['index'] == 0:
            first[key].add(row['file'])
for key in historical:
    historical[key]['requests_with_any_pass'] = len(passing[key])
    historical[key]['requests_with_first_pass'] = len(first[key])
    historical[key]['attempted_requests'] = groups[key]['saved_requests']

stale = []
for version in ['g3', 'g4', 'g5']:
    prompt = {'g3': 'G3-designed', 'g4': 'G4-parts', 'g5': 'G5-parts'}[version]
    for row in read(generation / (version + '-links.json')):
        file = f"{row['key']}__{prompt}__{row['model']}.json"
        raw = read(generation / 'generated' / file)
        if row.get('tried') == [] and raw.get('candidates'):
            stale.append({'report': version + '-links.json', 'file': file,
                          'raw_candidates': len(raw['candidates'])})

gemini = collections.defaultdict(collections.Counter)
for path in (docs / 'describe-experiment/gemini-out').glob('*.json'):
    row = read(path)
    model = path.stem.split('__')[2]
    gemini[model]['records'] += 1
    gemini[model]['http_200'] += row.get('status') == 200

out = {
    'source_revision': subprocess.check_output(
        ['git', '-C', str(root), 'rev-parse', 'HEAD'], text=True).strip(),
    'method': 'Static recount of saved records; no fresh inference or mechanical replay.',
    'generation_raw': dict(sorted(groups.items())),
    'generation_historical_gate': dict(sorted(historical.items())),
    'stale_selection_reports': stale,
    'correction_records': len(read(generation / 'corrections-verified.json')) - 1,
    'repair_call_records': len(list((docs / 'explain-why-evidence/calls').glob('*.json'))),
    'explanation_call_records': len(list((docs / 'explain-why-evidence/explanation-calls').glob('*-[123].json'))),
    'repair_prose_audit': read(docs / 'explain-why-evidence/prose-audit.json')['summary'],
    'description_response_files': {
        version: len(list((docs / 'describe-experiment' / version).glob('*.txt')))
        for version in ['responses-v1', 'responses-v2', 'responses-v3']
    },
    'gemini_description_records': dict(gemini),
    'generation_sha256': manifest,
}
print(json.dumps(out, indent=2))
