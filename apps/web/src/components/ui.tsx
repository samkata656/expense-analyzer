"use client";
import { forwardRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from "react";
import { STATUS_LABELS } from "@/lib/labels";

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-xl bg-c900 border border-c800 p-5 sm:p-6 ${className}`}>{children}</section>;
}

export function Eyebrow({ children }: { children: ReactNode }) {
  return <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-c300 mb-1">{children}</p>;
}

export function H2({ children }: { children: ReactNode }) {
  return <h2 className="text-lg sm:text-xl font-semibold leading-tight">{children}</h2>;
}

type FieldProps = InputHTMLAttributes<HTMLInputElement> & { label: string; error?: string; hint?: string };
export const Field = forwardRef<HTMLInputElement, FieldProps>(function Field({ label, error, hint, id, className = "", ...rest }, ref) {
  const inputId = id ?? rest.name;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={inputId} className="text-sm font-normal text-paper">
        {label}
      </label>
      <input
        ref={ref}
        id={inputId}
        aria-invalid={!!error}
        aria-describedby={error ? `${inputId}-err` : hint ? `${inputId}-hint` : undefined}
        className={`h-11 rounded-lg bg-core border px-3 text-[15px] font-normal text-paper placeholder:text-c500 outline-none transition-colors
          ${error ? "border-danger" : "border-c700 hover:border-c500 focus:border-info"} ${className}`}
        {...rest}
      />
      {error ? (
        <p id={`${inputId}-err`} className="text-xs text-danger">
          {error}
        </p>
      ) : hint ? (
        <p id={`${inputId}-hint`} className="text-xs text-c300">
          {hint}
        </p>
      ) : null}
    </div>
  );
});

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "ghost"; busy?: boolean };
export function Button({ variant = "primary", busy, children, className = "", disabled, ...rest }: BtnProps) {
  const styles = {
    primary: "bg-signal text-core font-medium hover:bg-signal-hover",
    secondary: "bg-c800 text-paper border border-c700 hover:border-c500",
    ghost: "text-c300 hover:text-paper hover:bg-c800",
  }[variant];
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 h-11 px-4 rounded-lg text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${styles} ${className}`}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      {...rest}
    >
      {busy && <span className="size-4 rounded-full border-2 border-current border-t-transparent animate-spin" aria-hidden />}
      {children}
    </button>
  );
}

const STATUS_STYLE: Record<string, string> = {
  approved: "text-success border-success/40 bg-success/10",
  rejected: "text-danger border-danger/40 bg-danger/10",
  manual_review: "text-warning border-warning/40 bg-warning/10",
};
export function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded border font-mono text-[11px] uppercase tracking-wider whitespace-nowrap ${STATUS_STYLE[status] ?? "text-c300 border-c700"}`}>
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}

export function Alert({ tone, children }: { tone: "error" | "success" | "info"; children: ReactNode }) {
  const c = { error: "border-danger/50 text-paper bg-danger/10", success: "border-success/50 bg-success/10", info: "border-info/50 bg-info/10" }[tone];
  return (
    <div role={tone === "error" ? "alert" : "status"} className={`rounded-lg border px-4 py-3 text-sm ${c}`}>
      {children}
    </div>
  );
}

export const eur = (n: number) =>
  new Intl.NumberFormat("bg-BG", { style: "currency", currency: "EUR", minimumFractionDigits: 2 }).format(n);
export const money = (n: number, cur: string) => {
  try {
    return new Intl.NumberFormat("bg-BG", { style: "currency", currency: cur, minimumFractionDigits: 2 }).format(n);
  } catch {
    return `${n.toFixed(2)} ${cur}`;
  }
};
