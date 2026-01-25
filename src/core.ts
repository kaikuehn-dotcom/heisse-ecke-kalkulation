import * as XLSX from "xlsx";

/** ===== Types ===== */
export type InventoryItem = {
  name: string;
  ekRaw: number | null;      // EK wie Inventur (€/kg, €/g, €/l, €/ml, €/stk)
  unitRaw: string | null;    // kg/g/l/ml/stk
  ekBase: number | null;     // €/g or €/ml or €/stk
  status: string | null;
};

export type MappingRow = {
  recipeName: string;        // Zutat im Rezept
  suggestion: string | null; // Vorschlag Inventur-Zutat
  correction: string | null; // Inventur-Zutat (Korrektur)
  status: string | null;     // OK / PRÜFEN / ...
};

export type RecipeLine = {
  dish: string;
  ingredientRecipe: string;
  qty: number | null;
  unit: string | null;           // g/ml/stk
  mappedInventory: string | null;
  ekBase: number | null;
  cost: number | null;
  status: string | null;
};

export type DishRow = {
  dish: string;
  priceMaster: number | null;
  priceMenu: number | null;
  priceTest: number | null;
  cogs: number | null;
  db: number | null;
  dbPct: number | null;
  status: string | null;
};

export type AppData = {
  inventory: InventoryItem[];
  mapping: MappingRow[];
  recipes: RecipeLine[];
  dishes: DishRow[];
};

export type DataIssue = {
  type: "MAPPING" | "EK" | "MENGE" | "PREIS" | "REZEPT";
  message: string;
  dish?: string;
  ingredient?: string;
  actionHint: string;
};

/** ===== Utils ===== */
export function toNumber(x: unknown): number | null {
  if (typeof x === "number" && Number.isFinite(x)) return x;
  if (typeof x === "string") {
    const s = x.trim().replace(",", ".");
    const m = s.match(/-?\d+(?:\.\d+)?/);
    if (!m) return null;
    const v = Number(m[0]);
    return Number.isFinite(v) ? v : null;
  }
  return null;
}
export function money(n: number | null): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(n);
}
export function pct(n: number | null): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("de-DE", { style: "percent", maximumFractionDigits: 0 }).format(n);
}
function ekToBase(ekRaw: number, unitRaw: string): number {
  const u = unitRaw.toLowerCase().trim();
  if (u === "kg" || u === "l") return ekRaw / 1000;
  return ekRaw; // g/ml/stk already
}
function pickPrice(d: DishRow): number | null {
  return d.priceTest ?? d.priceMenu ?? d.priceMaster ?? null;
}

/** ===== Import =====
 * Erwartete Sheet-Namen aus deinem Datenpaket:
 * INVENTUR_INPUT, MAP_ZUTATEN, REZEPTE_BASIS, GERICHTE
 */
