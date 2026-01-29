import * as XLSX from "xlsx";

/** ========= Types ========= */

export type InventoryItem = {
  name: string;
  group?: string | null; // Warengruppe (aus Reiter / Excel)
  ekRaw: number | null; // EK wie Inventur (pro Packung / pro Einheit wie Inventur)
  unitRaw: string | null; // Einheit wie Inventur (Liter/kg/ml/g/stk/...)
  packRaw: number | null; // Packung (Ganzes Stück enthält) falls vorhanden
  targetUnit: "kg" | "L" | "stk" | null; // Ziel-Einheit für App
  packTarget: number | null; // Packungsinhalt in Ziel-Einheit (vom Kollegen)
  pricePerBase: number | null; // €/g oder €/ml oder €/stk (wird berechnet)
  status?: string | null;
};

export type RecipeLine = {
  dish: string;
  ingredientRecipe: string; // Text aus Rezept
  qty: number | null; // Menge (in g/ml/stk)
  unit: "g" | "ml" | "stk" | null; // Einheit aus Rezept
  inventoryItemSelected: string | null; // Dropdown-Auswahl (Inventur-Artikel)
  cost: number | null; // berechnet
  status?: string | null;
};

export type DishRow = {
  dish: string;
  priceMaster: number | null;
  priceMenu: number | null;
  priceTest: number | null;

  cogs: number | null; // Wareneinsatz pro Einheit
  db: number | null; // DB pro Einheit (auf PreisTest/Menu/Master)
  dbPct: number | null;
  status?: string | null;
};

export type MappingRow = {
  recipeName: string;
  suggestion: string | null;
  correction: string | null; // Inventur-Artikelname
  status: "PRÜFEN" | "OK";
};

export type AppData = {
  inventory: InventoryItem[];
  recipes: RecipeLine[];
  dishes: DishRow[];
  mapping: MappingRow[];
};

/** ========= Small helpers ========= */

export function toNumber(v: any): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const s = String(v).trim();
  if (!s) return null;
  const t = s.replace(/\s/g, "").replace(",", ".");
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

export function money(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(v);
}

export function pct(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  return new Intl.NumberFormat("de-DE", { style: "percent", maximumFractionDigits: 1 }).format(v);
}

function norm(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[ä]/g, "ae")
    .replace(/[ö]/g, "oe")
    .replace(/[ü]/g, "ue")
    .replace(/[ß]/g, "ss")
    .replace(/[^a-z0-9\s\-\/\.]/g, "")
    .replace(/\s+/g, " ");
}

function bestMatch(needle: string, options: string[]): string | null {
  const n = norm(needle);
  if (!n) return null;
  let best: { opt: string; score: number } | null = null;

  for (const opt of options) {
    const o = norm(opt);
    if (!o) continue;
    // sehr simple Score-Logik: contains + token overlap
    let score = 0;
    if (o === n) score += 100;
    if (o.includes(n) || n.includes(o)) score += 50;

    const nt = n.split(" ");
    const ot = o.split(" ");
    const overlap = nt.filter((t) => ot.includes(t)).length;
    score += overlap * 5;

    if (!best || score > best.score) best = { opt, score };
  }
  return best && best.score >= 10 ? best.opt : null;
}

function inferTargetUnitFromRaw(unitRaw: string | null): "kg" | "L" | "stk" | null {
  if (!unitRaw) return null;
  const u = unitRaw.toLowerCase().trim();
  if (u.includes("liter") || u === "l" || u === "lt" || u === "liter.") return "L";
  if (u.includes("ml")) return "L";
  if (u.includes("kilo") || u === "kg") return "kg";
  if (u === "g" || u.includes("gram")) return "kg";
  if (u.includes("stück") || u.includes("stk") || u.includes("stck") || u.includes("pcs") || u.includes("pc"))
    return "stk";
  return null;
}

/** targetUnit -> base unit used in recipes */
function targetToBaseUnit(target: "kg" | "L" | "stk"): "g" | "ml" | "stk" {
  if (target === "kg") return "g";
  if (target === "L") return "ml";
  return "stk";
}

/** Convert price-per-target to price-per-base (€/kg -> €/g; €/L -> €/ml; €/stk -> €/stk) */
function pricePerBaseFromTarget(pricePerTarget: number, target: "kg" | "L" | "stk"): number {
  if (target === "kg") return pricePerTarget / 1000;
  if (target === "L") return pricePerTarget / 1000;
  return pricePerTarget;
}

/** ========= Parse workbook (supports OLD + NEW formats) ========= */

