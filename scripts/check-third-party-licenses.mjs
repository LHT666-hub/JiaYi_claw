import { access, readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const entries = JSON.parse(await readFile(path.join(root, "third_party", "skills", "sources.json"), "utf8"));
const allowedLicenses = new Set(["MIT", "Apache-2.0"]);
const failures = [];
const runtimeDependencies = [
  {
    id: "lucide-react-taro",
    manifest: "apps/wechat/package.json",
    expectedVersion: "1.5.2",
    expectedLicense: "ISC",
  },
];

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

const packageLock = JSON.parse(await readFile(path.join(root, "package-lock.json"), "utf8"));
const notices = await readFile(path.join(root, "THIRD_PARTY_NOTICES.md"), "utf8").catch(() => "");
for (const dependency of runtimeDependencies) {
  const manifest = JSON.parse(await readFile(path.join(root, dependency.manifest), "utf8"));
  const declaredVersion = manifest.dependencies?.[dependency.id];
  const locked = packageLock.packages?.[`node_modules/${dependency.id}`];
  if (declaredVersion !== dependency.expectedVersion) {
    failures.push(`${dependency.id}: expected exact version ${dependency.expectedVersion}, found ${declaredVersion ?? "missing"}`);
  }
  if (locked?.version !== dependency.expectedVersion) {
    failures.push(`${dependency.id}: lockfile version is ${locked?.version ?? "missing"}`);
  }
  if (locked?.license !== dependency.expectedLicense) {
    failures.push(`${dependency.id}: expected ${dependency.expectedLicense} license evidence in lockfile`);
  }
  if (!notices.includes(`\`${dependency.id}\` ${dependency.expectedVersion}`)) {
    failures.push(`${dependency.id}: missing versioned notice`);
  }
}

if (failures.length) {
  console.error(failures.map((failure) => `- ${failure}`).join("\n"));
  process.exit(1);
}
console.log(`Verified ${entries.length} pinned sources and ${runtimeDependencies.length} runtime dependency license boundaries.`);
