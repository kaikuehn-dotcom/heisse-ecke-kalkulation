import React, { useEffect, useMemo, useState } from "react";
import type { AppData, DishRow, InventoryItem, RecipeLine } from "./core";
import { parseWorkbook, recalcAll, exportWorkbook, money, pct } from "./core";

type Tab = "UPLOAD" | "GERICHTE" | "MAPPING" | "REZEPTE" | "INVENTUR" | "TAG";
type Theme = "LIGHT" | "DARK";

const LS_KEY = "heisseecke_appdata_v2";
const LS_THEME = "heisseecke_theme_v1";
const LS_DAY = "heisseecke_day_v1";
const LS_SAVED_AT = "heisseecke_saved_at_v1";

type DayState = {
  // per dish
  qtyByDish: Record<string, number>;
  priceByDish: Record<string, number | null>; // VK heute (override)
  // global
  aufschlagPct: number; // +% auf Umsatz (default 0)
  franchiseFeePct: number; // -% vom Umsatz (default 0)
};

function toNum(v: any): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const s = String(v).trim();
  if (!s) return null;
  const t = s.replace(/\s/g, "").replace(",", ".");
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

function clampPct(v: number): number {
  if (!Number.isFinite(v)) return 0;
  if (v < 0) return 0;
  if (v > 100) return 100;
  return v;
}

