import type { Metadata, Viewport } from "next";
import { JetBrains_Mono, Montserrat } from "next/font/google";
import { SiteFooter, SiteHeader } from "@/components/chrome";
import "./globals.css";

const montserrat = Montserrat({
  subsets: ["latin", "cyrillic"],
  weight: ["300", "400", "500", "600", "700"],
  variable: "--font-montserrat",
});
const jetbrains = JetBrains_Mono({ subsets: ["latin", "cyrillic"], weight: ["400", "500"], variable: "--font-jetbrains" });

export const metadata: Metadata = {
  title: "TechCorp · Разходи",
  description: "Качете касова бележка или опишете разход. AI извлича данните и проверява фирмената политика.",
};

export const viewport: Viewport = { themeColor: "#0d0d0f", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="bg" className={`${montserrat.variable} ${jetbrains.variable}`}>
      <body className="min-h-dvh flex flex-col">
        <SiteHeader />
        <main className="flex-1 w-full max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-10">{children}</main>
        <SiteFooter />
      </body>
    </html>
  );
}
