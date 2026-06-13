const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DATETIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
const MIN_YEAR = new Date().getFullYear();
const MAX_YEAR = 2100;

export function isValidDateInput(value) {
  if (!DATE_RE.test(String(value || ""))) return false;
  const [year, month, day] = String(value).split("-").map(Number);
  if (year < MIN_YEAR || year > MAX_YEAR) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export function isValidDateTimeInput(value) {
  const text = String(value || "");
  if (!DATETIME_RE.test(text)) return false;
  const [datePart, timePart] = text.split("T");
  const [hour, minute] = timePart.split(":").map(Number);
  return isValidDateInput(datePart) && hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59;
}

export function dateError(field = "التاريخ") {
  return `${field} يجب أن يكون بصيغة صحيحة YYYY-MM-DD ومن سنة ${MIN_YEAR} وما بعد`;
}

export function dateTimeError(field = "الموعد") {
  return `${field} يجب أن يكون بصيغة صحيحة YYYY-MM-DDTHH:mm ومن سنة ${MIN_YEAR} وما بعد`;
}
