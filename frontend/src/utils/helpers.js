import { API_URL } from "../api/client.js";

export function classNames(...items) {
  return items.filter(Boolean).join(" ");
}

export function formatDate(value) {
  return value ? value.slice(0, 10) : "غير محدد";
}

export function milestoneStatusLabel(item) {
  return item.status === "done" || item.completed_at ? "منجزة" : "قيد العمل";
}

export const roleLabels = {
  student: "طالب",
  supervisor: "مشرف",
  admin: "إدارة"
};

export function assetUrl(path) {
  return path ? `${API_URL.replace("/api", "")}${path}` : "";
}

export function initials(name = "") {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join("") || "?";
}

export function csvList(value) {
  return Array.isArray(value) ? value.join(", ") : String(value || "");
}

const today = new Date().toISOString().slice(0, 10);
const currentYear = new Date().getFullYear();

export const DATE_INPUT_LIMITS = {
  min: today,
  max: "2100-12-31",
  pattern: "\\d{4}-\\d{2}-\\d{2}",
  title: `اكتب التاريخ بصيغة YYYY-MM-DD ومن سنة ${currentYear} وما بعد`
};

export const DATETIME_INPUT_LIMITS = {
  min: `${today}T00:00`,
  max: "2100-12-31T23:59",
  step: 60,
  title: `اكتب الموعد بصيغة YYYY-MM-DD HH:mm ومن سنة ${currentYear} وما بعد`
};
