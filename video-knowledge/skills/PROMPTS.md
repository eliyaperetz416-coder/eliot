# Prompt library: ready-to-copy prompts from the videos

The original prompts as they appeared in the videos (lightly edited). Each one is tagged with its video number.

## Design
**An app that looks like a designer made it (081)**
> קלוד, אני רוצה שהאפליקציה שלי תיראה כאילו מעצב אמיתי עיצב אותה. בחר צבע ראשי אחד ושמור אותו לכפתור הכי חשוב במסך. החלף את הגרדיאנט הסגול בצבעי המותג שלי. פונט אחד עם 2–3 משקלים. כותרת אחת גדולה וברורה בכל מסך. מרווחים בכפולות של 8, תן לכל אלמנט לנשום, ויישר הכל לגריד אחד. כפתורים בגודל 44 נקודות לפחות. ניגודיות 4.5:1 לפחות. אייקונים מסט אחד באותו עובי קו. אותו רדיוס פינות בכל האפליקציה. צל אחד עדין. אימוג'ים רק כשהם מוסיפים משמעות. תמונות אמיתיות. מסך ריק עם הסבר קצר וכפתור לפעולה הראשונה. הודעות שגיאה בשפה פשוטה עם הצעד הבא. כפתורים שאומרים מה הם עושים. אנימציות קצרות ועדינות. דארק מוד עם צבעים שנבחרו במיוחד בשבילו. ובדוק כל מסך על טלפון אמיתי ביד אחת.

(English: make my app look designed. One primary colour reserved for the main button; brand colours instead of the purple gradient; one font in 2–3 weights; one big heading per screen; 8-point spacing on one grid; 44pt buttons; 4.5:1 contrast; one icon set; one corner radius; one subtle shadow; emojis only when meaningful; real photos; empty states with a first action; plain-language errors with the next step; buttons that say what they do; short, subtle animations; a real dark mode; test every screen one-handed on a real phone.)

**5 directions (025)**
> תן לי 5 כיווני עיצוב שונים לגמרי + כפתור שמחליף ביניהם. אחרי שאבחר, תעבור על העיצוב ותסמן כל דבר שנראה כמו AI ותתקן.

(English: give me 5 completely different design directions plus a button that switches between them. After I pick one, mark everything that looks like AI and fix it.)

## Security
**Vibe-coded site (077, EN)**
> Hey Claude, I do not want my vibe-coded website to get hacked, so please hide my API keys, check my environment variables and protect my admin routes. Add proper authentication, make sure users can only access what they're supposed to. Sanitize my forms, protect against XSS, add rate limiting, secure my API endpoints and check my CORS settings. Add security headers, turn off debug mode, update my dependencies and remove anything I don't need. Check for exposed files, secure my database, hash passwords properly, check my git history for leaked secrets and run a full security audit.

**App, 20 points (026, HE)**
> קלוד, אני לא רוצה שיפרצו לי לאפליקציה, אז בבקשה: תשתמש בשירות התחברות מוכן, אל תבנה אחד לבד. תגביל ניסיונות סיסמה. תוסיף אימות דו-שלבי. תוודא שכל משתמש מקבל מהשרת רק את המידע שלו. תפעיל Row Level Security על כל טבלה. תבדוק הרשאות בשרת, לא רק באפליקציה. מפתחות סודיים רק בשרת. תוודא שקובץ הסודות לא עולה לגיט. אל תסמוך על המחיר שהאפליקציה שולחת, תחשב אותו בשרת. תבדוק כל קלט מהמשתמש. תגביל בקשות לדקה. תגביל כמה כל משתמש יכול להוציא על AI. תבדוק סוג וגודל של כל קובץ שמעלים. אל תציג שגיאות עם פרטים פנימיים. רק HTTPS. תעדכן ספריות עם פרצות ידועות. אל תיתן ל-AI באפליקציה לעשות פעולות רגישות בלי אישור המשתמש. תשמור תיעוד של כל התחברות ופעולה רגישה. תשלח לי התראה כשמשהו חשוד. ובסוף, תנסה לפרוץ לאפליקציה בעצמך ותגיד לי מה מצאת.

(English: use a ready-made auth service; limit password attempts; add 2FA; each user gets only their own data from the server; RLS on every table; check permissions on the server; secret keys only on the server and never in git; recompute prices on the server; validate every input; rate-limit requests; cap each user's AI spend; check uploaded file type and size; no internal error details; HTTPS only; update vulnerable libraries; the in-app AI takes no sensitive action without the user's approval; log logins and sensitive actions; alert me on suspicious activity; finally, try to hack the app yourself and tell me what you found.)

