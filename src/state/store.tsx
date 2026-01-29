import React, { createContext, useContext, useMemo, useState } from "react";
import { AppData, DataIssue, OutletState } from "../core/types";
import { recalcAll } from "../core/calc";
import { applyOutlet, initialOutletState, makeId } from "../core/outlets";
import { mergeAppData } from "../core/utils";

type StoreState = {
  base: AppData | null;        // as imported (recipes + master prices)
  computed: AppData | null;    // base + outlet overrides + recalculated
  issues: DataIssue[];
  outlet: OutletState;
  savedAt?: number | null;
};

type Store = {
  data: AppData | null;        // computed data (for current outlet)
  baseData: AppData | null;
  issues: DataIssue[];
  outlet: OutletState;
  savedAt?: number | null;
  setData: (d: AppData) => void;                 // replace import
  updateData: (d: AppData) => void;              // merge import
  update: (mutator: (s: { base: AppData; outlet: OutletState }) => void) => void;
  clear: () => void;
  selectOutlet: (id: string) => void;
  addOutlet: (name: string) => void;
};

const Ctx = createContext<Store | null>(null);

const LS_KEY = "heisse-ecke-mvp-state-v1";

function loadState(): Partial<StoreState> | null {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function saveState(s: StoreState) {
  try {
    const payload = { base: s.base, outlet: s.outlet, savedAt: Date.now() };
    localStorage.setItem(LS_KEY, JSON.stringify(payload));
  } catch {}
}

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const saved = typeof window !== "undefined" ? loadState() : null;

  const [base, setBase] = useState<AppData | null>((saved?.base as any) ?? null);
  const [outlet, setOutlet] = useState<OutletState>((saved?.outlet as any) ?? initialOutletState());
  const [computed, setComputed] = useState<AppData | null>(null);
  const [issues, setIssues] = useState<DataIssue[]>([]);
  const [savedAt, setSavedAt] = useState<number | null>((saved?.savedAt as any) ?? null);

  const recompute = (b: AppData, o: OutletState) => {
    const ov = o.overridesByOutletId[o.selectedOutletId] ?? { inventory: {}, prices: {} };
    const applied = applyOutlet(b, ov);
    const out = recalcAll(applied);
    setComputed(out.data);
    setIssues(out.issues);
    saveState({ base: b, outlet: o, computed: out.data, issues: out.issues });
    setSavedAt(Date.now());
  };

  const setData = (d: AppData) => {
    setBase(d);
    const st = outlet.outlets.length ? outlet : initialOutletState();
    setOutlet(st);
    recompute(d, st);
  };

  const updateData = (d: AppData) => {
    // Update-Import: Master/Excel neu, aber eigene Änderungen behalten
    if (!base) {
      setData(d);
      return;
    }
    const merged = mergeAppData(base, d) as AppData;
    setBase(merged);
    const st = outlet.outlets.length ? outlet : initialOutletState();
    setOutlet(st);
    recompute(merged, st);
  };

  const update = (mutator: (s: { base: AppData; outlet: OutletState }) => void) => {
    if (!base) return;
    const b: AppData = JSON.parse(JSON.stringify(base));
    const o: OutletState = JSON.parse(JSON.stringify(outlet));
    mutator({ base: b, outlet: o });
    setBase(b);
    setOutlet(o);
    recompute(b, o);
  };

  const clear = () => {
    setBase(null);
    setComputed(null);
    setIssues([]);
    setOutlet(initialOutletState());
    setSavedAt(null);
    try { localStorage.removeItem(LS_KEY); } catch {}
  };

  const selectOutlet = (id: string) => {
    if (!base) {
      setOutlet((o) => ({ ...o, selectedOutletId: id }));
      return;
    }
    const o: OutletState = JSON.parse(JSON.stringify(outlet));
    o.selectedOutletId = id;
    setOutlet(o);
    recompute(base, o);
  };

  const addOutlet = (name: string) => {
    const id = makeId();
    const o: OutletState = JSON.parse(JSON.stringify(outlet));
    o.outlets.push({ id, name, createdAt: Date.now() });
    o.overridesByOutletId[id] = { inventory: {}, prices: {} };
    o.selectedOutletId = id;
    setOutlet(o);
    if (base) recompute(base, o);
  };

  const value = useMemo<Store>(() => ({
    data: computed,
    baseData: base,
    issues,
    outlet,
    savedAt,
    setData,
    updateData,
    update,
    clear,
    selectOutlet,
    addOutlet,
  }), [computed, base, issues, outlet, savedAt]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore(): Store {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("StoreProvider fehlt");
  return ctx;
}
