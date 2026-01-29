import React, { useEffect, useMemo, useRef, useState } from "react";
import { toNumber } from "../../core/utils";

function formatDe(n: number): string {
  // Für Eingabefelder: möglichst „human“, mit Komma.
  // Keine Währung, nur Zahl.
  return new Intl.NumberFormat("de-DE", {
    maximumFractionDigits: 6,
  }).format(n);
}

type Props = {
  value: number | null | undefined;
  placeholder?: string;
  onCommit: (next: number | null) => void;
  style?: React.CSSProperties;
  className?: string;
  width?: number | string;
};

export default function DecimalInput({
  value,
  placeholder,
  onCommit,
  style,
  className,
  width,
}: Props) {
  const initial = useMemo(() => {
    if (value === null || value === undefined || !Number.isFinite(value)) return "";
    return formatDe(value);
  }, [value]);

  const [text, setText] = useState<string>(initial);
  const [focused, setFocused] = useState(false);
  const lastProp = useRef<string>(initial);

  useEffect(() => {
    // Wenn der Nutzer NICHT gerade tippt, synchronisieren wir Anzeige mit dem gespeicherten Wert.
    if (!focused) {
      const next = initial;
      lastProp.current = next;
      setText(next);
    }
  }, [initial, focused]);

  const commit = () => {
    const trimmed = (text ?? "").trim();
    if (trimmed === "") {
      onCommit(null);
      return;
    }
    const parsed = toNumber(trimmed);
    if (parsed === null) {
      // Ungültig -> zurück auf letzten gültigen Wert (oder leer)
      setText(lastProp.current ?? "");
      return;
    }
    onCommit(parsed);
  };

  return (
    <input
      className={className}
      inputMode="decimal"
      placeholder={placeholder}
      value={text}
      onFocus={() => setFocused(true)}
      onBlur={() => {
        setFocused(false);
        commit();
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          (e.target as HTMLInputElement).blur();
        }
        if (e.key === "Escape") {
          setText(lastProp.current ?? "");
          (e.target as HTMLInputElement).blur();
        }
      }}
      onChange={(e) => {
        // Nutzer darf frei tippen: Komma, Punkt, etc.
        setText(e.target.value);
      }}
      style={{ width: width ?? undefined, ...(style ?? {}) }}
    />
  );
}
