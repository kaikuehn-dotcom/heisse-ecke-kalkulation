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
  const focused = useRef(false);

  // Debounce-Commit (speichert nach Tipp-Pause automatisch)
  const tRef = useRef<string>("");
  const timerRef = useRef<number | null>(null);

  const scheduleCommit = (nextText: string) => {
    tRef.current = nextText;

    if (timerRef.current) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    timerRef.current = window.setTimeout(() => {
      const n = toNumber(tRef.current);
      onCommit(n);
    }, 400);
  };

  // Wenn Wert von außen kommt: nur übernehmen, wenn wir NICHT gerade tippen
  useEffect(() => {
    if (focused.current) return;
    if (value === null || value === undefined) {
      setText("");
      tRef.current = "";
    } else {
      const s = String(value).replace(".", ",");
      setText(s);
      tRef.current = s;
    }
  }, [value]);

  // Cleanup
  useEffect(() => {
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, []);

  return (
    <input
      type="text"
      inputMode="decimal"
      value={text}
      placeholder={placeholder}
      onFocus={() => {
        focused.current = true;
      }}
      onBlur={() => {
        focused.current = false;
        // Commit sofort beim Verlassen (und Timer killen)
        if (timerRef.current) {
          window.clearTimeout(timerRef.current);
          timerRef.current = null;
        }
        onCommit(toNumber(tRef.current));
      }}
      onChange={(e) => {
        const next = e.target.value;
        setText(next);
        scheduleCommit(next);
      }}
      onKeyDown={(e) => {
        // Enter = sofort speichern
        if (e.key === "Enter") {
          e.preventDefault();
          if (timerRef.current) {
            window.clearTimeout(timerRef.current);
            timerRef.current = null;
          }
          onCommit(toNumber(tRef.current));
          (e.currentTarget as HTMLInputElement).blur();
        }
      }}
      style={{ width: width ?? 140 }}
    />
  );
}
