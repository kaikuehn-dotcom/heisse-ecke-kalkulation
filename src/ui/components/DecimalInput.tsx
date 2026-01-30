import React, { useEffect, useRef, useState } from "react";
import { toNumber } from "../../core/utils";

type Props = {
  value: number | null | undefined;
  placeholder?: string;
  onCommit: (n: number | null) => void;
  width?: number | string;
};

export default function DecimalInput({ value, placeholder, onCommit, width }: Props) {
  const [text, setText] = useState<string>("");
  const inputRef = useRef<HTMLInputElement | null>(null);
  const isFocused = useRef(false);

  // Nur wenn NICHT fokussiert: Wert von außen übernehmen.
  useEffect(() => {
    if (isFocused.current) return;
    if (value === null || value === undefined) setText("");
    else setText(String(value).replace(".", ","));
  }, [value]);

  // HARTER FIX: Stoppe globale Keydown/Hotkey-Listener (capture phase)
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;

    const stop = (ev: Event) => {
      // stoppt auch Listener, die auf window/document hängen
      // (sofern sie nicht ebenfalls capture+passive mit Tricks arbeiten)
      // @ts-ignore
      if (ev.stopImmediatePropagation) ev.stopImmediatePropagation();
      ev.stopPropagation();
    };

    el.addEventListener("keydown", stop, true);
    el.addEventListener("keyup", stop, true);
    el.addEventListener("keypress", stop, true);
    el.addEventListener("input", stop, true);

    return () => {
      el.removeEventListener("keydown", stop, true);
      el.removeEventListener("keyup", stop, true);
      el.removeEventListener("keypress", stop, true);
      el.removeEventListener("input", stop, true);
    };
  }, []);

  return (
    <input
      ref={inputRef}
      type="text"
      inputMode="decimal"
      value={text}
      placeholder={placeholder}
      onFocus={() => (isFocused.current = true)}
      onBlur={() => {
        isFocused.current = false;
        onCommit(toNumber(text));
      }}
      onChange={(e) => setText(e.target.value)}
      // zusätzlich: auch Maus-Events nicht nach oben „durchreichen“
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      style={{ width: width ?? 140 }}
    />
  );
}
