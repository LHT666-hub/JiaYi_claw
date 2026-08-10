import { access, readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const entries = JSON.parse(await readFile(path.join(root, "third_party", "skills", "sources.json"), "utf8"));
const allowedLicenses = new Set(["MIT", "Apache-2.0"]);
const failures = [];

for (const entry of entries) {
  if (!/^[a-f0-9]{40}$/.test(entry.commit ?? "")) failures.push(`${entry.id}: invalid pinned commit`);
  if (!allowedLicenses.has(entry.license)) failures.push(`${entry.id}: unapproved license ${entry.license}`);
  if (!/^https:\/\/github\.com\//.test(entry.repository ?? "")) failures.push(`${entry.id}: source must be a GitHub repository`);
  if (entry.enabled && !entry.licenseFile) failures.push(`${entry.id}: enabled source has no retained license evidence`);
  if (entry.licenseFile) {
    try { await access(path.join(root, entry.licenseFile)); }
    catch { failures.push(`${entry.id}: missing ${entry.licenseFile}`); }
  }
}
try { await access(path.join(root, "THIRD_PARTY_NOTICES.md")); }
catch { failures.push("THIRD_PARTY_NOTICES.md is missing"); }

if (failures.length) {
  console.error(failures.map((failure) => `- ${failure}`).join("\n"));
  process.exit(1);
}
console.log(`Verified ${entries.length} pinned third-party sources and license boundaries.`);
