// Generated plans: form, plan overview with weeks and days, start a day as a prefilled workout.
import { h } from './dom.js';
import { icon } from './icons.js';
import { t, getLanguage } from '../core/i18n.mjs';
import { GOALS, EXPERIENCE, PLAN_WEEKS, SESSION_MINUTES, GYM_EQUIPMENT, generatePlan, nextPlanDay, planDayId, planProgress } from '../core/generator.mjs';
import { button, emptyState, exThumb, openSheet, segmented, showToast } from './components.js';
import { data } from './data.js';
import { store, savePlan, deletePlan } from './store.js';
import { startFromPlanDay } from './routines.js';
import { planDayLabel } from './plan-names.js';

const nameOf = (ex) => (getLanguage() === 'he' ? ex.nameHe : ex.nameEn);
const go = (hash) => { location.hash = hash; };
const form = { goal: 'hypertrophy', days: 4, equipment: [...GYM_EQUIPMENT], experience: 'beginner', weeks: 6, sessionMin: null };

export function plansScreen() {
  const root = h('main', { class: 'screen' });
  const plans = [...store.plans].reverse();
  root.append(
    h('a', { class: 'back-link', href: '#/workouts' }, icon('chevron', 'chev back-chev'), t('tab.workouts')),
    h('h1', { class: 'ex-title', text: t('plans.title') }),
    h('p', { class: 'row-sub', text: t('plans.hint') }),
    h('div', { class: 'stack', style: 'padding-block:12px' }, button({ label: t('plans.generate'), icon: 'bolt', block: true, onClick: () => go('#/plan/new') })));
  if (!plans.length) root.append(emptyState({ icon: 'bolt', title: t('plans.empty.title'), body: t('plans.empty.body') }));
  for (const p of plans) {
    const pr = planProgress(p);
    root.append(h('a', { class: 'card plan-card', href: `#/plan/${p.id}` },
      h('div', { class: 'row-title', text: `${t(`plan.goal.${p.goal}`)} · ${t('plan.perWeek', { n: p.daysPerWeek })}` }),
      h('div', { class: 'row-sub', text: `${t(`plan.exp.${p.experience}`)} · ${t('plan.weeks', { n: p.weeks })}` }),
      h('div', { class: 'lp', 'aria-hidden': 'true' }, h('span', { class: 'lp-fill', style: `width:${(pr.done / pr.total) * 100}%` }), h('span', { class: 'lp-text num', text: `${pr.done} / ${pr.total}` }))));
  }
  return root;
}

export function planFormScreen() {
  const root = h('main', { class: 'screen' });
  function draw() {
    const eqChips = h('div', { class: 'chips-wrap' }, GYM_EQUIPMENT.map((q) => h('button', { type: 'button', class: 'chip chip-select', 'aria-pressed': String(form.equipment.includes(q)), onclick: () => {
      form.equipment = form.equipment.includes(q) ? form.equipment.filter((x) => x !== q) : [...form.equipment, q]; draw();
    } }, t(`equipment.${q}`))));
    const seg = (key, values, label, fmt) => segmented({ label, value: form[key], onChange: (v) => { form[key] = v; draw(); }, options: values.map((v) => ({ value: v, label: fmt(v) })) });
    root.replaceChildren(
      h('a', { class: 'back-link', href: '#/plans' }, icon('chevron', 'chev back-chev'), t('plans.title')),
      h('h1', { class: 'ex-title', text: t('plans.generate') }),
      h('p', { class: 'row-sub', text: t('plans.guidance') }),
      h('div', { class: 'section-label', text: t('plan.goal') }), seg('goal', GOALS, t('plan.goal'), (v) => t(`plan.goal.${v}`)),
      h('div', { class: 'section-label', text: t('plan.days') }), seg('days', [2, 3, 4, 5, 6], t('plan.days'), (v) => String(v)),
      h('div', { class: 'section-label', text: t('plan.equipment') }), eqChips,
      h('div', { class: 'section-label', text: t('plan.experience') }), seg('experience', EXPERIENCE, t('plan.experience'), (v) => t(`plan.exp.${v}`)),
      h('div', { class: 'section-label', text: t('plan.length') }), seg('weeks', PLAN_WEEKS, t('plan.length'), (v) => t('plan.weeks', { n: v })),
      h('div', { class: 'section-label', text: t('plan.session') }), seg('sessionMin', [null, ...SESSION_MINUTES], t('plan.session'), (v) => (v ? t('plan.minutes', { n: v }) : t('plan.noLimit'))),
      h('div', { class: 'stack', style: 'padding-block-start:20px' },
        button({ label: t('plans.generate'), block: true, disabled: !form.equipment.length, onClick: async () => {
          const plan = generatePlan({ ...form, seed: Date.now() }, { exercises: data().exercises, ratios: data().ratios });
          await savePlan(plan);
          go(`#/plan/${plan.id}`);
        } })));
  }
  draw();
  return root;
}

