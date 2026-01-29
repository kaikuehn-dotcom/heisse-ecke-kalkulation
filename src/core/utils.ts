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

export function norm(s: unknown): string {
  const t = String(s ?? "").toLowerCase().trim();
  return t
    .replace(/[()\[\]{}]/g, " ")
    .replace(/[^a-z0-9äöüß]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function money(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(n);
}

export function pct(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("de-DE", {
    style: "percent",
    maximumFractionDigits: 0,
  }).format(n);
}

export function pickPrice(d: { priceTest?: number | null; priceMenu?: number | null; priceMaster?: number | null }): number | null {
  return (d.priceTest ?? null) ?? (d.priceMenu ?? null) ?? (d.priceMaster ?? null);
}

export function ekToBase(ekRaw: number, unitRaw: string): number {
  const u = unitRaw.toLowerCase().trim();
  if (u === "kg" || u === "l") return ekRaw / 1000;
  return ekRaw; // g/ml/stk already
}

/**
 * Update-Import: neue Excel-Daten einlesen, aber bereits gemachte Änderungen behalten.
 * - Mapping-Korrekturen bleiben
 * - Rezept-Änderungen (qty/unit) bleiben
 * - manuell angelegte Zeilen bleiben (falls nicht im neuen Excel)
 */
export function mergeAppData(oldBase: any, newBase: any) {
  const out = JSON.parse(JSON.stringify(newBase));

  // ---- Mapping: alte corrections übernehmen
  const oldMapByRecipe = new Map<string, any>();
  for (const m of (oldBase?.mapping ?? [])) {
    if (m?.recipeName) oldMapByRecipe.set(String(m.recipeName), m);
  }
  for (const m of (out.mapping ?? [])) {
    const old = oldMapByRecipe.get(String(m.recipeName));
    if (old && old.correction) m.correction = old.correction;
  }
  const newMapNames = new Set((out.mapping ?? []).map((m: any) => String(m.recipeName)));
  for (const old of (oldBase?.mapping ?? [])) {
    if (old?.recipeName && !newMapNames.has(String(old.recipeName))) {
      out.mapping.push(old);
    }
  }

  // ---- Rezepte: alte qty/unit übernehmen (Key: dish + ingredientRecipe)
  const key = (r: any) => `${String(r?.dish ?? "")}__${String(r?.ingredientRecipe ?? "")}`;
  const oldRecipesByKey = new Map<string, any>();
  for (const r of (oldBase?.recipes ?? [])) oldRecipesByKey.set(key(r), r);

  for (const r of (out.recipes ?? [])) {
    const old = oldRecipesByKey.get(key(r));
    if (old) {
      if (old.qty !== undefined) r.qty = old.qty;
      if (old.unit !== undefined) r.unit = old.unit;
    }
  }
  const newRecipeKeys = new Set((out.recipes ?? []).map((r: any) => key(r)));
  for (const old of (oldBase?.recipes ?? [])) {
    const k = key(old);
    if (!newRecipeKeys.has(k)) out.recipes.push(old);
  }

  // ---- Dishes: manuell hinzugefügte Gerichte behalten
  const newDishNames = new Set((out.dishes ?? []).map((d: any) => String(d.dish)));
  for (const old of (oldBase?.dishes ?? [])) {
    const n = String(old?.dish ?? "");
    if (n && !newDishNames.has(n)) out.dishes.push(old);
  }

  // ---- Inventory: manuell hinzugefügte Produkte behalten
  const newInvNames = new Set((out.inventory ?? []).map((i: any) => String(i.name)));
  for (const old of (oldBase?.inventory ?? [])) {
    const n = String(old?.name ?? "");
    if (n && !newInvNames.has(n)) out.inventory.push(old);
  }

  return out;
}
