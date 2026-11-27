import type { Metadata } from "next";
import { CfoChat } from "@/components/cfo-chat";

export const metadata: Metadata = { title: "Финансов директор · TechCorp" };

export default function CfoPage() {
  return (
    <>
      <div className="mb-8">
        <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-signal mb-2">Само за финансовия директор</p>
        <h1 className="text-3xl sm:text-4xl font-bold leading-[1.15] tracking-tight">Разходите на екипа, с един въпрос.</h1>
        <p className="mt-3 text-c300 max-w-2xl">Асистентът има достъп само за четене до базата с разходи и отговаря на български.</p>
      </div>
      <CfoChat />
    </>
  );
}
