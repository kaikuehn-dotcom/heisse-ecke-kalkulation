import React, { useEffect, useMemo, useState } from "react";
import type { AppData, DishRow, InventoryItem, RecipeLine } from "./core";
import { parseWorkbook, recalcAll, exportWorkbook, money, pct } from "./core";

type Tab = "UPLOAD" | "GERICHTE" | "MAPPING" | "REZEPTE" | "INVENTUR";
type Theme = "LIGHT" | "DARK";

const LS_KEY = "heisseecke_appdata_v1";
const LS_THEME = "heisseecke_theme_v1";

export default function App() {
  const [tab, setTab] = useState<Tab>("UPLOAD");
  const [theme, setTheme] = useState<Theme>("LIGHT");

  const [rawParsed, setRawParsed] = useState<AppData | null>(null);
  const [data, setData] = useState<AppData | null>(null);
  const [issues, setIssues] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [mappingSearch, setMappingSearch] = useState("");
  const [dishSearch, setDishSearch] = useState("");

  // ======== Simple persistence (damit Eingaben nicht weg sind) ========
  useEffect(() => {
    const t = (localStorage.getItem(LS_THEME) as Theme) || "LIGHT";
    setTheme(t === "DARK" ? "DARK" : "LIGHT");

    const saved = localStorage.getItem(LS_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as AppData;
        // Recalc to be safe
        const { data: recalced, issues: recalcedIssues } = recalcAll(parsed);
        setData(recalced);
        setIssues(recalcedIssues);
        setTab("GERICHTE");
      } catch {
        // ignore
      }
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(LS_THEME, theme);
  }, [theme]);

  function safeSetAll(next: AppData, alsoPersist = true) {
    const { data: recalced, issues: recalcedIssues } = recalcAll(next);
    setData(recalced);
    setIssues(recalcedIssues);
    if (alsoPersist) localStorage.setItem(LS_KEY, JSON.stringify(recalced));
  }

  // ======== Upload ========
  async function onUpload(file: File) {
    try {
      setError(null);
      const buf = await file.arrayBuffer();
      const parsed = parseWorkbook(buf);

      setRawParsed(parsed);
      safeSetAll(parsed);

      setTab("GERICHTE");
    } catch (e: any) {
      const msg =
        e?.message ||
        "Konnte die Datei nicht einlesen. Bitte sicherstellen, dass es eine echte Excel-Datei ist.";
      setError(msg);
      setRawParsed(null);
      setData(null);
      setIssues([]);
      setTab("UPLOAD");
    }
  }

  function downloadExport() {
    if (!data) return;
    const blob = exportWorkbook(data);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "HeisseEcke_Export.xlsx";
    a.click();
    URL.revokeObjectURL(url);
  }

  function resetToOriginal() {
    if (!rawParsed) return;
    safeSetAll(rawParsed);
    setTab("GERICHTE");
  }

  function clearAll() {
    localStorage.removeItem(LS_KEY);
    setRawParsed(null);
    setData(null);
    setIssues([]);
    setError(null);
    setTab("UPLOAD");
  }

  // ======== Derived lists ========
  const invNames = useMemo(() => {
    if (!data) return [];
    return data.inventory.map((x) => x.name).filter(Boolean);
  }, [data]);

  const dishRows = useMemo(() => {
    if (!data) return [];
    const s = dishSearch.trim().toLowerCase();
    if (!s) return data.dishes;
    return data.dishes.filter((d) => d.dish.toLowerCase().includes(s));
  }, [data, dishSearch]);

  const dishesList = useMemo(() => {
    if (!data) return [];
    return data.dishes.map((d) => d.dish).filter(Boolean).sort((a, b) => a.localeCompare(b));
  }, [data]);

  // ======== Actions: prices (MUSS) ========
  function updateDishPrice(dishName: string, field: "priceMaster" | "priceMenu" | "priceTest", value: number | null) {
    if (!data) return;
    const next: AppData = JSON.parse(JSON.stringify(data));
    const d = next.dishes.find((x) => x.dish === dishName);
    if (!d) return;
    (d as any)[field] = value;
    safeSetAll(next);
  }

  // ======== Actions: mapping correction ========
  function applyMapping(recipeName: string, inventoryName: string | null) {
    if (!data) return;
    const next: AppData = JSON.parse(JSON.stringify(data));

    const m = next.mapping.find((x) => x.recipeName === recipeName);
    if (m) {
      m.correction = inventoryName;
      m.status = inventoryName ? "OK" : "PRÜFEN";
    }

    // push into recipe lines (so recalcAll uses it)
    for (const r of next.recipes) {
      if (r.ingredientRecipe === recipeName) {
        r.inventoryItemSelected = inventoryName;
      }
    }

    safeSetAll(next);
  }

  // ======== Unit mismatch: Fix-Vorschlag ========
  // Wenn Inventur-Ziel-Einheit kg -> Rezept sollte g sein; L -> ml; stk -> stk
  function suggestRecipeUnitFromInventory(invTarget: "kg" | "L" | "stk" | null | undefined): "g" | "ml" | "stk" | null {
    if (!invTarget) return null;
    if (invTarget === "kg") return "g";
    if (invTarget === "L") return "ml";
    return "stk";
  }

  function fixRecipeUnitForIngredient(recipeName: string, newUnit: "g" | "ml" | "stk") {
    if (!data) return;
    const next: AppData = JSON.parse(JSON.stringify(data));
    for (const r of next.recipes) {
      if (r.ingredientRecipe === recipeName) {
        r.unit = newUnit;
      }
    }
    safeSetAll(next);
  }

  // ======== Create: inventory product / dish / recipe line ========
  const [newInv, setNewInv] = useState({
    group: "",
    name: "",
    ekRaw: "",
    unitRaw: "",
    targetUnit: "" as "" | "kg" | "L" | "stk",
    packTarget: "",
  });

  function addInventoryItem() {
    if (!data) return;
    const name = newInv.name.trim();
    if (!name) return;

    const next: AppData = JSON.parse(JSON.stringify(data));

    const it: InventoryItem = {
      name,
      group: newInv.group.trim() || null,
      ekRaw: toNum(newInv.ekRaw),
      unitRaw: newInv.unitRaw.trim() || null,
      packRaw: null,
      targetUnit: newInv.targetUnit || null,
      packTarget: toNum(newInv.packTarget),
      pricePerBase: null,
      status: null,
    };

    next.inventory.push(it);
    // keep inventory dropdown list richer by also adding mapping suggestions later
    safeSetAll(next);

    setNewInv({ group: "", name: "", ekRaw: "", unitRaw: "", targetUnit: "", packTarget: "" });
    setTab("INVENTUR");
  }

  const [newDish, setNewDish] = useState({
    name: "",
    priceMaster: "",
    priceMenu: "",
    priceTest: "",
  });

  function addDish() {
    if (!data) return;
    const name = newDish.name.trim();
    if (!name) return;

    const next: AppData = JSON.parse(JSON.stringify(data));
    if (next.dishes.some((d) => d.dish.toLowerCase() === name.toLowerCase())) {
      setError("Gericht existiert bereits.");
      return;
    }

    const d: DishRow = {
      dish: name,
      priceMaster: toNum(newDish.priceMaster),
      priceMenu: toNum(newDish.priceMenu),
      priceTest: toNum(newDish.priceTest),
      cogs: null,
      db: null,
      dbPct: null,
      status: null,
    };

    next.dishes.push(d);
    safeSetAll(next);
    setNewDish({ name: "", priceMaster: "", priceMenu: "", priceTest: "" });
    setTab("GERICHTE");
  }

  const [newRecipe, setNewRecipe] = useState({
    dish: "",
    ingredientRecipe: "",
    qty: "",
    unit: "" as "" | "g" | "ml" | "stk",
    inventoryPick: "",
  });

  function addRecipeLine() {
    if (!data) return;
    const dish = newRecipe.dish.trim();
    const ingredient = newRecipe.ingredientRecipe.trim();
    if (!dish || !ingredient) return;

    const next: AppData = JSON.parse(JSON.stringify(data));

    const line: RecipeLine = {
      dish,
      ingredientRecipe: ingredient,
      qty: toNum(newRecipe.qty),
      unit: (newRecipe.unit || null) as any,
      inventoryItemSelected: newRecipe.inventoryPick.trim() || null,
      cost: null,
      status: null,
    };

    next.recipes.push(line);

    // Ensure dish exists
    if (!next.dishes.some((d) => d.dish === dish)) {
      next.dishes.push({
        dish,
        priceMaster: null,
        priceMenu: null,
        priceTest: null,
        cogs: null,
        db: null,
        dbPct: null,
        status: "PREIS FEHLT",
      });
    }

    // Ensure mapping entry exists
    if (!next.mapping.some((m) => m.recipeName === ingredient)) {
      next.mapping.push({
        recipeName: ingredient,
        suggestion: null,
        correction: newRecipe.inventoryPick.trim() || null,
        status: (newRecipe.inventoryPick.trim() ? "OK" : "PRÜFEN") as any,
      });
    }

    safeSetAll(next);

    setNewRecipe({ dish: dish, ingredientRecipe: "", qty: "", unit: "", inventoryPick: "" });
    setTab("REZEPTE");
  }

  // ======== KPIs ========
  const kpi = useMemo(() => {
    if (!data) {
      return {
        invCount: 0,
        recipeCount: 0,
        dishCount: 0,
        invIssues: 0,
        recipeIssues: 0,
        dishIssues: 0,
      };
    }
    const invIssues = data.inventory.filter((i) => i.status && i.status.trim().length > 0).length;
    const recipeIssues = data.recipes.filter((r) => r.status && r.status.trim().length > 0).length;
    const dishIssues = data.dishes.filter((d) => d.status && d.status.trim().length > 0).length;
    return {
      invCount: data.inventory.length,
      recipeCount: data.recipes.length,
      dishCount: data.dishes.length,
      invIssues,
      recipeIssues,
      dishIssues,
    };
  }, [data]);

  // ======== Styles / Theme ========
  const palette = theme === "DARK"
    ? {
        bg: "#0b1220",
        card: "#111a2e",
        border: "#24324f",
        text: "#f2f4f7",
        sub: "#b9c0d4",
        accent: "#7aa7ff",
        danger: "#ff6b6b",
        ok: "#38d9a9",
        warn: "#ffd43b",
        tableHead: "#172444",
        inputBg: "#0f1930",
      }
    : {
        bg: "#ffffff",
        card: "#ffffff",
        border: "#d0d5dd",
        text: "#101828",
        sub: "#475467",
        accent: "#1f4e79",
        danger: "#b42318",
        ok: "#12b76a",
        warn: "#f79009",
        tableHead: "#f2f4f7",
        inputBg: "#ffffff",
      };

  // ======== UI components ========
  const Badge = ({ text, tone }: { text: string; tone: "ok" | "warn" | "bad" }) => {
    const bg =
      theme === "DARK"
        ? tone === "ok"
          ? "#0f2a21"
          : tone === "warn"
          ? "#2a230f"
          : "#2a0f14"
        : tone === "ok"
        ? "#e7f7ea"
        : tone === "warn"
        ? "#fff4e5"
        : "#fde7ea";

    const bd =
      theme === "DARK"
        ? tone === "ok"
          ? "#38d9a9"
          : tone === "warn"
          ? "#ffd43b"
          : "#ff6b6b"
        : tone === "ok"
        ? "#7fd18a"
        : tone === "warn"
        ? "#f0b35a"
        : "#e57a85";

    return (
      <span
        style={{
          display: "inline-block",
          padding: "3px 10px",
          borderRadius: 999,
          background: bg,
          border: `1px solid ${bd}`,
          fontSize: 12,
          whiteSpace: "nowrap",
          fontWeight: 900,
          color: palette.text,
        }}
      >
        {text}
      </span>
    );
  };

  const Button = ({
    children,
    onClick,
    disabled,
    tone = "primary",
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    disabled?: boolean;
    tone?: "primary" | "ghost" | "danger";
  }) => {
    const bg =
      tone === "primary"
        ? palette.accent
        : tone === "danger"
        ? palette.danger
        : "transparent";
    const color = tone === "ghost" ? palette.accent : "#fff";
    const border = tone === "ghost" ? `1px solid ${palette.accent}` : "1px solid transparent";
    return (
      <button
        onClick={onClick}
        disabled={disabled}
        style={{
          padding: "10px 12px",
          borderRadius: 12,
          border,
          background: disabled ? (theme === "DARK" ? "#25314a" : "#d0d5dd") : bg,
          color: disabled ? (theme === "DARK" ? "#9aa4bb" : "#667085") : color,
          cursor: disabled ? "not-allowed" : "pointer",
          fontWeight: 950,
        }}
      >
        {children}
      </button>
    );
  };

  const TabBtn = ({ id, label }: { id: Tab; label: string }) => (
    <button
      onClick={() => setTab(id)}
      style={{
        padding: "10px 12px",
        borderRadius: 12,
        border: tab === id ? `2px solid ${palette.accent}` : `1px solid ${palette.border}`,
        background: tab === id ? (theme === "DARK" ? "#16264a" : "#eef4ff") : palette.card,
        cursor: "pointer",
        fontWeight: 950,
        color: palette.text,
      }}
    >
      {label}
    </button>
  );

  const Input = (props: React.InputHTMLAttributes<HTMLInputElement>) => (
    <input
      {...props}
      style={{
        padding: "10px 12px",
        borderRadius: 12,
        border: `1px solid ${palette.border}`,
        background: palette.inputBg,
        color: palette.text,
        fontWeight: 900,
        outline: "none",
        ...props.style,
      }}
    />
  );

  const Select = (props: React.SelectHTMLAttributes<HTMLSelectElement>) => (
    <select
      {...props}
      style={{
        padding: "10px 12px",
        borderRadius: 12,
        border: `1px solid ${palette.border}`,
        background: palette.inputBg,
        color: palette.text,
        fontWeight: 900,
        outline: "none",
        ...props.style,
      }}
    />
  );

  // ======== Render ========
  return (
    <div
      style={{
        fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial",
        background: palette.bg,
        minHeight: "100vh",
        color: palette.text,
      }}
    >
      <div style={{ padding: 18, maxWidth: 1280, margin: "0 auto" }}>
        <header
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <div>
            <div style={{ fontSize: 24, fontWeight: 1000 }}>Heiße Ecke – Deckungsbeitrag / Wareneinsatz</div>
            <div style={{ color: palette.sub, fontWeight: 800 }}>
              Fokus: DB & WE pro Gericht + freie Preiseingabe + schnelles Fixen von Mappings/Units
            </div>
          </div>

          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <TabBtn id="UPLOAD" label="Upload" />
            <TabBtn id="GERICHTE" label="Gerichte & DB" />
            <TabBtn id="MAPPING" label="Zuordnung" />
            <TabBtn id="REZEPTE" label="Rezepte" />
            <TabBtn id="INVENTUR" label="Inventur" />

            <Button tone="ghost" onClick={() => setTheme(theme === "DARK" ? "LIGHT" : "DARK")}>
              Theme: {theme === "DARK" ? "Dunkel" : "Hell"}
            </Button>

            <Button tone="ghost" onClick={downloadExport} disabled={!data}>
              Export Excel
            </Button>
            <Button tone="danger" onClick={resetToOriginal} disabled={!rawParsed}>
              Reset
            </Button>
            <Button tone="danger" onClick={clearAll}>
              Alles löschen
            </Button>
          </div>
        </header>

        {/* KPIs */}
        <section style={{ marginTop: 14, display: "grid", gridTemplateColumns: "repeat(6, minmax(0, 1fr))", gap: 10 }}>
          <Card palette={palette}>
            <div style={{ color: palette.sub, fontWeight: 950 }}>Inventur</div>
            <div style={{ fontSize: 20, fontWeight: 1000 }}>{kpi.invCount}</div>
            <div style={{ marginTop: 8 }}>
              {kpi.invIssues === 0 ? <Badge text="OK" tone="ok" /> : <Badge text={`${kpi.invIssues} Probleme`} tone="bad" />}
            </div>
          </Card>

          <Card palette={palette}>
            <div style={{ color: palette.sub, fontWeight: 950 }}>Rezeptzeilen</div>
            <div style={{ fontSize: 20, fontWeight: 1000 }}>{kpi.recipeCount}</div>
            <div style={{ marginTop: 8 }}>
              {kpi.recipeIssues === 0 ? <Badge text="OK" tone="ok" /> : <Badge text={`${kpi.recipeIssues} Probleme`} tone="bad" />}
            </div>
          </Card>

          <Card palette={palette}>
            <div style={{ color: palette.sub, fontWeight: 950 }}>Gerichte</div>
            <div style={{ fontSize: 20, fontWeight: 1000 }}>{kpi.dishCount}</div>
            <div style={{ marginTop: 8 }}>
              {kpi.dishIssues === 0 ? <Badge text="OK" tone="ok" /> : <Badge text={`${kpi.dishIssues} Probleme`} tone="bad" />}
            </div>
          </Card>

          <Card palette={palette} span={3}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <div>
                <div style={{ color: palette.sub, fontWeight: 1000 }}>Fehler</div>
                <div style={{ marginTop: 6, fontWeight: 950 }}>
                  {error ? <span style={{ color: palette.danger }}>{error}</span> : <span style={{ color: palette.ok }}>—</span>}
                </div>
              </div>

              <div style={{ maxWidth: 620 }}>
                <div style={{ color: palette.sub, fontWeight: 1000 }}>Was du jetzt wolltest (ist drin)</div>
                <div style={{ marginTop: 6, fontWeight: 850, color: palette.text }}>
                  ✅ Preisfelder pro Gericht (Master/Menü/Frei) + DB/WE sofort. <br />
                  ✅ Theme hell/dunkel lesbar. <br />
                  ✅ In-App: Inventurartikel, Gerichte, Rezeptzeilen hinzufügen. <br />
                  ✅ Unit-Mismatch: Fix-Vorschlag direkt im Mapping.
                </div>
              </div>
            </div>
          </Card>
        </section>

        {/* Issues list (compact) */}
        {issues.length > 0 && (
          <section style={{ marginTop: 12, padding: 12, border: `1px solid ${theme === "DARK" ? "#4a2230" : "#fecaca"}`, borderRadius: 14, background: theme === "DARK" ? "#1b0f16" : "#fff5f5" }}>
            <div style={{ fontWeight: 1000, color: theme === "DARK" ? "#ffb4c2" : "#b42318" }}>Probleme (Auszug):</div>
            <ul style={{ marginTop: 8, marginBottom: 0, paddingLeft: 18 }}>
              {issues.slice(0, 10).map((x, idx) => (
                <li key={idx} style={{ color: theme === "DARK" ? "#ffd1da" : "#7a271a", fontWeight: 850 }}>{x}</li>
              ))}
            </ul>
          </section>
        )}

        {/* TABS */}
        <main style={{ marginTop: 16 }}>
          {/* UPLOAD */}
          {tab === "UPLOAD" && (
            <Section palette={palette} title="Upload">
              <div style={{ color: palette.sub, fontWeight: 850 }}>
                Dateiname ist egal. Wichtig ist nur: echte Excel-Datei.
              </div>

              <div style={{ marginTop: 14, display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                <input
                  type="file"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) onUpload(f);
                  }}
                />
                <Button tone="ghost" onClick={() => setTab("GERICHTE")} disabled={!data}>
                  Zu Gerichte & DB
                </Button>
              </div>
            </Section>
          )}

          {/* GERICHTE & DB */}
          {tab === "GERICHTE" && (
            <Section palette={palette} title="Gerichte & DB (Preis editierbar)">
              {!data ? (
                <div style={{ marginTop: 8, color: palette.sub, fontWeight: 900 }}>Bitte erst eine Excel hochladen.</div>
              ) : (
                <>
                  <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
                    <Input
                      placeholder="Suche Gericht…"
                      value={dishSearch}
                      onChange={(e) => setDishSearch(e.target.value)}
                      style={{ minWidth: 280 }}
                    />
                    <Button tone="ghost" onClick={() => setTab("MAPPING")}>
                      Zuordnung fixen
                    </Button>
                  </div>

                  {/* Add dish */}
                  <div style={{ marginTop: 14, padding: 12, border: `1px dashed ${palette.border}`, borderRadius: 14 }}>
                    <div style={{ fontWeight: 1000, marginBottom: 10 }}>➕ Neues Gericht anlegen</div>
                    <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr auto", gap: 10 }}>
                      <Input placeholder="Gerichtname" value={newDish.name} onChange={(e) => setNewDish({ ...newDish, name: e.target.value })} />
                      <Input placeholder="Preis Master" value={newDish.priceMaster} onChange={(e) => setNewDish({ ...newDish, priceMaster: e.target.value })} />
                      <Input placeholder="Preis Menü" value={newDish.priceMenu} onChange={(e) => setNewDish({ ...newDish, priceMenu: e.target.value })} />
                      <Input placeholder="Preis Frei (Test)" value={newDish.priceTest} onChange={(e) => setNewDish({ ...newDish, priceTest: e.target.value })} />
                      <Button onClick={addDish}>Anlegen</Button>
                    </div>
                    <div style={{ marginTop: 8, color: palette.sub, fontWeight: 850 }}>
                      Tipp: „Preis Frei (Test)“ ist dein Spielpreis. Der wird für DB/WE genutzt, wenn gesetzt.
                    </div>
                  </div>

                  {/* Table */}
                  <div style={{ marginTop: 12, overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
                      <thead>
                        <tr style={{ background: palette.tableHead }}>
                          <th style={th(palette)}>Gericht</th>
                          <th style={th(palette)}>WE / Einheit</th>

                          <th style={th(palette)}>Preis Master</th>
                          <th style={th(palette)}>DB (Master)</th>

                          <th style={th(palette)}>Preis Menü</th>
                          <th style={th(palette)}>DB (Menü)</th>

                          <th style={th(palette)}>Preis Frei (Test)</th>
                          <th style={th(palette)}>DB (Frei)</th>

                          <th style={th(palette)}>WE % (Frei)</th>
                          <th style={th(palette)}>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {dishRows.map((d, idx) => {
                          const cogs = d.cogs ?? null;

                          const dbMaster = cogs !== null && d.priceMaster !== null ? d.priceMaster - cogs : null;
                          const dbMenu = cogs !== null && d.priceMenu !== null ? d.priceMenu - cogs : null;
                          const dbFree = cogs !== null && d.priceTest !== null ? d.priceTest - cogs : null;

                          const wePctFree =
                            cogs !== null && d.priceTest !== null && d.priceTest > 0 ? cogs / d.priceTest : null;

                          return (
                            <tr key={idx} style={{ borderTop: `1px solid ${palette.border}` }}>
                              <td style={tdStrong(palette)}>{d.dish}</td>

                              <td style={td(palette)}>{cogs === null ? "—" : money(cogs)}</td>

                              <td style={td(palette)}>
                                <Input
                                  value={d.priceMaster ?? ""}
                                  onChange={(e) => updateDishPrice(d.dish, "priceMaster", toNum(e.target.value))}
                                  style={{ width: 120 }}
                                />
                              </td>
                              <td style={td(palette)}>{dbMaster === null ? "—" : money(dbMaster)}</td>

                              <td style={td(palette)}>
                                <Input
                                  value={d.priceMenu ?? ""}
                                  onChange={(e) => updateDishPrice(d.dish, "priceMenu", toNum(e.target.value))}
                                  style={{ width: 120 }}
                                />
                              </td>
                              <td style={td(palette)}>{dbMenu === null ? "—" : money(dbMenu)}</td>

                              <td style={td(palette)}>
                                <Input
                                  value={d.priceTest ?? ""}
                                  onChange={(e) => updateDishPrice(d.dish, "priceTest", toNum(e.target.value))}
                                  style={{ width: 140 }}
                                />
                              </td>
                              <td style={td(palette)}>{dbFree === null ? "—" : money(dbFree)}</td>

                              <td style={td(palette)}>{wePctFree === null ? "—" : pct(wePctFree)}</td>

                              <td style={td(palette)}>
                                {d.status ? <Badge text={d.status} tone="bad" /> : <Badge text="OK" tone="ok" />}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  <div style={{ marginTop: 12, color: palette.sub, fontWeight: 850 }}>
                    **Wichtig:** „Preis Frei (Test)“ ist genau dein Eingabefeld zum „Spielen“. DB/WE reagieren sofort.
                  </div>
                </>
              )}
            </Section>
          )}

          {/* MAPPING */}
          {tab === "MAPPING" && (
            <Section palette={palette} title="Zuordnung (Rezept-Zutat → Inventur-Artikel) + Unit-Fix">
              {!data ? (
                <div style={{ marginTop: 8, color: palette.sub, fontWeight: 900 }}>Bitte erst eine Excel hochladen.</div>
              ) : (
                <>
                  <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
                    <Input
                      placeholder="Suche Zutat…"
                      value={mappingSearch}
                      onChange={(e) => setMappingSearch(e.target.value)}
                      style={{ minWidth: 280 }}
                    />
                    <Button tone="ghost" onClick={() => setTab("GERICHTE")}>
                      Zurück zu Gerichten
                    </Button>
                    <Button tone="ghost" onClick={() => setTab("REZEPTE")}>
                      Zu Rezepten
                    </Button>
                  </div>

                  <div style={{ marginTop: 12, overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
                      <thead>
                        <tr style={{ background: palette.tableHead }}>
                          <th style={th(palette)}>Rezept-Zutat</th>
                          <th style={th(palette)}>Vorschlag</th>
                          <th style={th(palette)}>Deine Auswahl</th>
                          <th style={th(palette)}>Unit-Check</th>
                          <th style={th(palette)}>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.mapping
                          .filter((m) => {
                            const s = mappingSearch.trim().toLowerCase();
                            if (!s) return true;
                            return m.recipeName.toLowerCase().includes(s);
                          })
                          .slice(0, 500)
                          .map((m, idx) => {
                            const selected = m.correction ?? "";

                            // derive unit mismatch info from first recipe line found
                            const sampleLine = data.recipes.find((r) => r.ingredientRecipe === m.recipeName);
                            const recipeUnit = sampleLine?.unit ?? null;

                            const invName = selected || m.suggestion || null;
                            const inv = invName ? data.inventory.find((i) => i.name === invName) : null;
                            const suggestedUnit = inv ? suggestRecipeUnitFromInventory(inv.targetUnit as any) : null;

                            const mismatch =
                              recipeUnit && suggestedUnit && recipeUnit !== suggestedUnit
                                ? `Mismatch: Rezept=${recipeUnit} → besser ${suggestedUnit}`
                                : recipeUnit && suggestedUnit
                                ? `OK: ${recipeUnit}`
                                : "—";

                            return (
                              <tr key={idx} style={{ borderTop: `1px solid ${palette.border}` }}>
                                <td style={tdStrong(palette)}>{m.recipeName}</td>
                                <td style={td(palette)}>{m.suggestion ?? "—"}</td>

                                <td style={td(palette)}>
                                  <Select
                                    value={selected}
                                    onChange={(e) => {
                                      const v = e.target.value;
                                      applyMapping(m.recipeName, v ? v : null);
                                    }}
                                    style={{ width: "100%" }}
                                  >
                                    <option value="">— auswählen —</option>
                                    {invNames.map((n) => (
                                      <option key={n} value={n}>
                                        {n}
                                      </option>
                                    ))}
                                  </Select>
                                </td>

                                <td style={td(palette)}>
                                  <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                                    <span style={{ fontWeight: 900, color: mismatch.includes("Mismatch") ? palette.warn : palette.sub }}>
                                      {mismatch}
                                    </span>
                                    {recipeUnit && suggestedUnit && recipeUnit !== suggestedUnit && (
                                      <Button
                                        tone="ghost"
                                        onClick={() => fixRecipeUnitForIngredient(m.recipeName, suggestedUnit)}
                                      >
                                        Fix: setze auf {suggestedUnit}
                                      </Button>
                                    )}
                                  </div>
                                </td>

                                <td style={td(palette)}>
                                  {m.status === "OK" ? <Badge text="OK" tone="ok" /> : <Badge text="PRÜFEN" tone="warn" />}
                                </td>
                              </tr>
                            );
                          })}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </Section>
          )}

          {/* REZEPTE */}
          {tab === "REZEPTE" && (
            <Section palette={palette} title="Rezepte (anzeigen + Rezeptzeile hinzufügen)">
              {!data ? (
                <div style={{ marginTop: 8, color: palette.sub, fontWeight: 900 }}>Bitte erst eine Excel hochladen.</div>
              ) : (
                <>
                  <div style={{ marginBottom: 12, padding: 12, border: `1px dashed ${palette.border}`, borderRadius: 14 }}>
                    <div style={{ fontWeight: 1000, marginBottom: 10 }}>➕ Rezeptzeile hinzufügen</div>
                    <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1.6fr 0.6fr 0.7fr 1.6fr auto", gap: 10 }}>
                      <Select value={newRecipe.dish} onChange={(e) => setNewRecipe({ ...newRecipe, dish: e.target.value })}>
                        <option value="">— Gericht wählen —</option>
                        {dishesList.map((d) => (
                          <option key={d} value={d}>
                            {d}
                          </option>
                        ))}
                      </Select>

                      <Input
                        placeholder="Zutat (Rezept)"
                        value={newRecipe.ingredientRecipe}
                        onChange={(e) => setNewRecipe({ ...newRecipe, ingredientRecipe: e.target.value })}
                      />

                      <Input placeholder="Menge" value={newRecipe.qty} onChange={(e) => setNewRecipe({ ...newRecipe, qty: e.target.value })} />

                      <Select value={newRecipe.unit} onChange={(e) => setNewRecipe({ ...newRecipe, unit: e.target.value as any })}>
                        <option value="">Unit</option>
                        <option value="g">g</option>
                        <option value="ml">ml</option>
                        <option value="stk">stk</option>
                      </Select>

                      <Select value