export function parseWorkbook(file: ArrayBuffer): AppData {
  const wb = XLSX.read(file, { type: "array" });

  const inv = sheetToJSON(wb, "INVENTUR_INPUT");
  const map = sheetToJSON(wb, "MAP_ZUTATEN");
  const rec = sheetToJSON(wb, "REZEPTE_BASIS");
  const dis = sheetToJSON(wb, "GERICHTE");

  const inventory: InventoryItem[] = inv.map((r) => {
    const name = String(r["Zutat"] ?? "").trim();
    const ekRaw = toNumber(r["EK (wie Inventur)"] ?? r["EK"] ?? r["EK (wie auf Rechnung)"]);
    const unitRaw = String(r["Einheit (Inventur)"] ?? r["Einheit"] ?? "").trim() || null;
    let ekBase: number | null = null;
    if (ekRaw != null && unitRaw) ekBase = ekToBase(ekRaw, unitRaw);
    const status = String(r["STATUS"] ?? "").trim() || null;
    return { name, ekRaw, unitRaw, ekBase, status };
  }).filter(x => x.name);

  const mapping: MappingRow[] = map.map((r) => ({
    recipeName: String(r["Zutat im Rezept"] ?? r["Zutat (Rezept)"] ?? r["Zutat"] ?? "").trim(),
    suggestion: String(r["Vorschlag Inventur-Zutat"] ?? r["Vorschlag"] ?? "").trim() || null,
    correction: String(r["Inventur-Zutat (Korrektur)"] ?? r["Inventur-Zutat (falls korrigieren)"] ?? "").trim() || null,
    status: String(r["Status"] ?? r["STATUS"] ?? "").trim() || null
  })).filter(x => x.recipeName);

  const recipes: RecipeLine[] = rec.map((r) => ({
    dish: String(r["Gericht"] ?? "").trim(),
    ingredientRecipe: String(r["Zutat (Rezept)"] ?? r["Zutat"] ?? "").trim(),
    qty: toNumber(r["Menge"]),
    unit: String(r["Einheit (g/ml/stk)"] ?? r["Einheit"] ?? "").trim() || null,
    mappedInventory: String(r["Inventur-Zutat (gemappt)"] ?? r["Inventur-Zutat"] ?? "").trim() || null,
    ekBase: toNumber(r["EK aus Inventur (Base)"] ?? r["EK"]),
    cost: toNumber(r["Kosten"]),
    status: String(r["STATUS"] ?? "").trim() || null
  })).filter(x => x.dish && x.ingredientRecipe);

  const dishes: DishRow[] = dis.map((r) => ({
    dish: String(r["Gericht"] ?? "").trim(),
    priceMaster: toNumber(r["Preis (Master)"]),
    priceMenu: toNumber(r["Preis (Speisekarte)"]),
    priceTest: toNumber(r["Preis (Test)"]),
    cogs: toNumber(r["Wareneinsatz (aus Rezept)"] ?? r["Wareneinsatz"]),
    db: toNumber(r["DB € (Test)"] ?? r["DB €"]),
    dbPct: toNumber(r["DB % (Test)"] ?? r["DB %"]),
    status: String(r["STATUS"] ?? "").trim() || null
  })).filter(x => x.dish);

  return { inventory, mapping, recipes, dishes };
}

function sheetToJSON(wb: XLSX.WorkBook, name: string): Record<string, unknown>[] {
  const ws = wb.Sheets[name];
  if (!ws) return [];
  return XLSX.utils.sheet_to_json(ws, { defval: "" }) as Record<string, unknown>[];
}

