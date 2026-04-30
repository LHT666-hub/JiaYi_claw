import { contacts as localContacts } from "@/data/contacts";
import { TypedSupabaseClient } from "@/lib/supabase/types";
import { ContactItem, ContactRow } from "@/lib/types";

function localTemplateByName(name: string) {
  return localContacts.find((item) => item.name === name) ?? null;
}

export function mapContactRowToContactItem(row: ContactRow): ContactItem {
  const template = localTemplateByName(row.name);

  return {
    id: template?.id ?? row.id,
    name: row.name,
    role: row.role_label,
    group: row.group_type,
    description: row.description ?? template?.description ?? "",
    availableTime: row.available_time ?? template?.availableTime,
    avatarColor: template?.avatarColor ?? "#12365A",
    avatarPath: row.avatar_url ?? template?.avatarPath,
  };
}

export async function getContactsForResident(
  residentId: string,
  supabase: TypedSupabaseClient,
) {
  try {
    const { data, error } = await supabase
      .from("contacts")
      .select(
        "id, resident_id, contact_user_id, name, role_label, group_type, description, available_time, avatar_url, sort_order, created_at, updated_at",
      )
      .eq("resident_id", residentId)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });

    if (error || !data) {
      return [] as ContactRow[];
    }

    return data as ContactRow[];
  } catch {
    return [] as ContactRow[];
  }
}
