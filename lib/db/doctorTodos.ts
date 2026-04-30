import { TypedSupabaseClient } from "@/lib/supabase/types";
import { AppRole, DoctorTodoRow } from "@/lib/types";

type CreateDoctorTodoInput = {
  residentId?: string | null;
  assignedTo?: string | null;
  type: string;
  title: string;
  description?: string | null;
  riskLevel: DoctorTodoRow["risk_level"];
  status?: DoctorTodoRow["status"];
  source?: string | null;
  supabase: TypedSupabaseClient;
};

export async function getDoctorTodosForUser(
  userId: string,
  role: AppRole,
  supabase: TypedSupabaseClient,
) {
  try {
    let query = supabase
      .from("doctor_todos")
      .select("id, resident_id, assigned_to, type, title, description, risk_level, status, source, created_at, updated_at")
      .order("created_at", { ascending: false });

    if (role !== "admin") {
      query = query.eq("assigned_to", userId);
    }

    const { data, error } = await query;

    if (error || !data) {
      return [] as DoctorTodoRow[];
    }

    return data as DoctorTodoRow[];
  } catch {
    return [] as DoctorTodoRow[];
  }
}

export async function createDoctorTodo({
  residentId = null,
  assignedTo = null,
  type,
  title,
  description = null,
  riskLevel,
  status = "pending",
  source = null,
  supabase,
}: CreateDoctorTodoInput) {
  try {
    const { data, error } = await supabase
      .from("doctor_todos")
      .insert({
        resident_id: residentId,
        assigned_to: assignedTo,
        type,
        title,
        description,
        risk_level: riskLevel,
        status,
        source,
      })
      .select("id, resident_id, assigned_to, type, title, description, risk_level, status, source, created_at, updated_at")
      .maybeSingle();

    if (error || !data) {
      return {
        ok: false,
        message: error?.message ?? "医生待办创建失败",
      };
    }

    return {
      ok: true,
      todo: data as DoctorTodoRow,
    };
  } catch {
    return {
      ok: false,
      message: "医生待办创建失败",
    };
  }
}

export async function updateDoctorTodoStatus(
  todoId: string,
  status: DoctorTodoRow["status"],
  supabase: TypedSupabaseClient,
) {
  try {
    const { data, error } = await supabase
      .from("doctor_todos")
      .update({ status })
      .eq("id", todoId)
      .select("id, resident_id, assigned_to, type, title, description, risk_level, status, source, created_at, updated_at")
      .maybeSingle();

    if (error || !data) {
      return {
        ok: false,
        message: error?.message ?? "待办状态更新失败",
      };
    }

    return {
      ok: true,
      todo: data as DoctorTodoRow,
    };
  } catch {
    return {
      ok: false,
      message: "待办状态更新失败",
    };
  }
}
