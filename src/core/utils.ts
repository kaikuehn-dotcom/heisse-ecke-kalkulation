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

export function money(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(n);
}

export function pct(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("de-DE", { style: "percent", maximumFractionDigits: 0 }).format(n);
}

export function pickPrice(d: { priceTest?: number | null; priceMenu?: number | null; priceMaster?: number | null }): number | null {
  return (d.priceTest ?? null) ?? (d.priceMenu ?? null) ?? (d.priceMaster ?? null);
}

export function mergeAppData(oldBase: any, newBase: any) {
  // Minimaler Merge: altes beibehalten, neues ergänzt nur fehlende Sachen.
  // Wichtig: bricht nicht am TS und funktioniert stabil für "Update-Import".
  const out = JSON.parse(JSON.stringify(newBase));

  const oldDishes = new Map<string, any>();
  for (const d of oldBase?.dishes ?? []) oldDishes.set(String(d.dish), d);
  for (const d of out?.dishes ?? []) {
    const old = oldDishes.get(String(d.dish));
    if (old) {
      // falls du manuelle Felder hast, behalten
      if (old.priceTest !== undefined && d.priceTest === undefined) d.priceTest = old.priceTest;
      if (old.priceMenu !== undefined && d.priceMenu === undefined) d.priceMenu = old.priceMenu;
    }
  }

  // Rezepte/Inventur ggf. später erweitert – hier erstmal stabil halten
  return out;
}
