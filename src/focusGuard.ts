// Fokus-Guard (sanft):
// - verhindert "Fokus springt nach 1 Zeichen weg"
// - ABER: blockiert NICHT das Wechseln in ein anderes Eingabefeld
// - greift nur, wenn Fokus beim Tippen auf "nichts" (body/html) fällt

let lastField: HTMLElement | null = null;
let typingUntil = 0;

function isField(el: any): el is HTMLElement {
  if (!el) return false;
  const tag = String(el.tagName || "").toLowerCase();
  return tag === "input" || tag === "textarea" || el.isContentEditable === true;
}

function isTypingNow() {
  return Date.now() < typingUntil;
}

function markTyping() {
  // sehr kurz – nur um "Fokus klaut sich direkt weg" abzufangen
  typingUntil = Date.now() + 200;
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

// Merke letztes aktives Feld
document.addEventListener(
  "focusin",
  (e) => {
    const t: any = e.target;

    if (isField(t)) {
      lastField = t;
      return;
    }

    // Nur wenn wir gerade tippen UND Fokus auf "nichts" geht:
    const tag = String(t?.tagName || "").toLowerCase();
    const isNothing = tag === "body" || tag === "html" || t === document.body || t === document.documentElement;

    if (isTypingNow() && isNothing && lastField) {
      refocusSoon();
    }
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
