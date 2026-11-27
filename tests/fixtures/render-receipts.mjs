// Renders synthetic receipt images used for manual/AI testing. Run: node tests/fixtures/render-receipts.mjs
// (uses the Playwright Chromium installed for apps/web)
import { createRequire } from "node:module";
const require = createRequire(new URL("../../apps/web/package.json", import.meta.url));
const { chromium } = require("playwright");

const receipt = (lines) => `<html><body style="margin:0;background:#ddd;display:flex;justify-content:center;padding:30px">
<div style="background:#fff;width:340px;padding:24px;font:15px/1.5 'Courier New',monospace;color:#111;box-shadow:0 2px 8px #0003">${lines}</div></body></html>`;
const row = (a, b) => `<div style="display:flex;justify-content:space-between"><span>${a}</span><span>${b}</span></div>`;
const hr = `<div style="border-top:1px dashed #333;margin:8px 0"></div>`;

const files = {
  "billa-beer.png": receipt(`<div style="text-align:center"><b>БИЛА БЪЛГАРИЯ ЕООД</b><br>ОБЕКТ: БИЛА София Младост<br>ЕИК 831414323</div>${hr}
    ${row("Хляб Добруджа", "1.20 €")}${row("Сирене краве 400г", "4.60 €")}${row("Бира Загорка 0.5л x2", "2.40 €")}${hr}
    ${row("<b>ОБЩО EUR</b>", "<b>8.20 €</b>")}${row("ОБЩО BGN", "16.04 лв.")}${hr}<div style="text-align:center">24.11.2026 18:42<br>КАСОВ БОН №0041122</div>`),
  "restaurant-dinner.png": receipt(`<div style="text-align:center"><b>РЕСТОРАНТ САСНА</b><br>гр. София, ул. Шипка 12</div>${hr}
    ${row("Салата Шопска x3", "21.00 €")}${row("Агнешко печено x3", "84.00 €")}${row("Вино Мавруд 0.75 x1", "38.00 €")}${row("Минерална вода x3", "6.00 €")}${hr}
    ${row("<b>ОБЩО EUR</b>", "<b>149.00 €</b>")}${row("ОБЩО BGN", "291.42 лв.")}${hr}<div style="text-align:center">25.11.2026 21:10<br>Маса 7 · Кувери: 3</div>`),
  "taxi-long.png": receipt(`<div style="text-align:center"><b>ЖЪЛТО ТАКСИ ООД</b><br>Автомобил СВ1234АВ</div>${hr}
    ${row("Тарифа 1", "0.90 €/km")}${row("Изминати км", "27.4")}${hr}${row("<b>ОБЩО EUR</b>", "<b>24.66 €</b>")}${row("ОБЩО BGN", "48.23 лв.")}${hr}
    <div style="text-align:center">26.11.2026 08:15</div>`),
  "black.png": `<html><body style="margin:0;background:#000;width:400px;height:600px"></body></html>`,
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 400, height: 600 } });
for (const [name, html] of Object.entries(files)) {
  await page.setContent(html);
  await page.screenshot({ path: new URL(`./receipts/${name}`, import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1"), fullPage: true });
  console.log("rendered", name);
}
await browser.close();
