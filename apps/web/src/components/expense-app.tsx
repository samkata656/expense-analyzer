"use client";
import { useCallback, useEffect, useState } from "react";
import { ExpenseForm } from "./expense-form";
import { History, fetchHistory, type HistoryData } from "./history";
import { IdentityCard } from "./identity-card";
import { useIdentity } from "./use-identity";

export function ExpenseApp() {
  const id = useIdentity("techcorp.identity");
  const verified = id.state === "verified";
  const [history, setHistory] = useState<HistoryData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setHistory(await fetchHistory(id.value));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [id.value]);

  // Load history as soon as the identity becomes valid; clear it when it stops being valid.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sync history with identity validity
    if (verified) void refresh();
    else setHistory(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when verification flips
  }, [verified]);

  return (
    <div className="grid gap-6">
      <IdentityCard id={id} eyebrow="Стъпка 1" title="Кой подава разхода?" />
      <ExpenseForm identity={id.value} enabled={verified} onSaved={refresh} />
      <History enabled={verified} data={history} loading={loading} error={error} onRefresh={refresh} />
    </div>
  );
}
