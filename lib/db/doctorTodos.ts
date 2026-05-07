import { TypedSupabaseClient } from "@/lib/supabase/types";
import { AppRole, DoctorTodoRow } from "@/lib/types";

type CreateDoctorTodoInput = {
  residentId?: string | null;
  assignedTo?: string | null;
  type?: string;
  title: string;
  description?: string | null;
  originalQuestion?: string | null;
  clawAnswer?: string | null;
  riskLevel: DoctorTodoRow["risk_level"];
  status?: DoctorTodoRow["status"];
  source?: string | null;
  supabase: TypedSupabaseClient;
};

const todoSelect =
  "id, resident_id, assigned_to, type, title, description, original_question, claw_answer, risk_level, status, source, created_at, updated_at";

export async function getDoctorTodosForUser(
  userId: string,
  role: AppRole,
  supabase: TypedSupabaseClient,
) {
  try {
    let query = supabase.from("doctor_todos").select(todoSelect).order("created_at", {
      ascending: false,
    });

    if (role === "admin") {
      const { data, error } = await query;
      if (error || !data) {
        return [] as DoctorTodoRow[];
      }
      return data as DoctorTodoRow[];
    }

    const { data, error } = await query.or(`assigned_to.eq.${userId},assigned_to.is.null`);

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
  type = "ask",
  title,
  description = null,
  originalQuestion = null,
  clawAnswer = null,
  riskLevel,
  status = "pending",
  source = "ask",
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
        original_question: originalQuestion,
        claw_answer: clawAnswer,
        risk_level: riskLevel,
        status,
        source,
      })
      .select(todoSelect)
      .maybeSingle();

    if (error || !data) {
      return {
        ok: false,
        message: error?.message ?? "Failed to create doctor todo",
      };
    }

    return {
      ok: true,
      todo: data as DoctorTodoRow,
    };
  } catch {
    return {
      ok: false,
      message: "Failed to create doctor todo",
    };
  }
}

export async function updateDoctorTodoStatus(
  todoId: string,
  status: DoctorTodoRow["status"],
  supabase: TypedSupabaseClient,
  assignedTo?: string | null,
) {
  try {
    const updatePayload: { status: DoctorTodoRow["status"]; assigned_to?: string | null } = {
      status,
    };

    if (assignedTo !== undefined) {
      updatePayload.assigned_to = assignedTo;
    }

    const { data, error } = await supabase
      .from("doctor_todos")
      .update(updatePayload)
      .eq("id", todoId)
      .select(todoSelect)
      .maybeSingle();

    if (error || !data) {
      return {
        ok: false,
        message: error?.message ?? "Failed to update doctor todo status",
      };
    }

    return {
      ok: true,
      todo: data as DoctorTodoRow,
    };
  } catch {
    return {
      ok: false,
      message: "Failed to update doctor todo status",
    };
  }
}
