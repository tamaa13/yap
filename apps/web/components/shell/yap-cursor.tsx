"use client";

import { useEffect } from "react";

// Dot + Leash cursor — Promoter direction. JS-driven so we can swap state
// per hover-target (link / button / bet / danger / text / fighter / ring /
// disabled) and spawn a velocity trail. CSS lives in globals.css under
// the `#yap-cursor` and `.yap-trail` selectors.
//
// Mount once at the app root. The component renders the cursor markup
// SSR-side; the effect attaches mousemove/down/up handlers + the rAF
// follow loop on mount. Touch devices hide the cursor entirely and
// restore the native one, since pointer behavior on touch is gestural,
// not hover-based.

const TAGS: Record<string, string> = {
  link: "READ",
  button: "PUNCH",
  bet: "STAKE",
  danger: "DISPUTE",
  text: "TYPE",
  fighter: "SCOUT",
  ring: "WATCH",
  disabled: "",
  default: "READY",
};

type CursorState = keyof typeof TAGS;

function classify(el: EventTarget | null): [CursorState, string] {
  if (!(el instanceof Element)) return ["default", "READY"];
  const exp = el.closest("[data-cursor]");
  if (exp instanceof HTMLElement) {
    const s = (exp.dataset.cursor ?? "default") as CursorState;
    const t = exp.dataset.cursorTag ?? TAGS[s] ?? "";
    if (
      s === "disabled" ||
      (exp instanceof HTMLButtonElement && exp.disabled) ||
      (exp instanceof HTMLInputElement && exp.disabled)
    ) {
      return ["disabled", ""];
    }
    return [s, t];
  }
  if (el.closest("[disabled], [aria-disabled='true']")) return ["disabled", ""];
  if (el.closest("input, textarea, [contenteditable='true']"))
    return ["text", "TYPE"];
  if (el.closest("a")) return ["link", "READ"];
  // <select> is a button-shaped control (opens a menu on click) — give it
  // the same PUNCH state. Tables with onClick rows on <tr> route through
  // [role="button"] when callers add the role; otherwise fall through to
  // default. Either way the row's native pointer is suppressed by the
  // global * { cursor: none } rule, so no double-cursor.
  if (el.closest("button, select, [role='button']"))
    return ["button", "PUNCH"];
  return ["default", "READY"];
}

export function YapCursor() {
  useEffect(() => {
    const cur = document.getElementById("yap-cursor");
    const tagEl = cur?.querySelector<HTMLElement>("[data-tag]");
    if (!cur || !tagEl) return;

    // Touch / coarse-pointer devices: gestural, no hover. Hide the
    // synthetic cursor and let the OS render the native one.
    if (window.matchMedia("(hover: none), (pointer: coarse)").matches) {
      cur.style.display = "none";
      document.body.style.cursor = "auto";
      return;
    }

    let tx = window.innerWidth / 2;
    let ty = window.innerHeight / 2;
    let cx = tx;
    let cy = ty;
    let lastX = tx;
    let lastY = ty;
    let lastT = performance.now();
    let raf = 0;

    const onMove = (e: MouseEvent) => {
      tx = e.clientX;
      ty = e.clientY;
      cur.classList.remove("is-hidden");

      const [s, t] = classify(e.target);
      cur.dataset.state = s;
      // Always update tag text (not gated on `t` truthy). Otherwise
      // moving from a tagged state (e.g. "PUNCH") to a tagless one
      // (e.g. default/disabled) leaves the prior label sitting in the
      // DOM. CSS still hides the tag visually for tagless states, but
      // any transition that briefly keeps it visible would flash the
      // stale text.
      tagEl.textContent = t;

      // Velocity trail: only fires when the user is moving fast enough
      // (pixels per ms > 1.6). Stamps a single fading dot at the
      // halfway point of the last segment, then GC's after 460ms.
      const now = performance.now();
      const dt = Math.max(1, now - lastT);
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      if (Math.hypot(dx, dy) / dt > 1.6) {
        const d = document.createElement("div");
        d.className = "yap-trail";
        d.style.left = e.clientX - dx * 0.5 + "px";
        d.style.top = e.clientY - dy * 0.5 + "px";
        document.body.appendChild(d);
        window.setTimeout(() => d.remove(), 460);
      }
      lastX = e.clientX;
      lastY = e.clientY;
      lastT = now;
    };
    const onLeave = () => cur.classList.add("is-hidden");
    const onEnter = () => cur.classList.remove("is-hidden");
    const onDown = () => cur.classList.add("is-down");
    const onUp = () => cur.classList.remove("is-down");

    window.addEventListener("mousemove", onMove, { passive: true });
    window.addEventListener("mouseleave", onLeave);
    window.addEventListener("mouseenter", onEnter);
    window.addEventListener("mousedown", onDown);
    window.addEventListener("mouseup", onUp);

    // rAF lerp follow — 0.32 catches up fast enough that the dot feels
    // tied to the pointer, not lagged. Higher feels jumpy; lower feels
    // mushy. Tag punch animation uses the spring ease defined in CSS.
    const tick = () => {
      cx += (tx - cx) * 0.32;
      cy += (ty - cy) * 0.32;
      cur.style.transform = `translate(${cx}px, ${cy}px)`;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseleave", onLeave);
      window.removeEventListener("mouseenter", onEnter);
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("mouseup", onUp);
    };
  }, []);

  return (
    <div id="yap-cursor" data-state="default" aria-hidden="true">
      <div className="yap-cursor-dot" />
      <div className="yap-cursor-leash" />
      <div className="yap-cursor-tag" data-tag>
        READY
      </div>
    </div>
  );
}