export function planScreen(id) {
  if (id === 'new') return planFormScreen();
  const plan = store.plans.find((p) => p.id === id);
  if (!plan) return h('main', { class: 'screen' }, emptyState({ icon: 'bolt', title: t('plans.notfound'), body: '' }), h('a', { class: 'btn btn-secondary btn-block', href: '#/plans' }, t('plans.title')));
  const byId = data().byId;
  const next = nextPlanDay(plan);
  let week = next?.week ?? 1;
  const root = h('main', { class: 'screen' });
  function draw() {
    const pr = planProgress(plan);
    const weekChips = h('div', { class: 'chips-row week-chips' }, Array.from({ length: plan.weeks }, (_, i) => i + 1).map((w) =>
      h('button', { type: 'button', class: 'chip chip-select', 'aria-pressed': String(w === week), onclick: () => { week = w; draw(); } }, w === plan.deloadWeek ? `${w} · ${t('plan.deload')}` : String(w))));
    const days = plan.days.filter((d) => d.week === week).map((d) => {
      const done = plan.done.includes(planDayId(plan, d.week, d.day));
      const isNext = next && next.week === d.week && next.day === d.day;
      return h('section', { class: `card plan-day${done ? ' done' : ''}${isNext ? ' next' : ''}` },
        h('header', { class: 'ent-head' },
          h('div', {}, h('div', { class: 'row-title', text: `${t('plan.day', { n: d.day })} · ${planDayLabel(plan, d)}` }), h('div', { class: 'row-sub', text: d.deload ? t('plan.deload.hint') : t('plan.sets', { n: d.entries.reduce((n, e) => n + e.sets, 0) }) })),
          done ? h('span', { class: 'pr-badge pr-week', text: t('plan.done') }) : null),
        h('ul', { class: 'plan-list' }, d.entries.map((e) => h('li', {}, exThumb(byId[e.exerciseId], 44), h('span', { class: 'plan-name', text: nameOf(byId[e.exerciseId]) }), h('span', { class: 'num plan-sr', dir: 'ltr', text: `${e.sets}×${e.repsMin}-${e.repsMax}` })))),
        done ? null : button({ label: t('routines.start'), variant: isNext ? 'primary' : 'secondary', block: true, icon: 'workout', onClick: () => startFromPlanDay(plan, d) }));
    });
    root.replaceChildren(
      h('a', { class: 'back-link', href: '#/plans' }, icon('chevron', 'chev back-chev'), t('plans.title')),
      h('h1', { class: 'ex-title', text: `${t(`plan.goal.${plan.goal}`)} · ${t('plan.perWeek', { n: plan.daysPerWeek })}` }),
      h('p', { class: 'ex-title-alt', text: `${t(`plan.exp.${plan.experience}`)} · ${t('plan.weeks', { n: plan.weeks })} · ${pr.done}/${pr.total}` }),
      plan.warnings.length ? h('p', { class: 'row-sub warn', text: t('plan.warnings') }) : null,
      h('p', { class: 'row-sub', text: t('plans.guidance') }),
      weekChips, h('div', { class: 'stack', style: 'padding-block-start:12px' }, days),
      h('div', { class: 'btn-pair', style: 'padding-block-start:16px' },
        button({ label: t('plans.regenerate'), variant: 'secondary', onClick: async () => {
          const fresh = generatePlan({ goal: plan.goal, days: plan.daysPerWeek, equipment: plan.equipment, experience: plan.experience, weeks: plan.weeks, sessionMin: plan.sessionMin, seed: Date.now() }, { exercises: data().exercises, ratios: data().ratios });
          fresh.id = plan.id; fresh.done = [];
          await savePlan(fresh); store.plans.splice(store.plans.findIndex((p) => p.id === plan.id), 1, fresh);
          showToast({ message: t('plans.regenerated') }); go(`#/plan/${plan.id}`); window.dispatchEvent(new HashChangeEvent('hashchange'));
        } }),
        button({ label: t('common.delete'), variant: 'danger', onClick: () => {
          const sh = openSheet({ title: t('plans.delete.title'), content: h('div', { class: 'stack' }, h('p', { text: t('plans.delete.confirm') }),
            button({ label: t('common.delete'), variant: 'danger', block: true, onClick: async () => { sh.close(); await deletePlan(plan.id); go('#/plans'); } }),
            button({ label: t('common.cancel'), variant: 'secondary', block: true, onClick: () => sh.close() })) });
        } })));
  }
  draw();
  return root;
}
