import React, { useState } from "react";
import { useStore } from "../../../state/store";

export default function UploadPage() {
  const { setData, updateData, baseData, clear, savedAt } = useStore();
  const [error, setError] = useState<string | null>(null);

  const onJsonFile = async (f: File) => {
    setError(null);
    try {
      const txt = await f.text();
      const parsed = JSON.parse(txt);
      setData(parsed);
    } catch (e: any) {
      setError(e?.message ?? "Konnte Datei nicht lesen.");
    }
  };

  const onJsonUpdate = async (f: File) => {
    setError(null);
    try {
      const txt = await f.text();
      const parsed = JSON.parse(txt);
      updateData(parsed);
    } catch (e: any) {
      setError(e?.message ?? "Konnte Datei nicht lesen.");
    }
  };

  return (
    <div className="card">
      <div className="h1">Upload</div>
      <div className="small">
        Für den Moment laden wir <b>JSON</b> (damit Vercel sauber deployt).
        Excel-Parsing bauen wir als nächstes wieder ein – aber erst wenn das Projekt stabil baut.
      </div>

      <div style={{ height: 10 }} />

      <div className="card">
        <div className="small" style={{ fontWeight: 800 }}>Neu laden (ersetzen)</div>
        <input
          type="file"
          accept=".json,application/json"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void onJsonFile(f);
          }}
        />
      </div>

      <div style={{ height: 10 }} />

      <div className="card">
        <div className="small" style={{ fontWeight: 800 }}>Update laden (Änderungen behalten)</div>
        <input
          type="file"
          accept=".json,application/json"
          disabled={!baseData}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void onJsonUpdate(f);
          }}
        />
        knowing: {baseData ? "Update möglich" : "erst neu laden"}
      </div>

      <div style={{ height: 10 }} />

      <div className="row" style={{ gap: 12 }}>
        <button className="secondary" onClick={clear}>Alles löschen</button>
        <span className="small" style={{ opacity: 0.8 }}>
          Letzte Speicherung: {savedAt ? new Date(savedAt).toLocaleString("de-DE") : "—"}
        </span>
      </div>

      {error && (
        <div style={{ marginTop: 10 }} className="pill">
          <span className="dot bad" /> {error}
        </div>
      )}
    </div>
  );
}
