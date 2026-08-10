export function normalizeChinaPhone(value: string) {
  const digits = value.replace(/\D/g, "");
  if (/^1\d{10}$/.test(digits)) return `+86${digits}`;
  if (/^861\d{10}$/.test(digits)) return `+${digits}`;
  if (/^\d{6,20}$/.test(digits) && value.trim().startsWith("+")) return `+${digits}`;
  throw new Error("INVALID_PHONE");
}

export function maskPhone(value: string) {
  const normalized = normalizeChinaPhone(value);
  return `${normalized.slice(0, 5)}****${normalized.slice(-4)}`;
}
