/**
 * ENTER/TAB-Bestätigung (global)
 *
 * Problem: Nach dem 1. Zeichen verliert jedes Feld den Fokus.
 * Fix: Solange ein Feld "aktiv bearbeitet" wird, darf es den Fokus NICHT verlieren.
 * Bestätigung mit ENTER oder TAB: dann wird Fokus-Lock gelöst.
 *
 * Das ist absichtlich "hart", damit es zuverlässig funktioniert.
 */

declare global {
  interface Window {
    __he_focus_guard_installed?: boolean;
  }
}

if (typeof window !== "undefined" && !window.__he_focus_guard_installed) {
  window.__he_focus_guard_installed = true;

  let activeEl: HTMLElement | null = null;
  let allowBlur = false;

  const isField = (el: any): el is HTMLElement => {
    if (!el) return false;
    const tag = String(el.tagName || "").toLowerCase();
    return tag === "input" || tag === "textarea" || el.isContentEditable === true;
  };

  const refocus = (el: HTMLElement) => {
    setTimeout(() => {
      if (document.activeElement !== el) {
        try {
          (el as any).focus({ preventScroll: true });
        } catch {
          try {
            (el as any).focus();
          } catch {}
        }
      }
    }, 0);
  };

  // Sobald ein Feld fokussiert ist: wir merken es und locken wieder
  document.addEventListener(
    "focusin",
    (e) => {
      const t: any = e.target;
      if (!isField(t)) return;
      activeEl = t;
      allowBlur = false;
    },
    true
  );

  // ENTER oder TAB = bestätigen -> Blur erlauben
  document.addEventListener(
    "keydown",
    (e: any) => {
      const t: any = e.target;
      if (!isField(t)) return;

      // Globales Keyhandling blocken, damit keine Hotkeys Fokus klauen
      // (dein Fehlerbild)
      e.stopPropagation();

      const tag = String(t.tagName || "").toLowerCase();

      // ENTER bestätigt (aber nicht bei textarea)
      if (e.key === "Enter" && tag !== "textarea") {
        e.preventDefault();
        allowBlur = true;
        try {
          (t as any).blur();
        } catch {}
        return;
      }

      // TAB bestätigt und lässt Wechseln ins nächste Feld zu
      if (e.key === "Tab") {
        allowBlur = true;
        return; // TAB normal laufen lassen
      }

      // ESC = Abbruch -> Feld darf verlassen werden
      if (e.key === "Escape") {
        allowBlur = true;
        try {
          (t as any).blur();
        } catch {}
      }
    },
    true
  );

  // Wenn Fokus rausfliegt ohne Bestätigung: sofort zurück
  document.addEventListener(
    "focusout",
    (e) => {
      const from: any = e.target;
      if (!isField(from)) return;

      if (allowBlur) {
        // bestätigter Blur -> lock lösen
        allowBlur = false;
        activeEl = null;
        return;
      }

      // unfreiwilliger Fokusverlust -> zurück
      const el = activeEl || from;
      if (el) refocus(el);
    },
    true
  );
}
