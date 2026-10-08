import test from 'node:test';
import assert from 'node:assert/strict';
import { base64UrlToBytes, weekStart, statsFromState, sortBoard, errorKey, normalizeCode, validNick, unreadCount, inviteText } from '../src/core/crew.mjs';
import { newGame } from '../src/core/gamestate.mjs';

test('week starts on Monday (local date keys)', () => {
  assert.equal(weekStart('2026-10-07'), '2026-10-05'); // Wednesday
  assert.equal(weekStart('2026-10-05'), '2026-10-05'); // Monday itself
  assert.equal(weekStart('2026-10-11'), '2026-10-05'); // Sunday
  assert.equal(weekStart('2026-01-01'), '2025-12-29'); // across the year
});

const w = (dateKey, volume) => ({ dateKey, stats: { volume } });
test('shared stats: numbers only, this week and this month', () => {
  const game = { ...newGame(), xp: 0 };
  const s = statsFromState({ workouts: [w('2026-10-05', 1000), w('2026-10-06', 500), w('2026-10-02', 9999), w('2026-09-30', 1)], overall: { pending: false, rating: 612 }, game, streakNow: 3, todayKey: '2026-10-07' });
  assert.equal(s.weekVolume, 1500);
  assert.equal(s.monthWorkouts, 3);
  assert.equal(s.workouts, 4);
  assert.equal(s.level, 1); assert.equal(s.streak, 3); assert.equal(s.rating, 612); assert.equal(s.tier, 'diamond'); assert.equal(s.division, 'V');
  assert.deepEqual(Object.keys(s).sort(), ['division', 'level', 'monthWorkouts', 'rating', 'streak', 'tier', 'weekVolume', 'workouts']);
  const pending = statsFromState({ workouts: [], overall: { pending: true, rating: 0 }, game, streakNow: 0, todayKey: '2026-10-07' });
  assert.equal('rating' in pending, false, 'no rating before the overall rank exists');
});

test('board sorting: best first, unranked last, stable ties', () => {
  const m = [{ nickname: 'Cy', stats: {} }, { nickname: 'Bo', stats: { rating: 500, level: 3, weekVolume: 100, streak: 9 } }, { nickname: 'Al', stats: { rating: 700, level: 2, weekVolume: 50, streak: 1 } }, { nickname: 'Di', stats: { rating: 700, level: 5 } }];
  assert.deepEqual(sortBoard(m, 'rating').map((x) => x.nickname), ['Di', 'Al', 'Bo', 'Cy']);
  assert.deepEqual(sortBoard(m, 'level').map((x) => x.nickname), ['Di', 'Bo', 'Al', 'Cy']);
  assert.deepEqual(sortBoard(m, 'week').map((x) => x.nickname), ['Bo', 'Al', 'Di', 'Cy']);
  assert.equal(sortBoard(m, 'streak')[0].nickname, 'Bo');
  assert.deepEqual(m.map((x) => x.nickname), ['Cy', 'Bo', 'Al', 'Di'], 'input not mutated');
});

test('error names, code and nickname cleanup', () => {
  assert.equal(errorKey(new Error('nick_taken')), 'nick_taken');
  assert.equal(errorKey({ message: 'group_full' }), 'group_full');
  assert.equal(errorKey(new Error('offline')), 'offline');
  assert.equal(errorKey(new TypeError('Failed to fetch')), 'offline');
  assert.equal(errorKey(new Error('???')), 'generic');
  assert.equal(normalizeCode(' ab-c d23x9 '), 'ABCD23');
  assert.equal(validNick('  Dan   the  man '), 'Dan the man');
  assert.equal(validNick('   '), null);
  assert.equal(validNick('x'.repeat(25)), null);
});

test('unread ignores my own and system messages', () => {
  const msgs = [{ id: 1, member_id: 'a', kind: 'chat' }, { id: 2, member_id: 'me', kind: 'chat' }, { id: 3, member_id: 'b', kind: 'system' }, { id: 4, member_id: 'b', kind: 'status' }];
  assert.equal(unreadCount(msgs, 0, 'me'), 2);
  assert.equal(unreadCount(msgs, 1, 'me'), 1);
  assert.equal(unreadCount(msgs, 4, 'me'), 0);
});

test('invite text has the code and the link in both languages', () => {
  const i = { name: 'Gym bros', code: 'AB23CD', url: 'https://x.vercel.app' };
  for (const lang of ['he', 'en']) { const t = inviteText(i, lang); assert.ok(t.includes('AB23CD') && t.includes('https://x.vercel.app') && t.includes('Gym bros')); }
});

test('push key conversion: base64url text -> bytes (65 for a P-256 public key)', () => {
  const key = 'BGHF4v4jgvywkr9KHUC2otVMTOdoImKR8inSmv6ndYtP-1CZfFfjg1tOcCDzuzUkCD8x8dopqjmiapHRPQ_JNPg';
  const b = base64UrlToBytes(key);
  assert.equal(b.length, 65);
  assert.equal(b[0], 4, 'uncompressed point marker');
  assert.deepEqual([...base64UrlToBytes('-_8')], [251, 255]);
});

test('plan payload: kinds and your own names only; this week trained days', async () => {
  const { planPayload, planRows, sundayWeek } = await import('../src/core/crew.mjs');
  assert.equal(sundayWeek('2026-10-08')[0], '2026-10-04');
  assert.equal(sundayWeek('2026-10-04')[0], '2026-10-04');
  assert.equal(sundayWeek('2026-10-10')[6], '2026-10-10');
  const schedule = { days: { 0: { kind: 'workout', ref: 'r1' }, 1: { kind: 'rest' }, 2: { kind: 'activity', type: 'basketball' }, 3: { kind: 'activity', type: 'other', label: 'Pool' }, 4: { kind: 'workout', ref: 'plan' } }, done: { '2026-10-06': true } };
  const p = planPayload({ schedule, routines: [{ id: 'r1', name: 'Push A', entries: [{ exerciseId: 'secret', weight: 100 }] }], workouts: [{ dateKey: '2026-10-04', entries: [] }, { dateKey: '2026-09-01' }], todayKey: '2026-10-08' });
  assert.deepEqual(p.days, { 0: { k: 'workout', n: 'Push A' }, 1: { k: 'rest' }, 2: { k: 'activity', n: 'basketball' }, 3: { k: 'activity', n: 'Pool' }, 4: { k: 'workout', n: '' } });
  assert.deepEqual(p.trained, ['2026-10-04', '2026-10-06']);
  assert.ok(!JSON.stringify(p).includes('secret') && !JSON.stringify(p).includes('100'));
  const rows = planRows(p, '2026-10-08');
  assert.equal(rows.length, 7);
  assert.deepEqual(rows[0], { weekday: 0, key: '2026-10-04', kind: 'workout', name: 'Push A', trained: true });
  assert.equal(rows[5].kind, null);
  assert.equal(planRows(null, '2026-10-08'), null);
});
