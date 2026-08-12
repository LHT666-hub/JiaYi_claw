"use client";

import { SupabaseClient } from "@supabase/supabase-js";
import {
  AppRole,
  ContactRow,
  DoctorTodoRow,
  PointsLedgerRow,
  ProfileRow,
  ResidentProfileRow,
  SupabaseTaskRow,
  TaskRecordRow,
} from "@/lib/types";

export function getRoleLabel(role: AppRole) {
  switch (role) {
    case "resident":
      return "居民";
    case "family":
      return "家属";
    case "doctor":
      return "家庭医生";
    case "nurse":
      return "护士";
    case "pharmacist":
      return "药师";
    case "community":
      return "社区支持";
    case "admin":
      return "管理员";
    default:
      return "用户";
  }
}

export function isWorkbenchRole(role?: AppRole | null) {
  return Boolean(
    role && ["doctor", "nurse", "pharmacist", "community", "admin"].includes(role),
  );
}

export function getPostLoginPath(role?: AppRole | null, onboardingCompletedAt?: string | null) {
  if (role === "admin") {
    return "/admin";
  }

  if (isWorkbenchRole(role)) {
    return "/doctor";
  }

  if (onboardingCompletedAt === null) {
    return "/onboarding";
  }

  if (role === "family") {
    return "/family";
  }

  return "/";
}

export async function fetchCurrentProfile(supabase: SupabaseClient) {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return null;
  }

  const { data, error } = await supabase
    .from("profiles")
    .select("id, display_name, role, avatar_url, phone, organization_id, community_id, account_status, onboarding_completed_at, preferred_language, created_at, updated_at")
    .eq("id", user.id)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return data as ProfileRow;
}

export async function resolveResidentScope(supabase: SupabaseClient, profile: ProfileRow) {
  if (profile.role === "resident") {
    return {
      residentId: profile.id,
      residentName: profile.display_name,
    };
  }

  if (profile.role !== "family") {
    return {
      residentId: null,
      residentName: null,
    };
  }

  const { data } = await supabase
    .from("contacts")
    .select("resident_id, name")
    .eq("contact_user_id", profile.id)
    .eq("group_type", "family")
    .limit(1)
    .maybeSingle();

  return {
    residentId: data?.resident_id ?? null,
    residentName: data?.name ?? null,
  };
}

export async function fetchResidentProfile(supabase: SupabaseClient, residentId: string) {
  const { data, error } = await supabase
    .from("resident_profiles")
    .select("id, user_id, age, chronic_tags, family_doctor_id, community_contact_id, created_at")
    .eq("user_id", residentId)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return data as ResidentProfileRow;
}

export async function fetchResidentContacts(supabase: SupabaseClient, residentId: string) {
  const { data, error } = await supabase
    .from("contacts")
    .select(
      "id, resident_id, contact_user_id, name, role_label, group_type, description, available_time, avatar_url, created_at, updated_at",
    )
    .eq("resident_id", residentId)
    .order("sort_order", { ascending: true });

  if (error || !data) {
    return [];
  }

  return data as ContactRow[];
}

export async function fetchSupabaseTasks(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from("tasks")
    .select("id, title, description, category, points, is_active, sort_order, created_at, updated_at")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });

  if (error || !data) {
    return [];
  }

  return data as SupabaseTaskRow[];
}

export async function fetchTaskRecords(supabase: SupabaseClient, residentId: string) {
  const { data, error } = await supabase
    .from("task_records")
    .select("id, resident_id, task_id, completed_on, completed_at, points_awarded, note")
    .eq("resident_id", residentId)
    .order("completed_at", { ascending: false });

  if (error || !data) {
    return [];
  }

  return data as TaskRecordRow[];
}

export async function fetchPointsLedger(supabase: SupabaseClient, residentId: string) {
  const { data, error } = await supabase
    .from("points_ledger")
    .select("id, resident_id, change, reason, source_type, source_id, balance_after, created_at, created_by")
    .eq("resident_id", residentId)
    .order("created_at", { ascending: false });

  if (error || !data) {
    return [];
  }

  return data as PointsLedgerRow[];
}

export function sumPoints(ledger: PointsLedgerRow[]) {
  return ledger.reduce((total, item) => total + item.change, 0);
}

export async function fetchDoctorTodos(supabase: SupabaseClient, profile: ProfileRow) {
  let query = supabase
    .from("doctor_todos")
    .select(
      "id, resident_id, assigned_to, type, title, description, risk_level, status, created_at, updated_at, source",
    )
    .order("created_at", { ascending: false });

  if (profile.role !== "admin") {
    query = query.eq("assigned_to", profile.id);
  }

  const { data, error } = await query;

  if (error || !data) {
    return [];
  }

  return data as DoctorTodoRow[];
}
