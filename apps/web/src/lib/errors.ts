// Error codes shared by the API, n8n responses and the UI. Messages never blame the user and say what to do next.
export const ERROR_MESSAGES = {
  VALIDATION: "Проверете маркираните полета и опитайте отново.",
  EMPLOYEE_NOT_FOUND: "Не открихме служител с тези имена и номер. Проверете данните или се свържете с HR.",
  NOT_CFO: "Този достъп е само за финансовия директор. Проверете имената и ID номера.",
  EMPTY_SUBMISSION: "Добавете снимка на бележка или опишете разхода в коментара.",
  INVALID_FILE_TYPE: "Поддържаме само JPG, JPEG, PNG, WEBP и GIF. Изберете друг файл.",
  FILE_TOO_LARGE: "Файлът е над 10 MB. Направете по-малка снимка и опитайте отново.",
  RECEIPT_UNREADABLE: "Не успяхме да разчетем бележката. Снимайте я отново на светло или опишете разхода в коментара.",
  MISSING_AMOUNT: "Не открихме сума. Добавете сумата и валутата в коментара.",
  AI_ERROR: "AI анализът временно не е достъпен. Опитайте отново след минута.",
  DB_ERROR: "Разходът не беше записан поради техническа грешка. Опитайте отново.",
  RATE_LIMITED: "Твърде много заявки. Изчакайте малко и опитайте отново.",
  UPSTREAM_TIMEOUT: "Обработката отне твърде дълго. Проверете историята след минута, преди да изпратите отново.",
  UPSTREAM_ERROR: "Услугата за обработка не отговори. Опитайте отново след малко.",
  INTERNAL: "Нещо се обърка от наша страна. Опитайте отново.",
} as const;

export type ErrorCode = keyof typeof ERROR_MESSAGES;

export function isErrorCode(code: unknown): code is ErrorCode {
  return typeof code === "string" && Object.hasOwn(ERROR_MESSAGES, code);
}

export function messageFor(code: unknown): string {
  return isErrorCode(code) ? ERROR_MESSAGES[code] : ERROR_MESSAGES.INTERNAL;
}
