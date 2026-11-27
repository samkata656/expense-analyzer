import { ExpenseApp } from "@/components/expense-app";

export default function Home() {
  return (
    <>
      <div className="mb-8">
        <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-signal mb-2">Отчитане на разходи</p>
        <h1 className="text-3xl sm:text-4xl font-bold leading-[1.15] tracking-tight">Снимайте бележката. Останалото е автоматично.</h1>
        <p className="mt-3 text-c300 max-w-2xl">
          AI разчита търговеца, датата и сумата, определя категорията и проверява разхода спрямо фирмената политика.
        </p>
      </div>
      <ExpenseApp />
    </>
  );
}
