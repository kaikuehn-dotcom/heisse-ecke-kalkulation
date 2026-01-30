import React, { useMemo, useState } from "react";
import { useStore } from "../../../state/store";
import { money, pct, pickPrice } from "../../../core/utils";
import DecimalInput from "../DecimalInput";

export default function DishPage() {
  const { data, update } = useStore();

  const dishes = useMemo<any[]>(() => (data?.dishes ?? []) as any[], [data]);
  const [selectedDish, setSelectedDish] = useState<string>(() =>
    dishes?.[0]?.dish ? String(dishes[0].dish) : ""
  );

  const dish = useMemo<any | null>(
    () => dishes.find((d: any) => String(d.dish) === String(selectedDish)) ?? null,
    [dishes, selectedDish]
  );

  if (!data) {
    return (
      <div className="card">
        <div className="h1">Gericht</div>
        <div className="small">Bitte zuerst Excel/JSON laden.</div>
      </div>
    );
  }

  if (!dish) {
    return (
      <div className="card">
        <div className="h1">Kein Gericht ausgewählt</div>
        <div className="small">Bitte wähle oben ein Gericht aus.</div>
      </div>
    );
  }

  const price = pickPrice(dish);

  return (
    <div className="card">
      <div className="row" style={{ gap: 12, alignItems: "center" }}>
        <div className="h1" style={{ margin: 0 }}>
          Gericht
        </div>

        <select value={selectedDish} onChange={(e) => setSelectedDish(e.target.value)} style={{ minWidth: 280 }}>
          {dishes.map((d: any) => (
            <option key={String(d.dish)} value={String(d.dish)}>
              {String(d.dish)}
            </option>
          ))}
        </select>
      </div>

      <div style={{ height: 12 }} />

      <div className="grid" style={{ gap: 12 }}>
        <div className="card">
          <div className="small">Preise (Komma erlaubt)</div>
          <div className="row" style={{ marginTop: 8, gap: 16 }}>
            <div>
              <div className="small">Master</div>
              <div style={{ fontWeight: 900 }}>{money(dish.priceMaster ?? null)}</div>
            </div>

            <div>
              <div className="small">Speisekarte (frei)</div>
              <DecimalInput
                value={dish.priceMenu ?? null}
                placeholder="z.B. 8,90"
                onCommit={(n) => {
                  update((base: any) => {
                    const target = (base.dishes ?? []).find((x: any) => String(x.dish) === String(dish.dish));
                    if (target) target.priceMenu = n;
                  });
                }}
              />
            </div>

            <div>
              <div className="small">Testpreis (frei)</div>
              <DecimalInput
                value={dish.priceTest ?? null}
                placeholder="z.B. 8,90"
                onCommit={(n) => {
                  update((base: any) => {
                    const target = (base.dishes ?? []).find((x: any) => String(x.dish) === String(dish.dish));
                    if (target) target.priceTest = n;
                  });
                }}
              />
            </div>
          </div>
        </div>

        <div className="card">
          <div className="small">Ergebnis pro Stück</div>
          <div className="row" style={{ marginTop: 8, gap: 16 }}>
            <div><b>Preis:</b> {money(price)}</div>
            <div><b>Wareneinsatz:</b> {money(dish.cogs ?? null)}</div>
            <div><b>DB €:</b> {money(dish.db ?? null)}</div>
            <div><b>DB %:</b> {pct(dish.dbPct ?? null)}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
