import { CheckCircle2, LogOut } from "lucide-react";
import type { useIdentity } from "./use-identity";
import { Button, Card, Eyebrow, Field, H2 } from "./ui";

export function IdentityCard({ id, title, eyebrow }: { id: ReturnType<typeof useIdentity>; title: string; eyebrow: string }) {
  const { value, update, state, error, verify, forget } = id;
  return (
    <Card>
      <div className="flex items-start justify-between gap-4 mb-5">
        <div>
          <Eyebrow>{eyebrow}</Eyebrow>
          <H2>{title}</H2>
        </div>
        {state === "verified" && (
          <span className="inline-flex items-center gap-1.5 text-sm text-success font-normal">
            <CheckCircle2 className="size-4" strokeWidth={2} aria-hidden /> Потвърден
          </span>
        )}
      </div>
      <form
        className="grid gap-4 sm:grid-cols-3"
        onSubmit={(e) => {
          e.preventDefault();
          void verify(value);
        }}
        noValidate
      >
        <Field label="Име" name="firstName" autoComplete="given-name" value={value.firstName} onChange={(e) => update({ firstName: e.target.value })} />
        <Field label="Фамилия" name="lastName" autoComplete="family-name" value={value.lastName} onChange={(e) => update({ lastName: e.target.value })} />
        <Field label="Служебен номер" name="employeeId" autoComplete="off" value={value.employeeId} onChange={(e) => update({ employeeId: e.target.value })} />
        <div className="sm:col-span-3 flex flex-wrap items-center gap-3">
          <Button type="submit" variant="secondary" busy={state === "checking"}>
            Потвърди самоличност
          </Button>
          {state === "verified" && (
            <Button type="button" variant="ghost" onClick={forget}>
              <LogOut className="size-4" strokeWidth={2} aria-hidden /> Смени служител
            </Button>
          )}
          {error && (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          )}
        </div>
      </form>
    </Card>
  );
}
