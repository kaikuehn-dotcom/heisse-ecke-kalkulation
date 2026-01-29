import React, { useMemo, useState } from "react";
import { useStore } from "../../state/store";
import { money } from "../../core/utils";
import DecimalInput from "../components/DecimalInput";

export default function InventoryPage() {
  const { data, update } = useStore();
  const [q, setQ] = useState("");

  const rows = useMemo(() => {
    if (!data) return [];
    const qq = q.toLowerCase().trim();
    return data.inventory
      .filter((i) => (qq ? i.name.toLowerCase().includes(qq) : true))
      .sort((a, b) => a.name.localeCompare(b.name, "de"));
  }, [data, q]);

  if (!data) {
    return (
      <div className="card">
        <div className="h1">Inventur</div>
        <div className="small">Bitte zuerst Excel laden.</div>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="row">
        <div>
          <div className="h1">3) Inventur (Outlet-spezifisch)</div>
          <div className="small">Einkauf ändern → alle Gerichte im aktuellen Outlet rechnen neu.</div>
        </div>
        <div className="right row">
          <input
            placeholder="Zutat suchen…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            style={{ minWidth: 260 }}
          />
        </div>
      </div>

      <div style={{ height: 10 }} />
      <table className="table">
        <thead>
          <tr>
            <th>Zutat</th>
            <th>EK</th>
            <th>Einheit</th>
            <th>EK (Base)</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((i) => (
            <tr key={i.name}>
              <td style={{ fontWeight: 800 }}>{i.name}</td>

              <td style={{ width: 140 }}>
                <DecimalInput
                  value={i.ekRaw ?? null}
                  placeholder="z.B. 12,49"
                  width={120}
                  onCommit={(next) => {
                    update(({ outlet }) => {
                      const o = outlet.overridesByOutletId[outlet.selectedOutletId];
                      o.inventory[i.name] = { ekRaw: next, unitRaw: i.unitRaw ?? null };
                    });
                  }}
                />
              </td>

              <td style={{ width: 140 }}>
                <select
                  value={i.unitRaw ?? ""}
                  onChange={(e) => {
                    const v = e.target.value;
                    update(({ outlet }) => {
                      const o = outlet.overridesByOutletId[outlet.selectedOutletId];
                      o.inventory[i.name] = { ekRaw: i.ekRaw ?? null, unitRaw: v || null };
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

              <td>{i.ekBase != null ? money(i.ekBase) : "—"}</td>
              <td>{i.status ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
