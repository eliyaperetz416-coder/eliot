// Start-up guard (OUR DESIGN). A separate classic script (not inline) so the Content-Security-Policy can forbid inline scripts.
// If the app has not started after 9 s (a script of the app failed to load on a bad network or a busy server), reload;
// at most 3 times in a row, and the count resets as soon as the app starts. If it still has not started after 20 s, show a
// message with a button instead of a black page.
(function () {
  var root = document.documentElement, key = 'dg.guardTries';
  var ready = function () { return root.dataset.ready === '1'; };
  var get = function () { try { return Number(sessionStorage.getItem(key)) || 0; } catch (e) { return 0; } };
  var set = function (n) { try { if (n) sessionStorage.setItem(key, String(n)); else sessionStorage.removeItem(key); } catch (e) { /* private mode */ } };
  var watch = setInterval(function () { if (ready()) { set(0); clearInterval(watch); } }, 500);
  setTimeout(function () {
    var app = document.getElementById('app');
    if (ready() || get() >= 3 || (app && app.childNodes.length)) return; // the app drew something (its own error screen): leave it
    set(get() + 1);
    location.reload();
  }, 9000);
  setTimeout(function () {
    var app = document.getElementById('app');
    if (ready() || !app || app.childNodes.length) return;
    var h = document.createElement('h1'); h.textContent = 'Demigod';
    var p = document.createElement('p'); p.textContent = "לא הצלחנו לפתוח את האפליקציה. הנתונים שלך שמורים. בדוק חיבור ונסה שוב. / Couldn't open the app. Your data is safe. Check your connection and try again.";
    var b = document.createElement('button'); b.type = 'button'; b.textContent = 'נסה שוב / Try again';
    b.onclick = function () { set(0); location.reload(); };
    app.append(h, p, b);
  }, 20000);
})();
