import { Camera, ImagePlus, Send, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { messageFor } from "@/lib/errors";
import { ACCEPT_ATTR, ALLOWED_TYPES, MAX_UPLOAD_BYTES } from "@/lib/files";
import { CATEGORY_LABELS } from "@/lib/labels";
import { COMMENT_MAX } from "@/lib/validation";
import type { IdentityInput } from "./use-identity";
import { Alert, Button, Card, Eyebrow, H2, StatusBadge, money } from "./ui";

type SavedExpense = {
  merchant?: string | null;
  receipt_date?: string | null;
  amount?: number;
  currency?: string;
  category?: string;
  status?: string;
  status_reason?: string;
};

const STEPS = [
  "Проверяваме служителя…",
  "Проверяваме коментара…",
  "AI чете бележката…",
  "Прилагаме фирмената политика…",
  "Записваме разхода…",
];

export function ExpenseForm({
  identity,
  enabled,
  onSaved,
}: {
  identity: IdentityInput;
  enabled: boolean;
  onSaved: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SavedExpense | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const cameraInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- object URL lifecycle is tied to the file
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  useEffect(() => {
    if (!busy) return;
    const t = setInterval(() => setStep((s) => Math.min(s + 1, STEPS.length - 1)), 3500);
    return () => clearInterval(t);
  }, [busy]);

  function pick(f: File | undefined) {
    setError(null);
    setResult(null);
    if (!f) return;
    if (!Object.hasOwn(ALLOWED_TYPES, f.type) && !/\.(jpe?g|png|webp|gif)$/i.test(f.name)) {
      setError(messageFor("INVALID_FILE_TYPE"));
      return;
    }
    if (f.size > MAX_UPLOAD_BYTES) {
      setError(messageFor("FILE_TOO_LARGE"));
      return;
    }
    setFile(f);
  }

  function clearFile() {
    setFile(null);
    setPreview(null);
    if (fileInput.current) fileInput.current.value = "";
    if (cameraInput.current) cameraInput.current.value = "";
  }

  async function submit(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setResult(null);
    if (!file && !comment.trim()) {
      setError(messageFor("EMPTY_SUBMISSION"));
      return;
    }
    const fd = new FormData();
    fd.set("firstName", identity.firstName);
    fd.set("lastName", identity.lastName);
    fd.set("employeeId", identity.employeeId);
    fd.set("comment", comment);
    if (file) fd.set("receipt", file);
    setBusy(true);
    setStep(0);
    try {
      const res = await fetch("/api/expenses", { method: "POST", body: fd });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || body.ok === false) {
        setError(body.message ?? messageFor(body.code));
        return;
      }
      setResult(body.expense ?? {});
      clearFile();
      setComment("");
      onSaved();
    } catch {
      setError(messageFor("UPSTREAM_ERROR"));
    } finally {
      setBusy(false);
    }
  }

  const summary = result
    ? [
        result.merchant,
        result.category && CATEGORY_LABELS[result.category],
        result.amount != null && result.currency ? money(result.amount, result.currency) : null,
        result.receipt_date,
      ]
        .filter(Boolean)
        .join(" · ")
    : "";

  return (
    <Card className={enabled ? "" : "opacity-60"}>
      <Eyebrow>Нов разход</Eyebrow>
      <H2>Качете бележка или опишете разхода</H2>
      {!enabled && <p className="mt-2 text-sm text-c300">Първо потвърдете самоличността си по-горе.</p>}
      <form onSubmit={submit} className="mt-5 grid gap-5" noValidate>
        <fieldset disabled={!enabled || busy} className="grid gap-5 min-w-0">
          <div>
            <span className="block text-sm mb-1.5">
              Снимка на касова бележка <span className="text-c300">(по желание)</span>
            </span>
            {preview ? (
              <div className="relative inline-block">
                {/* eslint-disable-next-line @next/next/no-img-element -- local blob preview */}
                <img src={preview} alt="Преглед на избраната бележка" className="max-h-64 rounded-lg border border-c700" />
                <button
                  type="button"
                  onClick={clearFile}
                  className="absolute top-2 right-2 size-11 inline-flex items-center justify-center rounded-full bg-core/90 border border-c700 hover:border-c500"
                  aria-label="Премахни снимката"
                >
                  <X className="size-4" strokeWidth={2} aria-hidden />
                </button>
              </div>
            ) : (
              <div className="flex flex-wrap gap-3">
                <Button type="button" variant="secondary" onClick={() => fileInput.current?.click()}>
                  <ImagePlus className="size-4" strokeWidth={2} aria-hidden /> Избери файл
                </Button>
                <Button type="button" variant="secondary" className="sm:hidden" onClick={() => cameraInput.current?.click()}>
                  <Camera className="size-4" strokeWidth={2} aria-hidden /> Снимай
                </Button>
              </div>
            )}
            <input
              ref={fileInput}
              type="file"
              name="receipt"
              accept={ACCEPT_ATTR}
              className="sr-only"
              tabIndex={-1}
              aria-label="Файл с бележка"
              onChange={(e) => pick(e.target.files?.[0])}
            />
            <input
              ref={cameraInput}
              type="file"
              accept="image/*"
              capture="environment"
              className="sr-only"
              tabIndex={-1}
              aria-label="Снимка от камерата"
              onChange={(e) => pick(e.target.files?.[0])}
            />
            <p className="mt-1.5 text-xs text-c300">JPG, JPEG, PNG, WEBP или GIF, до 10 MB.</p>
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="comment" className="text-sm">
              Коментар
            </label>
            <textarea
              id="comment"
              name="comment"
              rows={4}
              maxLength={COMMENT_MAX}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="напр. Такси до офиса на клиента, 24 лв."
              className="rounded-lg bg-core border border-c700 hover:border-c500 focus:border-info outline-none px-3 py-2.5 text-[15px] font-normal placeholder:text-c500 resize-y"
              aria-describedby="comment-hint"
            />
            <p id="comment-hint" className="text-xs text-c300">
              Допълнете какво липсва на бележката (търговец, вид разход, повод) или опишете разхода без снимка.
            </p>
          </div>
        </fieldset>

        <div className="flex flex-wrap items-center gap-4">
          <Button type="submit" busy={busy} disabled={!enabled} className="w-full sm:w-auto">
            {!busy && <Send className="size-4" strokeWidth={2} aria-hidden />} Изпрати разхода
          </Button>
          {busy && (
            <p className="font-mono text-xs text-c300" aria-live="polite">
              {STEPS[step]}
            </p>
          )}
        </div>

        {error && <Alert tone="error">{error}</Alert>}
        {result && (
          <Alert tone="success">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <span className="font-medium">Разходът е записан</span>
              {result.status && <StatusBadge status={result.status} />}
            </div>
            {summary && <p className="text-c300">{summary}</p>}
            {result.status_reason && <p className="mt-1">{result.status_reason}</p>}
          </Alert>
        )}
      </form>
    </Card>
  );
}
