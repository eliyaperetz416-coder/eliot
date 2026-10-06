// Custom exercises: validation and record building (pure). Images are handled in the UI layer.
import { GROUP_OF_MUSCLE } from './muscles.mjs';
import { uid } from './workout.mjs';

export const CUSTOM_VERSION = 1;
export const CUSTOM_TYPES = ['weight', 'bodyweight', 'time', 'cardio'];
export const EQUIPMENT_IDS = ['barbell', 'dumbbell', 'machine', 'cable', 'ez-bar', 'bodyweight', 'other'];
export const PICKABLE_MUSCLES = ['chest', 'front-deltoids', 'back-deltoids', 'upper-back', 'lower-back', 'trapezius', 'biceps', 'triceps', 'forearm', 'abs', 'obliques', 'quadriceps', 'hamstring', 'gluteal', 'calves', 'adductor', 'abductors', 'neck'];
export const MAX_IMAGE = 800;

/** Scale (w,h) down so the longer side is at most `max` (never up). */
export function fitSize(w, h, max = MAX_IMAGE) {
  const k = Math.min(1, max / Math.max(w, h));
  return { width: Math.max(1, Math.round(w * k)), height: Math.max(1, Math.round(h * k)) };
}

/**
 * form: { name, equipment, type, primary:[ids], secondary:[ids], countsLike: exerciseId|null, notes, imageBlobId }
 * Returns { ok, errors, exercise }.
 */
export function buildCustomExercise(form, byId, { id = null, now = Date.now() } = {}) {
  const errors = {};
  const name = String(form.name ?? '').trim();
  if (!name) errors.name = 'name';
  if (!EQUIPMENT_IDS.includes(form.equipment)) errors.equipment = 'equipment';
  if (!CUSTOM_TYPES.includes(form.type)) errors.type = 'type';
  const primary = [...new Set((form.primary ?? []).filter((m) => PICKABLE_MUSCLES.includes(m)))];
  const secondary = [...new Set((form.secondary ?? []).filter((m) => PICKABLE_MUSCLES.includes(m) && !primary.includes(m)))];
  if (!primary.length) errors.primary = 'primary';
  const like = form.countsLike ? byId[form.countsLike] : null;
  if (form.countsLike && (!like || !like.ranked)) errors.countsLike = 'countsLike';
  if (like && !['weight', 'bodyweight'].includes(form.type)) errors.countsLike = 'countsLike';
  if (Object.keys(errors).length) return { ok: false, errors, exercise: null };

  const groupFromMuscle = primary.map((m) => GROUP_OF_MUSCLE[m]).find(Boolean) ?? 'other';
  const notes = String(form.notes ?? '').split('\n').map((s) => s.trim()).filter(Boolean);
  const ex = {
    id: id ?? `custom-${uid()}`, custom: true, schemaVersion: CUSTOM_VERSION, createdMs: now,
    nameEn: name.slice(0, 60), nameHe: name.slice(0, 60), equipment: form.equipment,
    primaryMuscles: primary, secondaryMuscles: secondary,
    muscleGroup: like ? like.muscleGroup : groupFromMuscle, ranked: !!like, type: form.type,
    instructionsEn: notes, instructionsHe: notes, imageBlobId: form.imageBlobId ?? null, countsLike: like ? like.id : null,
  };
  if (like) { ex.family = like.family; ex.R = like.R; if (like.bwFactor) ex.bwFactor = like.bwFactor; if (like.perHand) ex.perHand = true; }
  return { ok: true, errors: {}, exercise: ex };
}

/** Counts-like candidates: ranked library exercises, optionally filtered by text. */
export const countsLikeOptions = (exercises) => exercises.filter((e) => e.ranked && !e.custom);
