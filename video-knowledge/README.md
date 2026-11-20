# Video Knowledge: מה למדנו מ-105 סרטונים על בנייה עם Claude

105 סרטוני טיקטוק ורילס (100 ייחודיים). כל אחד תומלל ונבדק פריים אחרי פריים, ואחרי זה עבר בדיקה חוזרת עם OCR.

## מבנה התיקייה
| תיקייה | מה יש בה |
|---|---|
| [`topics/`](topics/) | **הידע מחולק ל-8 נושאים**, ובכל נושא מה הוא כולל ומאילו סרטונים |
| [`skills/`](skills/) | 8 סקילים מוכנים להתקנה ב-Claude, וספריית פרומפטים ([`PROMPTS.md`](skills/PROMPTS.md)) |
| [`videos/ALL-VIDEOS.md`](videos/ALL-VIDEOS.md) | סיכום מפורט של כל סרטון לפי הסדר |

## 8 הנושאים
| # | נושא | מה בפנים | סקיל |
|---|---|---|---|
| 1 | [עיצוב שלא נראה כמו AI](topics/01-design.md) | איך נותנים כיוון, 5 כיווני עיצוב, רשימת "סימני AI" אסורים, 20 חוקי UI, Impeccable, Taste, Apple Design, UI UX Pro Max | `anti-ai-design` |
| 2 | [אנימציות וספריות](topics/02-motion-and-libraries.md) | GSAP, Lenis, React Bits, 21st.dev, ScrollCraft, סוגי אנימציות "יקרות", מילון סגנונות, 20 עקרונות UX | `motion-and-ui-libraries` |
| 3 | [אבטחה](topics/03-security.md) | מפתחות ו-.env, הרשאות, RLS, SQL injection, rate limiting, prompt injection, hook שחוסם .env, פרצות PHP | `security-hardening` |
| 4 | [משפטי (ישראל)](topics/04-legal.md) | טבלת חשיפה לתביעות, פרטיות, נגישות (ת"י 5568), חוק הספאם, זכויות יוצרים, ביקורות מזויפות | `israeli-legal-compliance` |
| 5 | [לפני עלייה לאוויר](topics/05-launch-readiness.md) | SEO ו-Open Graph, מהירות (20 חוקים), מובייל, ליטוש, עומס (קריסה ב-150 משתמשים), ארכיטקטורה, state machines | `launch-readiness` |
| 6 | [שיטת עבודה וסוכנים](topics/06-claude-workflow.md) | 4 השורות, תכנון לפני ביצוע, לולאות אימות, אורקסטרטור ו-Arena, Cowork OS, פלאגינים | `claude-workflow` |
| 7 | [וידאו, תוכן ושיווק](topics/07-video-content-marketing.md) | עריכת וידאו ב-5 שלבים, קודים לפרומפטים, prompt-motion, מכונת מודעות, 100 המשתמשים הראשונים | `video-and-content` |
| 8 | [כלים ו-MCPs](topics/08-tools-and-mcps.md) | Perplexity, Firecrawl, PostHog, Playwright, Composio, REA, Expo, VoiceMode, 9 חלופות קוד פתוח | `tool-stack-reference` |

## התקנת הסקילים
- **Claude Code, בפרויקט אחד:** מעתיקים את התיקיות מ-`skills/` אל `.claude/skills/` בפרויקט
- **Claude Code, בכל הפרויקטים:** מעתיקים אל `~/.claude/skills/`
- **אפליקציית Claude:** מעלים ZIP של כל תיקיית סקיל בהגדרות, תחת Skills

## הערות
- מספרים כמו כוכבים, מחירים וגובה קנסות מובאים כפי שנאמרו בסרטונים, ושווה לאמת אותם. הנושא המשפטי **אינו ייעוץ משפטי**.
- התמלולים המלאים ושמות היוצרים לא נשמרו כאן בכוונה, כי הריפו ציבורי.
