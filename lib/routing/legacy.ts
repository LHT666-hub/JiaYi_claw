export const legacyPageTargets: Record<string, string> = {
  "/ask/history": "/ask",
  "/contacts": "/services",
  "/courses": "/services?tab=classroom",
  "/followup": "/appointments?type=followup_reminder",
  "/group": "/messages",
  "/notifications": "/messages",
  "/tasks": "/me",
  "/match-leader": "/me",
  "/feedback": "/me",
};

export const legacyApiPrefixes = [
  "/api/admin/dashboard", "/api/contacts", "/api/courses", "/api/doctor-todos",
  "/api/doctor", "/api/family/bindings", "/api/faqs", "/api/feedback", "/api/followup",
  "/api/group", "/api/home/summary", "/api/leaders", "/api/notifications", "/api/points",
  "/api/resident/todos", "/api/tasks",
];

function matches(pathname: string, prefix: string) {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

export function getLegacyPageTarget(pathname: string) {
  const prefix = Object.keys(legacyPageTargets).find((candidate) => matches(pathname, candidate));
  return prefix ? legacyPageTargets[prefix] : null;
}

export function isLegacyApiPath(pathname: string) {
  return legacyApiPrefixes.some((prefix) => matches(pathname, prefix));
}
