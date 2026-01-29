import React, { createContext, useContext, useMemo, useState } from "react";
import { mergeAppData } from "../core/utils";

type Store = {
  data: any | null;
  baseData: any | null;
  savedAt: number | null;
  setData: (d: any) => void;       // neu laden (ersetzen)
  updateData: (d: any) => void;    // update laden (alte Änderungen behalten)
  update: (mutator: (base: any) => void) => void;
  clear: () => void;
};

const Ctx = createContext<Store | null>(null);
const LS_KEY = "heisse-ecke-app-state-v1";

function loadSaved() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveSaved(base: any) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify({ base, savedAt: Date.now() }));
  } catch {}
}

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const saved = typeof window !== "undefined" ? loadSaved() : null;

  const [baseData, setBaseData] = useState<any | null>(saved?.base ?? null);
  const [data, setDataState] = useState<any | null>(saved?.base ?? null);
  const [savedAt, setSavedAt] = useState<number | null>(saved?.savedAt ?? null);

  const setData = (d: any) => {
    setBaseData(d);
    setDataState(d);
    saveSaved(d);
    setSavedAt(Date.now());
  };

  const updateData = (d: any) => {
    if (!baseData) {
      setData(d);
      return;
    }
    const merged = mergeAppData(baseData, d);
    setBaseData(merged);
    setDataState(merged);
    saveSaved(merged);
    setSavedAt(Date.now());
  };

  const update = (mutator: (base: any) => void) => {
    if (!baseData) return;
    const clone = JSON.parse(JSON.stringify(baseData));
    mutator(clone);
    setBaseData(clone);
    setDataState(clone);
    saveSaved(clone);
    setSavedAt(Date.now());
  };

  const clear = () => {
    setBaseData(null);
    setDataState(null);
    setSavedAt(null);
    try {
      localStorage.removeItem(LS_KEY);
    } catch {}
  };

  const value = useMemo(
    () => ({ data, baseData, savedAt, setData, updateData, update, clear }),
    [data, baseData, savedAt]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore(): Store {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("StoreProvider fehlt");
  return ctx;
}
