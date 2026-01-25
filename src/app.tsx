import React, { useEffect, useMemo, useState } from "react";
import {
  AppData,
  exportWorkbook,
  money,
  parseWorkbook,
  pct,
  recalcAll,
  toNumber
} from "./core";

type Tab = "UPLOAD" | "DASHBOARD" | "DISH" | "INVENTORY" | "MAPPING";

const LS_KEY = "heisse-ecke-mvp-single-outlet-v3";

function clone<T>(x: T): T {
  return JSON.parse(JSON.stringify(x));
}

function lsSave(data: AppData) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(data));
  } catch {}
}
function lsLoad(): AppData | null {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
function lsClear() {
  try {
    localStorage.removeItem(LS_KEY);
  } catch {}
}

function ensureMappingRow(data: AppData, recipeName: string) {
  const key = (recipeName ?? "").trim();
  if (!key) return;
  if (data.mapping.some((m) => m.recipeName === key)) return;
  data.mapping.push({ recipeName: key, suggestion: null, correction: null, status: "PRÜFEN" });
}

export default function App() {
  const [tab, setTab] = useState<Tab>("UPLOAD");
  const [data, setData] = useState<AppData | null>(null);
  const [issuesCount, setIssuesCount] = useState<number>(0);
  const [dish, setDish] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const recompute = (next: AppData) => {
    next.recipes.forEach((r) => ensureMappingRow(next, r.ingredientRecipe));
    const out = recalcAll(next);
    setData(out.data);
    setIssuesCount(out.issues.length);
    lsSave(out.data);
  };

  useEffect(() => {
    const saved = lsLoad();
    if (saved) {
      const out = recalcAll(saved);
      setData(out.data);
      setIssuesCount(out.issues.length);
      setTab("DASHBOARD");
    }
  }, []);

  const upload = async (file: File) => {
    const buf = await file.arrayBuffer();
    const parsed = parseWorkbook(buf);
    recompute(parsed);
    setTab("DASHBOARD");
  };

  const reset = () => {
    lsClear();
    setData(null);
    setIssuesCount(0);
    setDish(null);
    setTab("UPLOAD");
  };

  const exportXlsx = () => {
    if (!data) return;
    const blob = exportWorkbook(data);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `HeisseEcke_Export_${new Date().toISOString().slice(0, 10)}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const dishes = useMemo(() => {
    if (!data) return [];
    const q = search.trim().toLowerCase();
    return data.dishes
      .filter((d) => (q ? d.dish.toLowerCase().includes(q) : true))
      .sort((a, b) => (b.db ?? -1e9) - (a.db ?? -1e9));
  }, [data, search]);

  return (
    <div className="container">
      <div className="topbar">
        <div className="brand">Heiße Ecke – MVP</div>
        <div className="row">
          <span className="badge">Status: {data ? "geladen" : "leer"}</span>
          {data && <span className="badge">Hinweise: {issuesCount}</span>}
          {data && (
            <button className="secondary" onClick={exportXlsx}>
              Excel exportieren
            </button>
          )}
          <button className="secondary" onClick={reset}>
            Zurücksetzen
          </button>
        </div>
      </div>

      <div className="nav">
        <button className={tab === "UPLOAD" ? "active" : ""} onClick={() => setTab("UPLOAD")}>
          Excel laden
        </button>
        <button className={tab === "DASHBOARD" ? "active" : ""} onClick={() => setTab("DASHBOARD")}>
          Dashboard
        </button>
        <button className={tab === "DISH" ? "active" : ""} onClick={() => setTab("DISH")} disabled={!dish}>
          Gericht
        </button>
        <button className={tab === "INVENTORY" ? "active" : ""} onClick={() => setTab("INVENTORY")}>
          Inventur
        </button>
        <button className={tab === "MAPPING" ? "active" : ""} onClick={() => setTab("MAPPING")}>
          Mapping
        </button>
      </div>

      <div style={{ height: 12 }} />

      {tab === "UPLOAD" && (
        <div className="card">
          <div className="h1">Excel laden</div>
          <div className="small">Lade deine Datei (Datenpaket_FULL.xlsx) hoch.</div>
          <div style={{ height: 10 }} />
          <input
            type="file"
            accept=".xlsx"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) upload(f);
            }}
          />
        </div>
      )}

      {tab === "DASHBOARD" && (
        <div className="card">
          <div className="row">
            <div>
              <div className="h1">Dashboard</div>
              <div className="small">Preise editieren, DB live.</div>
            </div>
            <div style={{ marginLeft: "auto" }} className="row">
              <input
                placeholder="Gericht suchen…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{ minWidth: 240 }}
              />
            </div>
          </div>

          {!data ? (
            <div className="small" style={{ marginTop: 10 }}>
              Bitte zuerst Excel laden.
            </div>
          ) : (
            <table className="table" style={{ marginTop: 12 }}>
              <thead>
                <tr>
                  <th>Gericht</th>
                  <th>Preis Menü</th>
                  <th>Preis Test</th>
                  <th>Wareneinsatz</th>
                  <th>DB €</th>
                  <th>DB %</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {dishes.map((d) => (
                  <tr key={d.dish}>
                    <td style={{ fontWeight: 800 }}>
                      <button
                        className="secondary"
                        onClick={() => {
                          setDish(d.dish);
                          setTab("DISH");
                        }}
                      >
                        {d.dish}
                      </button>
                    </td>
                    <td style={{ width: 150 }}>
                      <input
                        value={d.priceMenu ?? ""}
                        placeholder="8,90"
                        onChange={(e) => {
                          const c = clone(data);
                          const x = c.dishes.find((z) => z.dish === d.dish);
                          if (x) x.priceMenu = e.target.value.trim() ? Number(e.target.value.replace(",", ".")) : null;
                          recompute(c);
                        }}
                        style={{ width: 120 }}
                      />
                    </td>
                    <td style={{ width: 150 }}>
                      <input
                        value={d.priceTest ?? ""}
                        placeholder="9,50"
                        onChange={(e) => {
                          const c = clone(data);
                          const x = c.dishes.find((z) => z.dish === d.dish);
                          if (x) x.priceTest = e.target.value.trim() ? Number(e.target.value.replace(",", ".")) : null;
                          recompute(c);
                        }}
                        style={{ width: 120 }}
                      />
                    </td>
                    <td>{money(d.cogs)}</td>
                    <td>{money(d.db)}</td>
                    <td>{pct(d.dbPct)}</td>
                    <td>{d.status ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {tab === "DISH" && (
        <DishView
          data={data}
          dish={dish}
          onChange={recompute}
          onGoMapping={() => setTab("MAPPING")}
          onGoInventory={() => setTab("INVENTORY")}
        />
      )}

      {tab === "INVENTORY" && <InventoryView data={data} onChange={recompute} />}

      {tab === "MAPPING" && <MappingView data={data} onChange={recompute} />}
    </div>
  );
}

function DishView({
  data,
  dish,
  onChange,
  onGoMapping,
  onGoInventory
}: {
  data: AppData | null;
  dish: string | null;
  onChange: (d: AppData) => void;
  onGoMapping: () => void;
  onGoInventory: () => void;
}) {
  const [sold, setSold] = useState(0);

  if (!data || !dish) {
    return (
      <div className="card">
        <div className="h1">Gericht</div>
        <div className="small">Bitte zuerst Daten laden und ein Gericht wählen.</div>
      </div>
    );
  }

  const d = data.dishes.find((x) => x.dish === dish);
  if (!d) {
    return (
      <div className="card">
        <div className="h1">Gericht nicht gefunden</div>
      </div>
    );
  }

  const lines = data.recipes.filter((r) => r.dish === dish);
  const invOptions = [...data.inventory.map((i) => i.name)].sort((a, b) => a.localeCompare(b, "de"));

  const price = d.priceTest ?? d.priceMenu ?? d.priceMaster ?? null;
  const rev = price && sold ? price * sold : null;
  const cogs = d.cogs && sold ? d.cogs * sold : null;
  const db = d.db && sold ? d.db * sold : null;

  const getMapping = (recipeName: string) => data.mapping.find((m) => m.recipeName === recipeName) ?? null;

  const setCorrection = (recipeName: string, invNameOrEmpty: string) => {
    const c = clone(data);
    ensureMappingRow(c, recipeName);
    const m = c.mapping.find((x) => x.recipeName === recipeName);
    if (!m) return;
    m.correction = invNameOrEmpty ? invNameOrEmpty : null;
    m.status = "OK";
    onChange(c);
  };

  return (
    <div className="card">
      <div className="row">
        <div>
          <div className="h1">{dish}</div>
          <div className="small">Mapping kannst du hier pro Zutat wählen.</div>
        </div>
        <div style={{ marginLeft: "auto" }} className="row">
          <button className="secondary" onClick={onGoInventory}>Inventur</button>
          <button className="secondary" onClick={onGoMapping}>Mapping</button>
        </div>
      </div>

      <div style={{ height: 12 }} />

      <div className="row">
        <span className="badge">Wareneinsatz: {money(d.cogs)}</span>
        <span className="badge">DB €: {money(d.db)}</span>
        <span className="badge">DB %: {pct(d.dbPct)}</span>
      </div>

      <div style={{ height: 12 }} />

      <div className="card">
        <div className="small">Heute verkauft (optional)</div>
        <div className="row" style={{ marginTop: 8 }}>
          <input type="number" min={0} value={sold} onChange={(e) => setSold(Number(e.target.value))} style={{ width: 120 }} />
          <span className="badge">Umsatz: {money(rev)}</span>
          <span className="badge">Wareneinsatz: {money(cogs)}</span>
          <span className="badge">DB gesamt: {money(db)}</span>
        </div>
      </div>

      <div style={{ height: 12 }} />

      <table className="table">
        <thead>
          <tr>
            <th>Zutat</th>
            <th>Menge</th>
            <th>Einheit</th>
            <th>Inventur-Artikel (Korrektur)</th>
            <th>Kosten</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l, idx) => {
            const m = getMapping(l.ingredientRecipe);
            const hint = m?.suggestion ? `Vorschlag: ${m.suggestion}` : "kein Vorschlag";
            return (
              <tr key={idx}>
                <td>{l.ingredientRecipe}</td>
                <td>{l.qty ?? "—"}</td>
                <td>{l.unit ?? "—"}</td>
                <td style={{ width: 320 }}>
                  <select
                    value={m?.correction ?? ""}
                    onChange={(e) => setCorrection(l.ingredientRecipe, e.target.value)}
                    style={{ width: "100%" }}
                  >
                    <option value="">{`— (Vorschlag verwenden: ${hint})`}</option>
                    {invOptions.map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                  </select>
                </td>
                <td>{money(l.cost)}</td>
                <td>{l.status ?? "—"}</td>
              </tr>
            );
          })}
          {lines.length === 0 && (
            <tr>
              <td colSpan={6} className="small">Keine Rezeptzeilen gefunden.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function InventoryView({ data, onChange }: { data: AppData | null; onChange: (d: AppData) => void }) {
  const [q, setQ] = useState("");
  const [newName, setNewName] = useState("");
  const [newEK, setNewEK] = useState("");
  const [newUnit, setNewUnit] = useState("kg");

  if (!data) {
    return (
      <div className="card">
        <div className="h1">Inventur</div>
        <div className="small">Bitte zuerst Excel laden.</div>
      </div>
    );
  }

  const rows = data.inventory
    .filter((i) => (q ? i.name.toLowerCase().includes(q.toLowerCase()) : true))
    .sort((a, b) => a.name.localeCompare(b.name, "de"));

  const add = () => {
    const name = newName.trim();
    if (!name) return;
    const ek = toNumber(newEK);
    const c = clone(data);
    if (c.inventory.some((x) => x.name.toLowerCase() === name.toLowerCase())) return;
    c.inventory.push({ name, ekRaw: ek ?? null, unitRaw: newUnit, ekBase: null, status: "NEU" });
    onChange(c);
    setNewName("");
    setNewEK("");
    setNewUnit("kg");
  };

  return (
    <div className="card">
      <div className="row">
        <div>
          <div className="h1">Inventur</div>
          <div className="small">EK + Einheit pflegen (kg/g/l/ml/stk).</div>
        </div>
        <div style={{ marginLeft: "auto" }} className="row">
          <input placeholder="Suchen…" value={q} onChange={(e) => setQ(e.target.value)} style={{ minWidth: 220 }} />
        </div>
      </div>

      <div style={{ height: 12 }} />

      <div className="card">
        <div className="small">Neue Zutat</div>
        <div className="row" style={{ marginTop: 8 }}>
          <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Name" style={{ minWidth: 240 }} />
          <input value={newEK} onChange={(e) => setNewEK(e.target.value)} placeholder="EK" style={{ width: 140 }} />
          <select value={newUnit} onChange={(e) => setNewUnit(e.target.value)} style={{ width: 120 }}>
            <option value="kg">kg</option><option value="g">g</option>
            <option value="l">l</option><option value="ml">ml</option>
            <option value="stk">stk</option>
          </select>
          <button className="primary" onClick={add}>+ Zutat</button>
        </div>
      </div>

      <div style={{ height: 12 }} />

      <table className="table">
        <thead>
          <tr>
            <th>Zutat</th><th>EK</th><th>Einheit</th><th>Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((i) => (
            <tr key={i.name}>
              <td style={{ fontWeight: 800 }}>{i.name}</td>
              <td style={{ width: 140 }}>
                <input
                  value={i.ekRaw ?? ""}
                  onChange={(e) => {
                    const c = clone(data);
                    const it = c.inventory.find((x) => x.name === i.name);
                    if (it) it.ekRaw = e.target.value.trim() ? Number(e.target.value.replace(",", ".")) : null;
                    onChange(c);
                  }}
                  style={{ width: 120 }}
                />
              </td>
              <td style={{ width: 140 }}>
                <select
                  value={i.unitRaw ?? ""}
                  onChange={(e) => {
                    const c = clone(data);
                    const it = c.inventory.find((x) => x.name === i.name);
                    if (it) it.unitRaw = e.target.value || null;
                    onChange(c);
                  }}
                >
                  <option value="">—</option>
                  <option value="kg">kg</option><option value="g">g</option>
                  <option value="l">l</option><option value="ml">ml</option>
                  <option value="stk">stk</option>
                </select>
              </td>
              <td>{i.status ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MappingView({ data, onChange }: { data: AppData | null; onChange: (d: AppData) => void }) {
  const [q, setQ] = useState("");

  if (!data) {
    return (
      <div className="card">
        <div className="h1">Mapping</div>
        <div className="small">Bitte zuerst Excel laden.</div>
      </div>
    );
  }

  const invOptions = [...data.inventory.map((i) => i.name)].sort((a, b) => a.localeCompare(b, "de"));
  const rows = data.mapping
    .filter((m) => (q ? m.recipeName.toLowerCase().includes(q.toLowerCase()) : true))
    .sort((a, b) => (a.status === "PRÜFEN" ? -1 : 1) - (b.status === "PRÜFEN" ? -1 : 1));

  return (
    <div className="card">
      <div className="row">
        <div>
          <div className="h1">Mapping</div>
          <div className="small">Rezept-Zutat → Inventur-Artikel.</div>
        </div>
        <div style={{ marginLeft: "auto" }} className="row">
          <input placeholder="Suchen…" value={q} onChange={(e) => setQ(e.target.value)} style={{ minWidth: 220 }} />
        </div>
      </div>

      <div style={{ height: 12 }} />

      <table className="table">
        <thead>
          <tr>
            <th>Rezept-Zutat</th><th>Vorschlag</th><th>Korrektur</th><th>Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((m) => (
            <tr key={m.recipeName}>
              <td style={{ fontWeight: 800 }}>{m.recipeName}</td>
              <td>{m.suggestion ?? "—"}</td>
              <td style={{ width: 320 }}>
                <select
                  value={m.correction ?? ""}
                  onChange={(e) => {
                    const c = clone(data);
                    const x = c.mapping.find((z) => z.recipeName === m.recipeName);
                    if (x) {
                      x.correction = e.target.value || null;
                      x.status = "OK";
                    }
                    onChange(c);
                  }}
                  style={{ width: "100%" }}
                >
                  <option value="">— (Vorschlag verwenden)</option>
                  {invOptions.map((name) => (
                    <option key={name} value={name}>{name}</option>
                  ))}
                </select>
              </td>
              <td>{m.status ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
