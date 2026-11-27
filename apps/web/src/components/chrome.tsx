import Link from "next/link";

/** Placeholder monogram until the official sB SVG lands in /public/brand. */
export function Monogram({ size = 32 }: { size?: number }) {
  return (
    <span
      aria-hidden
      className="inline-flex items-center justify-center rounded-md bg-c900 border border-c700 font-bold leading-none select-none"
      style={{ width: size, height: size, fontSize: size * 0.5 }}
    >
      <span className="text-paper">s</span>
      <span className="text-signal">B</span>
    </span>
  );
}

export function SiteHeader() {
  return (
    <header className="border-b border-c800">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
        <Link href="/" className="flex items-center gap-3 min-w-0">
          <Monogram />
          <span className="font-semibold tracking-tight truncate">
            TechCorp <span className="hidden sm:inline text-c300 font-normal">· Разходи</span>
          </span>
        </Link>
        <nav className="flex items-center gap-1 text-sm">
          <Link href="/" className="px-2.5 sm:px-3 py-2 rounded-md whitespace-nowrap text-c300 hover:text-paper hover:bg-c900 transition-colors">
            Разходи
          </Link>
          <Link href="/cfo" className="px-2.5 sm:px-3 py-2 rounded-md whitespace-nowrap text-c300 hover:text-paper hover:bg-c900 transition-colors">
            <span className="sm:hidden">Директор</span>
            <span className="hidden sm:inline">Финансов директор</span>
          </Link>
        </nav>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="border-t border-c800">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-5 flex flex-wrap items-center justify-between gap-3 text-xs text-c300">
        <span className="font-mono uppercase tracking-wider">Proof of concept · EAIA</span>
        <a href="https://samkobuilds.com" className="flex items-center gap-2 hover:text-paper transition-colors">
          <Monogram size={20} />
          built by samkoBuilds
        </a>
      </div>
    </footer>
  );
}
