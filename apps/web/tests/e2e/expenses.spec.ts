import { expect, test, type Page } from "@playwright/test";

async function identify(page: Page, first: string, last: string, id: string) {
  await page.getByLabel("Име", { exact: true }).fill(first);
  await page.getByLabel("Фамилия").fill(last);
  await page.getByLabel("Служебен номер").fill(id);
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
});

test("employee submits a text-only expense and sees it in the history", async ({ page }, testInfo) => {
  // each project gets its own employee so the empty state is real on both runs
  const who = testInfo.project.name === "mobile" ? (["Цветелина", "Иванова", "TCV-3"] as const) : (["Мария", "Георгиева", "1042"] as const);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Снимайте бележката");
  await expect(page.getByRole("button", { name: "Изпрати разхода" })).toBeDisabled();

  await identify(page, who[0], who[1], who[2]);
  await expect(page.getByText("Потвърден")).toBeVisible();
  await expect(page.getByText("Все още нямате разходи")).toBeVisible();

  await page.getByLabel("Коментар").fill("Такси до клиента, 24 лв.");
  await page.getByRole("button", { name: "Изпрати разхода" }).click();

  const result = page.getByRole("status").filter({ hasText: "Разходът е записан" });
  await expect(result).toBeVisible();
  await expect(result).toContainText("Политика 4");
  // history refreshes automatically after a submission
  await expect(page.getByText("Брой разходи")).toBeVisible();
  await expect(page.getByText("Yellow Taxi").first()).toBeVisible();
  await expect(page.getByText("Градски транспорт/такси").first()).toBeVisible();
});

test("identity survives a reload and history loads by itself", async ({ page }) => {
  await identify(page, "Иван", "Петров", "EMP-001");
  await expect(page.getByText("Потвърден")).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Име", { exact: true })).toHaveValue("Иван");
  await expect(page.getByText("Потвърден")).toBeVisible();
});

test("unknown employee is told what to do", async ({ page }) => {
  await identify(page, "Някой", "Непознат", "000");
  await expect(page.getByRole("alert").filter({ hasText: "Не открихме служител" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Изпрати разхода" })).toBeDisabled();
});

test("unsupported file types are rejected before upload", async ({ page }) => {
  await identify(page, "Иван", "Петров", "EMP-001");
  await expect(page.getByText("Потвърден")).toBeVisible();
  await page.getByLabel("Файл с бележка").setInputFiles({ name: "invoice.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4") });
  await expect(page.getByRole("alert").filter({ hasText: "Поддържаме само JPG, JPEG, PNG, WEBP и GIF" })).toBeVisible();
});

test("empty submission asks for a receipt or a comment", async ({ page }) => {
  await identify(page, "Иван", "Петров", "EMP-001");
  await expect(page.getByText("Потвърден")).toBeVisible();
  await page.getByRole("button", { name: "Изпрати разхода" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Добавете снимка" })).toBeVisible();
});

test("CFO page: employees are refused, the CFO can chat", async ({ page }) => {
  await page.goto("/cfo");
  await identify(page, "Иван", "Петров", "EMP-001");
  await expect(page.getByRole("alert").filter({ hasText: "само за финансовия директор" })).toBeVisible();

  await identify(page, "Росица", "Ангелова", "CFO-7781");
  await expect(page.getByText("Потвърден")).toBeVisible();
  await page.getByLabel("Въпрос към асистента").fill("Колко са одобрените разходи?");
  await page.getByRole("button", { name: "Изпрати въпроса" }).click();
  await expect(page.locator("strong", { hasText: "12,27 €" })).toBeVisible();
});

test("no horizontal overflow", async ({ page }) => {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});
