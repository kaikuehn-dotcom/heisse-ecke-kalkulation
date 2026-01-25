import React, { useEffect, useMemo, useState } from "react";
import {
  AppData,
  DataIssue,
  exportWorkbook,
  money,
  parseWorkbook,
  pct,
  recalcAll,
  toNumber
} from "./core";

type Tab = "UPLOAD" | "DASHBOARD" | "GERICHT" | "INVENTUR" | "MAPPING" | "HINWEISE";

const LS_KEY = "heisse-ecke-single-outlet-state-v1";

function saveToLS(data: AppData) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(data));
  } catch {}
}
function loadFromLS(): AppData | null {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function cloneData(d: AppData): AppData {
  return JSON.parse(JSON.stringify(d));
}

function ensureMappingRow(data: AppData, recipeIngredient: string) {
  const name = recipeIngredient.trim();
  if (!name) return;
  const exists = data.mapping.find((m) => m.recipeName === name);
  if (exists) return;
  data.mapping.push({
    recipeName: name,
    suggestion: null,
    correction: null,
    status: "PRÜFEN"
  });
}

export default function App() {
  const [tab, setTab] = useState<Tab>("UPLOAD");
  const [data, setData] = useState<AppData | null>(null);
  const [issues, setIssues] = useState<DataIssue[]>([]);
  const [selectedDish, setSelectedDish] = useState<string | null>(null);
  const [showFix, setShowFix] = useState(false);

  // load previous state
  useEffect(() => {
    const saved = loadFromLS();
    if (saved) {
      const out = recalcAll(saved);
      setData(out.data);
      setIssues(out.issues);
      setTab("DASHBOARD");
    }
  }, []);

  const recompute = (next: AppData) => {
    const out = recalcAll(next);
    setData(out.data);
    setIssues(out.issues);
    saveToLS(out.data);
  };

  const onUpload = async (file: File) => {
    const buf = await file.arrayBuffer();
    const parsed = parseWorkbook(buf);
    // safety: ensure mapping rows exist for every recipe ingredient
    parsed.recipes.forEach((r) => ensureMappingRow(parsed, r.ingredientRecipe));
    recompute(parsed);
    setTab("DASHBOARD");
  };

  const doExport = () => {
    if (!data) return;
    const blob = exportWorkbook(data);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `HeisseEcke_Export_${new Date().toISOString().slice(0, 10)}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const clearAll = () => {
    setData(null);
    setIssues([]);
    setTab("UPLOAD");
    setSelectedDish(null);
    try {
      localStorage.removeItem(LS_KEY);
    } catch {}
  };

  const nextIssue = issues[0] ?? null;

  return (
    <div className="container">
      <div className="topbar">
        <div className="brand">
          <span
            style={{
              display: "inline-flex",
              width: 10,
              height: 10,
              borderRadius: 99,
              background: "var(--accent)"
            }}
          />
          Heiße Ecke – Web-App (Single Outlet)
        </div>

        <div className="row">
          <span className="badge">Status: {data ? "Daten geladen" : "Bitte Excel laden"}</span>
          {data && <span className="badge">Hinweise: {issues.length}</span>}
          {data && (
            <button className="secondary" onClick={doExport}>
              Excel exportieren
            </button>
          )}
          {data && issues.length > 0 && (
            <button className="primary" onClick={() => setShowFix(true)}>
              Quick-Fix
            </button>
          )}
          {data && (
            <button className="secondary" onClick={clearAll}>
              Zurücksetzen
            </button>
          )}
        </div>
      </div>

      <div className="nav">
        <button className={tab === "UPLOAD" ? "active" : ""} onClick={() => setTab("UPLOAD")}>
          1) Excel laden
        </button>
        <button className={tab === "DASHBOARD" ? "active" : ""} onClick={() => setTab("DASHBOARD")}>
          2) Dashboard
        </button>
        <button className={tab === "INVENTUR" ? "active" : ""} onClick={() => setTab("INVENTUR")}>
          3) Inventur
        </button>
        <button className={tab === "MAPPING" ? "active" : ""} onClick={() => setTab("MAPPING")}>
          4) Mapping
        </button>
        <button className={tab === "HINWEISE" ? "active" : ""} onClick={() => setTab("HINWEISE")}>
          Hinweise
        </button>
      </div>

      <div style={{ height: 12 }} />

      {tab === "UPLOAD" && <UploadScreen dataLoaded={!!data} onUpload={onUpload} />}

      {tab === "DASHBOARD" && (
        <DashboardScreen
          data={data}
          onChange={recompute}
          onOpenDish={(name) => {
            setSelectedDish(name);
            setTab("GERICHT");
          }}
        />
      )}

      {tab === "GERICHT" && (
        <DishScreen
          data={data}
          dishName={selectedDish}
          onBack={() => setTab("DASHBOARD")}
          onChange={recompute}
          onGoInventur={() => setTab("INVENTUR")}
          onGoMapping={() => setTab("MAPPING")}
        />
      )}

      {tab === "INVENTUR" && <InventoryScreen data={data} onChange={recompute} />}

      {tab === "MAPPING" && <MappingScreen data={data} onChange={recompute} />}

      {tab === "HINWEISE" && (
        <HintsScreen
          issues={issues}
          onJumpDish={(d) => {
            setSelectedDish(d);
            setTab("GERICHT");
          }}
        />
      )}

      {showFix && nextIssue && (
        <QuickFixModal
          issue={nextIssue}
          onClose={() => setShowFix(false)}
          onFixPrice={(dish, price) => {
            if (!data) return;
            const c = cloneData(data);
            const d = c.dishes.find((x) => x.dish === dish);
            if (d) d.priceTest = price;
            recompute(c);
            setShowFix(false);
          }}
          onFixEK={(invName, ek, unit) => {
            if (!data) return;
            const c = cloneData(data);
            const i = c.inventory.find((x) => x.name === invName);
            if (i) {
              i.ekRaw = ek;
              i.unitRaw = unit;
            }
            recompute(c);
            setShowFix(false);
          }}
          onGoMapping={() => {
            setShowFix(false);
            setTab("MAPPING");
          }}
          onGoDish={(d) => {
            setShowFix(false);
            setSelectedDish(d);
            setTab("GERICHT");
          }}
          onGoInventur={() => {
            setShowFix(false);
            setTab("INVENTUR");
          }}
        />
      )}

      <div style={{ height: 18 }} />
      <div className="small">
        Prinzip: nichts blockiert. Wenn Daten fehlen, siehst du „—“. Preisänderungen ändern DB sofort (Wareneinsatz
        kommt aus dem Rezept).
      </div>
    </div>
  );
}

/** ===== Screens ===== */

function UploadScreen({ dataLoaded, onUpload }: { dataLoaded: boolean; onUpload: (f: File) => void }) {
  const [err, setErr] = useState<string | null>(null);
  return (
    <div className="card">
      <div className="h1">1) Excel laden</div>
      <div className="small">
        Lade deine Datei <b>HeisseEcke_WebApp_Datenpaket_FULL.xlsx</b> hoch. Danach ist Dashboard sofort nutzbar.
      </div>
      <div style={{ height: 10 }} />
      <div className="row">
        <input
          type="file"
          accept=".xlsx"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            setErr(null);
            try {
              await onUpload(f);
            } catch (ex: any) {
              setErr(ex?.message ?? "Konnte Datei nicht lesen.");
            }
          }}
        />
        {dataLoaded && (
          <span className="pill">
            <span className="dot ok" /> Datei geladen
          </span>
        )}
        {err && (
          <span className="pill">
            <span className="dot bad" /> {err}
          </span>
        )}
      </div>
    </div>
  );
}

function DashboardScreen({
  data,
  onChange,
  onOpenDish
}: {
  data: AppData | null;
  onChange: (d: AppData) => void;
  onOpenDish: (dish: string) => void;
}) {
  const [q, setQ] = useState("");
  const [newDishName, setNewDishName] = useState("");
  const [newDishPrice, setNewDishPrice] = useState("");

  const rows = useMemo(() => {
    if (!data) return [];
    const qq = q.toLowerCase().trim();
    return data.dishes
      .filter((d) => (qq ? d.dish.toLowerCase().includes(qq) : true))
      .sort((a, b) => (b.db ?? -1e9) - (a.db ?? -1e9));
  }, [data, q]);

  if (!data)
    return (
      <div className="card">
        <div className="h1">Dashboard</div>
        <div className="small">Bitte zuerst Excel laden.</div>
      </div>
    );

  const setPrice = (dish: string, field: "priceMenu" | "priceTest", raw: string) => {
    const v = raw.replace(",", ".").trim();
    const num = v === "" ? null : Number(v);
    const c = cloneData(data);
    const d = c.dishes.find((x) => x.dish === dish);
    if (!d) return;
    (d as any)[field] = num;
    onChange(c);
  };

  const addDish = () => {
    const name = newDishName.trim();
    if (!name) return;
    const price = toNumber(newDishPrice);
    const c = cloneData(data);
    const exists = c.dishes.find((d) => d.dish.toLowerCase() === name.toLowerCase());
    if (exists) return;

    c.dishes.push({
      dish: name,
      priceMaster: null,
      priceMenu: price,
      priceTest: null,
      cogs: null,
      db: null,
      dbPct: null,
      status: "FEHLT_REZEPT"
    });
    onChange(c);
    setNewDishName("");
    setNewDishPrice("");
  };

  return (
    <div className="card">
      <div className="row">
        <div>
          <div className="h1">2) Dashboard</div>
          <div className="small">Hier kannst du Preise direkt ändern. Klick ein Gericht für Rezept/Details.</div>
        </div>
        <div style={{ marginLeft: "auto" }} className="row">
          <input
            placeholder="Gericht suchen…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            style={{ minWidth: 260 }}
          />
        </div>
      </div>

      <div style={{ height: 12 }} />

      <div className="card">
        <div className="small">Neues Gericht anlegen</div>
        <div className="row" style={{ marginTop: 8 }}>
          <input
            placeholder="Gerichtname (z.B. Currywurst Dippers)"
            value={newDishName}
            onChange={(e) => setNewDishName(e.target.value)}
            style={{ minWidth: 320 }}
          />
          <input
            placeholder="Start-Preis (Speisekarte) optional"
            value={newDishPrice}
            onChange={(e) => setNewDishPrice(e.target.value)}
            style={{ width: 220 }}
          />
          <button className="primary" onClick={addDish}>
            + Gericht
          </button>
          <span className="small">Hinweis: Wareneinsatz kommt, sobald du Rezeptzeilen ergänzt.</span>
        </div>
      </div>

      <div style={{ height: 12 }} />

      <table className="table">
        <thead>
          <tr>
            <th>Gericht</th>
            <th>Preis Master</th>
            <th>Preis Speisekarte (edit)</th>
            <th>Preis Test (edit)</th>
            <th>Wareneinsatz</th>
            <th>DB €</th>
            <th>DB %</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((d) => (
            <tr key={d.dish}>
              <td style={{ fontWeight: 900 }}>
                <button className="secondary" onClick={() => onOpenDish(d.dish)}>
                  {d.dish}
                </button>
              </td>
              <td>{money(d.priceMaster)}</td>
              <td style={{ width: 180 }}>
                <input
                  value={d.priceMenu ?? ""}
                  placeholder="z.B. 8,90"
                  onChange={(e) => setPrice(d.dish, "priceMenu", e.target.value)}
                  style={{ width: 150 }}
                />
              </td>
              <td style={{ width: 160 }}>
                <input
                  value={d.priceTest ?? ""}
                  placeholder="z.B. 9,50"
                  onChange={(e) => setPrice(d.dish, "priceTest", e.target.value)}
                  style={{ width: 130 }}
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
    </div>
  );
}

function DishScreen({
  data,
  dishName,
  onBack,
  onChange,
  onGoInventur,
  onGoMapping
}: {
  data: AppData | null;
  dishName: string | null;
  onBack: () => void;
  onChange: (d: AppData) => void;
  onGoInventur: () => void;
  onGoMapping: () => void;
}) {
  const [sold, setSold] = useState(0);
  const [newIng, setNewIng] = useState("");
  const [newQty, setNewQty] = useState("");
  const [newUnit, setNewUnit] = useState<"g" | "ml" | "stk">("g");

  if (!data || !dishName)
    return (
      <div className="card">
        <div className="h1">Gericht</div>
        <div className="small">Bitte zuerst Excel laden und Gericht wählen.</div>
      </div>
    );

  const dish = data.dishes.find((d) => d.dish === dishName);
  if (!dish)
    return (
      <div className="card">
        <div className="h1">Nicht gefunden</div>
        <button className="secondary" onClick={onBack}>
          Zurück
        </button>
      </div>
    );

  const lines = data.recipes.filter((r) => r.dish === dishName);

  const price = dish.priceTest ?? dish.priceMenu ?? dish.priceMaster ?? null;
  const revToday = price && sold > 0 ? price * sold : null;
  const cogsToday = dish.cogs && sold > 0 ? dish.cogs * sold : null;
  const dbToday = dish.db && sold > 0 ? dish.db * sold : null;

  const updateDishPrice = (field: "priceMenu" | "priceTest", raw: string) => {
    const v = raw.replace(",", ".").trim();
    const num = v === "" ? null : Number(v);
    const c = cloneData(data);
    const d = c.dishes.find((x) => x.dish === dish.dish);
    if (!d) return;
    (d as any)[field] = num;
    onChange(c);
  };

  const addRecipeLine = () => {
    const ing = newIng.trim();
    if (!ing) return;
    const qty = toNumber(newQty);
    const c = cloneData(data);

    // add mapping row if missing
    ensureMappingRow(c, ing);

    // add recipe line
    c.recipes.push({
      dish: dish.dish,
      ingredientRecipe: ing,
      qty: qty ?? null,
      unit: newUnit,
      mappedInventory: null,
      ekBase: null,
      cost: null,
      status: "PRÜFEN"
    });

    onChange(c);
    setNewIng("");
    setNewQty("");
    setNewUnit("g");
  };

  const deleteRecipeLine = (ingredientRecipe: string) => {
    const c = cloneData(data);
    const idx = c.recipes.findIndex((r) => r.dish === dish.dish && r.ingredientRecipe === ingredientRecipe);
    if (idx >= 0) c.recipes.splice(idx, 1);
    onChange(c);
  };

  const updateRecipeField = (ingredientRecipe: string, field: "qty" | "unit", raw: string) => {
    const c = cloneData(data);
    const r = c.recipes.find((x) => x.dish === dish.dish && x.ingredientRecipe === ingredientRecipe);
    if (!r) return;
    if (field === "qty") {
      r.qty = raw.trim() === "" ? null : Number(raw.replace(",", "."));
    } else {
      r.unit = raw || null;
    }
    onChange(c);
  };

  return (
    <div className="card">
      <div className="row">
        <div>
          <div className="h1">{dish.dish}</div>
          <div className="small">
            Preise ändern → DB live. Rezeptzeilen ändern → Wareneinsatz & DB live.
          </div>
        </div>
        <div style={{ marginLeft: "auto" }} className="row">
          <button className="secondary" onClick={onBack}>
            ← Dashboard
          </button>
          <button className="secondary" onClick={onGoInventur}>
            Inventur
          </button>
          <button className="secondary" onClick={onGoMapping}>
            Mapping
          </button>
        </div>
      </div>

      <div style={{ height: 12 }} />

      <div className="card">
        <div className="small">Preise</div>
        <div className="row" style={{ marginTop: 8 }}>
          <div>
            <div className="small">Master</div>
            <div style={{ fontWeight: 900 }}>{money(dish.priceMaster)}</div>
          </div>
          <div>
            <div className="small">Speisekarte</div>
            <input
              value={dish.priceMenu ?? ""}
              placeholder="z.B. 8,90"
              onChange={(e) => updateDishPrice("priceMenu", e.target.value)}
              style={{ width: 160 }}
            />
          </div>
          <div>
            <div className="small">Testpreis</div>
            <input
              value={dish.priceTest ?? ""}
              placeholder="z.B. 9,50"
              onChange={(e) => updateDishPrice("priceTest", e.target.value)}
              style={{ width: 160 }}
            />
          </div>
          <span className="pill">
            Status: <b>{dish.status ?? "—"}</b>
          </span>
        </div>
      </div>

      <div style={{ height: 12 }} />

      <div className="card">
        <div className="small">Ergebnis pro Stück</div>
        <div className="row" style={{ marginTop: 8 }}>
          <span className="badge">Wareneinsatz: {money(dish.cogs)}</span>
          <span className="badge">DB €: {money(dish.db)}</span>
          <span className="badge">DB %: {pct(dish.dbPct)}</span>
        </div>
      </div>

      <div style={{ height: 12 }} />

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
          <span className="badge">Umsatz: {money(revToday)}</span>
          <span className="badge">Wareneinsatz: {money(cogsToday)}</span>
          <span className="badge">DB gesamt: {money(dbToday)}</span>
        </div>
      </div>

      <div style={{ height: 12 }} />

      <div className="card">
        <div className="h1">Rezept</div>
        <div className="small">
          Neue Zutat hinzufügen. Falls die Zutat in der Inventur fehlt: Inventur → Zutat anlegen.
        </div>

        <div style={{ height: 10 }} />

        <div className="card">
          <div className="small">Neue Rezeptzeile</div>
          <div className="row" style={{ marginTop: 8 }}>
            <input
              placeholder="Zutat im Rezept (z.B. Currywurst)"
              value={newIng}
              onChange={(e) => setNewIng(e.target.value)}
              style={{ minWidth: 320 }}
            />
            <input
              placeholder="Menge (z.B. 180)"
              value={newQty}
              onChange={(e) => setNewQty(e.target.value)}
              style={{ width: 180 }}
            />
            <select value={newUnit} onChange={(e) => setNewUnit(e.target.value as any)}>
              <option value="g">g</option>
              <option value="ml">ml</option>
              <option value="stk">stk</option>
            </select>
            <button className="primary" onClick={addRecipeLine}>
              + Zeile
            </button>
          </div>
          <div className="small" style={{ marginTop: 6 }}>
            Mapping wird automatisch angelegt (Status PRÜFEN), falls neu.
          </div>
        </div>

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
              <th></th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l, idx) => (
              <tr key={idx}>
                <td>{l.ingredientRecipe}</td>
                <td style={{ width: 120 }}>
                  <input
                    value={l.qty ?? ""}
                    onChange={(e) => updateRecipeField(l.ingredientRecipe, "qty", e.target.value)}
                    style={{ width: 100 }}
                  />
                </td>
                <td style={{ width: 120 }}>
                  <select
                    value={l.unit ?? ""}
                    onChange={(e) => updateRecipeField(l.ingredientRecipe, "unit", e.target.value)}
                  >
                    <option value="">—</option>
                    <option value="g">g</option>
                    <option value="ml">ml</option>
                    <option value="stk">stk</option>
                  </select>
                </td>
                <td>{l.mappedInventory ?? "—"}</td>
                <td>{money(l.cost)}</td>
                <td>{l.status ?? "—"}</td>
                <td style={{ width: 120 }}>
                  <button className="secondary" onClick={() => deleteRecipeLine(l.ingredientRecipe)}>
                    Entfernen
                  </button>
                </td>
              </tr>
            ))}
            {lines.length === 0 && (
              <tr>
                <td colSpan={7} className="small">
                  Noch keine Rezeptzeilen. Füge oben eine hinzu.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function InventoryScreen({ data, onChange }: { data: AppData | null; onChange: (d: AppData) => void }) {
  const [q, setQ] = useState("");
  const [newName, setNewName] = useState("");
  const [newEK, setNewEK] = useState("");
  const [newUnit, setNewUnit] = useState("kg");

  if (!data)
    return (
      <div className="card">
        <div className="h1">Inventur</div>
        <div className="small">Bitte zuerst Excel laden.</div>
      </div>
    );

  const rows = data.inventory
    .filter((i) => (q ? i.name.toLowerCase().includes(q.toLowerCase()) : true))
    .sort((a, b) => a.name.localeCompare(b.name, "de"));

  const addInventory = () => {
    const name = newName.trim();
    if (!name) return;
    const ek = toNumber(newEK);
    const c = cloneData(data);
    const exists = c.inventory.find((x) => x.name.toLowerCase() === name.toLowerCase());
    if (exists) return;

    c.inventory.push({
      name,
      ekRaw: ek ?? null,
      unitRaw: newUnit,
      ekBase: null,
      status: "NEU"
    });

    onChange(c);
    setNewName("");
    setNewEK("");
    setNewUnit("kg");
  };

  return (
    <div className="card">
      <div className="row">
        <div>
          <div className="h1">3) Inventur</div>
          <div className="small">EK/Einheit ändern → alles rechnet neu. Du kannst auch neue Zutaten anlegen.</div>
        </div>
        <div style={{ marginLeft: "auto" }} className="row">
          <input
            placeholder="Zutat suchen…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            style={{ minWidth: 260 }}
          />
        </div>
      </div>

      <div style={{ height: 12 }} />

      <div className="card">
        <div className="small">Neue Zutat anlegen</div>
        <div className="row" style={{ marginTop: 8 }}>
          <input
            placeholder="Zutatname (z.B. Cheddar Scheiben)"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            style={{ minWidth: 320 }}
          />
          <input
            placeholder="EK (z.B. 12,90)"
            value={newEK}
            onChange={(e) => setNewEK(e.target.value)}
            style={{ width: 180 }}
          />
          <select value={newUnit} onChange={(e) => setNewUnit(e.target.value)}>
            <option value="kg">kg</option>
            <option value="g">g</option>
            <option value="l">l</option>
            <option value="ml">ml</option>
            <option value="stk">stk</option>
          </select>
          <button className="primary" onClick={addInventory}>
            + Zutat
          </button>
          <span className="small">Wenn EK/Einheit fehlen, zeigt die App das als Hinweis.</span>
        </div>
      </div>

      <div style={{ height: 12 }} />

      <table className="table">
        <thead>
          <tr>
            <th>Zutat</th>
            <th>EK</th>
            <th>Einheit</th>
            <th>Status</th>
