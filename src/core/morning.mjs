// The morning reminder (OUR DESIGN, Elia 25.11, after a friend's example): every morning at the time you chose, a
// notification with what you planned for today ("Today: Legs. Let's go!"). The phone writes the seven messages (one per
// weekday, 0 = Sunday) next to its push address; the server only picks today's and sends it (supabase/migrations/017).
// Pure: the wording comes in through `t`, the names of the planned items through `textOf`.

export const MORNING_DEFAULT = '08:00';
const cut = (s, n) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** days = schedule.days ({ 0..6: [entry] }) -> 7 × { title, body } */
export function morningMessages(days, { textOf, t }) {
  return Array.from({ length: 7 }, (_, wd) => {
    const list = days?.[wd] ?? days?.[String(wd)] ?? [];
    const doing = list.filter((e) => e.kind !== 'rest');
    if (doing.length) return { title: cut(t('morning.train.title', { what: textOf(doing) }), 120), body: cut(t('morning.train.body'), 160) };
    if (list.length) return { title: cut(t('morning.rest.title'), 120), body: cut(t('morning.rest.body'), 160) };
    return { title: cut(t('morning.none.title'), 120), body: cut(t('morning.none.body'), 160) };
  });
}

/** "HH:MM" -> minutes after midnight; anything odd -> 08:00. */
export function minuteOf(hhmm) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm ?? ''));
  const h = m ? Number(m[1]) : NaN, min = m ? Number(m[2]) : NaN;
  return h >= 0 && h < 24 && min >= 0 && min < 60 ? h * 60 + min : 480;
}
