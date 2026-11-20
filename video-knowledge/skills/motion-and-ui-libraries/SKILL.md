---
name: motion-and-ui-libraries
description: Use when a site or app needs animation, smooth scrolling, scroll-driven storytelling, 3D, micro-interactions or premium-looking UI components. Lists the proven libraries (GSAP, Lenis, React Bits, Motion, Anime.js, Magic UI, 21st.dev, Skiper UI, Retro UI, Theatre.js, ScrollCraft), a vocabulary of animation styles for prompts, and the 20 UX and animation principles to apply them well. Triggers - "animation", "smooth scroll", "make it feel premium", "3D site", "scroll effect", אנימציה, תנועה, גלילה.
---

# Motion and UI libraries

Distilled from ~15 videos. Premium sites ("$3K–$30K look") almost always use a small set of libraries plus restraint.

## The core stack (paste the repo links into Claude Code and let it install)
| Need | Library |
|---|---|
| Timeline and scroll animation | **GSAP** + ScrollTrigger (`github.com/greensock/GSAP`) |
| Buttery smooth scroll | **Lenis** (`github.com/darkroomengineering/lenis`, `npm i lenis`) |
| Copy-paste animated components, backgrounds, text effects | **React Bits** (`github.com/DavidHDev/react-bits`) |
| Component registry / variations via MCP | **21st.dev** |
| React animation and scroll effects, 400+ examples | **Motion** (motion.dev) |
| Lightweight vanilla animation | **Anime.js** |
| Ready-made animated sections | **Magic UI** (animated lists, theme toggles, showcase), **Skiper UI**, **Kokonut UI** |
| Animations, image effects, navigation, backgrounds and shaders | **Unlumen UI** |
| Text effects, buttons, pre-built hero/stats blocks | **Smooth UI** |
| Neo-brutalist/retro components (+ Figma kit, 300+ components) | **Retro UI** |
| Visual timeline editor for complex sequences | **Theatre.js** |
| 3D product scenes | three.js / WebGL (e.g. a "WebGL 3D Scenes" skill) |
| Scroll-story sites with self-check | **ScrollCraft** skill (detects "dead scroll" spots and bans AI-look patterns) |

Usage pattern: "Build this with GSAP + Lenis, use React Bits for the hero background." Name the library explicitly; otherwise Claude hand-rolls weak CSS.

## Animation types that read as premium
Object reveal / zoom into a 3D object on hover or scroll · portal transitions · 3D product rotation/configurator (e.g. build-your-own product) · space/zoom transitions · 3D image gallery (sphere) · "breaking the 4th wall" elements · pinned scroll storytelling · kinetic typography · liquid tab-bar indicators · marquee/ticker of product lines.

Style vocabulary for prompts: particles, liquid morph, holographic, neon glow, wireframe 3D, glassmorphism, kinetic type, isometric, clay 3D, ASCII art, gradient mesh, comic book, split-flap display, retro VHS, halftone, Bauhaus, pixel art, blueprint, art deco, neo-brutalism; also chalkboard, glowing sketch, PS2-era, flat vector, minimalist stick figure, Lego.

## 20 UX and animation principles (apply, don't just decorate)
1. Squash & stretch · 2. **Anticipation**: a small wind-up before a big move · 3. Staging: focus attention · 4. Pose to pose · 5. **Follow-through**: parts settle after the main body stops · 6. Slow in / slow out (easing) · 7. **Arcs**: move along curves, not straight lines · 8. Secondary action · 9. **Snappy timing** · 10. **Exaggerated feedback**: push it past real so the moment lands (e.g. a wrong-password shake) · 11. Solid 3D drawing · 12. Overall appeal: the sum of the details · 13. **Fitts's law**: bigger, closer targets · 14. Bigger hit areas · 15. **Hick's law**: fewer choices · 16. **Miller's law**: chunk information (card numbers in groups of 4) · 17. **Doherty threshold**: respond in under 400ms · 18. Postel's law: be liberal in what inputs you accept · 19. Jakob's law: follow familiar patterns · 20. **Frequency of use**: the more often something is used, the less it should animate.

## Rules
- Respect `prefers-reduced-motion`.
- Animate `transform`/`opacity` only; avoid layout thrash; keep 60fps on mid-range phones.
- Animation must explain state changes (what happened, where something went), not decorate everything. "Every section fades in on scroll" is an AI-look anti-pattern (see `anti-ai-design`).
- Verify in a real browser: scroll through the whole page and look for stuck/"dead" scroll segments and jank.
