import { ImageIcon, RefreshCw } from "lucide-react";
import { messageFor } from "@/lib/errors";
import type { ExpenseRow, HistorySummary } from "@/lib/history";
import { CATEGORY_LABELS, STATUS_LABELS } from "@/lib/labels";
import { Alert, Button, Card, Eyebrow, H2, StatusBadge, eur, money } from "./ui";

export type HistoryData = { expenses: ExpenseRow[]; summary: HistorySummary };

export async function fetchHistory(identity: object): Promise<HistoryData> {
  const res = await fetch("/api/history", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(identity),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(messageFor(body.code));
  return body;
}

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg bg-c800 border border-c700 p-4 min-w-0">
      <p className="font-mono text-[11px] uppercase tracking-wider text-c300">{label}</p>
      <p className="mt-1 text-xl sm:text-2xl font-semibold tabular-nums truncate">{value}</p>
      {sub && <p className="text-xs text-c300 mt-0.5">{sub}</p>}
    </div>
  );
}

function Breakdown({ title, data, labels }: { title: string; data: HistorySummary["byCategory"]; labels: Record<string, string> }) {
  const entries = Object.entries(data).sort((a, b) => b[1].eur - a[1].eur);
  const max = Math.max(1, ...entries.map(([, b]) => b.eur));
  return (
    <div>
      <h3 className="text-sm font-medium mb-3">{title}</h3>
      <ul className="grid gap-2.5">
        {entries.map(([key, b]) => (
          <li key={key} className="grid gap-1">
            <div className="flex justify-between gap-3 text-sm">
              <span className="truncate">{labels[key] ?? key}</span>
              <span className="tabular-nums text-c300 whitespace-nowrap">
                {eur(b.eur)} · {b.count}
              </span>
            </div>
            <div className="h-1.5 rounded-full bg-c800 overflow-hidden">
              <div
                className={`h-full rounded-full ${key === "approved" ? "bg-success" : key === "rejected" ? "bg-danger" : key === "manual_review" ? "bg-warning" : "bg-c300"}`}
                style={{ width: `${Math.max(2, (b.eur / max) * 100)}%` }}
              />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function History({
  enabled,
  data,
  loading,
  error,
  onRefresh,
}: {
  enabled: boolean;
  data: HistoryData | null;
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
}) {
  const s = data?.summary;
  return (
    <Card>
      <div className="flex items-start justify-between gap-4 mb-5">
        <div>
          <Eyebrow>История</Eyebrow>
          <H2>Вашите разходи</H2>
        </div>
        <Button variant="secondary" onClick={onRefresh} disabled={!enabled} busy={loading} aria-label="Обнови историята">
          {!loading && <RefreshCw className="size-4" strokeWidth={2} aria-hidden />}
          <span className="hidden sm:inline">Обнови</span>
        </Button>
      </div>

      {!enabled && <p className="text-sm text-c300">Историята се зарежда след потвърждаване на самоличността.</p>}
      {error && <Alert tone="error">{error}</Alert>}

      {enabled && !data && loading && (
        <div className="grid gap-3 sm:grid-cols-3" aria-hidden>
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-24 rounded-lg bg-c800 animate-pulse" />
          ))}
        </div>
      )}

      {s && data && data.expenses.length === 0 && (
        <div className="rounded-lg border border-dashed border-c700 p-6 text-center">
          <p className="font-medium">Все още нямате разходи</p>
          <p className="text-sm text-c300 mt-1">Изпратете първата си бележка от формата по-горе.</p>
        </div>
      )}

      {s && data && data.expenses.length > 0 && (
        <div className="grid gap-6">
          <div className="grid gap-3 grid-cols-2 sm:grid-cols-3">
            <Tile label="Общо похарчени" value={eur(s.totalEur)} sub={s.unconvertedCount ? `+${s.unconvertedCount} в друга валута` : undefined} />
            <Tile label="Одобрени" value={eur(s.approvedEur)} />
            <Tile label="Брой разходи" value={String(s.count)} />
          </div>
          <div className="grid gap-6 md:grid-cols-2">
            <Breakdown title="По категория" data={s.byCategory} labels={CATEGORY_LABELS} />
            <Breakdown title="По статус" data={s.byStatus} labels={STATUS_LABELS} />
          </div>

          {/* Desktop table */}
          <div className="hidden md:block overflow-x-auto -mx-2">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left font-mono text-[11px] uppercase tracking-wider text-c300 border-b border-c700">
                  <th className="px-2 py-2 font-normal">Дата</th>
                  <th className="px-2 py-2 font-normal">Търговец</th>
                  <th className="px-2 py-2 font-normal">Категория</th>
                  <th className="px-2 py-2 font-normal text-right">Сума</th>
                  <th className="px-2 py-2 font-normal">Статус</th>
                  <th className="px-2 py-2 font-normal sr-only">Снимка</th>
                </tr>
              </thead>
              <tbody>
                {data.expenses.map((e) => (
                  <tr key={e.id} className="border-b border-c800 align-top">
                    <td className="px-2 py-3 whitespace-nowrap tabular-nums">{e.receipt_date ?? "—"}</td>
                    <td className="px-2 py-3">{e.merchant ?? "—"}</td>
                    <td className="px-2 py-3">{CATEGORY_LABELS[e.category] ?? e.category}</td>
                    <td className="px-2 py-3 text-right tabular-nums whitespace-nowrap">{money(e.amount, e.currency)}</td>
                    <td className="px-2 py-3">
                      <StatusBadge status={e.status} />
                      <p className="text-xs text-c300 mt-1 max-w-xs">{e.status_reason}</p>
                    </td>
                    <td className="px-2 py-3">
                      {e.image_url && (
                        <a href={e.image_url} target="_blank" rel="noreferrer" className="inline-flex size-9 items-center justify-center rounded-md text-info hover:bg-c800" aria-label="Отвори снимката">
                          <ImageIcon className="size-4" strokeWidth={2} aria-hidden />
                        </a>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <ul className="md:hidden grid gap-3">
            {data.expenses.map((e) => (
              <li key={e.id} className="rounded-lg bg-c800 border border-c700 p-4">
                <div className="flex justify-between gap-3">
                  <span className="font-medium truncate">{e.merchant ?? CATEGORY_LABELS[e.category]}</span>
                  <span className="tabular-nums whitespace-nowrap">{money(e.amount, e.currency)}</span>
                </div>
                <p className="text-xs text-c300 mt-0.5">
                  {CATEGORY_LABELS[e.category]} · {e.receipt_date ?? "без дата"}
                </p>
                <div className="mt-2 flex items-center justify-between gap-3">
                  <StatusBadge status={e.status} />
                  {e.image_url && (
                    <a href={e.image_url} target="_blank" rel="noreferrer" className="text-sm text-info">
                      Снимка
                    </a>
                  )}
                </div>
                <p className="text-xs text-c300 mt-2">{e.status_reason}</p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}
