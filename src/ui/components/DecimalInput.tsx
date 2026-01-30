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
  const isFocused = useRef(false);

  // Nur initial / wenn NICHT fokussiert: Text aus value setzen.
  useEffect(() => {
    if (isFocused.current) return;
    if (value === null || value === undefined) setText("");
    else setText(String(value).replace(".", ","));
  }, [value]);

  return (
    <input
      type="text"
      inputMode="decimal"
      value={text}
      placeholder={placeholder}
      onFocus={() => {
        isFocused.current = true;
      }}
      onBlur={() => {
        isFocused.current = false;
        onCommit(toNumber(text));
      }}
      onChange={(e) => {
        // Freies Tippen erlauben: Zahlen, Komma, Punkt
        setText(e.target.value);
      }}
      onKeyDown={(e) => {
        // WICHTIG: verhindert, dass Container/Table Keydowns “fangen”
        // und dadurch Fokus/Selection springen lassen.
        e.stopPropagation();
      }}
      onKeyUp={(e) => e.stopPropagation()}
      onKeyPress={(e) => e.stopPropagation()}
      style={{ width: width ?? 120 }}
    />
  );
}
