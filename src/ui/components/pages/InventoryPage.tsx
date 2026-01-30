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

    // WICHTIG: .sort() NICHT auf dem Original machen, sonst mutierst du State
    const copy = [...(data.inventory as any[])];

    return copy
      .filter((i: any) => (qq ? String(i.name ?? "").toLowerCase().includes(qq) : true))
      .sort((a: any, b: any) => String(a.name ?? "").localeCompare(String(b.name ?? ""), "de"));
  }, [data, q]);

  if (!data) {
    return (
      <div className="card">
        <div className="h1">Inventur</div>
        <div className="small">Bitte zuerst Excel/JSON laden.</div>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="row" style={{ justifyContent: "space-between", gap: 12 }}>
        <div>
          <div className="h1">Inventur</div>
          <div className="small">Preise überschreiben (mit Komma). Cursor bleibt jetzt im Feld.</div>
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
          {rows.map((i: any) => (
            <tr key={String(i.name)}>
              <td style={{ fontWeight: 800 }}>{String(i.name ?? "")}</td>

              <td style={{ width: 140 }}>
                <DecimalInput
                  value={i.ekRaw ?? null}
                  placeholder="z.B. 12,49"
                  onCommit={(n) => {
                    update((base: any) => {
                      const inv = (base.inventory ?? []) as any[];
                      const row = inv.find((x: any) => String(x.name) === String(i.name));
                      if (row) row.ekRaw = n;
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
                      const row = inv.find((x: any) => String(x.name) === String(i.name));
                      if (row) row.unitRaw = v;
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
