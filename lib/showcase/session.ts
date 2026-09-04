import type { NextRequest } from "next/server";
import type { AppRole, ProfileRow } from "@/lib/types";

export const SHOWCASE_ROLE_COOKIE = "jiayi_showcase_role";

const showcaseRoles: AppRole[] = [
  "resident",
  "family",
  "doctor",
  "nurse",
  "pharmacist",
  "community",
  "admin",
];

const showcaseNames: Record<AppRole, string> = {
  resident: "张阿姨",
  family: "张阿姨女儿",
  doctor: "李医生",
  nurse: "王护士",
  pharmacist: "陈药师",
  community: "居委张老师",
  admin: "管理员",
};

export function parseShowcaseRole(value?: string | null): AppRole {
  return showcaseRoles.includes(value as AppRole) ? (value as AppRole) : "resident";
}

export function readShowcaseRole(request: NextRequest) {
  return parseShowcaseRole(request.cookies.get(SHOWCASE_ROLE_COOKIE)?.value);
}

export function createShowcaseProfile(role: AppRole): ProfileRow {
  const timestamp = new Date().toISOString();
  return {
    id: `showcase-${role}`,
    display_name: showcaseNames[role],
    role,
    avatar_url: null,
    phone: null,
    organization_id: null,
    community_id: null,
    account_status: "active",
    onboarding_completed_at: timestamp,
    created_at: timestamp,
    updated_at: timestamp,
  };
}
