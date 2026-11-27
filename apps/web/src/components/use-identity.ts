"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { messageFor } from "@/lib/errors";

export type IdentityInput = { firstName: string; lastName: string; employeeId: string };
export type IdentityState = "idle" | "checking" | "verified" | "invalid";

const empty: IdentityInput = { firstName: "", lastName: "", employeeId: "" };
const filled = (i: IdentityInput) => !!(i.firstName.trim() && i.lastName.trim() && i.employeeId.trim());

/** Identity fields persisted in localStorage and verified against /api/identity whenever they change. */
export function useIdentity(storageKey: string, opts: { requireCfo?: boolean } = {}) {
  const [value, setValue] = useState<IdentityInput>(empty);
  const [state, setState] = useState<IdentityState>("idle");
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrate from storage once on mount
      if (raw) setValue({ ...empty, ...JSON.parse(raw) });
    } catch {}
  }, [storageKey]);

  const verify = useCallback(
    async (v: IdentityInput) => {
      if (!filled(v)) {
        setState("idle");
        return false;
      }
      const my = ++seq.current;
      setState("checking");
      setError(null);
      try {
        const res = await fetch("/api/identity", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(v) });
        const body = await res.json();
        if (my !== seq.current) return false;
        if (!res.ok) {
          setState("invalid");
          setError(messageFor(body.code));
          return false;
        }
        if (opts.requireCfo && body.user.role !== "cfo") {
          setState("invalid");
          setError(messageFor("NOT_CFO"));
          return false;
        }
        localStorage.setItem(storageKey, JSON.stringify(v));
        setState("verified");
        return true;
      } catch {
        if (my === seq.current) {
          setState("invalid");
          setError(messageFor("UPSTREAM_ERROR"));
        }
        return false;
      }
    },
    [storageKey, opts.requireCfo],
  );

  // Auto-verify shortly after the user stops typing (stored values verify on load too).
  useEffect(() => {
    if (!filled(value)) return;
    const t = setTimeout(() => void verify(value), 500);
    return () => clearTimeout(t);
  }, [value, verify]);

  const update = (patch: Partial<IdentityInput>) => {
    setValue((v) => ({ ...v, ...patch }));
    setState((s) => (s === "verified" || s === "invalid" ? "idle" : s));
    setError(null);
  };

  const forget = () => {
    localStorage.removeItem(storageKey);
    setValue(empty);
    setState("idle");
  };

  return { value, update, state, error, verify, forget };
}
