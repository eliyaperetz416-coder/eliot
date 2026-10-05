// Ranking group (one of the 10, or 'other') per family. Dips/push-up variants and per-exercise overrides use the dataset muscle.
const G = {
  chest: ['bench-flat', 'bench-incline', 'db-bench', 'db-incline', 'chest-machine', 'chest-cable-press', 'fly-db', 'fly-cable', 'pec-deck', 'pushup', 'pullover-db', 'pullover-bb'],
  back: ['deadlift', 'rack-pull', 'hyperextension', 'row-barbell', 'row-db', 'row-cable', 'row-machine', 'row-bodyweight', 'pulldown', 'straight-arm', 'pullup', 'chinup', 'shrug-bb', 'shrug-db', 'clean'],
  shoulders: ['ohp', 'db-press-shoulder', 'machine-shoulder', 'cable-press-shoulder', 'push-press', 'lateral-raise', 'front-raise', 'rear-delt-db', 'rear-delt-machine', 'rear-delt-cable', 'face-pull', 'upright-row'],
  biceps: ['curl-bb', 'curl-db', 'hammer', 'curl-cable', 'curl-machine'],
  triceps: ['pushdown', 'skull', 'overhead', 'tri-kickback', 'close-grip', 'tri-machine', 'bench-dip'],
  quads: ['squat', 'front-squat', 'leg-press', 'hack-machine', 'leg-extension', 'lunge-bb', 'lunge-db', 'stepup-db'],
  hamstrings: ['rdl', 'leg-curl', 'glute-ham', 'good-morning', 'reverse-hyper'],
  glutes: ['hip-thrust', 'cable-glute', 'pull-through'],
  calves: ['calf-standing', 'calf-seated', 'calf-press'],
  abs: ['cable-crunch', 'ab-machine', 'cable-rotation', 'side-bend-db', 'side-bend-bb', 'pallof'],
  other: ['hip-abduction'],
};
export const FAMILY_GROUP = Object.fromEntries(Object.entries(G).flatMap(([g, fs]) => fs.map((f) => [f, g])));
