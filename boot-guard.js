// Start-up guard (OUR DESIGN). A separate classic script (not inline) so the Content-Security-Policy can forbid inline scripts.
// If the app has not started after 8 s (a script of the app failed to load on a bad network or a busy server), reload once;
// if it still has not started after 16 s, show a message with a button instead of a black page.
(function () {
  var root = document.documentElement;
  var ready = function () { return root.dataset.ready === '1'; };
  setTimeout(function () {
    if (ready()) return;
    var key = 'dg.guardReload', last = 0;
    try { last = Number(sessionStorage.getItem(key)) || 0; } catch (e) { /* private mode */ }
    if (Date.now() - last > 60000) {
      try { sessionStorage.setItem(key, String(Date.now())); } catch (e) { /* ignore */ }
      location.reload();
    }
  }, 8000);
  setTimeout(function () {
    var app = document.getElementById('app');
    if (ready() || !app || app.childNodes.length) return;
    var h = document.createElement('h1'); h.textContent = 'Demigod';
    var p = document.createElement('p'); p.textContent = "לא הצלחנו לפתוח את האפליקציה. הנתונים שלך שמורים. בדוק חיבור ונסה שוב. / Couldn't open the app. Your data is safe. Check your connection and try again.";
    var b = document.createElement('button'); b.type = 'button'; b.textContent = 'נסה שוב / Try again'; b.onclick = function () { location.reload(); };
    app.append(h, p, b);
  }, 16000);
})();
