import React, { useEffect, useMemo, useState } from "react";
import { AppData, DataIssue, exportWorkbook, money, parseWorkbook, pct, recalcAll, toNumber } from "./core";

type Tab = "UPLOAD" | "DASHBOARD" | "GERICHT" | "INVENTUR" | "MAPPING" | "HINWEISE";

const LS_KEY = "heisse-ecke-single-outlet-state-v1";

function saveToLS(data: AppData) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(data)); } catch {}
}
function loadFromLS(): AppData | null {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch { return null; }
}

export default function App() {
  const [tab, setTab] = useState<Tab>("UPLOAD");
  const [base, setBase] = useState<AppData | null>(null);
  const [data, setData] = useState<AppData | null>(null);
  const [issues, setIssues] = useState<DataIssue[]>([]);
  const [selectedDish, setSelectedDish] = useState<string | null>(null);
  const [showFix, setShowFix] = useState(false);

  // load previous state
  useEffect(() => {
    const saved = loadFromLS();
    if (saved) {
      const out = recalcAll(saved);
      setBase(out.data);
      setData(out.data);
      setIssues(out.issues);
      setTab("DASHBOARD");
    }
  }, []);

  const recompute = (next: AppData) => {
    const out = recalcAll(next);
    setBase(out.data);
    setData(out.data);
    setIssues(out.issues);
    saveToLS(out.data);
  };

  const onUpload = async (file: File) => {
    const buf = await file.arrayBuffer();
    const parsed = parseWorkbook(buf);
    recompute(parsed);
    setTab("DASHBOARD");
  };

  const doExport = () => {
    if (!data) return;
    const blob = exportWorkbook(data);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `HeisseEcke_Export_${new Date().toISOString().slice(0,10)}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const clearAll = () => {
    setBase(null); setData(null); setIssues([]);
    setTab("UPLOAD"); setSelectedDish(null);
    try { localStorage.removeItem(LS_KEY); } catch {}
  };

  const nextIssue = issues[0] ?? null;

  return (
    <div className="container">
      <div className="topbar">
        <div className="brand">
          <span style={{display:"inline-flex",width:10,height:10,borderRadius:99,background:"var(--accent)"}}/>
          Heiße Ecke – Web-App (Single Outlet)
        </div>

        <div className="row">
          <span className="badge">Status: {data ? "Daten geladen" : "Bitte Excel laden"}</span>
          {data && <span className="badge">Hinweise: {issues.length}</span>}
          {data && <button className="secondary" onClick={doExport}>Excel exportieren</button>}
          {data && issues.length > 0 && <button className="primary" onClick={() => setShowFix(true)}>Quick-Fix</button>}
          {data && <button className="secondary" onClick={clearAll}>Zurücksetzen</button>}
        </div>
      </div>

      <div className="nav">
        <button className={tab==="UPLOAD" ? "active":""} onClick={() => setTab("UPLOAD")}>1) Excel laden</button>
        <button className={tab==="DASHBOARD" ? "active":""} onClick={() => setTab("DASHBOARD")}>2) Dashboard</button>
        <button className={tab==="INVENTUR" ? "active":""} onClick={() => setTab("INVENTUR")}>3) Inventur</button>
        <button className={tab==="MAPPING" ? "active":""} onClick={() => setTab("MAPPING")}>4) Mapping</button>
        <button className={tab==="HINWEISE" ? "active":""} onClick={() => setTab("HINWEISE")}>Hinweise</button>
      </div>

      <div style={{height:12}} />

      {tab === "UPLOAD" && <UploadScreen dataLoaded={!!data} onUpload={onUpload} />}
      {tab === "DASHBOARD" && <DashboardScreen data={data} onOpenDish={(name) => { setSelectedDish(name); setTab("GERICHT"); }} />}
      {tab === "GERICHT" && <DishScreen data={data} dishName={selectedDish} onBack={() => setTab("DASHBOARD")} onChange={recompute} />}
      {tab === "INVENTUR" && <InventoryScreen data={data} onChange={recompute} />}
      {tab === "MAPPING" && <MappingScreen data={data} onChange={recompute} />}
      {tab === "HINWEISE" && <HintsScreen issues={issues} onJumpDish={(d) => { setSelectedDish(d); setTab("GERICHT"); }} />}

      {showFix && nextIssue && (
        <QuickFixModal
          issue={nextIssue}
          onClose={() => setShowFix(false)}
          onFixPrice={(dish, price) => {
            if (!data) return;
            const clone: AppData = JSON.parse(JSON.stringify(data));
            const d = clone.dishes.find(x => x.dish === dish);
            if (d) d.priceTest = price;
            recompute(clone);
            setShowFix(false);
          }}
          onFixEK={(invName, ek, unit) => {
            if (!data) return;
            const clone: AppData = JSON.parse(JSON.stringify(data));
            const i = clone.inventory.find(x => x.name === invName);
            if (i) { i.ekRaw = ek; i.unitRaw = unit; }
            recompute(clone);
            setShowFix(false);
          }}
          onGoMapping={() => { setShowFix(false); setTab("MAPPING"); }}
          onGoDish={(d) => { setShowFix(false); setSelectedDish(d); setTab("GERICHT"); }}
          onGoInventur={() => { setShowFix(false); setTab("INVENTUR"); }}
        />
      )}

      <div style={{height:18}} />
      <div className="small">
        Prinzip: nichts blockiert. Wenn etwas fehlt, siehst du „—“ und bekommst optional Quick-Fix.
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
      <div style={{height:10}} />
      <div className="row">
        <input
          type="file"
          accept=".xlsx"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            setErr(null);
            try { await onUpload(f); }
            catch (ex: any) { setErr(ex?.message ?? "Konnte Datei nicht lesen."); }
          }}
        />
        {dataLoaded && <span className="pill"><span className="dot ok" /> Datei geladen</span>}
        {err && <span className="pill"><span className="dot bad" /> {err}</span>}
      </div>
    </div>
  );
}

function DashboardScreen({ data, onOpenDish }: { data: AppData | null; onOpenDish: (dish: string) => void }) {
  const [q, setQ] = useState("");
  const rows = useMemo(() => {
    if (!data) return [];
    const qq = q.toLowerCase().trim();
    return data.dishes
      .filter(d => qq ? d.dish.toLowerCase().includes(qq) : true)
      .sort((a,b) => (b.db ?? -1e9) - (a.db ?? -1e9));
  }, [data, q]);

  if (!data) return <div className="card"><div className="h1">Dashboard</div><div className="small">Bitte zuerst Excel laden.</div></div>;

  return (
    <div className="card">
      <div className="row">
        <div>
          <div className="h1">2) Dashboard</div>
          <div className="small">Klick ein Gericht → Preis testen → DB sehen.</div>
        </div>
        <div style={{marginLeft:"auto"}} className="row">
          <input placeholder="Gericht suchen…" value={q} onChange={(e)=>setQ(e.target.value)} style={{minWidth:260}} />
        </div>
      </div>

      <div style={{height:10}} />
      <table className="table">
        <thead>
          <tr>
            <th>Gericht</th>
            <th>Preis (Test/aktiv)</th>
            <th>Wareneinsatz</th>
            <th>DB €</th>
            <th>DB %</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(d => (
            <tr key={d.dish}>
              <td style={{fontWeight:900}}>
                <button className="secondary" onClick={()=>onOpenDish(d.dish)}>{d.dish}</button>
              </td>
              <td>{money(d.priceTest ?? d.priceMenu ?? d.priceMaster ?? null)}</td>
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
  data, dishName, onBack, onChange
}: { data: AppData | null; dishName: string | null; onBack: () => void; onChange: (d: AppData) => void }) {
  const [sold, setSold] = useState(0);

  if (!data || !dishName) return <div className="card"><div className="h1">Gericht</div><div className="small">Bitte zuerst Excel laden und Gericht wählen.</div></div>;
  const dish = data.dishes.find(d => d.dish === dishName);
  if (!dish) return <div className="card"><div className="h1">Nicht gefunden</div><button className="secondary" onClick={onBack}>Zurück</button></div>;

  const lines = data.recipes.filter(r => r.dish === dishName);
  const price = dish.priceTest ?? dish.priceMenu ?? dish.priceMaster ?? null;
  const revToday = (price && sold>0) ? price*sold : null;
  const cogsToday = (dish.cogs && sold>0) ? dish.cogs*sold : null;
  const dbToday = (dish.db && sold>0) ? dish.db*sold : null;

  return (
    <div className="card">
      <div className="row">
        <div>
          <div className="h1">{dish.dish}</div>
          <div className="small">Speisekartenpreis/Testpreis ändern → DB live.</div>
        </div>
        <div style={{marginLeft:"auto"}} className="row">
          <button className="secondary" onClick={onBack}>← Dashboard</button>
        </div>
      </div>

      <div style={{height:12}} />

      <div className="card">
        <div className="small">Preise</div>
        <div className="row" style={{marginTop:8}}>
          <div>
            <div className="small">Master</div>
            <div style={{fontWeight:900}}>{money(dish.priceMaster)}</div>
          </div>
          <div>
            <div className="small">Speisekarte</div>
            <input
              value={dish.priceMenu ?? ""}
              placeholder="z.B. 8,90"
              onChange={(e) => {
                const v = e.target.value.replace(",", ".");
                const clone: AppData = JSON.parse(JSON.stringify(data));
                const d = clone.dishes.find(x => x.dish === dish.dish);
                if (d) d.priceMenu = v === "" ? null : Number(v);
                onChange(clone);
              }}
              style={{width:160}}
            />
          </div>
          <div>
            <div className="small">Testpreis</div>
            <input
              value={dish.priceTest ?? ""}
              placeholder="z.B. 9,50"
              onChange={(e) => {
                const v = e.target.value.replace(",", ".");
                const clone: AppData = JSON.parse(JSON.stringify(data));
                const d = clone.dishes.find(x => x.dish === dish.dish);
                if (d) d.priceTest = v === "" ? null : Number(v);
                onChange(clone);
              }}
              style={{width:160}}
            />
          </div>
          <span className="pill">Status: <b>{dish.status ?? "—"}</b></span>
        </div>
      </div>

      <div style={{height:12}} />

      <div className="card">
        <div className="small">Ergebnis pro Stück</div>
        <div className="row" style={{marginTop:8}}>
          <span className="badge">Wareneinsatz: {money(dish.cogs)}</span>
          <span className="badge">DB €: {money(dish.db)}</span>
          <span className="badge">DB %: {pct(dish.dbPct)}</span>
        </div>
      </div>

      <div style={{height:12}} />

      <div className="card">
        <div className="small">Heute verkauft (optional)</div>
        <div className="row" style={{marginTop:8}}>
          <input type="number" min={0} value={sold} onChange={(e)=>setSold(Number(e.target.value))} style={{width:140}} />
          <span className="badge">Umsatz: {money(revToday)}</span>
          <span className="badge">Wareneinsatz: {money(cogsToday)}</span>
          <span className="badge">DB gesamt: {money(dbToday)}</span>
        </div>
      </div>

      <div style={{height:12}} />

      <div className="card">
        <div className="h1">Rezept (editierbar)</div>
        <div className="small">Mengen/Einheit ändern → Wareneinsatz & DB ändern sich sofort.</div>
        <div style={{height:10}} />
        <table className="table">
          <thead>
            <tr>
              <th>Zutat</th><th>Menge</th><th>Einheit</th><th>Gemappt</th><th>Kosten</th><th>Status</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l, idx) => (
              <tr key={idx}>
                <td>{l.ingredientRecipe}</td>
                <td style={{width:120}}>
                  <input
                    value={l.qty ?? ""}
                    onChange={(e) => {
                      const v = e.target.value.replace(",", ".");
                      const clone: AppData = JSON.parse(JSON.stringify(data));
                      const r = clone.recipes.find(x => x.dish===l.dish && x.ingredientRecipe===l.ingredientRecipe);
                      if (r) r.qty = v === "" ? null : Number(v);
                      onChange(clone);
                    }}
                    style={{width:100}}
                  />
                </td>
                <td style={{width:120}}>
                  <select
                    value={l.unit ?? ""}
                    onChange={(e) => {
                      const v = e.target.value;
                      const clone: AppData = JSON.parse(JSON.stringify(data));
                      const r = clone.recipes.find(x => x.dish===l.dish && x.ingredientRecipe===l.ingredientRecipe);
                      if (r) r.unit = v || null;
                      onChange(clone);
                    }}
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
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function InventoryScreen({ data, onChange }: { data: AppData | null; onChange: (d: AppData)=>void }) {
  const [q, setQ] = useState("");
  if (!data) return <div className="card"><div className="h1">Inventur</div><div className="small">Bitte zuerst Excel laden.</div></div>;
  const rows = data.inventory.filter(i => q ? i.name.toLowerCase().includes(q.toLowerCase()) : true);

  return (
    <div className="card">
      <div className="row">
        <div><div className="h1">3) Inventur</div><div className="small">EK/Einheit ändern → alles rechnet neu.</div></div>
        <div style={{marginLeft:"auto"}} className="row">
          <input placeholder="Zutat suchen…" value={q} onChange={(e)=>setQ(e.target.value)} style={{minWidth:260}} />
        </div>
      </div>
      <div style={{height:10}} />
      <table className="table">
        <thead><tr><th>Zutat</th><th>EK</th><th>Einheit</th><th>Status</th></tr></thead>
        <tbody>
          {rows.map(i => (
            <tr key={i.name}>
              <td style={{fontWeight:900}}>{i.name}</td>
              <td style={{width:140}}>
                <input
                  value={i.ekRaw ?? ""}
                  onChange={(e)=>{
                    const v = e.target.value.replace(",", ".");
                    const clone: AppData = JSON.parse(JSON.stringify(data));
                    const x = clone.inventory.find(z => z.name===i.name);
                    if (x) x.ekRaw = v==="" ? null : Number(v);
                    onChange(clone);
                  }}
                  style={{width:120}}
                />
              </td>
              <td style={{width:140}}>
                <select
                  value={i.unitRaw ?? ""}
                  onChange={(e)=>{
                    const v = e.target.value;
                    const clone: AppData = JSON.parse(JSON.stringify(data));
                    const x = clone.inventory.find(z => z.name===i.name);
                    if (x) x.unitRaw = v || null;
                    onChange(clone);
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

function MappingScreen({ data, onChange }: { data: AppData | null; onChange: (d: AppData)=>void }) {
  const [q, setQ] = useState("");
  if (!data) return <div className="card"><div className="h1">Mapping</div><div className="small">Bitte zuerst Excel laden.</div></div>;
  const inventoryOptions = [...data.inventory.map(i=>i.name)].sort((a,b)=>a.localeCompare(b,"de"));
  const rows = data.mapping
    .filter(m => q ? m.recipeName.toLowerCase().includes(q.toLowerCase()) : true)
    .sort((a,b)=> (a.status==="PRÜFEN"?-1:1) - (b.status==="PRÜFEN"?-1:1));

  return (
    <div className="card">
      <div className="row">
        <div><div className="h1">4) Mapping</div><div className="small">Rezept-Zutat → Inventur-Zutat. Nur hier wird’s „gecleant“.</div></div>
        <div style={{marginLeft:"auto"}} className="row">
          <input placeholder="Rezept-Zutat suchen…" value={q} onChange={(e)=>setQ(e.target.value)} style={{minWidth:260}} />
        </div>
      </div>
      <div style={{height:10}} />
      <table className="table">
        <thead><tr><th>Rezept-Zutat</th><th>Vorschlag</th><th>Korrektur</th><th>Status</th></tr></thead>
        <tbody>
          {rows.map(m => (
            <tr key={m.recipeName}>
              <td style={{fontWeight:900}}>{m.recipeName}</td>
              <td>{m.suggestion ?? "—"}</td>
              <td style={{width:360}}>
                <select
                  value={m.correction ?? ""}
                  onChange={(e)=>{
                    const v = e.target.value;
                    const clone: AppData = JSON.parse(JSON.stringify(data));
                    const x = clone.mapping.find(z => z.recipeName===m.recipeName);
                    if (x) x.correction = v || null;
                    onChange(clone);
                  }}
                  style={{width:"100%"}}
                >
                  <option value="">— (Vorschlag verwenden)</option>
                  {inventoryOptions.map(n => <option key={n} value={n}>{n}</option>)}
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

function HintsScreen({ issues, onJumpDish }: { issues: DataIssue[]; onJumpDish: (dish: string)=>void }) {
  return (
    <div className="card">
      <div className="h1">Hinweise</div>
      <div className="small">Blockiert nichts. Zeigt nur, warum irgendwo „—“ steht.</div>
      <div style={{height:10}} />
      {issues.length===0 ? (
        <span className="pill"><span className="dot ok" /> Alles OK</span>
      ) : (
        <table className="table">
          <thead><tr><th>Typ</th><th>Was fehlt?</th><th>So fixen</th><th></th></tr></thead>
          <tbody>
            {issues.map((x, idx)=>(
              <tr key={idx}>
                <td>{x.type}</td>
                <td>{x.message}</td>
                <td className="small">{x.actionHint}</td>
                <td style={{width:120}}>
                  {x.dish ? <button className="secondary" onClick={()=>onJumpDish(x.dish!)}>Gericht</button> : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

/** ===== Minimaler Loop (nur wenn du klickst) ===== */
function QuickFixModal(props: {
  issue: DataIssue;
  onClose: ()=>void;
  onFixPrice: (dish: string, price: number)=>void;
  onFixEK: (invName: string, ek: number, unit: string)=>void;
  onGoMapping: ()=>void;
  onGoDish: (dish: string)=>void;
  onGoInventur: ()=>void;
}) {
  const { issue } = props;
  const [price, setPrice] = useState("");
  const [ek, setEk] = useState("");
  const [unit, setUnit] = useState("kg");

  const title =
    issue.type==="PREIS" ? "Preis fehlt" :
    issue.type==="EK" ? "Einkaufspreis fehlt" :
    issue.type==="MAPPING" ? "Zuordnung fehlt" :
    issue.type==="MENGE" ? "Menge fehlt" : "Hinweis";

  return (
    <div className="modalOverlay" onClick={props.onClose}>
      <div className="card modal" onClick={(e)=>e.stopPropagation()}>
        <div className="row">
          <div>
            <div className="h1">Quick-Fix: {title}</div>
            <div className="small">{issue.message}</div>
          </div>
          <button className="secondary" style={{marginLeft:"auto"}} onClick={props.onClose}>Schließen</button>
        </div>

        <div style={{height:12}} />

        {issue.type==="PREIS" && issue.dish && (
          <div className="card">
            <div className="small">Testpreis setzen (sofortige Simulation)</div>
            <div className="row" style={{marginTop:8}}>
              <input value={price} onChange={(e)=>setPrice(e.target.value)} placeholder="z.B. 8,90" style={{width:180}} />
              <button className="primary" onClick={()=>{
                const n = toNumber(price);
                if (n!=null) props.onFixPrice(issue.dish!, n);
              }}>Speichern</button>
              <button className="secondary" onClick={()=>props.onGoDish(issue.dish!)}>Zum Gericht</button>
            </div>
          </div>
        )}

        {issue.type==="EK" && issue.ingredient && (
          <div className="card">
            <div className="small">Einkaufspreis + Einheit</div>
            <div className="row" style={{marginTop:8}}>
              <input value={ek} onChange={(e)=>setEk(e.target.value)} placeholder="z.B. 6,20" style={{width:180}} />
              <select value={unit} onChange={(e)=>setUnit(e.target.value)}>
                <option value="kg">kg</option><option value="g">g</option>
                <option value="l">l</option><option value="ml">ml</option>
                <option value="stk">stk</option>
              </select>
              <button className="primary" onClick={()=>{
                const n = toNumber(ek);
                if (n!=null) props.onFixEK(issue.ingredient!, n, unit);
              }}>Speichern</button>
              <button className="secondary" onClick={props.onGoInventur}>Zur Inventur</button>
            </div>
          </div>
        )}

        {issue.type==="MAPPING" && (
          <div className="card">
            <div className="small">Mapping fixen</div>
            <div className="row" style={{marginTop:8}}>
              <button className="secondary" onClick={props.onGoMapping}>Zum Mapping</button>
              {issue.dish && <button className="secondary" onClick={()=>props.onGoDish(issue.dish!)}>Zum Gericht</button>}
            </div>
          </div>
        )}

        {issue.type==="MENGE" && issue.dish && (
          <div className="card">
            <div className="small">Menge fehlt</div>
            <div className="row" style={{marginTop:8}}>
              <button className="secondary" onClick={()=>props.onGoDish(issue.dish!)}>Zum Gericht</button>
            </div>
          </div>
        )}

        <div style={{height:8}} />
        <div className="small">MVP-Regel: Quick-Fix ist optional. Keine Pflicht-Loops.</div>
      </div>
    </div>
  );
}
