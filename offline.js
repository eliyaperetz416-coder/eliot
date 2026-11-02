// Offline page script. A separate file (not inline) so the Content-Security-Policy can forbid inline scripts.
const t = document.getElementById('t');
const b = document.getElementById('b');
const r = document.getElementById('r');
r.addEventListener('click', () => { location.href = './'; });
if ((navigator.language || '').toLowerCase().startsWith('he')) {
  document.documentElement.lang = 'he'; document.documentElement.dir = 'rtl';
  t.textContent = 'אין חיבור';
  b.textContent = 'צריך לטעון את Demigod פעם אחת עם אינטרנט. אחרי זה הוא עובד בכל מקום בחדר הכושר.';
  r.textContent = 'ניסיון נוסף';
}
