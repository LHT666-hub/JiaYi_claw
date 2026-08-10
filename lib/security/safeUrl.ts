import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

function isPrivateAddress(address: string) {
  if (address === "::1" || address.startsWith("fc") || address.startsWith("fd") || address.startsWith("fe80:")) return true;
  if (!isIP(address.includes("%") ? address.split("%")[0] : address)) return true;
  const parts = address.split(".").map(Number);
  if (parts.length !== 4) return false;
  return parts[0] === 10 || parts[0] === 127 || parts[0] === 0 ||
    (parts[0] === 169 && parts[1] === 254) || (parts[0] === 192 && parts[1] === 168) ||
    (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31);
}

export async function assertSafeOfficialUrl(input: string, allowedHost: string) {
  const url = new URL(input);
  if (url.protocol !== "https:") throw new Error("HTTPS_SOURCE_REQUIRED");
  if (url.username || url.password || url.port) throw new Error("SOURCE_URL_FORBIDDEN");
  const host = url.hostname.toLowerCase();
  const normalizedAllowed = allowedHost.toLowerCase();
  if (host !== normalizedAllowed && !host.endsWith(`.${normalizedAllowed}`)) throw new Error("SOURCE_HOST_NOT_ALLOWED");
  const addresses = await lookup(host, { all: true });
  if (!addresses.length || addresses.some((item) => isPrivateAddress(item.address))) throw new Error("SOURCE_ADDRESS_FORBIDDEN");
  return url;
}
