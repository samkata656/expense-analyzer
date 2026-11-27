export type ExpenseRow = {
  id: string;
  image_url: string | null;
  merchant: string | null;
  receipt_date: string | null;
  amount: number;
  currency: string;
  amount_eur: number | null;
  category: string;
  status: "approved" | "rejected" | "manual_review";
  status_reason: string;
  description: string | null;
  created_at: string;
};

export type Bucket = { count: number; eur: number };
export type HistorySummary = {
  count: number;
  totalEur: number;
  approvedEur: number;
  /** amounts in currencies other than BGN/EUR are not converted and are counted here */
  unconvertedCount: number;
  byCategory: Record<string, Bucket>;
  byStatus: Record<string, Bucket>;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

export function summarize(rows: ExpenseRow[]): HistorySummary {
  const s: HistorySummary = { count: rows.length, totalEur: 0, approvedEur: 0, unconvertedCount: 0, byCategory: {}, byStatus: {} };
  for (const r of rows) {
    const eur = r.amount_eur ?? 0;
    if (r.amount_eur == null) s.unconvertedCount++;
    s.totalEur += eur;
    if (r.status === "approved") s.approvedEur += eur;
    for (const [map, key] of [[s.byCategory, r.category], [s.byStatus, r.status]] as const) {
      const b = (map[key] ??= { count: 0, eur: 0 });
      b.count++;
      b.eur = round2(b.eur + eur);
    }
  }
  s.totalEur = round2(s.totalEur);
  s.approvedEur = round2(s.approvedEur);
  return s;
}