**One-liners**
- API keys (057): "את כל מפתחות ה-API תגדיר אך ורק דרך קובץ סביבה בשרת, ואל תחשוף אותם לעולם לצד הלקוח." (Set up all API keys only through an environment file on the server, and never expose them on the client side.)
- SQL (066): "תחסום מראש כל תקיפות SQL Injection והשתמש אך ורק ב-Parameterized Queries או ORM לגישה למסד הנתונים." (Block all SQL injection attacks up front and use only parameterized queries or an ORM for database access.)
- After every change (048): "האם יש פה פרצת אבטחה? משהו בהרשאות שלא שמתי לב אליו? תריץ סריקת אבטחה על השינויים." (Is there a security hole here? Anything about permissions I missed? Run a security scan on the changes.)
- Full review (084): "תעשה בדיקת אבטחה מלאה לכל הפרויקט, לא רק לשינויים האחרונים. תעבור על כל הקבצים ותחפש: חיבורים והרשאות, גישה למידע של משתמשים אחרים, SQL ו-XSS, העלאת קבצים, מפתחות וסיסמאות בקוד, ספריות עם פרצות ידועות. תחזיר טבלת ממצאים עם קובץ, שורה וחומרה." (Do a full security review of the whole project, not just the latest changes. Look for connections and permissions, access to other users' data, SQL and XSS, file uploads, keys and passwords in code, libraries with known vulnerabilities. Return a findings table with file, line and severity.)
- .env hook (099): "תבנה לעצמך hook שחוסם אותך מלגעת בקבצי .env." (Build yourself a hook that blocks you from touching .env files.)

## Legal
**EN (051)**
> Hey Claude, I do not want my vibe-coded website to get sued, so please add a privacy policy page, a terms and conditions page, and add a cookie policy. Check if I need cookie consent and add a refund policy and add form consent. Only collect necessary data, check analytics tracking, check third-party embeds, make the site accessible, add alt text, check color contrast, and make forms keyboard-friendly. Use clear button labels, remove fake reviews, remove unsupported claims, add business details, and check copyright on images. Check applicable local laws and flag any other risks.

**HE (067)**
> תעבור על כל האתר ותבדוק אותו מול החוק בישראל: הגנת פרטיות, נגישות (ת"י 5568), חוק הספאם (פרסומת + הסרה), ביטול מנוי, זכויות יוצרים על תמונות ופונטים, ביקורות מזויפות. תחזיר טבלה של מה מצאת ומה תיקנת.

(English: go over the whole site and check it against Israeli law: privacy, accessibility (IS 5568), the anti-spam law (advertisement label + unsubscribe), subscription cancellation, copyright on images and fonts, fake reviews. Return a table of what you found and what you fixed.)

## Pre-launch
- **SEO (059)**: "My website still looks vibe-coded, so please add a custom domain, proper page sources, and a custom 404 page. Add unique page titles, meta descriptions, canonical tags, and one clear heading per page. Add a sitemap.xml, robots.txt, llms.txt, and a favicon. Add internal links, breadcrumbs, structured data, and local business schema. Add social share images and proper alt text. Fix all console errors, remove production source maps, reduce huge JavaScript bundles. Make sure the browser tab doesn't say Vite or React and don't leave any placeholder content."
- **Open Graph (049)**: "תטמיע תגיות Meta SEO ותגיות Open Graph, כולל תמונות תצוגה מקדימה." (Embed Meta SEO tags and Open Graph tags, including preview images.)
- **Speed (090)**: "My website takes forever to load, so please compress the images, convert them to modern formats, lazy load anything below the fold, remove unused code, reduce JavaScript, optimize the fonts, cache static files, stop loading scripts we don't need. Fix layout shifts, improve LCP, reduce interaction delays, test on a slow mobile connection. Then run Chrome Lighthouse, fix the biggest problems, and show me a before and after."
- **Mobile (045)**: "My site looks terrible on mobile: remove horizontal scrolling, increase tap target sizes, stop text overflowing, make forms easy, keep every button within thumb reach, make phone numbers clickable, prevent popups covering the screen, optimise for slow connections, test on different screen sizes, portrait and landscape, and make sure nothing jumps while loading."
- **Load (007), full**: "תבדוק את המערכת שלי לעמידות בעומס משתמשים: תעבור על כל נקודות הקצה ב-API ועל אירועי ה-socket, תמצא שאילתות שרצות בלולאה לכל פריט (N+1), טעינות שגדלות עם כמות הנתונים של המשתמש, עבודה כבדה על ה-thread הראשי כמו גיבוב סיסמאות, חוסר בהגבלת קצב ובתור לעבודה שמחכה, הגדרות ברירת מחדל של מסד הנתונים ושל ה-pool, ומה קורה כשמאה משתמשים מתחברים בבת אחת אחרי deploy. לכל ממצא תכתוב איפה, למה זה ישבור את השרת ומה התיקון, לפי סדר חומרה. תתקן רק אחרי שאאשר, ואחרי התיקון תריץ שוב את אותה בדיקה ותראה לפני ואחרי." (Check my system for user load: every API endpoint and socket event, N+1 queries, loads that grow with user data, heavy main-thread work like password hashing, missing rate limiting and job queues, DB and pool defaults, and 100 users connecting at once after a deploy. For each finding: where, why it breaks the server, the fix, by severity. Fix only after I approve, then re-run the same test and show before and after.)
- **Architecture (044)**: "חובה לכתוב את הקוד בארכיטקטורה מודולרית, component based. אל תדחוף הכל לקובץ אחד, חלק לפונקציות קטנות עם הערות ברורות, כדי שנוכל לתחזק את זה בעתיד." (Write the code in a modular, component-based architecture. Don't put everything in one file; split into small functions with clear comments so we can maintain it.)
- **Hidden bugs (050)**: "Find all of the implicit state machines in my app."

## Working method
**The 4 lines at the end of every substantial request (086), recommended in CLAUDE.md**
> לפני שאתה מתחיל: 1) שאל אותי את כל השאלות שצריך. 2) מפה את מקרי הקצה ואיך כל אחד מטופל. 3) אבטחה: מי מורשה לראות ולעשות מה. 4) הגדר מה זה "גמור" ואיך תוכיח שזה עובד.

(English: before you start, 1) ask me every question you need; 2) map the edge cases and how each is handled; 3) security: who may see and do what; 4) define "done" and how you'll prove it works.)

**A new project in Cowork (078)**
> הגדר את התיקייה הזו כפרויקט חדש. שאל אותי שאלות, ואז כתוב לה CLAUDE.md ו-MEMORY.md.

(English: set this folder up as a new project. Ask me questions, then write its CLAUDE.md and MEMORY.md.)
