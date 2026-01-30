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

  // Nur synchronisieren wenn wir NICHT aktiv tippen
  useEffect(() => {
    if (focused.current) return;
    if (value === null || value === undefined) setText("");
    else setText(String(value).replace(".", ","));
  }, [value]);

  return (
    <input
      type="text"
      inputMode="decimal"
      value={text}
      placeholder={placeholder}
      onFocus={() => (focused.current = true)}
      onBlur={() => {
        focused.current = false;
        onCommit(toNumber(text)); // Komma wird korrekt akzeptiert
      }}
      onChange={(e) => setText(e.target.value)}
      style={{ width: width ?? 140 }}
    />
  );
}
