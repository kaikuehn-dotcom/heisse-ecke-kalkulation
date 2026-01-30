import React, { useEffect, useRef, useState } from "react";
import { toNumber } from "./core/utils";

type Props = {
  value: number | null | undefined;
  placeholder?: string;
  onCommit: (n: number | null) => void;
  width?: number | string;
};

export default function Decimallnput({ value, placeholder, onCommit, width }: Props) {
  const [text, setText] = useState<string>("");
  const latest = useRef<string>("");

  // Nur externen value übernehmen, wenn wir NICHT mitten im Tippen sind.
  // (Hier simpel: wir übernehmen, wenn value sich ändert; Text bleibt ansonsten.)
  useEffect(() => {
    const next = value === null || value === undefined ? "" : String(value).replace(".", ",");
    // Nur setzen, wenn der User nicht gerade was anderes drin hat
    // (sonst fühlt es sich "überschrieben" an)
    if (latest.current === "" || latest.current === text) {
      setText(next);
      latest.current = next;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const commit = () => {
    latest.current = text;
    onCommit(toNumber(text));
  };

  return (
    <input
      type="text"
      inputMode="decimal"
      value={text}
      placeholder={placeholder}
      onChange={(e) => {
        setText(e.target.value);
        latest.current = e.target.value;
      }}
      onKeyDown={(e) => {
        // ENTER: speichern (Blur macht der focusGuard global)
        if (e.key === "Enter") {
          e.preventDefault();
          e.stopPropagation();
          commit();
        } else {
          e.stopPropagation();
        }
      }}
      onBlur={() => {
        // Falls Blur erlaubt wurde (Enter/Tab/Escape), speichern wir nochmal sicher.
        commit();
      }}
      style={{ width: width ?? 140 }}
    />
  );
}