export function parseWorkbook(buf: ArrayBuffer): AppData {
  const wb = XLSX.read(buf, { type: "array" });

  // OLD format?
  if (wb.Sheets["INVENTUR_INPUT"] && wb.Sheets["REZEPTE_BASIS"] && wb.Sheets["GERICHTE"]) {
    return parseOldFormat(wb);
  }

  // NEW human format?
  if (wb.Sheets["01_INVENTUR"]) {
    return parseHumanV6(wb);
  }

  throw new Error(
    "Excel-Format nicht erkannt. Erwartet entweder: (INVENTUR_INPUT/REZEPTE_BASIS/GERICHTE) oder (01_INVENTUR + Gericht-Tabs)."
  );
}

function parseOldFormat(wb: XLSX.WorkBook): AppData {
  const inv = XLSX.utils.sheet_to_json<any>(wb.Sheets["INVENTUR_INPUT"], { defval: "" });
  const rec = XLSX.utils.sheet_to_json<any>(wb.Sheets["REZEPTE_BASIS"], { defval: "" });
  const dish = XLSX.utils.sheet_to_json<any>(wb.Sheets["GERICHTE"], { defval: "" });

  const inventory: InventoryItem[] = inv.map((r: any) => ({
    name: String(r["Zutat"] ?? "").trim(),
    group: null,
    ekRaw: toNumber(r["EK (wie Inventur)"]),
    unitRaw: String(r["Einheit (Inventur)"] ?? "").trim() || null,
    packRaw: toNumber(r["Packungsinhalt (optional)"]),
    targetUnit: inferTargetUnitFromRaw(String(r["Einheit (Inventur)"] ?? "")),
    packTarget: null,
    pricePerBase: null,
    status: null,
  }));

  const recipes: RecipeLine[] = rec.map((r: any) => ({
    dish: String(r["Gericht"] ?? "").trim(),
    ingredientRecipe: String(r["Zutat (Rezept)"] ?? "").trim(),
    qty: toNumber(r["Menge"]),
    unit: (String(r["Einheit (g/ml/stk)"] ?? "").trim() as any) || null,
    inventoryItemSelected: (String(r["Inventur-Artikel (Dropdown)"] ?? "").trim() || null),
    cost: null,
    status: null,
  }));

  const dishes: DishRow[] = dish.map((r: any) => ({
    dish: String(r["Gericht"] ?? "").trim(),
    priceMaster: toNumber(r["Preis (Master)"]),
    priceMenu: toNumber(r["Preis (Speisekarte)"]),
    priceTest: toNumber(r["Preis (Test)"]),
    cogs: null,
    db: null,
    dbPct: null,
    status: null,
  }));

  const mapping = buildMapping(inventory, recipes);

  return { inventory, recipes, dishes, mapping };
}

function parseHumanV6(wb: XLSX.WorkBook): AppData {
  const invRows = XLSX.utils.sheet_to_json<any>(wb.Sheets["01_INVENTUR"], { defval: "" });

  const inventory: InventoryItem[] = invRows
    .map((r: any) => {
      const name = String(r["ARTIKEL (wie Inventur)"] ?? "").trim();
      if (!name) return null;

      const targetUnit = (String(r["ZIEL-EINHEIT (App)"] ?? "").trim() as any) || null;
      const target: "kg" | "L" | "stk" | null =
        targetUnit === "kg" || targetUnit === "L" || targetUnit === "stk" ? targetUnit : null;

      return {
        name,
        group: String(r["WARENGRUPPE (Reiter)"] ?? "").trim() || null,
        ekRaw: toNumber(r["EK (wie Inventur)"]),
        unitRaw: String(r["EINHEIT (wie Inventur)"] ?? "").trim() || null,
        packRaw: toNumber(r["PACKUNG (Ganzes Stück enthält)"]),
        targetUnit: target ?? inferTargetUnitFromRaw(String(r["EINHEIT (wie Inventur)"] ?? "")),
        packTarget: toNumber(r["PACKUNGSINHALT in ZIEL-EINHEIT"]),
        pricePerBase: null,
        status: null,
      } as InventoryItem;
    })
    .filter(Boolean) as InventoryItem[];

  // Recipes are stored in each dish tab (NOT in one big sheet)
  const ignore = new Set(["00_START", "01_INVENTUR", "02_REZEPTE_INDEX", "98_LISTEN"]);
  const recipeLines: RecipeLine[] = [];
  const dishesMap = new Map<string, DishRow>();

  for (const sheetName of wb.SheetNames) {
    if (ignore.has(sheetName)) continue;

    const sheet = wb.Sheets[sheetName];
    const grid = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1, defval: "" }) as any[][];

    // Dish name in A1
    const dishName = String(grid?.[0]?.[0] ?? "").trim();
    if (!dishName) continue;

    // Prices in A3/B3 etc
    const priceMaster = readPriceFromGrid(grid, "Preis Master");
    const priceMenu = readPriceFromGrid(grid, "Preis Speisekarte");
    const priceTest = readPriceFromGrid(grid, "Preis Test");

    if (!dishesMap.has(dishName)) {
      dishesMap.set(dishName, {
        dish: dishName,
        priceMaster,
        priceMenu,
        priceTest,
        cogs: null,
        db: null,
        dbPct: null,
        status: null,
      });
    }

    // Find header row that contains "Zutat (Rezept)"
    const headerRowIdx = grid.findIndex((row) => String(row?.[0] ?? "").trim() === "Zutat (Rezept)");
    if (headerRowIdx < 0) continue;

    // rows below header
    for (let r = headerRowIdx + 1; r < grid.length; r++) {
      const row = grid[r];
      const ingredient = String(row?.[0] ?? "").trim();
      if (!ingredient) break; // stop at first empty ingredient
      const qty = toNumber(row?.[1]);
      const unit = (String(row?.[2] ?? "").trim() as any) || null; // g/ml/stk
      const invSel = String(row?.[3] ?? "").trim() || null; // dropdown selection

      recipeLines.push({
        dish: dishName,
        ingredientRecipe: ingredient,
        qty,
        unit: unit === "g" || unit === "ml" || unit === "stk" ? unit : null,
        inventoryItemSelected: invSel,
        cost: null,
        status: null,
      });
    }
  }

  const dishes = Array.from(dishesMap.values());
  const mapping = buildMapping(inventory, recipeLines);

  return { inventory, recipes: recipeLines, dishes, mapping };
}

