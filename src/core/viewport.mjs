// iPhone home-screen app bug (Elia 27.11): after the screen changes size (a phone call, the keyboard) iOS can leave the
// page frame that fixed layers hang on above the part you actually see; then the floating bar sits mid-screen and rides
// up with the scroll. bottomDrift() is how far it has slipped up, so the bar can be put back on the real bottom edge.
// Only a slip UP counts: when the keyboard shortens the screen the bar stays where iOS puts it (behind the keyboard).

/** bottomDrift(visualViewport, innerHeight) -> whole px to move bottom-anchored layers down (0 when nothing is wrong). */
export function bottomDrift(vv, innerH) {
  if (!vv || (vv.scale && vv.scale > 1.01)) return 0; // pinch-zoom moves the view on purpose
  const d = vv.offsetTop + vv.height - innerH;
  return d >= 1 ? Math.round(d) : 0;
}
