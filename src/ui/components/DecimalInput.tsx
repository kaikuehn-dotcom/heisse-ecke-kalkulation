import React, { useEffect, useRef, useState } from "react";
import { toNumber } from "../../core/utils";

type Props = {
  value: number | null | undefined;
  placeholder?: string;
  onCommit: (n: number | null) => void;
  width?: number | string;
};

export default function DecimalInput({ value, placeholder, onCommit, width }: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Text, den du tippst (mit Komma möglich)
  const [text, setText] = useState<string>("");

  // Merkt, ob du gerade aktiv in diesem Feld bist
  const editingRef = useRef(false);

  // Merkt letzten "gültigen" Text, damit wir nicht dauernd überschreiben
  const lastSyncedRef = useRef<string>("");

  // 1) Nur wenn du NICHT tippst, übernehmen wir den Wert von außen
  useEffect(() => {
    if (editingRef.current) return;

    const next =
      value === null || value === undefined ? "" : String(value).replace(".", ",");

    lastSyncedRef.current = next;
    setText(next);
  }, [value]);

  // 2) Fokus-Guard: solange du tippst, holen wir den Fokus notfalls zurück
  useEffect(() => {
    let timer: any = null;

    const startGuard = () => {
      if (timer) return;
      timer = setInterval(() => {
        if (!editingRef.current) return;
        const el = inputRef.current;
        if (!el) return;

        // Falls irgendwer den Fokus klaut -> zurückholen
        if (document.activeElement !== el) {
          try {
            el.focus({ preventScroll: true });
          } catch {
            el.focus();
          }
        }
      }, 50);
    };

    const stopGuard = () => {
      if (timer) clearInterval(timer);
      timer = null;
    };

    // Startet automatisch, wenn editingRef true ist (siehe onFocus)
    // und stoppt beim Unmount
    startGuard();
    return () => stopGuard();
  }, []);

  // 3) Hard stop: blockiert globale Keydown/Hotkey-Listener auf Capture-Ebene
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;

    const stop = (ev: Event) => {
      // verhindert "Hotkeys"/globales Handling, das Fokus klaut
      // @ts-ignore
      if (ev.stopImmediatePropagation) ev.stopImmediatePropagation();
      ev.stopPropagation();
    };

    el.addEventListener("keydown", stop, true);
    el.addEventListener("keyup", stop, true);
    el.addEventListener("keypress", stop, true);

    return () => {
      el.removeEventListener("keydown", stop, true);
      el.removeEventListener("keyup", stop, true);
      el.removeEventListener("keypress", stop, true);
    };
  }, []);

  const commit = () => {
    const n = toNumber(text);
    onCommit(n);
    // Nach Commit merken wir uns den Text als "synced"
    lastSyncedRef.current =
      n === null ? "" : String(n).replace(".", ",");
  };

  return (
    <input
      ref={inputRef}
      type="text"
      inputMode="decimal"
      value={text}
      placeholder={placeholder}
      style={{ width: width ?? 140 }}

      onFocus={() => {
        editingRef.current = true;
      }}

      onBlur={() => {
        // Wichtig: erst committen, dann editing aus
        commit();
        editingRef.current = false;
      }}

      onChange={(e) => {
        // Freies Tippen erlaubt: 3, 3,5 3,50 etc.
        setText(e.target.value);
      }}

      // Maus-Events nicht nach oben durchreichen (hilft bei Table/Row-Handlern)
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    />
  );
}
