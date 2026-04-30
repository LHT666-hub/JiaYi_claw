import type { SupabaseClient } from "@supabase/supabase-js";

export type DatabaseRole =
  | "resident"
  | "family"
  | "doctor"
  | "nurse"
  | "pharmacist"
  | "community"
  | "admin";

export type DatabaseRiskLevel = "low" | "medium" | "high" | "emergency";
export type DatabaseContactGroup = "doctorTeam" | "family" | "community";
export type DatabaseTaskCategory =
  | "medicine"
  | "record"
  | "course"
  | "group"
  | "followup"
  | "other";

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          display_name: string;
          role: DatabaseRole;
          avatar_url: string | null;
          phone: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          display_name: string;
          role: DatabaseRole;
          avatar_url?: string | null;
          phone?: string | null;
        };
        Update: Partial<{
          display_name: string;
          role: DatabaseRole;
          avatar_url: string | null;
          phone: string | null;
          updated_at: string;
        }>;
      };
      contacts: {
        Row: {
          id: string;
          resident_id: string;
          contact_user_id: string | null;
          name: string;
          role_label: string;
          group_type: DatabaseContactGroup;
          description: string | null;
          available_time: string | null;
          avatar_url: string | null;
          sort_order: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          resident_id: string;
          contact_user_id?: string | null;
          name: string;
          role_label: string;
          group_type: DatabaseContactGroup;
          description?: string | null;
          available_time?: string | null;
          avatar_url?: string | null;
          sort_order?: number;
        };
        Update: Partial<{
          name: string;
          role_label: string;
          group_type: DatabaseContactGroup;
          description: string | null;
          available_time: string | null;
          avatar_url: string | null;
          sort_order: number;
          updated_at: string;
        }>;
      };
      faqs: {
        Row: {
          id: string;
          question: string;
          keywords: string[];
          category: string;
          answer: string;
          next_step: string | null;
          suggest_doctor: boolean;
          risk_level: DatabaseRiskLevel;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          question: string;
          keywords?: string[];
          category: string;
          answer: string;
          next_step?: string | null;
          suggest_doctor?: boolean;
          risk_level: DatabaseRiskLevel;
          is_active?: boolean;
        };
        Update: Partial<{
          question: string;
          keywords: string[];
          category: string;
          answer: string;
          next_step: string | null;
          suggest_doctor: boolean;
          risk_level: DatabaseRiskLevel;
          is_active: boolean;
          updated_at: string;
        }>;
      };
      courses: {
        Row: {
          id: string;
          title: string;
          category: string;
          audience: string | null;
          summary: string | null;
          duration: string | null;
          points: number;
          video_url: string | null;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          title: string;
          category: string;
          audience?: string | null;
          summary?: string | null;
          duration?: string | null;
          points?: number;
          video_url?: string | null;
          is_active?: boolean;
        };
        Update: Partial<{
          title: string;
          category: string;
          audience: string | null;
          summary: string | null;
          duration: string | null;
          points: number;
          video_url: string | null;
          is_active: boolean;
          updated_at: string;
        }>;
      };
      tasks: {
        Row: {
          id: string;
          title: string;
          description: string | null;
          category: DatabaseTaskCategory;
          points: number;
          is_active: boolean;
          sort_order: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          title: string;
          description?: string | null;
          category: DatabaseTaskCategory;
          points?: number;
          is_active?: boolean;
          sort_order?: number;
        };
        Update: Partial<{
          title: string;
          description: string | null;
          category: DatabaseTaskCategory;
          points: number;
          is_active: boolean;
          sort_order: number;
          updated_at: string;
        }>;
      };
      task_records: {
        Row: {
          id: string;
          resident_id: string;
          task_id: string;
          completed_at: string;
          points_awarded: number;
          note: string | null;
        };
        Insert: {
          id?: string;
          resident_id: string;
          task_id: string;
          completed_at?: string;
          points_awarded?: number;
          note?: string | null;
        };
        Update: Partial<{
          completed_at: string;
          points_awarded: number;
          note: string | null;
        }>;
      };
      points_ledger: {
        Row: {
          id: string;
          resident_id: string;
          change: number;
          reason: string;
          source_type: "task" | "course" | "group" | "exchange" | "manual" | "system";
          source_id: string | null;
          balance_after: number | null;
          created_at: string;
          created_by: string | null;
        };
        Insert: {
          id?: string;
          resident_id: string;
          change: number;
          reason: string;
          source_type: "task" | "course" | "group" | "exchange" | "manual" | "system";
          source_id?: string | null;
          balance_after?: number | null;
          created_at?: string;
          created_by?: string | null;
        };
        Update: Partial<{
          change: number;
          reason: string;
          source_type: "task" | "course" | "group" | "exchange" | "manual" | "system";
          source_id: string | null;
          balance_after: number | null;
          created_by: string | null;
        }>;
      };
      exchanges: {
        Row: {
          id: string;
          resident_id: string;
          item_name: string;
          points_cost: number;
          status: "pending" | "completed" | "cancelled";
          created_at: string;
          completed_at: string | null;
        };
        Insert: {
          id?: string;
          resident_id: string;
          item_name: string;
          points_cost: number;
          status?: "pending" | "completed" | "cancelled";
          created_at?: string;
          completed_at?: string | null;
        };
        Update: Partial<{
          item_name: string;
          points_cost: number;
          status: "pending" | "completed" | "cancelled";
          completed_at: string | null;
        }>;
      };
      group_messages: {
        Row: {
          id: string;
          group_id: string;
          sender_id: string | null;
          sender_name: string;
          sender_role: string;
          content: string;
          message_type: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          group_id: string;
          sender_id?: string | null;
          sender_name: string;
          sender_role: string;
          content: string;
          message_type?: string;
          created_at?: string;
        };
        Update: Partial<{
          sender_name: string;
          sender_role: string;
          content: string;
          message_type: string;
        }>;
      };
      doctor_todos: {
        Row: {
          id: string;
          resident_id: string | null;
          assigned_to: string | null;
          type: string;
          title: string;
          description: string | null;
          risk_level: DatabaseRiskLevel;
          status: "pending" | "processing" | "done" | "ignored";
          source: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          resident_id?: string | null;
          assigned_to?: string | null;
          type: string;
          title: string;
          description?: string | null;
          risk_level: DatabaseRiskLevel;
          status?: "pending" | "processing" | "done" | "ignored";
          source?: string | null;
        };
        Update: Partial<{
          assigned_to: string | null;
          type: string;
          title: string;
          description: string | null;
          risk_level: DatabaseRiskLevel;
          status: "pending" | "processing" | "done" | "ignored";
          source: string | null;
          updated_at: string;
        }>;
      };
      audit_logs: {
        Row: {
          id: string;
          actor_id: string | null;
          action: string;
          target_table: string | null;
          target_id: string | null;
          detail: Record<string, unknown> | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          actor_id?: string | null;
          action: string;
          target_table?: string | null;
          target_id?: string | null;
          detail?: Record<string, unknown> | null;
          created_at?: string;
        };
        Update: never;
      };
    };
  };
};

export type TypedSupabaseClient = SupabaseClient<any>;
