import React, { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useStore } from "../../state/store";
import { money, pct, pickPrice } from "../../core/utils";
import DecimalInput from "../components/DecimalInput";

export default function DishPage() {
  const { name } = useParams();
  const dishName = decodeURIComponent(name ?? "");
  const { data, update } = useStore();
  const [sold, setSold] = useState<number>(0);

  const dish = useMemo(() => data?.dishes.find((d) => d.dish === dishName) ?? null, [data, dishName]);
  const lines = useMemo(() => data?.recipes.filter((r) => r.dish === dishName) ?? [], [data, dishName]);

  if (!data) {
    return (
      <div className="card">
        <div className="h1">Gericht</div>
        <div className="small">Bitte zuerst Excel laden.</div>
      </div>
    );
  }
  if (!dish) {
    return (
      <div className="card">
        <div className="h1">Nicht gefunden</div>
        <div className="small">Gericht nicht gefunden.</div>
        <div style={{ height: 10 }} />
        <Link to="/dashboard">Zurück</Link>
      </div>
    );
  }

  const price = pickPrice(dish);
  const db = dish.db ?? null;
  const dbToday = db != null && sold > 0 ? db * sold : null;
  const cogsToday = dish.cogs != null && sold > 0 ? dish.cogs * sold : null;
  const revenueToday = price != null && sold > 0 ? price * sold : null;

  return (
    <div className="grid two">
      <div className="card">
        <div className="row">
          <div>
            <div className="h1">{dish.dish}</div>
            <div className="small">Preis testen → DB live. (Master bleibt Referenz. Test/Speisekarte sind Outlet-spezifisch.)</div>
          </div>
          <div className="right">
            <Link to="/dashboard" className="badge">← Dashboard</Link>
          </div>
        </div>

        <div style={{ height: 14 }} />

        <div className="grid">
          <div className="card">
            <div className="small">Preise</div>
            <div className="row" style={{ marginTop: 8 }}>
              <div>
                <div className="small">Master</div>
                <div style={{ fontWeight: 900 }}>{money(dish.priceMaster ?? null)}</div>
              </div>

              <div>
                <div className="small">Speisekarte (Outlet)</div>
                <DecimalInput
                  value={dish.priceMenu ?? null}
                  placeholder="z.B. 8,90"
                  width={160}
                  onCommit={(next) => {
                    update(({ outlet }) => {
                      const o = outlet.overridesByOutletId[outlet.selectedOutletId];
                      if (!o.prices[dish.dish]) o.prices[dish.dish] = { priceMenu: null, priceTest: null };
                      o.prices[dish.dish].priceMenu = next;
                    });
                  }}
                />
              </div>

              <div>
                <div className="small">Testpreis (Outlet)</div>
                <DecimalInput
                  value={dish.priceTest ?? null}
                  placeholder="z.B. 8,90"
                  width={160}
                  onCommit={(next) => {
                    update(({ outlet }) => {
                      const o = outlet.overridesByOutletId[outlet.selectedOutletId];
                      if (!o.prices[dish.dish]) o.prices[dish.dish] = { priceMenu: null, priceTest: null };
                      o.prices[dish.dish].priceTest = next;
                    });
                  }}
                />
              </div>
            </div>
          </div>

          <div className="card">
            <div className="small">Ergebnis pro Stück</div>
            <div className="row" style={{ marginTop: 8 }}>
              <div className="kpi">
                <div className="small">Wareneinsatz</div>
                <div className="v">{money(dish.cogs ?? null)}</div>
              </div>
              <div className="kpi">
                <div className="small">DB €</div>
                <div className="v">{money(dish.db ?? null)}</div>
              </div>
              <div className="kpi">
                <div className="small">DB %</div>
                <div className="v">{pct(dish.dbPct ?? null)}</div>
              </div>
              <div className="pill right">
                Status: <b>{dish.status ?? "—"}</b>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="small">Heute verkauft (optional)</div>
            <div className="row" style={{ marginTop: 8 }}>
              <input
                type="number"
                min={0}
                value={sold}
                onChange={(e) => setSold(Number(e.target.value))}
                style={{ width: 140 }}
              />
              <span className="badge">Umsatz: {money(revenueToday)}</span>
              <span className="badge">Wareneinsatz: {money(cogsToday)}</span>
              <span className="badge">DB gesamt: {money(dbToday)}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="h1">Rezept (global)</div>
        <div className="small">Mengen ändern → Wareneinsatz und DB ändern sich in allen Outlets.</div>
        <div style={{ height: 10 }} />
        <table className="table">
          <thead>
            <tr>
              <th>Zutat</th>
              <th>Menge</th>
              <th>Einheit</th>
              <th>Gemappt</th>
              <th>Kosten</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l, idx) => (
              <tr key={idx}>
                <td>{l.ingredientRecipe}</td>

                <td style={{ width: 140 }}>
                  <DecimalInput
                    value={l.qty ?? null}
                    placeholder="z.B. 120"
                    width={110}
                    onCommit={(next) => {
                      update(({ base }) => {
                        const r = base.recipes.find((x) => x.dish === l.dish && x.ingredientRecipe === l.ingredientRecipe);
                        if (r) r.qty = next;
                      });
                    }}
                  />
                </td>

                <td style={{ width: 120 }}>
                  <select
                    value={l.unit ?? ""}
                    onChange={(e) => {
                      const v = e.target.value;
                      update(({ base }) => {
                        const r = base.recipes.find((x) => x.dish === l.dish && x.ingredientRecipe === l.ingredientRecipe);
                        if (r) r.unit = v || null;
                      });
                    }}
                  >
                    <option value="">—</option>
                    <option value="g">g</option>
                    <option value="ml">ml</option>
                    <option value="stk">stk</option>
                  </select>
                </td>

                <td>{l.mappedInventory ?? "—"}</td>
                <td>{money(l.cost ?? null)}</td>
                <td>{l.status ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