function readPriceFromGrid(grid: any[][], label: string): number | null {
  for (let r = 0; r < Math.min(grid.length, 30); r++) {
    const a = String(grid[r]?.[0] ?? "").trim();
    if (a === label) return toNumber(grid[r]?.[1]);
  }
  return null;
}

/** ========= Mapping + Recalc ========= */

function buildMapping(inventory: InventoryItem[], recipes: RecipeLine[]): MappingRow[] {
  const invNames = inventory.map((i) => i.name);
  const seen = new Set<string>();
  const mapping: MappingRow[] = [];

  for (const r of recipes) {
    const key = r.ingredientRecipe?.trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);

    const suggestion = bestMatch(key, invNames);
    mapping.push({
      recipeName: key,
      suggestion,
      correction: null,
      status: "PRÜFEN",
    });
  }
  return mapping;
}

export function recalcAll(input: AppData): { data: AppData; issues: string[] } {
  const data: AppData = JSON.parse(JSON.stringify(input));
  const issues: string[] = [];

  // 1) compute pricePerBase for inventory (€/g or €/ml or €/stk)
  for (const it of data.inventory) {
    it.status = null;

    if (!it.name) {
      it.status = "NAME FEHLT";
      issues.push("Inventur: Name fehlt");
      continue;
    }
    if (it.ekRaw === null) {
      it.status = joinStatus(it.status, "PREIS FEHLT");
    }
    const target = it.targetUnit ?? inferTargetUnitFromRaw(it.unitRaw);
    it.targetUnit = target;

    if (!target) it.status = joinStatus(it.status, "ZIEL-EINHEIT FEHLT");

    // packTarget: bevorzugt vom Kollegen, sonst packRaw als fallback
    const pack = it.packTarget ?? it.packRaw ?? null;
    if (!pack) it.status = joinStatus(it.status, "PACKUNGSINHALT FEHLT");

    if (it.ekRaw !== null && target && pack) {
      const pricePerTarget = it.ekRaw / pack; // €/kg or €/L or €/stk
      it.pricePerBase = pricePerBaseFromTarget(pricePerTarget, target);
    } else {
      it.pricePerBase = null;
    }

    if (it.status) issues.push(`Inventur: ${it.name} → ${it.status}`);
  }

  // 2) apply mapping corrections from recipe sheet selection if present
  // If recipe line has inventoryItemSelected, we treat it as correction (strong)
  const mappingByName = new Map<string, MappingRow>();
  for (const m of data.mapping) mappingByName.set(m.recipeName, m);

  for (const r of data.recipes) {
    const m = mappingByName.get(r.ingredientRecipe);
    if (!m) continue;

    if (r.inventoryItemSelected) {
      m.correction = r.inventoryItemSelected;
      m.status = "OK";
    }
  }

  // 3) compute recipe line cost
  const invByName = new Map<string, InventoryItem>();
  for (const it of data.inventory) invByName.set(it.name, it);

  for (const r of data.recipes) {
    r.cost = null;
    r.status = null;

    const m = mappingByName.get(r.ingredientRecipe);
    const chosenName = m?.correction ?? m?.suggestion ?? null;

    if (!chosenName) {
      r.status = "MAP FEHLT";
      issues.push(`Rezept: ${r.dish} / ${r.ingredientRecipe} → Mapping fehlt`);
      continue;
    }

    const inv = invByName.get(chosenName);
    if (!inv) {
      r.status = "INVENTUR ARTIKEL FEHLT";
      issues.push(`Rezept: ${r.dish} / ${r.ingredientRecipe} → Inventur-Artikel nicht gefunden`);
      continue;
    }

    if (r.qty === null || !r.unit) {
      r.status = "MENGE/EINHEIT FEHLT";
      continue;
    }

    // unit check: inventory base should match recipe unit (g/ml/stk)
    const base = inv.targetUnit ? targetToBaseUnit(inv.targetUnit) : null;
    if (base && base !== r.unit) {
      r.status = `UNIT MISMATCH (Inventur=${base}, Rezept=${r.unit})`;
      issues.push(`Rezept: ${r.dish} / ${r.ingredientRecipe} → ${r.status}`);
      continue;
    }

    if (inv.pricePerBase === null) {
      r.status = "PREIS PRO BASIS FEHLT";
      continue;
    }

    r.cost = r.qty * inv.pricePerBase;
  }

  // 4) compute dishes COGS + DB
  const linesByDish = new Map<string, RecipeLine[]>();
  for (const r of data.recipes) {
    if (!linesByDish.has(r.dish)) linesByDish.set(r.dish, []);
    linesByDish.get(r.dish)!.push(r);
  }

  for (const d of data.dishes) {
    const lines = linesByDish.get(d.dish) ?? [];
    const cogs = sum(lines.map((l) => l.cost).filter((x): x is number => typeof x === "number" && Number.isFinite(x)));
    d.cogs = lines.length ? (Number.isFinite(cogs) ? cogs : null) : null;

    // effective price: test > menu > master
    const p = d.priceTest ?? d.priceMenu ?? d.priceMaster ?? null;

    if (p !== null && d.cogs !== null) {
      d.db = p - d.cogs;
      d.dbPct = p > 0 ? d.db / p : null;
    } else {
      d.db = null;
      d.dbPct = null;
    }

    d.status = null;
    if (d.cogs === null) d.status = joinStatus(d.status, "REZEPT/WE FEHLT");
    if (p === null) d.status = joinStatus(d.status, "PREIS FEHLT");
  }

  return { data, issues };
}

