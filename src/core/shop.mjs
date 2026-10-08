// Shop: purchases, equipping, XP Shake, Drachma Boost and streak restores as consumables. Cosmetics and comforts only: nothing here changes a rank. Pure.
import { canRestore, restore, view, RESTORES } from './streak.mjs';

export const CONSUMABLE_IDS = ['super', 'mega', 'revive', 'xpshake', 'dboost'];
export const SLOT_OF = { background: 'background', frame: 'frame', effect: 'effect', theme: 'theme', title: 'title', sound: 'sound' };

export function newInventory() {
  return { super: 0, mega: 0, revive: 0, xpshake: 0, dboost: 0, shakeActive: false, boostActive: false, owned: [], equipped: { background: null, frame: null, effect: null, theme: null, title: null, sound: null } };
}

export function priceOf(shop, id) {
  return shop.consumables.find((c) => c.id === id)?.price ?? shop.cosmetics.find((c) => c.id === id)?.price ?? null;
}

/** Returns { ok, game, error? } with error in: unknown | owned | funds */
export function purchase(game, shop, id) {
  const price = priceOf(shop, id);
  if (price == null) return { ok: false, error: 'unknown', game };
  const isConsumable = CONSUMABLE_IDS.includes(id);
  if (!isConsumable && game.inventory.owned.includes(id)) return { ok: false, error: 'owned', game };
  if (game.drachmas < price) return { ok: false, error: 'funds', game };
  const g = structuredClone(game);
  g.drachmas -= price;
  if (isConsumable) g.inventory[id] += 1; else g.inventory.owned.push(id);
  return { ok: true, game: g };
}

/** Equip an owned cosmetic (or unequip it when it is already equipped). */
export function toggleEquip(game, shop, id) {
  const item = shop.cosmetics.find((c) => c.id === id);
  if (!item || !game.inventory.owned.includes(id)) return { ok: false, game };
  const g = structuredClone(game);
  const slot = SLOT_OF[item.kind];
  g.inventory.equipped[slot] = g.inventory.equipped[slot] === id ? null : id;
  return { ok: true, game: g, equipped: g.inventory.equipped[slot] === id };
}

/** One XP Shake can be active at a time; it doubles the XP of the next rewarded workout. */
export function activateShake(game) {
  if (game.inventory.xpshake < 1 || game.inventory.shakeActive) return { ok: false, game };
  const g = structuredClone(game);
  g.inventory.xpshake -= 1; g.inventory.shakeActive = true;
  return { ok: true, game: g };
}

/** One Drachma Boost can be active at a time; it doubles the drachmas of the next rewarded workout. */
export function activateBoost(game) {
  if ((game.inventory.dboost ?? 0) < 1 || game.inventory.boostActive) return { ok: false, game };
  const g = structuredClone(game);
  g.inventory.dboost -= 1; g.inventory.boostActive = true;
  return { ok: true, game: g };
}

/** Uses a restore from the inventory on the broken streak. */
export function useRestore(game, kind, todayKey) {
  if (!RESTORES[kind] || game.inventory[kind] < 1 || !canRestore(game.streak, kind, todayKey)) return { ok: false, game };
  const g = structuredClone(game);
  g.streak = restore(game.streak, kind, todayKey);
  g.inventory[kind] -= 1;
  return { ok: true, game: g };
}
/** Restores the player owns that could fix the current break. */
export const usableRestores = (game, todayKey) => Object.keys(RESTORES).filter((k) => game.inventory[k] > 0 && canRestore(game.streak, k, todayKey));
export const brokenInfo = (game, todayKey) => view(game.streak, todayKey).broken;
