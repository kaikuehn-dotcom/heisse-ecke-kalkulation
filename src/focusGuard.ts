// Globaler Fokus-Guard: verhindert, dass Inputs nach dem ersten Zeichen den Fokus verlieren.
// Wir halten während des Tippens den Fokus im aktiven Feld.
// Das ist ein "Hotfix", der global wirkt, ohne deine App-Logik umzubauen.

let lastField: HTMLElement | null = null;
let typingUntil = 0;

function isField(el: any): el is HTMLElement {
  if (!el) return false;
  const tag = String(el.tagName || "").toLowerCase();
  return tag === "input" || tag === "textarea" || el.isContentEditable === true;
}

function markTyping() {
  typingUntil = Date.now() + 800; // 0,8s nach letztem Input gilt: "tippt gerade"
}

function isTypingNow() {
  return Date.now() < typingUntil;
}

function refocusSoon() {
  const target: any = lastField;
  if (!target) return;
  setTimeout(() => {
    if (document.activeElement !== target) {
      try {
        target.focus({ preventScroll: true });
      } catch {
        try { target.focus(); } catch {}
      }
    }
  }, 0);
}

// Merken, welches Feld aktiv ist
document.addEventListener(
  "focusin",
  (e) => {
    const t: any = e.target;
    if (isField(t)) lastField = t;

    // Wenn während Tippen plötzlich auf NICHT-Feld fokussiert wird -> zurück
    if (isTypingNow() && !isField(t) && lastField) refocusSoon();
  },
  true
);

// Tippen erkennen
document.addEventListener(
  "keydown",
  (e) => {
    const t: any = e.target;
    if (isField(t)) {
      lastField = t;
      markTyping();
    }
  },
  true
);

document.addEventListener(
  "input",
  (e) => {
    const t: any = e.target;
    if (isField(t)) {
      lastField = t;
      markTyping();
    }
  },
  true
);

// Wenn Fokus beim Tippen rausfliegt -> sofort zurück
document.addEventListener(
  "focusout",
  (e) => {
    if (!isTypingNow()) return;
    const from: any = e.target;
    if (isField(from)) {
      lastField = from;
      refocusSoon();
    }
  },
  true
);
