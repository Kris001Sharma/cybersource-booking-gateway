/** Client-side utilities — validation, formatting, date math */

export function nightsBetween(checkin, checkout) {
  const d1 = new Date(checkin + "T00:00:00");
  const d2 = new Date(checkout + "T00:00:00");
  const diff = (d2 - d1) / (1000 * 60 * 60 * 24);
  return Math.max(0, Math.round(diff));
}

export function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function validateRequired(value) {
  return typeof value === "string" && value.trim().length > 0;
}
