import React, { useMemo, useState } from "react";
import { useStore } from "../../../state/store";
import { money } from "../../../core/utils";
import DecimalInput from "../DecimalInput";

export default function InventoryPage() {
  const { data, update } = useStore();
  const [q, setQ] = useState<string>("");

  const rows = useMemo<any[]>(() => {
    if (!data?.inventory) return [];
    const qq = q.toLowerCase().trim();

    // NICHT den Store mutieren:
    const copy = [...(data.inventory as any[])];

    // Sortierung bleibt ok – aber Fokusproblem lösen wir über stabile keys unten.
    return copy
      .filter((i: any) => (qq ? String(i.name ?? "").toLowerCase().includes(qq) : true));
  }, [data, q]);

  if (!data) {
    return (
      <div className="card">
        <div className="h1">Inventur</div>
        <div className="small">Bitte zuerst Daten laden.</div>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="row" style={{ justifyContent: "space-between", gap: 12 }}>
        <div>
          <div className="h1">Inventur</div>
          <div className="small">
            Preise überschreiben (Komma erlaubt). Cursor darf NICHT mehr raus springen.
          </div>
        </div>

        <input
          placeholder="Zutat suchen…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          style={{ minWidth: 260 }}
        />
      </div>

      <div style={{ height: 10 }} />

      <table className="table">
        <thead>
          <tr>
            <th>Zutat</th>
            <th>EK</th>
            <th>Einheit</th>
            <th>Info</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((i: any, idx: number) => (
            // WICHTIG: eindeutiger key, auch wenn Namen doppelt/leer sind
            <tr key={`${String(i.name ?? "ohne_name")}__${idx}`}>
              <td style={{ fontWeight: 800 }}>{String(i.name ?? "")}</td>

              <td style={{ width: 160 }}>
                <DecimalInput
                  value={i.ekRaw ?? null}
                  placeholder="z.B. 12,49"
                  width={140}
                  onCommit={(n) => {
                    update((base: any) => {
                      const inv = (base.inventory ?? []) as any[];
                      // gleiche Sortierung/Index ist nicht garantiert → suche über Name + idx fallback
                      // Primär: Name match. Wenn mehrfach vorhanden: nimm das idx-te Vorkommen.
                      const name = String(i.name ?? "");
                      const matches = inv
                        .map((x: any, j: number) => ({ x, j }))
                        .filter(({ x }: any) => String(x.name ?? "") === name);

                      let target: any = null;
                      if (matches.length <= 1) target = matches[0]?.x ?? null;
                      else target = matches[Math.min(idx, matches.length - 1)]?.x ?? matches[0]?.x ?? null;

                      if (target) target.ekRaw = n;
                    });
                  }}
                />
              </td>

              <td style={{ width: 140 }}>
                <select
                  value={String(i.unitRaw ?? "")}
                  onChange={(e) => {
                    const v = e.target.value || null;
                    update((base: any) => {
                      const inv = (base.inventory ?? []) as any[];
                      const name = String(i.name ?? "");
                      const matches = inv
                        .map((x: any, j: number) => ({ x, j }))
                        .filter(({ x }: any) => String(x.name ?? "") === name);

                      let target: any = null;
                      if (matches.length <= 1) target = matches[0]?.x ?? null;
                      else target = matches[Math.min(idx, matches.length - 1)]?.x ?? matches[0]?.x ?? null;

                      if (target) target.unitRaw = v;
                    });
                  }}
                >
                  <option value="">—</option>
                  <option value="kg">kg</option>
                  <option value="g">g</option>
                  <option value="l">l</option>
                  <option value="ml">ml</option>
                  <option value="stk">stk</option>
                </select>
              </td>

              <td className="small" style={{ opacity: 0.85 }}>
                {i.ekRaw == null ? "Kein EK gesetzt" : `EK: ${money(Number(i.ekRaw) || 0)}`}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
