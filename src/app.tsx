import React, { useMemo, useState } from "react";
import type { AppData, MappingRow } from "./core";
import { parseWorkbook, recalcAll, exportWorkbook, money, pct } from "./core";

type Tab = "UPLOAD" | "INVENTUR" | "MAPPING" | "GERICHTE";

export default function App() {
  const [tab, setTab] = useState<Tab>("UPLOAD");
  const [rawParsed, setRawParsed] = useState<AppData | null>(null);
  const [data, setData] = useState<AppData | null>(null);
  const [issues, setIssues] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [dishSearch, setDishSearch] = useState("");

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

  function safeSetAll(next: AppData) {
    const { data: recalced, issues: recalcedIssues } = recalcAll(next);
    setData(recalced);
    setIssues(recalcedIssues);
  }

  async function onUpload(file: File) {
    try {
      setError(null);

      // Quick sanity
      if (!file.name.toLowerCase().endsWith(".xlsx") && !file.name.toLowerCase().endsWith(".xls")) {
        throw new Error("Bitte eine Excel-Datei (.xlsx/.xls) hochladen.");
      }

      const buf = await file.arrayBuffer();
      const parsed = parseWorkbook(buf);

      // Recalc
      setRawParsed(parsed);
      safeSetAll(parsed);

      // Jump to Mapping so you can fix wrong assignments fast
      setTab("MAPPING");
    } catch (e: any) {
      setError(e?.message ?? "Unbekannter Fehler beim Einlesen.");
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

  /** Apply mapping correction (ingredient -> inventory article) to all recipe lines of that ingredient */
  function applyMapping(recipeName: string, inventoryName: string | null) {
    if (!data) return;

    const next: AppData = JSON.parse(JSON.stringify(data));
    // Update mapping table
    const m = next.mapping.find((x) => x.recipeName === recipeName);
    if (m) {
      m.correction = inventoryName;
      m.status = inventoryName ? "OK" : "PRÜFEN";
    }

    // Push correction into recipe lines (so recalcAll will use it without changing core.ts)
    for (const r of next.recipes) {
      if (r.ingredientRecipe === recipeName) {
        r.inventoryItemSelected = inventoryName;
      }
    }

    safeSetAll(next);
  }

  function resetToOriginal() {
    if (!rawParsed) return;
    safeSetAll(rawParsed);
    setTab("MAPPING");
  }

  /** UI helpers */
  const Badge = ({ text, tone }: { text: string; tone: "ok" | "warn" | "bad" }) => {
    const bg =
      tone === "ok" ? "#e7f7ea" : tone === "warn" ? "#fff4e5" : "#fde7ea";
    const bd =
      tone === "ok" ? "#7fd18a" : tone === "warn" ? "#f0b35a" : "#e57a85";
    return (
      <span
        style={{
          display: "inline-block",
          padding: "2px 8px",
          borderRadius: 999,
          background: bg,
          border: `1px solid ${bd}`,
          fontSize: 12,
          whiteSpace: "nowrap",
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
        ? "#1f4e79"
        : tone === "danger"
        ? "#b42318"
        : "transparent";
    const color = tone === "ghost" ? "#1f4e79" : "#fff";
    const border = tone === "ghost" ? "1px solid #1f4e79" : "1px solid transparent";
    return (
      <button
        onClick={onClick}
        disabled={disabled}
        style={{
          padding: "10px 12px",
          borderRadius: 10,
          border,
          background: disabled ? "#d0d5dd" : bg,
          color: disabled ? "#667085" : color,
          cursor: disabled ? "not-allowed" : "pointer",
          fontWeight: 700,
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
        borderRadius: 10,
        border: tab === id ? "2px solid #1f4e79" : "1px solid #d0d5dd",
        background: tab === id ? "#eef4ff" : "#fff",
        cursor: "pointer",
        fontWeight: 800,
      }}
    >
      {label}
    </button>
  );

  /** Derived KPIs */
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

  return (
    <div style={{ fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial", padding: 18, maxWidth: 1200, margin: "0 auto" }}>
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 900 }}>Heiße Ecke – Kalkulation (Single Outlet)</div>
          <div style={{ color: "#667085", fontWeight: 600 }}>Upload → Daten prüfen → Mapping fixen → WE/DB sauber sehen</div>
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <TabBtn id="UPLOAD" label="1) Upload" />
          <TabBtn id="INVENTUR" label="2) Inventur" />
          <TabBtn id="MAPPING" label="3) Zuordnung" />
          <TabBtn id="GERICHTE" label="4) Gerichte" />
          <Button tone="ghost" onClick={downloadExport} disabled={!data}>
            Export Excel
          </Button>
          <Button tone="danger" onClick={resetToOriginal} disabled={!rawParsed}>
            Reset auf Original
          </Button>
        </div>
      </header>

      {/* KPIs */}
      <section style={{ marginTop: 14, display: "grid", gridTemplateColumns: "repeat(6, minmax(0, 1fr))", gap: 10 }}>
        <div style={{ padding: 12, border: "1px solid #d0d5dd", borderRadius: 12 }}>
          <div style={{ color: "#667085", fontWeight: 700 }}>Inventur</div>
          <div style={{ fontSize: 18, fontWeight: 900 }}>{kpi.invCount}</div>
          <div style={{ marginTop: 6 }}>
            {kpi.invIssues === 0 ? <Badge text="OK" tone="ok" /> : <Badge text={`${kpi.invIssues} Probleme`} tone="bad" />}
          </div>
        </div>

        <div style={{ padding: 12, border: "1px solid #d0d5dd", borderRadius: 12 }}>
          <div style={{ color: "#667085", fontWeight: 700 }}>Rezeptzeilen</div>
          <div style={{ fontSize: 18, fontWeight: 900 }}>{kpi.recipeCount}</div>
          <div style={{ marginTop: 6 }}>
            {kpi.recipeIssues === 0 ? <Badge text="OK" tone="ok" /> : <Badge text={`${kpi.recipeIssues} Probleme`} tone="bad" />}
          </div>
        </div>

        <div style={{ padding: 12, border: "1px solid #d0d5dd", borderRadius: 12 }}>
          <div style={{ color: "#667085", fontWeight: 700 }}>Gerichte</div>
          <div style={{ fontSize: 18, fontWeight: 900 }}>{kpi.dishCount}</div>
          <div style={{ marginTop: 6 }}>
            {kpi.dishIssues === 0 ? <Badge text="OK" tone="ok" /> : <Badge text={`${kpi.dishIssues} Probleme`} tone="bad" />}
          </div>
        </div>

        <div style={{ gridColumn: "span 3", padding: 12, border: "1px solid #d0d5dd", borderRadius: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <div>
              <div style={{ color: "#667085", fontWeight: 800 }}>Letzte Fehlermeldung</div>
              <div style={{ marginTop: 4, fontWeight: 700 }}>
                {error ? <span style={{ color: "#b42318" }}>{error}</span> : <span style={{ color: "#12b76a" }}>—</span>}
              </div>
            </div>

            <div style={{ maxWidth: 520 }}>
              <div style={{ color: "#667085", fontWeight: 800 }}>Hinweis</div>
              <div style={{ marginTop: 4, color: "#344054", fontWeight: 600 }}>
                Wenn WE “1500€” zeigt, fehlt fast immer <b>Ziel-Einheit</b> oder <b>Packungsinhalt</b> in der Inventur.
                Dann wird pro Packung statt pro g/ml gerechnet.
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Issues list (compact) */}
      {issues.length > 0 && (
        <section style={{ marginTop: 12, padding: 12, border: "1px solid #fecaca", borderRadius: 12, background: "#fff5f5" }}>
          <div style={{ fontWeight: 900, color: "#b42318" }}>Probleme (Auszug):</div>
          <ul style={{ marginTop: 8, marginBottom: 0, paddingLeft: 18 }}>
            {issues.slice(0, 8).map((x, idx) => (
              <li key={idx} style={{ color: "#7a271a", fontWeight: 650 }}>{x}</li>
            ))}
          </ul>
        </section>
      )}

      {/* TABS */}
      <main style={{ marginTop: 16 }}>
        {tab === "UPLOAD" && (
          <section style={{ padding: 14, border: "1px solid #d0d5dd", borderRadius: 12 }}>
            <div style={{ fontWeight: 900, fontSize: 18 }}>1) Excel hochladen</div>
            <div style={{ color: "#667085", fontWeight: 650, marginTop: 6 }}>
              Unterstützt zwei Formate:
              <div style={{ marginTop: 6 }}>
                • <b>NEU (menschlich)</b>: <code>01_INVENTUR</code> + Tabs pro Gericht<br />
                • <b>ALT</b>: <code>INVENTUR_INPUT</code>, <code>REZEPTE_BASIS</code>, <code>GERICHTE</code>
              </div>
            </div>

            <div style={{ marginTop: 14, display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
              <input
                type="file"
                accept=".xlsx,.xls"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) onUpload(f);
                }}
              />
              <Button tone="ghost" onClick={() => setTab("MAPPING")} disabled={!data}>
                Direkt zur Zuordnung
              </Button>
            </div>
          </section>
        )}

        {tab === "INVENTUR" && (
          <section style={{ padding: 14, border: "1px solid #d0d5dd", borderRadius: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <div>
                <div style={{ fontWeight: 900, fontSize: 18 }}>2) Inventur</div>
                <div style={{ color: "#667085", fontWeight: 650, marginTop: 6 }}>
                  Hier siehst du, ob Ziel-Einheit / Packungsinhalt fehlen (das erzeugt Horrorwerte).
                </div>
              </div>
            </div>

            {!data ? (
              <div style={{ marginTop: 12, color: "#667085", fontWeight: 700 }}>Bitte erst eine Excel hochladen.</div>
            ) : (
              <div style={{ marginTop: 12, overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: "#f2f4f7" }}>
                      <th style={th}>Warengruppe</th>
                      <th style={th}>Artikel</th>
                      <th style={th}>EK (raw)</th>
                      <th style={th}>Einheit (raw)</th>
                      <th style={th}>Ziel</th>
                      <th style={th}>Pack (Ziel)</th>
                      <th style={th}>€/Basis</th>
                      <th style={th}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.inventory.slice(0, 300).map((it, idx) => (
                      <tr key={idx} style={{ borderTop: "1px solid #eaecf0" }}>
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

                <div style={{ marginTop: 10, color: "#667085", fontWeight: 650 }}>
                  Anzeige ist auf 300 Zeilen begrenzt (Performance). Export zeigt alles.
                </div>
              </div>
            )}
          </section>
        )}

        {tab === "MAPPING" && (
          <section style={{ padding: 14, border: "1px solid #d0d5dd", borderRadius: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <div>
                <div style={{ fontWeight: 900, fontSize: 18 }}>3) Zuordnung (Rezept-Zutat → Inventur-Artikel)</div>
                <div style={{ color: "#667085", fontWeight: 650, marginTop: 6 }}>
                  Genau hier fixst du falsche Zuordnungen. Sobald du auswählst, rechnet WE/DB sofort neu.
                </div>
              </div>

              <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                <input
                  placeholder="Suche Zutat…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  style={{
                    padding: "10px 12px",
                    borderRadius: 10,
                    border: "1px solid #d0d5dd",
                    minWidth: 240,
                    fontWeight: 700,
                  }}
                />
                <Button tone="ghost" onClick={() => setTab("GERICHTE")} disabled={!data}>
                  Weiter zu Gerichten
                </Button>
              </div>
            </div>

            {!data ? (
              <div style={{ marginTop: 12, color: "#667085", fontWeight: 700 }}>Bitte erst eine Excel hochladen.</div>
            ) : (
              <div style={{ marginTop: 12, overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: "#f2f4f7" }}>
                      <th style={th}>Rezept-Zutat</th>
                      <th style={th}>Vorschlag</th>
                      <th style={th}>Deine Auswahl</th>
                      <th style={th}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.mapping
                      .filter((m) => {
                        const s = search.trim().toLowerCase();
                        if (!s) return true;
                        return m.recipeName.toLowerCase().includes(s);
                      })
                      .slice(0, 400)
                      .map((m, idx) => {
                        const selected = m.correction ?? "";
                        return (
                          <tr key={idx} style={{ borderTop: "1px solid #eaecf0" }}>
                            <td style={tdStrong}>{m.recipeName}</td>
                            <td style={td}>{m.suggestion ?? "—"}</td>
                            <td style={td}>
                              <select
                                value={selected}
                                onChange={(e) => {
                                  const v = e.target.value;
                                  applyMapping(m.recipeName, v ? v : null);
                                }}
                                style={{
                                  width: "100%",
                                  padding: "8px 10px",
                                  borderRadius: 10,
                                  border: "1px solid #d0d5dd",
                                  fontWeight: 700,
                                }}
                              >
                                <option value="">— auswählen —</option>
                                {invNames.map((n) => (
                                  <option key={n} value={n}>
                                    {n}
                                  </option>
                                ))}
                              </select>
                            </td>
                            <td style={td}>
                              {m.status === "OK" ? <Badge text="OK" tone="ok" /> : <Badge text="PRÜFEN" tone="warn" />}
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>

                <div style={{ marginTop: 10, color: "#667085", fontWeight: 650 }}>
                  Anzeige ist auf 400 Zeilen begrenzt. Nutze Suche.
                </div>
              </div>
            )}
          </section>
        )}

        {tab === "GERICHTE" && (
          <section style={{ padding: 14, border: "1px solid #d0d5dd", borderRadius: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <div>
                <div style={{ fontWeight: 900, fontSize: 18 }}>4) Gerichte – Wareneinsatz & DB</div>
                <div style={{ color: "#667085", fontWeight: 650, marginTop: 6 }}>
                  Wenn hier noch Horrorwerte stehen, ist fast immer Inventur-Ziel-Einheit/Packungsinhalt nicht gepflegt.
                </div>
              </div>

              <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                <input
                  placeholder="Suche Gericht…"
                  value={dishSearch}
                  onChange={(e) => setDishSearch(e.target.value)}
                  style={{
                    padding: "10px 12px",
                    borderRadius: 10,
                    border: "1px solid #d0d5dd",
                    minWidth: 240,
                    fontWeight: 700,
                  }}
                />
                <Button tone="ghost" onClick={() => setTab("INVENTUR")} disabled={!data}>
                  Zurück zur Inventur
                </Button>
              </div>
            </div>

            {!data ? (
              <div style={{ marginTop: 12, color: "#667085", fontWeight: 700 }}>Bitte erst eine Excel hochladen.</div>
            ) : (
              <div style={{ marginTop: 12, overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: "#f2f4f7" }}>
                      <th style={th}>Gericht</th>
                      <th style={th}>Preis (Master)</th>
                      <th style={th}>Preis (Menü)</th>
                      <th style={th}>Preis (Test)</th>
                      <th style={th}>WE / Einheit</th>
                      <th style={th}>DB / Einheit</th>
                      <th style={th}>DB %</th>
                      <th style={th}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dishRows.map((d, idx) => (
                      <tr key={idx} style={{ borderTop: "1px solid #eaecf0" }}>
                        <td style={tdStrong}>{d.dish}</td>
                        <td style={td}>{d.priceMaster ?? "—"}</td>
                        <td style={td}>{d.priceMenu ?? "—"}</td>
                        <td style={td}>{d.priceTest ?? "—"}</td>
                        <td style={td}>{d.cogs === null ? "—" : money(d.cogs)}</td>
                        <td style={td}>{d.db === null ? "—" : money(d.db)}</td>
                        <td style={td}>{d.dbPct === null ? "—" : pct(d.dbPct)}</td>
                        <td style={td}>
                          {d.status ? <Badge text={d.status} tone="bad" /> : <Badge text="OK" tone="ok" />}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}
      </main>
    </div>
  );
}

/** Simple table styles */
const th: React.CSSProperties = {
  textAlign: "left",
  padding: "10px 10px",
  borderBottom: "1px solid #eaecf0",
  fontWeight: 900,
  color: "#344054",
  whiteSpace: "nowrap",
};

const td: React.CSSProperties = {
  textAlign: "left",
  padding: "10px 10px",
  color: "#344054",
  fontWeight: 650,
  verticalAlign: "top",
};

const tdStrong: React.CSSProperties = {
  ...td,
  fontWeight: 900,
};