/** ===== Recalc (robust, fail-safe) ===== */
export function recalcAll(data: AppData): { data: AppData; issues: DataIssue[] } {
  const issues: DataIssue[] = [];

  const invByName = new Map<string, InventoryItem>();
  data.inventory.forEach(i => invByName.set(i.name, i));

  const mapByRecipe = new Map<string, MappingRow>();
  data.mapping.forEach(m => mapByRecipe.set(m.recipeName, m));

  // inventory -> base price
  data.inventory.forEach(inv => {
    if (inv.ekRaw != null && inv.unitRaw) {
      inv.ekBase = ekToBase(inv.ekRaw, inv.unitRaw);
      inv.status = "OK";
    } else {
      inv.ekBase = null;
      inv.status = "FEHLT_EK_ODER_EINHEIT";
    }
  });

  // recipes -> mapping + cost
  const recipes = data.recipes.map(r => {
    const m = mapByRecipe.get(r.ingredientRecipe);
    const mapped = (m?.correction?.trim()) ? m!.correction : (m?.suggestion ?? null);
    r.mappedInventory = mapped;

    if (!r.qty || r.qty <= 0) {
      r.status = "FEHLT_MENGE";
      r.cost = null;
      issues.push({
        type: "MENGE",
        dish: r.dish,
        ingredient: r.ingredientRecipe,
        message: `Menge fehlt: ${r.ingredientRecipe}`,
        actionHint: "Im Gericht-Rezept die Menge eintragen."
      });
      return r;
    }

    if (!mapped) {
      r.status = "FEHLT_MAPPING";
      r.cost = null;
      issues.push({
        type: "MAPPING",
        dish: r.dish,
        ingredient: r.ingredientRecipe,
        message: `Zuordnung fehlt: ${r.ingredientRecipe}`,
        actionHint: "Im Reiter „Mapping“ die Rezept-Zutat zuordnen."
      });
      return r;
    }

    const inv = invByName.get(mapped) ?? null;
    if (!inv || inv.ekBase == null) {
      r.status = "FEHLT_EK";
      r.ekBase = null;
      r.cost = null;
      issues.push({
        type: "EK",
        dish: r.dish,
        ingredient: mapped,
        message: `Einkaufspreis fehlt: ${mapped}`,
        actionHint: "In „Inventur“ EK + Einheit pflegen."
      });
      return r;
    }

    r.ekBase = inv.ekBase;
    r.cost = r.qty * inv.ekBase;  // Menge wird als g/ml/stk interpretiert
    r.status = "OK";
    return r;
  });

  // dishes -> cogs + db
  const recByDish = new Map<string, RecipeLine[]>();
  recipes.forEach(r => {
    const arr = recByDish.get(r.dish) ?? [];
    arr.push(r);
    recByDish.set(r.dish, arr);
  });

  const dishes = data.dishes.map(d => {
    const lines = recByDish.get(d.dish) ?? [];
    const cogs = lines.reduce((s, x) => s + (x.cost ?? 0), 0);
    d.cogs = cogs > 0 ? cogs : null;

    const price = pickPrice(d);
    if (!price || price <= 0) {
      d.status = "FEHLT_PREIS";
      d.db = null; d.dbPct = null;
      issues.push({
        type: "PREIS",
        dish: d.dish,
        message: `Preis fehlt: ${d.dish}`,
        actionHint: "Im Gericht einen Speisekarten- oder Testpreis eintragen."
      });
      return d;
    }

    if (!d.cogs) {
      d.status = "FEHLT_REZEPT";
      d.db = null; d.dbPct = null;
      issues.push({
        type: "REZEPT",
        dish: d.dish,
        message: `Wareneinsatz fehlt (Rezept unvollständig): ${d.dish}`,
        actionHint: "Im Gericht-Rezept fehlende Mengen/Zuordnung ergänzen."
      });
      return d;
    }

    d.db = price - d.cogs;
    d.dbPct = d.db / price;
    d.status = "OK";
    return d;
  });

  return { data: { ...data, recipes, dishes }, issues };
}

/** ===== Export (round-trip) ===== */
export function exportWorkbook(data: AppData): Blob {
  const wb = XLSX.utils.book_new();

  const invRows = data.inventory.map(i => ({
    "Zutat": i.name,
    "EK (wie Inventur)": i.ekRaw ?? "",
    "Einheit (Inventur)": i.unitRaw ?? "",
    "EK für App (€/g, €/ml, €/stk)": i.ekBase ?? "",
    "STATUS": i.status ?? ""
  }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(invRows), "INVENTUR_INPUT");

  const mapRows = data.mapping.map(m => ({
    "Zutat im Rezept": m.recipeName,
    "Vorschlag Inventur-Zutat": m.suggestion ?? "",
    "Inventur-Zutat (Korrektur)": m.correction ?? "",
    "Status": m.status ?? ""
  }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(mapRows), "MAP_ZUTATEN");

  const recRows = data.recipes.map(r => ({
    "Gericht": r.dish,
    "Zutat (Rezept)": r.ingredientRecipe,
    "Menge": r.qty ?? "",
    "Einheit (g/ml/stk)": r.unit ?? "",
    "Inventur-Zutat (gemappt)": r.mappedInventory ?? "",
    "EK aus Inventur (Base)": r.ekBase ?? "",
    "Kosten": r.cost ?? "",
    "STATUS": r.status ?? ""
  }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(recRows), "REZEPTE_BASIS");

  const dishRows = data.dishes.map(d => ({
    "Gericht": d.dish,
    "Preis (Master)": d.priceMaster ?? "",
    "Preis (Speisekarte)": d.priceMenu ?? "",
    "Preis (Test)": d.priceTest ?? "",
    "Wareneinsatz (aus Rezept)": d.cogs ?? "",
    "DB € (Test)": d.db ?? "",
    "DB % (Test)": d.dbPct ?? "",
    "STATUS": d.status ?? ""
  }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(dishRows), "GERICHTE");

  const array = XLSX.write(wb, { type: "array", bookType: "xlsx" });
  return new Blob([array], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}