function sum(arr: number[]): number {
  let s = 0;
  for (const n of arr) s += n;
  return s;
}

function joinStatus(a: string | null | undefined, b: string): string {
  if (!a) return b;
  if (a.includes(b)) return a;
  return `${a} | ${b}`;
}

/** ========= Export (optional) ========= */

export function exportWorkbook(data: AppData): Blob {
  const wb = XLSX.utils.book_new();

  const inv = data.inventory.map((i) => ({
    Warengruppe: i.group ?? "",
    Artikel: i.name,
    EK: i.ekRaw ?? "",
    Einheit: i.unitRaw ?? "",
    Ziel: i.targetUnit ?? "",
    Packungsinhalt_Ziel: i.packTarget ?? i.packRaw ?? "",
    PreisProBasis: i.pricePerBase ?? "",
    Status: i.status ?? "",
  }));
  const wsInv = XLSX.utils.json_to_sheet(inv);
  XLSX.utils.book_append_sheet(wb, wsInv, "INVENTUR");

  const rec = data.recipes.map((r) => ({
    Gericht: r.dish,
    Zutat_Rezept: r.ingredientRecipe,
    Menge: r.qty ?? "",
    Einheit: r.unit ?? "",
    Inventur: r.inventoryItemSelected ?? "",
    Kosten: r.cost ?? "",
    Status: r.status ?? "",
  }));
  const wsRec = XLSX.utils.json_to_sheet(rec);
  XLSX.utils.book_append_sheet(wb, wsRec, "REZEPTE");

  const dishes = data.dishes.map((d) => ({
    Gericht: d.dish,
    Preis_Master: d.priceMaster ?? "",
    Preis_Menu: d.priceMenu ?? "",
    Preis_Test: d.priceTest ?? "",
    Wareneinsatz: d.cogs ?? "",
    DB_EUR: d.db ?? "",
    DB_PCT: d.dbPct ?? "",
    Status: d.status ?? "",
  }));
  const wsDish = XLSX.utils.json_to_sheet(dishes);
  XLSX.utils.book_append_sheet(wb, wsDish, "GERICHTE");

  const out = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  return new Blob([out], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}
