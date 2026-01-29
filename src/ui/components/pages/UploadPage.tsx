import React, { useState } from "react";
import { parseHeisseEckeWorkbook } from "../../core/parseWorkbook";
import { useStore } from "../../state/store";

export default function UploadPage() {
  const { setData, updateData, data, baseData } = useStore();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<{ file: File; parsed: any } | null>(null);

  const onFile = async (f: File) => {
    setError(null);
    setPending(null);
    try {
      const buf = await f.arrayBuffer();
      const parsed = parseHeisseEckeWorkbook(buf);
      setPending({ file: f, parsed });
    } catch (e: any) {
      setError(e?.message ?? "Konnte Datei nicht lesen.");
    }
  };

  return (
    <div className="grid">
      <div className="card">
        <div className="h1">1) Excel hochladen</div>
        <div className="small">
          Nimm deine Datei <b>HeisseEcke_WebApp_Datenpaket_FULL.xlsx</b> (oder ein Update davon).
          Danach ist das Dashboard sofort nutzbar.
        </div>

        <div style={{ height: 10 }} />
        <div className="row">
          <input
            type="file"
            accept=".xlsx"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void onFile(f);
            }}
          />

          {data && <span className="pill"><span className="dot ok" /> Datei geladen</span>}
          {error && <span className="pill"><span className="dot bad" /> {error}</span>}
        </div>

        {pending && (
          <>
            <div style={{ height: 12 }} />
            <div className="card">
              <div className="small" style={{ fontWeight: 800 }}>
                Datei erkannt: <span className="badge">{pending.file.name}</span>
              </div>
              <div className="small" style={{ opacity: 0.9, marginTop: 6 }}>
                Entscheide jetzt: komplett ersetzen oder Update (eigene Änderungen behalten).
              </div>

              <div style={{ height: 10 }} />
              <div className="row">
                <button
                  onClick={() => {
                    setData(pending.parsed);
                    setPending(null);
                  }}
                >
                  Neu laden (ersetzen)
                </button>

                <button
                  className="secondary"
                  disabled={!baseData}
                  onClick={() => {
                    updateData(pending.parsed);
                    setPending(null);
                  }}
                  title={!baseData ? "Kein bestehender Stand vorhanden – bitte neu laden." : ""}
                >
                  Update (Änderungen behalten)
                </button>

                <button
                  className="secondary"
                  onClick={() => setPending(null)}
                >
                  Abbrechen
                </button>
              </div>
            </div>
          </>
        )}
      </div>

      <div className="card">
        <div className="h1">Was diese Version kann</div>
        <ul className="small">
          <li>Gerichte anzeigen, Wareneinsatz berechnen, DB live anzeigen.</li>
          <li>Inventurpreise ändern (Outlet) → alle Gerichte rechnen neu.</li>
          <li>Rezeptmengen ändern (global) → Wareneinsatz ändert sich sofort.</li>
          <li>Dezimal-Komma sauber tippen (kein Abschneiden beim Tippen).</li>
          <li>Excel-Update möglich, ohne dass deine Änderungen wegfliegen.</li>
        </ul>
      </div>
    </div>
  );
}