function nowStamp() {
  const d = new Date();
  const pad = (x: number) => String(x).padStart(2, "0");
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export default function App() {
  const [tab, setTab] = useState<Tab>("UPLOAD");
  const [theme, setTheme] = useState<Theme>("LIGHT");

  const [rawParsed, setRawParsed] = useState<AppData | null>(null);
  const [data, setData] = useState<AppData | null>(null);
  const [issues, setIssues] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [mappingSearch, setMappingSearch] = useState("");
  const [dishSearch, setDishSearch] = useState("");

  // Tagesabschluss state
  const [day, setDay] = useState<DayState>({
    qtyByDish: {},
    priceByDish: {},
    aufschlagPct: 0,
    franchiseFeePct: 0,
  });

  // sichtbares Autosave-Stamp
  const [savedAt, setSavedAt] = useState<string | null>(null);

  // ===== Persist =====
  useEffect(() => {
    const t = (localStorage.getItem(LS_THEME) as Theme) || "LIGHT";
    setTheme(t === "DARK" ? "DARK" : "LIGHT");

    const saved = localStorage.getItem(LS_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as AppData;
        const { data: recalced, issues: recalcedIssues } = recalcAll(parsed);
        setData(recalced);
        setIssues(recalcedIssues);
        setTab("GERICHTE");
      } catch {
        // ignore
      }
    }

    const daySaved = localStorage.getItem(LS_DAY);
    if (daySaved) {
      try {
        const d = JSON.parse(daySaved) as DayState;
        setDay({
          qtyByDish: d.qtyByDish || {},
          priceByDish: d.priceByDish || {},
          aufschlagPct: Number.isFinite(d.aufschlagPct) ? d.aufschlagPct : 0,
          franchiseFeePct: Number.isFinite(d.franchiseFeePct) ? d.franchiseFeePct : 0,
        });
      } catch {
        // ignore
      }
    }

    const sa = localStorage.getItem(LS_SAVED_AT);
    if (sa) setSavedAt(sa);
  }, []);

  useEffect(() => {
    localStorage.setItem(LS_THEME, theme);
  }, [theme]);

  function touchSavedAt() {
    const stamp = nowStamp();
    localStorage.setItem(LS_SAVED_AT, stamp);
    setSavedAt(stamp);
  }

  function safeSetAll(next: AppData, alsoPersist = true) {
    const { data: recalced, issues: recalcedIssues } = recalcAll(next);
    setData(recalced);
    setIssues(recalcedIssues);
    if (alsoPersist) {
      localStorage.setItem(LS_KEY, JSON.stringify(recalced));
      touchSavedAt();
    }
  }

  // persist day
  useEffect(() => {
    localStorage.setItem(LS_DAY, JSON.stringify(day));
    touchSavedAt();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [day]);

  // ===== Upload =====
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
    localStorage.removeItem(LS_DAY);
    localStorage.removeItem(LS_SAVED_AT);

    setRawParsed(null);
    setData(null);
    setIssues([]);
    setError(null);
    setSavedAt(null);
    setDay({
      qtyByDish: {},
      priceByDish: {},
      aufschlagPct: 0,
      franchiseFeePct: 0,
    });
    setTab("UPLOAD");
  }

  // ===== JSON Backup (Notfall) =====
  function exportJSON() {
    const payload = { data, day, savedAt: nowStamp() };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "HeisseEcke_Backup.json";
    a.click();
    URL.revokeObjectURL(url);
  }

  async function importJSON(file: File) {
    try {
      setError(null);
      const txt = await file.text();
      const payload = JSON.parse(txt);

      if (payload?.data) {
        const { data: recalced, issues: recalcedIssues } = recalcAll(
          payload.data as AppData
        );
        setData(recalced);
        setIssues(recalcedIssues);
        localStorage.setItem(LS_KEY, JSON.stringify(recalced));
      }

      if (payload?.day) {
        setDay(payload.day as DayState);
        localStorage.setItem(LS_DAY, JSON.stringify(payload.day));
      }

      touchSavedAt();
      setTab("GERICHTE");
    } catch (e: any) {
      setError(e?.message || "JSON Import fehlgeschlagen.");
    }
  }

  // ===== Theme palette (lesbar!) =====
  const palette =
    theme === "DARK"
      ? {
          bg: "#0b1220",
          card: "#111a2e",
          border: "#2b3a5b",
          text: "#f2f4f7",
          sub: "#c7cee3",
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

  // ===== UI building blocks =====
  const Card = ({
    children,
    span,
  }: {
    children: React.ReactNode;
    span?: number;
  }) => (
    <div
      style={{
        padding: 12,
        border: `1px solid ${palette.border}`,
        borderRadius: 14,
        background: palette.card,
        gridColumn: span ? `span ${span}` : undefined,
      }}
    >
      {children}
    </div>
  );

  const Section = ({
    title,
    children,
  }: {
    title: string;
    children: React.ReactNode;
  }) => (
    <div
      style={{
        padding: 14,
        border: `1px solid ${palette.border}`,
        borderRadius: 14,
        background: palette.card,
      }}
    >
      <div style={{ fontWeight: 1000, fontSize: 18 }}>{title}</div>
      <div style={{ marginTop: 12 }}>{children}</div>
    </div>
  );

  const Badge = ({
    text,
    tone,
  }: {
    text: string;
    tone: "ok" | "warn" | "bad";
  }) => {
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
          fontWeight: 1000,
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
    const border =
      tone === "ghost" ? `1px solid ${palette.accent}` : "1px solid transparent";
    return (
      <button
        onClick={onClick}
        disabled={disabled}
        style={{
          padding: "10px 12px",
          borderRadius: 12,
          border,
          background: disabled
            ? theme === "DARK"
              ? "#25314a"
              : "#d0d5dd"
            : bg,
          color: disabled
            ? theme === "DARK"
              ? "#9aa4bb"
              : "#667085"
            : color,
          cursor: disabled ? "not-allowed" : "pointer",
          fontWeight: 1000,
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
        border:
          tab === id ? `2px solid ${palette.accent}` : `1px solid ${palette.border}`,
        background:
          tab === id
            ? theme === "DARK"
              ? "#16264a"
              : "#eef4ff"
            : palette.card,
        cursor: "pointer",
        fontWeight: 1000,
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
        fontWeight: 950,
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
        fontWeight: 950,
        outline: "none",
        ...props.style,
      }}
    />
  );

  const th = (w: number | undefined = undefined): React.CSSProperties => ({
    textAlign: "left",
    padding: "10px 10px",
    borderBottom: `1px solid ${palette.border}`,
    fontWeight: 1000,
    color: palette.text,
    whiteSpace: "nowrap",
    width: w,
    background: palette.tableHead,
  });

  const td: React.CSSProperties = {
    textAlign: "left",
    padding: "10px 10px",
    color: palette.text,
    fontWeight: 850,
    verticalAlign: "top",
  };

  const tdStrong: React.CSSProperties = { ...td, fontWeight: 1000 };

  // ===== Data lists =====
  const invNames = useMemo(() => {
    if (!data) return [];
    return data.inventory.map((x) => x.name).filter(Boolean);
  }, [data]);

  const dishesList = useMemo(() => {
    if (!data) return [];
    return data.dishes
      .map((d) => d.dish)
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b));
  }, [data]);

  const dishRows = useMemo(() => {
    if (!data) return [];
    const s = dishSearch.trim().toLowerCase();
    if (!s) return data.dishes;
    return data.dishes.filter((d) => d.dish.toLowerCase().includes(s));
  }, [data, dishSearch]);

  // ===== Pricing: editable fields =====
  function updateDishPrice(
    dishName: string,
    field: "priceMaster" | "priceMenu" | "priceTest",
    value: number | null
  ) {
    if (!data) return;
    const next: AppData = JSON.parse(JSON.stringify(data));
    const d = next.dishes.find((x) => x.dish === dishName);
    if (!d) return;
    (d as any)[field] = value;
    safeSetAll(next);
  }

  // ===== Mapping correction =====
  function applyMapping(recipeName: string, inventoryName: string | null) {
    if (!data) return;
    const next: AppData = JSON.parse(JSON.stringify(data));

    const m = next.mapping.find((x) => x.recipeName === recipeName);
    if (m) {
      m.correction = inventoryName;
      m.status = inventoryName ? ("OK" as any) : ("PRÜFEN" as any);
    }

    for (const r of next.recipes) {
      if (r.ingredientRecipe === recipeName) {
        r.inventoryItemSelected = inventoryName;
      }
    }

    safeSetAll(next);
  }

  // ===== Unit mismatch fix suggestion =====
  function suggestRecipeUnitFromInventory(
    invTarget: "kg" | "L" | "stk" | null | undefined
  ): "g" | "ml" | "stk" | null {
    if (!invTarget) return null;
    if (invTarget === "kg") return "g";
    if (invTarget === "L") return "ml";
    return "stk";
  }

  function fixRecipeUnitForIngredient(recipeName: string, newUnit: "g" | "ml" | "stk") {
    if (!data) return;
    const next: AppData = JSON.parse(JSON.stringify(data));
    for (const r of next.recipes) {
      if (r.ingredientRecipe === recipeName) r.unit = newUnit as any;
    }
    safeSetAll(next);
  }

  // ===== Create: inventory / dish / recipe line =====
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

    if (!next.mapping.some((m) => m.recipeName === ingredient)) {
      next.mapping.push({
        recipeName: ingredient,
        suggestion: null,
        correction: newRecipe.inventoryPick.trim() || null,
        status: (newRecipe.inventoryPick.trim() ? "OK" : "PRÜFEN") as any,
      });
    }

    safeSetAll(next);

    setNewRecipe({ dish, ingredientRecipe: "", qty: "", unit: "", inventoryPick: "" });
    setTab("REZEPTE");
  }

  // ===== KPI =====
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

  // ===== Tagesabschluss calculations =====
  const daySummary = useMemo(() => {
    if (!data) return null;

    const aufschlag = clampPct(day.aufschlagPct) / 100;
    const franchise = clampPct(day.franchiseFeePct) / 100;

    const dishes = data.dishes;

    let revenue = 0;
    let revenueAdj = 0;
    let totalCogs = 0;

    // map ingredient->mapping choice fallback
    const mapByRecipe = new Map<string, { correction: string | null; suggestion: string | null }>();
    for (const m of data.mapping)
      mapByRecipe.set(m.recipeName, {
        correction: (m as any).correction ?? null,
        suggestion: (m as any).suggestion ?? null,
      });

    // aggregated consumption by inventory item name + unit
    const consumption: Record<
      string,
      { name: string; unit: "g" | "ml" | "stk"; qty: number; cost: number }
    > = {};

    // group recipe lines by dish
    const linesByDish = new Map<string, RecipeLine[]>();
    for (const r of data.recipes) {
      if (!linesByDish.has(r.dish)) linesByDish.set(r.dish, []);
      linesByDish.get(r.dish)!.push(r);
    }

    for (const d of dishes) {
      const qtySold = day.qtyByDish[d.dish] ?? 0;
      if (!qtySold || qtySold <= 0) continue;

      const defaultPrice = d.priceTest ?? d.priceMenu ?? d.priceMaster ?? null;
      const override = day.priceByDish[d.dish];
      const usedPrice = override !== undefined && override !== null ? override : defaultPrice;

      if (usedPrice !== null) revenue += usedPrice * qtySold;

      const cogsPerUnit = d.cogs ?? null;
      if (cogsPerUnit !== null) totalCogs += cogsPerUnit * qtySold;

      // consumption detail
      const lines = linesByDish.get(d.dish) ?? [];
      for (const line of lines) {
        if (!line.qty || !line.unit) continue;

        // determine chosen inventory item name
        const m = mapByRecipe.get(line.ingredientRecipe);
        const chosen =
          line.inventoryItemSelected ||
          (m?.correction ?? null) ||
          (m?.suggestion ?? null) ||
          null;

        if (!chosen) continue;

        // find inventory for cost per base
        const inv = data.inventory.find((i) => i.name === chosen);
        const pricePerBase = inv?.pricePerBase ?? null;

        const consumedQty = line.qty * qtySold;
        const key = `${chosen}__${line.unit}`;

        if (!consumption[key]) {
          consumption[key] = {
            name: chosen,
            unit: line.unit as any,
            qty: 0,
            cost: 0,
          };
        }
        consumption[key].qty += consumedQty;
        if (pricePerBase !== null && Number.isFinite(pricePerBase)) {
          consumption[key].cost += consumedQty * pricePerBase;
        }
      }
    }

    // apply surcharge to revenue (affects DB but not WE)
    revenueAdj = revenue * (1 + aufschlag);

    // franchise fee as deduction from adjusted revenue
    const franchiseFee = revenueAdj * franchise;

    const dbNet = revenueAdj - franchiseFee - totalCogs;
    const dbPctNet = revenueAdj > 0 ? dbNet / revenueAdj : null;

    const consumptionList = Object.values(consumption).sort((a, b) =>
      a.name.localeCompare(b.name)
    );

    return {
      revenue,
      revenueAdj,
      totalCogs,
      franchiseFee,
      dbNet,
      dbPctNet,
      consumptionList,
    };
  }, [data, day]);

  // ===== Day state mutators =====
  function setDayQty(dish: string, v: number | null) {
    const qty = v === null ? 0 : Math.max(0, Math.floor(v));
    setDay((prev) => ({ ...prev, qtyByDish: { ...prev.qtyByDish, [dish]: qty } }));
  }

  function setDayPrice(dish: string, v: number | null) {
    setDay((prev) => ({ ...prev, priceByDish: { ...prev.priceByDish, [dish]: v } }));
  }

  function setAufschlagPct(v: number | null) {
    setDay((prev) => ({ ...prev, aufschlagPct: clampPct(v ?? 0) }));
  }

  function setFranchiseFeePct(v: number | null) {
    setDay((prev) => ({ ...prev, franchiseFeePct: clampPct(v ?? 0) }));
  }

  // ===== Render =====
  return (
    <div
      style={{
        fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial",
        background: palette.bg,
        minHeight: "100vh",
        color: palette.text,
      }}
    >
      <div style={{ padding: 18, maxWidth: 1320, margin: "0 auto" }}>
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
            <div style={{ fontSize: 24, fontWeight: 1000 }}>
              Heiße Ecke – DB/WE Rechner (MVP)
            </div>
            <div style={{ color: palette.sub, fontWeight: 900 }}>
              Auto-Save:{" "}
              {savedAt ? (
                <span style={{ color: palette.ok }}>
                  aktiv (letzte Speicherung: {savedAt})
                </span>
              ) : (
                <span style={{ color: palette.warn }}>noch nichts gespeichert</span>
              )}
            </div>
          </div>

          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <TabBtn id="UPLOAD" label="Upload" />
            <TabBtn id="GERICHTE" label="Gerichte & DB" />
            <TabBtn id="TAG" label="Tagesabschluss" />
            <TabBtn id="MAPPING" label="Zuordnung" />
            <TabBtn id="REZEPTE" label="Rezepte" />
            <TabBtn id="INVENTUR" label="Inventur" />

            <Button tone="ghost" onClick={() => setTheme(theme === "DARK" ? "LIGHT" : "DARK")}>
              Theme: {theme === "DARK" ? "Dunkel" : "Hell"}
            </Button>

            <Button tone="ghost" onClick={downloadExport} disabled={!data}>
              Export Excel
            </Button>

            <Button tone="ghost" onClick={exportJSON}>
              Backup JSON
            </Button>

            <label style={{ display: "inline-flex", alignItems: "center", gap: 8, fontWeight: 900, color: palette.sub }}>
              JSON Import
              <input
                type="file"
                accept="application/json,.json"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) importJSON(f);
                }}
              />
            </label>

            <Button tone="danger" onClick={resetToOriginal} disabled={!rawParsed}>
              Reset
            </Button>
            <Button tone="danger" onClick={clearAll}>
              Alles löschen
            </Button>
          </div>
        </header>

        {/* KPIs */}
        <section
          style={{
            marginTop: 14,
            display: "grid",
            gridTemplateColumns: "repeat(6, minmax(0, 1fr))",
            gap: 10,
          }}
        >
          <Card>
            <div style={{ color: palette.sub, fontWeight: 1000 }}>Inventur</div>
            <div style={{ fontSize: 20, fontWeight: 1000 }}>{kpi.invCount}</div>
            <div style={{ marginTop: 8 }}>
              {kpi.invIssues === 0 ? (
                <Badge text="OK" tone="ok" />
              ) : (
                <Badge text={`${kpi.invIssues} Probleme`} tone="bad" />
              )}
            </div>
          </Card>

          <Card>
            <div style={{ color: palette.sub, fontWeight: 1000 }}>Rezeptzeilen</div>
            <div style={{ fontSize: 20, fontWeight: 1000 }}>{kpi.recipeCount}</div>
            <div style={{ marginTop: 8 }}>
              {kpi.recipeIssues === 0 ? (
                <Badge text="OK" tone="ok" />
              ) : (
                <Badge text={`${kpi.recipeIssues} Probleme`} tone="bad" />
              )}
            </div>
          </Card>

          <Card>
            <div style={{ color: palette.sub, fontWeight: 1000 }}>Gerichte</div>
            <div style={{ fontSize: 20, fontWeight: 1000 }}>{kpi.dishCount}</div>
            <div style={{ marginTop: 8 }}>
              {kpi.dishIssues === 0 ? (
                <Badge text="OK" tone="ok" />
              ) : (
                <Badge text={`${kpi.dishIssues} Probleme`} tone="bad" />
              )}
            </div>
          </Card>

          <Card span={3}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <div>
                <div style={{ color: palette.sub, fontWeight: 1000 }}>Fehler</div>
                <div style={{ marginTop: 6, fontWeight: 1000 }}>
                  {error ? (
                    <span style={{ color: palette.danger }}>{error}</span>
                  ) : (
                    <span style={{ color: palette.ok }}>—</span>
                  )}
                </div>
              </div>

              <div style={{ maxWidth: 680 }}>
                <div style={{ color: palette.sub, fontWeight: 1000 }}>Hinweis</div>
                <div style={{ marginTop: 6, fontWeight: 900 }}>
                  Wenn du im <b>Inkognito</b>-Modus bist, kann der Browser Speicher beim Schließen löschen.
                  Normaler Modus = bleibt.
                </div>
              </div>
            </div>
          </Card>
        </section>

        {/* Issues */}
        {issues.length > 0 && (
          <section
            style={{
              marginTop: 12,
              padding: 12,
              border: `1px solid ${
                theme === "DARK" ? "#4a2230" : "#fecaca"
              }`,
              borderRadius: 14,
              background: theme === "DARK" ? "#1b0f16" : "#fff5f5",
            }}
          >
            <div
              style={{
                fontWeight: 1000,
                color: theme === "DARK" ? "#ffb4c2" : "#b42318",
              }}
            >
              Probleme (Auszug):
            </div>
            <ul style={{ marginTop: 8, marginBottom: 0, paddingLeft: 18 }}>
              {issues.slice(0, 10).map((x, idx) => (
                <li
                  key={idx}
                  style={{
                    color: theme === "DARK" ? "#ffd1da" : "#7a271a",
                    fontWeight: 900,
                  }}
                >
                  {x}
                </li>
              ))}
            </ul>
          </section>
        )}

        <main style={{ marginTop: 16 }}>
          {/* UPLOAD */}
          {tab === "UPLOAD" && (
            <Section title="Upload">
              <div style={{ color: palette.sub, fontWeight: 900 }}>
                Dateiname egal. Einfach Excel hochladen.
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

          {/* GERICHTE */}
          {tab === "GERICHTE" && (
            <Section title="Gerichte & DB (Preise editierbar)">
              {!data ? (
                <div style={{ color: palette.sub, fontWeight: 900 }}>
                  Bitte erst eine Excel hochladen.
                </div>
              ) : (
                <>
                  <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
                    <Input
                      placeholder="Suche Gericht…"
                      value={dishSearch}
                      onChange={(e) => setDishSearch(e.target.value)}
                      style={{ minWidth: 280 }}
                    />
                    <Button tone="ghost" onClick={() => setTab("TAG")}>
                      Tagesabschluss
                    </Button>
                    <Button tone="ghost" onClick={() => setTab("MAPPING")}>
                      Zuordnung fixen
                    </Button>
                  </div>

                  <div style={{ marginTop: 14, padding: 12, border: `1px dashed ${palette.border}`, borderRadius: 14 }}>
                    <div style={{ fontWeight: 1000, marginBottom: 10 }}>➕ Neues Gericht anlegen</div>
                    <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr auto", gap: 10 }}>
                      <Input placeholder="Gerichtname" value={newDish.name} onChange={(e) => setNewDish({ ...newDish, name: e.target.value })} />
                      <Input placeholder="Preis Master" value={newDish.priceMaster} onChange={(e) => setNewDish({ ...newDish, priceMaster: e.target.value })} />
                      <Input placeholder="Preis Menü" value={newDish.priceMenu} onChange={(e) => setNewDish({ ...newDish, priceMenu: e.target.value })} />
                      <Input placeholder="Preis Frei (Test)" value={newDish.priceTest} onChange={(e) => setNewDish({ ...newDish, priceTest: e.target.value })} />
                      <Button onClick={addDish}>Anlegen</Button>
                    </div>
                    <div style={{ marginTop: 8, color: palette.sub, fontWeight: 900 }}>
                      „Preis Frei (Test)“ = dein Spielpreis. Wenn gesetzt, wird damit DB berechnet.
                    </div>
                  </div>

                  <div style={{ marginTop: 12, overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
                      <thead>
                        <tr>
                          <th style={th(320)}>Gericht</th>
                          <th style={th(140)}>WE / Einheit</th>

                          <th style={th(120)}>Preis Master</th>
                          <th style={th(140)}>DB (Master)</th>

                          <th style={th(120)}>Preis Menü</th>
                          <th style={th(140)}>DB (Menü)</th>

                          <th style={th(140)}>Preis Frei</th>
                          <th style={th(140)}>DB (Frei)</th>

                          <th style={th(120)}>WE % (Frei)</th>
                          <th style={th(120)}>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {dishRows.map((d, idx) => {
                          const cogs = d.cogs ?? null;

                          const dbMaster = cogs !== null && d.priceMaster !== null ? d.priceMaster - cogs : null;
                          const dbMenu = cogs !== null && d.priceMenu !== null ? d.priceMenu - cogs : null;
                          const dbFree = cogs !== null && d.priceTest !== null ? d.priceTest - cogs : null;

                          const wePctFree = cogs !== null && d.priceTest !== null && d.priceTest > 0 ? cogs / d.priceTest : null;

                          return (
                            <tr key={idx} style={{ borderTop: `1px solid ${palette.border}` }}>
                              <td style={tdStrong}>{d.dish}</td>
                              <td style={td}>{cogs === null ? "—" : money(cogs)}</td>

                              <td style={td}><Input value={d.priceMaster ?? ""} onChange={(e) => updateDishPrice(d.dish, "priceMaster", toNum(e.target.value))} style={{ width: 120 }} /></td>
                              <td style={td}>{dbMaster === null ? "—" : money(dbMaster)}</td>

                              <td style={td}><Input value={d.priceMenu ?? ""} onChange={(e) => updateDishPrice(d.dish, "priceMenu", toNum(e.target.value))} style={{ width: 120 }} /></td>
                              <td style={td}>{dbMenu === null ? "—" : money(dbMenu)}</td>

                              <td style={td}><Input value={d.priceTest ?? ""} onChange={(e) => updateDishPrice(d.dish, "priceTest", toNum(e.target.value))} style={{ width: 140 }} /></td>
                              <td style={td}>{dbFree === null ? "—" : money(dbFree)}</td>

                              <td style={td}>{wePctFree === null ? "—" : pct(wePctFree)}</td>

                              <td style={td}>
                                {d.status ? <Badge text={d.status} tone="bad" /> : <Badge text="OK" tone="ok" />}
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

          {/* TAG */}
          {tab === "TAG" && (
            <Section title="Tagesabschluss (Mengen + DB/WE + Warenverbrauch)">
              {!data ? (
                <div style={{ color: palette.sub, fontWeight: 900 }}>Bitte erst eine Excel hochladen.</div>
              ) : (
                <>
                  {/* Global % */}
                  <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
                    <div style={{ fontWeight: 1000 }}>Aufschlag % (Umsatz +)</div>
                    <Input
                      value={String(day.aufschlagPct ?? 0)}
                      onChange={(e) => setAufschlagPct(toNum(e.target.value))}
                      style={{ width: 120 }}
                    />
                    <div style={{ fontWeight: 1000, marginLeft: 12 }}>Franchise Fee % (Umsatz -)</div>
                    <Input
                      value={String(day.franchiseFeePct ?? 0)}
                      onChange={(e) => setFranchiseFeePct(toNum(e.target.value))}
                      style={{ width: 120 }}
                    />
                    <Button tone="ghost" onClick={() => setDay((p) => ({ ...p, qtyByDish: {}, priceByDish: {} }))}>
                      Mengen/VK zurücksetzen
                    </Button>
                  </div>

                  {/* Summary cards */}
                  <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 10 }}>
                    <Card>
                      <div style={{ color: palette.sub, fontWeight: 1000 }}>Umsatz (VK heute)</div>
                      <div style={{ fontSize: 18, fontWeight: 1000 }}>
                        {daySummary ? money(daySummary.revenue) : "—"}
                      </div>
                    </Card>
                    <Card>
                      <div style={{ color: palette.sub, fontWeight: 1000 }}>Umsatz inkl. Aufschlag</div>
                      <div style={{ fontSize: 18, fontWeight: 1000 }}>
                        {daySummary ? money(daySummary.revenueAdj) : "—"}
                      </div>
                    </Card>
                    <Card>
                      <div style={{ color: palette.sub, fontWeight: 1000 }}>Wareneinsatz gesamt</div>
                      <div style={{ fontSize: 18, fontWeight: 1000 }}>
                        {daySummary ? money(daySummary.totalCogs) : "—"}
                      </div>
                    </Card>
                    <Card>
                      <div style={{ color: palette.sub, fontWeight: 1000 }}>DB (netto)</div>
                      <div style={{ fontSize: 18, fontWeight: 1000 }}>
                        {daySummary ? money(daySummary.dbNet) : "—"}
                      </div>
                      <div style={{ marginTop: 6 }}>
                        {daySummary && daySummary.dbPctNet !== null ? <Badge text={`DB% ${pct(daySummary.dbPctNet)}`} tone="ok" /> : <Badge text="DB% —" tone="warn" />}
                      </div>
                    </Card>
                  </div>

                  {/* Dish input table */}
                  <div style={{ marginTop: 14, overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
                      <thead>
                        <tr>
                          <th style={th(340)}>Gericht</th>
                          <th style={th(120)}>Menge</th>
                          <th style={th(160)}>VK heute (optional)</th>
                          <th style={th(140)}>Umsatz</th>
                          <th style={th(140)}>WE</th>
                          <th style={th(140)}>DB (brutto)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.dishes
                          .slice()
                          .sort((a, b) => a.dish.localeCompare(b.dish))
                          .map((d, idx) => {
                            const qtySold = day.qtyByDish[d.dish] ?? 0;
                            const defaultPrice = d.priceTest ?? d.priceMenu ?? d.priceMaster ?? null;
                            const override = day.priceByDish[d.dish];
                            const usedPrice = override !== undefined && override !== null ? override : defaultPrice;

                            const revenue = usedPrice !== null ? usedPrice * qtySold : null;
                            const cogs = d.cogs !== null ? d.cogs * qtySold : null;
                            const db = revenue !== null && cogs !== null ? revenue - cogs : null;

                            return (
                              <tr key={idx} style={{ borderTop: `1px solid ${palette.border}` }}>
                                <td style={tdStrong}>{d.dish}</td>

                                <td style={td}>
                                  <Input
                                    value={String(qtySold)}
                                    onChange={(e) => setDayQty(d.dish, toNum(e.target.value))}
                                    style={{ width: 120 }}
                                  />
                                </td>

                                <td style={td}>
                                  <Input
                                    placeholder={defaultPrice === null ? "kein Preis" : String(defaultPrice)}
                                    value={override === undefined || override === null ? "" : String(override)}
                                    onChange={(e) => setDayPrice(d.dish, toNum(e.target.value))}
                                    style={{ width: 160 }}
                                  />
                                </td>

                                <td style={td}>{revenue === null ? "—" : money(revenue)}</td>
                                <td style={td}>{cogs === null ? "—" : money(cogs)}</td>
                                <td style={td}>{db === null ? "—" : money(db)}</td>
                              </tr>
                            );
                          })}
                      </tbody>
                    </table>
                  </div>

                  {/* Consumption */}
                  <div style={{ marginTop: 18, fontWeight: 1000, fontSize: 16 }}>Verbrauchte Waren (aus Rezepturen hochgerechnet)</div>
                  <div style={{ marginTop: 10, overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
                      <thead>
                        <tr>
                          <th style={th(420)}>Artikel (Inventur)</th>
                          <th style={th(120)}>Unit</th>
                          <th style={th(160)}>Menge</th>
                          <th style={th(160)}>Kosten</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(daySummary?.consumptionList ?? []).map((c, idx) => (
                          <tr key={idx} style={{ borderTop: `1px solid ${palette.border}` }}>
                            <td style={tdStrong}>{c.name}</td>
                            <td style={td}>{c.unit}</td>
                            <td style={td}>{Number.isFinite(c.qty) ? c.qty.toFixed(c.unit === "stk" ? 0 : 1) : "—"}</td>
                            <td style={td}>{Number.isFinite(c.cost) ? money(c.cost) : "—"}</td>
                          </tr>
                        ))}
                        {(daySummary?.consumptionList ?? []).length === 0 && (
                          <tr style={{ borderTop: `1px solid ${palette.border}` }}>
                            <td style={td} colSpan={4}>
                              Keine Verbrauchsdaten (prüfe: Mengen verkauft &gt; 0, Rezepte vorhanden, Mapping OK).
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>

                  <div style={{ marginTop: 10, color: palette.sub, fontWeight: 900 }}>
                    Hinweis: Kosten im Verbrauch werden nur berechnet, wenn Inventurpreis + Ziel-Einheit + Packungsinhalt gepflegt sind.
                  </div>
                </>
              )}
            </Section>
          )}

          {/* MAPPING */}
          {tab === "MAPPING" && (
            <Section title="Zuordnung (Rezept-Zutat → Inventur-Artikel) + Unit-Fix">
              {!data ? (
                <div style={{ color: palette.sub, fontWeight: 900 }}>Bitte erst eine Excel hochladen.</div>
              ) : (
                <>
                  <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
                    <Input placeholder="Suche Zutat…" value={mappingSearch} onChange={(e) => setMappingSearch(e.target.value)} style={{ minWidth: 280 }} />
                    <Button tone="ghost" onClick={() => setTab("GERICHTE")}>Zurück</Button>
                    <Button tone="ghost" onClick={() => setTab("TAG")}>Tagesabschluss</Button>
                  </div>

                  <div style={{ marginTop: 12, overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
                      <thead>
                        <tr>
                          <th style={th(360)}>Rezept-Zutat</th>
                          <th style={th(280)}>Vorschlag</th>
                          <th style={th(undefined)}>Deine Auswahl</th>
                          <th style={th(360)}>Unit-Check</th>
                          <th style={th(120)}>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.mapping
                          .filter((m) => {
                            const s = mappingSearch.trim().toLowerCase();
                            if (!s) return true;
                            return m.recipeName.toLowerCase().includes(s);
                          })
                          .slice(0, 600)
                          .map((m, idx) => {
                            const selected = (m as any).correction ?? "";
                            const sampleLine = data.recipes.find((r) => r.ingredientRecipe === m.recipeName);
                            const recipeUnit = sampleLine?.unit ?? null;

                            const invName = selected || (m as any).suggestion || null;
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
                                <td style={tdStrong}>{m.recipeName}</td>
                                <td style={td}>{(m as any).suggestion ?? "—"}</td>
                                <td style={td}>
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
                                <td style={td}>
                                  <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                                    <span style={{ fontWeight: 1000, color: mismatch.includes("Mismatch") ? palette.warn : palette.sub }}>
                                      {mismatch}
                                    </span>
                                    {recipeUnit && suggestedUnit && recipeUnit !== suggestedUnit && (
                                      <Button tone="ghost" onClick={() => fixRecipeUnitForIngredient(m.recipeName, suggestedUnit)}>
                                        Fix: setze auf {suggestedUnit}
                                      </Button>
                                    )}
                                  </div>
                                </td>
                                <td style={td}>
                                  {(m as any).status === "OK" ? <Badge text="OK" tone="ok" /> : <Badge text="PRÜFEN" tone="warn" />}
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
            <Section title="Rezepte (Rezeptzeile hinzufügen + Übersicht)">
              {!data ? (
                <div style={{ color: palette.sub, fontWeight: 900 }}>Bitte erst eine Excel hochladen.</div>
              ) : (
                <>
                  <div style={{ marginBottom: 12, padding: 12, border: `1px dashed ${palette.border}`, borderRadius: 14 }}>
                    <div style={{ fontWeight: 1000, marginBottom: 10 }}>➕ Rezeptzeile hinzufügen</div>
                    <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1.6fr 0.7fr 0.7fr 1.6fr auto", gap: 10 }}>
                      <Select value={newRecipe.dish} onChange={(e) => setNewRecipe({ ...newRecipe, dish: e.target.value })}>
                        <option value="">— Gericht wählen —</option>
                        {dishesList.map((d) => (
                          <option key={d} value={d}>
                            {d}
                          </option>
                        ))}
                      </Select>

                      <Input placeholder="Zutat (Rezept)" value={newRecipe.ingredientRecipe} onChange={(e) => setNewRecipe({ ...newRecipe, ingredientRecipe: e.target.value })} />
                      <Input placeholder="Menge" value={newRecipe.qty} onChange={(e) => setNewRecipe({ ...newRecipe, qty: e.target.value })} />

                      <Select value={newRecipe.unit} onChange={(e) => setNewRecipe({ ...newRecipe, unit: e.target.value as any })}>
                        <option value="">Unit</option>
                        <option value="g">g</option>
                        <option value="ml">ml</option>
                        <option value="stk">stk</option>
                      </Select>

                      <Select value={newRecipe.inventoryPick} onChange={(e) => setNewRecipe({ ...newRecipe, inventoryPick: e.target.value })}>
                        <option value="">— Inventurartikel (optional) —</option>
                        {invNames.map((n) => (
                          <option key={n} value={n}>
                            {n}
                          </option>
                        ))}
                      </Select>

                      <Button onClick={addRecipeLine}>Hinzufügen</Button>
                    </div>
                    <div style={{ marginTop: 8, color: palette.sub, fontWeight: 900 }}>
                      Tipp: Wenn du Inventurartikel auswählst, wird das Mapping automatisch OK.
                    </div>
                  </div>

                  <div style={{ marginTop: 12, overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
                      <thead>
                        <tr>
                          <th style={th(280)}>Gericht</th>
                          <th style={th(320)}>Zutat</th>
                          <th style={th(100)}>Menge</th>
                          <th style={th(100)}>Unit</th>
                          <th style={th(320)}>Inventur (gesetzt)</th>
                          <th style={th(140)}>Kosten</th>
                          <th style={th(180)}>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.recipes.slice(0, 800).map((r, idx) => (
                          <tr key={idx} style={{ borderTop: `1px solid ${palette.border}` }}>
                            <td style={tdStrong}>{r.dish}</td>
                            <td style={td}>{r.ingredientRecipe}</td>
                            <td style={td}>{r.qty ?? "—"}</td>
                            <td style={td}>{r.unit ?? "—"}</td>
                            <td style={td}>{r.inventoryItemSelected ?? "—"}</td>
                            <td style={td}>{r.cost === null ? "—" : money(r.cost)}</td>
                            <td style={td}>{r.status ? <Badge text={r.status} tone="warn" /> : <Badge text="OK" tone="ok" />}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <div style={{ marginTop: 10, color: palette.sub, fontWeight: 900 }}>
                      Anzeige auf 800 Zeilen begrenzt (Performance). Export enthält alles.
                    </div>
                  </div>
                </>
              )}
            </Section>
          )}

          {/* INVENTUR */}
          {tab === "INVENTUR" && (
            <Section title="Inventur (Übersicht + Artikel hinzufügen)">
              {!data ? (
                <div style={{ color: palette.sub, fontWeight: 900 }}>Bitte erst eine Excel hochladen.</div>
              ) : (
                <>
                  <div style={{ marginBottom: 12, padding: 12, border: `1px dashed ${palette.border}`, borderRadius: 14 }}>
                    <div style={{ fontWeight: 1000, marginBottom: 10 }}>➕ Inventurprodukt hinzufügen</div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr 1fr 1fr 1fr 1fr auto", gap: 10 }}>
                      <Input placeholder="Warengruppe" value={newInv.group} onChange={(e) => setNewInv({ ...newInv, group: e.target.value })} />
                      <Input placeholder="Artikelname" value={newInv.name} onChange={(e) => setNewInv({ ...newInv, name: e.target.value })} />
                      <Input placeholder="EK (raw)" value={newInv.ekRaw} onChange={(e) => setNewInv({ ...newInv, ekRaw: e.target.value })} />
                      <Input placeholder="Einheit (raw)" value={newInv.unitRaw} onChange={(e) => setNewInv({ ...newInv, unitRaw: e.target.value })} />
                      <Select value={newInv.targetUnit} onChange={(e) => setNewInv({ ...newInv, targetUnit: e.target.value as any })}>
                        <option value="">Ziel</option>
                        <option value="kg">kg</option>
                        <option value="L">L</option>
                        <option value="stk">stk</option>
                      </Select>
                      <Input placeholder="Packinhalt (Ziel)" value={newInv.packTarget} onChange={(e) => setNewInv({ ...newInv, packTarget: e.target.value })} />
                      <Button onClick={addInventoryItem}>Anlegen</Button>
                    </div>
                    <div style={{ marginTop: 8, color: palette.sub, fontWeight: 900 }}>
                      Damit Horrorwerte verschwinden: Ziel-Einheit + Packinhalt müssen gepflegt sein.
                    </div>
                  </div>

                  <div style={{ marginTop: 12, overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
                      <thead>
                        <tr>
                          <th style={th(180)}>Warengruppe</th>
                          <th style={th(420)}>Artikel</th>
                          <th style={th(120)}>EK raw</th>
                          <th style={th(140)}>Einheit raw</th>
                          <th style={th(80)}>Ziel</th>
                          <th style={th(140)}>Pack (Ziel)</th>
                          <th style={th(160)}>€/Basis</th>
                          <th style={th(160)}>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.inventory.slice(0, 600).map((it, idx) => (
                          <tr key={idx} style={{ borderTop: `1px solid ${palette.border}` }}>
                            <td style={td}>{it.group ?? "—"}</td>
                            <td style={tdStrong}>{it.name}</td>
                            <td style={td}>{it.ekRaw ?? "—"}</td>
                            <td style={td}>{it.unitRaw ?? "—"}</td>
                            <td style={td}>{it.targetUnit ?? "—"}</td>
                            <td style={td}>{it.packTarget ?? it.packRaw ?? "—"}</td>
                            <td style={td}>{it.pricePerBase === null ? "—" : it.pricePerBase.toFixed(6)}</td>
                            <td style={td}>{it.status ? <Badge text={it.status} tone="bad" /> : <Badge text="OK" tone="ok" />}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <div style={{ marginTop: 10, color: palette.sub, fontWeight: 900 }}>
                      Anzeige auf 600 Zeilen begrenzt. Export zeigt alles.
                    </div>
                  </div>
                </>
              )}
            </Section>
          )}
        </main>
      </div>
    </div>
  );
}
