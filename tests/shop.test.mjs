import test from 'node:test';
import assert from 'node:assert/strict';
import { purchase, toggleEquip, activateShake, useRestore, usableRestores, newInventory, priceOf } from '../src/core/shop.mjs';
import { recordWorkout, newStreak, addDays, view } from '../src/core/streak.mjs';
import { newGame, shop } from './helpers.mjs';

const rich = (n = 5000) => { const g = newGame(); g.drachmas = n; return g; };

test('catalog: cosmetics and comforts priced 100-1000 with both languages, 5 consumables with the agreed prices', () => {
  const kinds = ['background', 'frame', 'effect', 'theme', 'title', 'sound'];
  assert.equal(shop.cosmetics.length, 40);
  for (const c of shop.cosmetics) {
    assert.ok(c.price >= 100 && c.price <= 1000, c.id);
    assert.ok(c.nameEn && c.nameHe && c.descEn && c.descHe, c.id);
    assert.ok(kinds.includes(c.kind), c.id);
    if (['background', 'frame', 'effect'].includes(c.kind)) assert.ok(c.art, `${c.id} needs art`);
    if (c.kind === 'theme') assert.match(c.hex, /^#[0-9a-f]{6}$/i, c.id);
    if (c.kind === 'sound') assert.ok(['bell', 'gong', 'whistle', 'pulse'].includes(c.sound), c.id);
  }
  assert.equal(new Set([...shop.cosmetics, ...shop.consumables].map((x) => x.id)).size, 45, 'unique ids');
  assert.deepEqual(Object.fromEntries(shop.consumables.map((c) => [c.id, c.price])), { super: 150, mega: 300, revive: 500, xpshake: 100, dboost: 120 });
  for (const kind of kinds) assert.ok(shop.cosmetics.filter((c) => c.kind === kind).length >= 4, kind);
  assert.equal(priceOf(shop, 'nope'), null);
});

test('drachma boost: activate once, doubles the next workout drachmas only', async () => {
  const { activateBoost } = await import('../src/core/shop.mjs');
  let g = purchase(rich(), shop, 'dboost').game;
  assert.equal(g.inventory.dboost, 1);
  g = activateBoost(g).game;
  assert.deepEqual([g.inventory.dboost, g.inventory.boostActive], [0, true]);
  assert.equal(activateBoost(g).ok, false, 'nothing left to activate');
  assert.equal(activateBoost(purchase(g, shop, 'dboost').game).ok, false, 'one at a time');
});

test('purchase: pays, adds to the inventory, refuses without funds, unknown items and double cosmetics', () => {
  let g = rich(1000);
  let r = purchase(g, shop, 'bg_storm'); assert.equal(r.ok, true);
  assert.deepEqual([r.game.drachmas, r.game.inventory.owned], [900, ['bg_storm']]); assert.equal(g.drachmas, 1000, 'input is not mutated');
  assert.equal(purchase(r.game, shop, 'bg_storm').error, 'owned');
  assert.equal(purchase(rich(50), shop, 'fx_dust').error, 'funds');
  assert.equal(purchase(rich(), shop, 'ghost').error, 'unknown');
  r = purchase(rich(1000), shop, 'super'); assert.deepEqual([r.game.inventory.super, r.game.drachmas], [1, 850]);
  r = purchase(r.game, shop, 'super'); assert.equal(r.game.inventory.super, 2, 'consumables stack');
  assert.equal(purchase(rich(149), shop, 'super').error, 'funds'); assert.equal(purchase(rich(150), shop, 'super').ok, true);
  assert.equal(purchase(rich(100), shop, 'xpshake').game.drachmas, 0);
});

test('equip: only owned items, one per slot, toggles off', () => {
  let g = purchase(purchase(purchase(rich(), shop, 'bg_storm').game, shop, 'bg_dawn').game, shop, 'fr_laurel').game;
  assert.equal(toggleEquip(g, shop, 'fx_glow').ok, false, 'not owned');
  g = toggleEquip(g, shop, 'bg_storm').game; assert.equal(g.inventory.equipped.background, 'bg_storm');
  g = toggleEquip(g, shop, 'bg_dawn').game; assert.equal(g.inventory.equipped.background, 'bg_dawn', 'replaces the previous background');
  g = toggleEquip(g, shop, 'fr_laurel').game; assert.deepEqual(g.inventory.equipped, { background: 'bg_dawn', frame: 'fr_laurel', effect: null, theme: null, title: null, sound: null });
  g = toggleEquip(g, shop, 'bg_dawn').game; assert.equal(g.inventory.equipped.background, null, 'equipping again unequips');
  assert.deepEqual(newInventory().equipped, { background: null, frame: null, effect: null, theme: null, title: null, sound: null });
});

test('XP Shake lifecycle: buy, activate once, only one active at a time', () => {
  let g = purchase(rich(), shop, 'xpshake').game;
  assert.equal(g.inventory.xpshake, 1); assert.equal(g.inventory.shakeActive, false);
  assert.equal(activateShake(newGame()).ok, false, 'none owned');
  const a = activateShake(g); assert.deepEqual([a.ok, a.game.inventory.xpshake, a.game.inventory.shakeActive], [true, 0, true]);
  g = purchase(a.game, shop, 'xpshake').game;
  assert.equal(activateShake(g).ok, false, 'one active at a time');
  assert.equal(g.inventory.xpshake, 1);
});

const brokenGame = (len, restoreItem) => {
  let g = rich(); g.inventory[restoreItem] = 1;
  for (let i = 0; i < len; i++) g.streak = recordWorkout(g.streak, addDays('2026-01-01', i)).streak;
  return { g, today: addDays('2026-01-01', len - 1 + 5) };
};

test('restores from the shop: used from the "streak broken" prompt, consumed, kind limits respected', () => {
  const { g, today } = brokenGame(12, 'super');
  assert.deepEqual(usableRestores(g, today), ['super']);
  const r = useRestore(g, 'super', today);
  assert.equal(r.ok, true); assert.equal(r.game.inventory.super, 0); assert.equal(r.game.streak.current, 12); assert.equal(view(r.game.streak, today).broken, null);
  assert.equal(useRestore(r.game, 'super', today).ok, false, 'used up, and nothing is broken any more');
  const big = brokenGame(40, 'super');
  assert.equal(useRestore(big.g, 'super', big.today).ok, false, 'Super does not cover 40 days'); assert.deepEqual(usableRestores(big.g, big.today), []);
  assert.equal(big.g.inventory.super, 1, 'not consumed on failure');
  const mega = brokenGame(40, 'mega'); assert.equal(useRestore(mega.g, 'mega', mega.today).game.streak.current, 40);
  const rev = brokenGame(90, 'revive'); assert.equal(useRestore(rev.g, 'revive', rev.today).game.streak.current, 90);
  const late = brokenGame(12, 'super'); assert.equal(useRestore(late.g, 'super', addDays(late.today, 10)).ok, false, 'window closed');
  const none = brokenGame(12, 'super'); none.g.inventory.super = 0; assert.equal(useRestore(none.g, 'super', none.today).ok, false);
  const fine = rich(); fine.inventory.revive = 1; assert.equal(useRestore(fine, 'revive', '2026-02-01').ok, false, 'nothing to restore');
});
