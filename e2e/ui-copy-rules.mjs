export const BANNED = [
  [/\blinkages?\b/i, 'linkage — say mechanism'],
  [/\bmounts?\b/i, 'mount — a code word; a cylinder has two joints'],
  // Narrower than the guide's own wording, on purpose. A slider-crank engine
  // really does have a piston and a shaper really does have a ram; what is
  // banned is either word standing in for *cylinder*, and only the cylinder
  // sense is worth failing a build over.
  [/\b(driven|guided|hydraulic)\s+rams?\b/i, 'ram — say cylinder'],
  [/\bram\s+(mount|barrel|rod|joint)/i, 'ram — say cylinder'],
  [/\bsimulation\b/i, 'simulation — say animation'],
  [/\bactuator\b/i, 'actuator — say driven'],
  [/\bcolour\b/i, 'colour — spell American'],
  [/\bcentred?\b/i, 'centred/centre — spell American'],
  [/\bneighbour/i, 'neighbour — spell American'],
  [/\banalyse[ds]?\b/i, 'analyse — spell American'],
  [/\bTODO\b/, 'TODO placeholder'],
  [/not available yet/i, 'not available yet — say "Not built yet."'],
  [/\bT\s*=\s*0\b/, 'T=0 — the app calls it the start'],
];
