import { t } from '../core/i18n.mjs';
/** "Upper A", "Push" ... as shown for a plan day. */
export const planDayLabel = (plan, day) => {
  const sameType = plan.days.filter((d) => d.week === day.week && d.type === day.type);
  const n = sameType.length > 1 ? ` ${sameType.findIndex((d) => d.day === day.day) + 1}` : '';
  return `${t(`plan.day.${day.type}`)}${n}`;
};
