"use client";

import { SupabaseClient } from "@supabase/supabase-js";
import { STORAGE_KEYS, clearDemoUser, readDemoUser, writeDemoUser } from "@/lib/storage";
import { fetchCurrentProfile, getRoleLabel, isWorkbenchRole } from "@/lib/supabase/mvp";
import { AppRole, DemoUser, ProfileRow } from "@/lib/types";

export const roleOptions: {
  role: AppRole;
  label: string;
  description: string;
}[] = [
  {
    role: "resident",
    label: "我是居民",
    description: "我想查看健康提醒、问 Claw、完成今日健康小事。",
  },
  {
    role: "family",
    label: "我是家属",
    description: "我想帮助老人查看提醒、联系医生、协助操作。",
  },
  {
    role: "doctor",
    label: "我是家庭医生",
    description: "我想查看居民问题和待处理提醒。",
  },
  {
    role: "nurse",
    label: "我是护士",
    description: "我想协助随访、健康记录和日常提醒。",
  },
  {
    role: "pharmacist",
    label: "我是药师",
    description: "我想协助配药规则、用药说明和续方咨询。",
  },
  {
    role: "community",
    label: "我是居委/楼组长",
    description: "我想协助体检通知、登记和老人操作。",
  },
  {
    role: "admin",
    label: "我是管理员",
    description: "我想维护 FAQ、小课堂、任务和运行看板。",
  },
];

export function getOnboardingRoleLabel(role: AppRole) {
  const option = roleOptions.find((item) => item.role === role);
  return option?.label.replace("我是", "") ?? getRoleLabel(role);
}

export function getPostOnboardingPath(role?: AppRole | null) {
  if (role === "family") {
    return "/family";
  }

  if (role === "admin") {
    return "/admin";
  }

  if (isWorkbenchRole(role)) {
    return "/doctor";
  }

  return "/";
}

export function createLocalUser(params: {
  name: string;
  role: AppRole;
  phone?: string;
  area?: string;
  profile?: DemoUser["profile"];
  id?: string;
  createdAt?: string;
}) {
  const roleLabel = getOnboardingRoleLabel(params.role);

  return {
    id: params.id ?? `local-${params.role}-${Date.now()}`,
    name: params.name.trim(),
    role: params.role,
    roleLabel,
    phone: params.phone?.trim() || "",
    area: params.area?.trim() || "",
    profile: params.profile ?? {},
    createdAt: params.createdAt ?? new Date().toISOString(),
    isOnboarded: true,
    description: `${roleLabel}身份`,
    avatarColor: params.role === "resident" ? "#12365A" : "#6F9996",
    tags: [roleLabel, params.area?.trim() ? `片区：${params.area.trim()}` : "已完成身份选择"],
  } satisfies DemoUser;
}

export function saveCurrentUser(user: DemoUser) {
  writeDemoUser(user);
}

export function clearCurrentUser() {
  clearDemoUser();
}

export function readCurrentUser() {
  return readDemoUser();
}

export function profileToLocalUser(profile: ProfileRow) {
  return createLocalUser({
    id: profile.id,
    name: profile.display_name,
    role: profile.role,
    phone: profile.phone ?? "",
    profile: { source: "account" },
    createdAt: profile.created_at,
  });
}

export async function resolveInitialUser(supabase: SupabaseClient | null) {
  if (supabase) {
    try {
      const profile = await fetchCurrentProfile(supabase);
      if (profile) {
        const user = profileToLocalUser(profile);
        saveCurrentUser(user);
        return user;
      }
    } catch {
      // Continue with local identity if account profile cannot be read.
    }
  }

  return readCurrentUser();
}

export function hasCurrentUserInStorage() {
  if (typeof window === "undefined") {
    return false;
  }

  return Boolean(window.localStorage.getItem(STORAGE_KEYS.currentUser));
}
