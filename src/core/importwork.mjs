// Turns pasted text (for example the exercises from one of your model's videos) into a saved workout. OUR DESIGN.
// Pure. One exercise per line, like "1. Bench press - 4 x 6-8" or "לחיצת חזה 4×6-8". Without sets and reps the line gets 3 x 8-12.
import { searchExercises } from './search.mjs';
import { routineEntry } from './routines.mjs';

const SETS_REPS = /(\d{1,2})\s*(?:סטים|סט|sets?)?\s*[x×*]\s*(\d{1,3})(?:\s*[-–]\s*(\d{1,3}))?/i;
const NAME_LINE = /^\s*(?:שם(?: האימון)?|name|workout)\s*[:：]\s*(.+)$/i;

/** { name, lines: [{ raw, query, sets, repsMin, repsMax }] } from the pasted text. */
export function parseWorkoutText(text) {
  let name = '';
  const lines = [];
  for (const raw0 of String(text ?? '').split(/\r?\n/)) {
    const raw = raw0.trim();
    if (!raw) continue;
    const nm = NAME_LINE.exec(raw);
    if (nm) { name = nm[1].trim().slice(0, 40); continue; }
    const body = raw.replace(/^\s*(?:\d{1,2}[.)]|[-•*])\s+/, '');
    const m = SETS_REPS.exec(body);
    const query = (m ? body.replace(m[0], ' ') : body).replace(/[–—:,()\[\]]/g, ' ').replace(/\s-\s/g, ' ').replace(/\s+/g, ' ').trim();
    if (!query) continue;
    let sets = 3, repsMin = 8, repsMax = 12;
    if (m) { sets = Math.min(10, Math.max(1, +m[1])); repsMin = Math.min(100, Math.max(1, +m[2])); repsMax = m[3] ? Math.min(100, Math.max(repsMin, +m[3])) : repsMin; }
    lines.push({ raw, query, sets, repsMin, repsMax });
  }
  return { name, lines };
}

/** Matches each line to an exercise. { entries, unmatched: [raw lines] }. `haystackOf(ex)` lists the strings to search, as the exercise picker does. */
export function matchWorkout(parsed, exercises, haystackOf) {
  const entries = [], unmatched = [];
  for (const l of parsed.lines) {
    const hit = searchExercises(exercises, l.query, haystackOf)[0];
    if (hit && exercises.includes(hit)) entries.push(routineEntry(hit, { sets: l.sets, repsMin: l.repsMin, repsMax: l.repsMax }));
    else unmatched.push(l.raw);
  }
  return { entries, unmatched };
}
