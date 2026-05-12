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
          is_primary: boolean;
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
          is_primary?: boolean;
        };
        Update: Partial<{
          name: string;
          role_label: string;
          group_type: DatabaseContactGroup;
          description: string | null;
          available_time: string | null;
          avatar_url: string | null;
          sort_order: number;
          is_primary: boolean;
          updated_at: string;
        }>;
      };
      family_bindings: {
        Row: {
          id: string;
          resident_id: string;
          family_id: string;
          relationship: string;
          note: string | null;
          is_primary: boolean;
          status: "pending" | "active" | "disabled";
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          resident_id: string;
          family_id: string;
          relationship: string;
          note?: string | null;
          is_primary?: boolean;
          status?: "pending" | "active" | "disabled";
        };
        Update: Partial<{
          relationship: string;
          note: string | null;
          is_primary: boolean;
          status: "pending" | "active" | "disabled";
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
      ask_logs: {
        Row: {
          id: string;
          user_id: string | null;
          question: string;
          answer: string | null;
          source: string;
          category: string | null;
          risk_level: DatabaseRiskLevel | null;
          suggest_doctor: boolean;
          reason: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string | null;
          question: string;
          answer?: string | null;
          source: string;
          category?: string | null;
          risk_level?: DatabaseRiskLevel | null;
          suggest_doctor?: boolean;
          reason?: string | null;
          created_at?: string;
        };
        Update: never;
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
          status: string;
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
          status?: string;
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
          status: string;
          updated_at: string;
        }>;
      };
      course_views: {
        Row: {
          id: string;
          resident_id: string;
          course_id: string;
          viewed_at: string;
          points_awarded: number;
        };
        Insert: {
          id?: string;
          resident_id: string;
          course_id: string;
          viewed_at?: string;
          points_awarded?: number;
        };
        Update: Partial<{
          viewed_at: string;
          points_awarded: number;
        }>;
      };
      group_leaders: {
        Row: {
          id: string;
          name: string;
          role_label: string;
          area: string | null;
          tags: string[];
          strengths: string[];
          suitable_for: string[];
          description: string | null;
          avatar_url: string | null;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          role_label: string;
          area?: string | null;
          tags?: string[];
          strengths?: string[];
          suitable_for?: string[];
          description?: string | null;
          avatar_url?: string | null;
          is_active?: boolean;
        };
        Update: Partial<{
          name: string;
          role_label: string;
          area: string | null;
          tags: string[];
          strengths: string[];
          suitable_for: string[];
          description: string | null;
          avatar_url: string | null;
          is_active: boolean;
          updated_at: string;
        }>;
      };
      leader_matches: {
        Row: {
          id: string;
          resident_id: string;
          leader_id: string;
          score: number;
          reasons: string[];
          needs: string[];
          is_selected: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          resident_id: string;
          leader_id: string;
          score: number;
          reasons?: string[];
          needs?: string[];
          is_selected?: boolean;
        };
        Update: Partial<{
          score: number;
          reasons: string[];
          needs: string[];
          is_selected: boolean;
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
          completed_on: string;
          completed_at: string;
          points_awarded: number;
          note: string | null;
        };
        Insert: {
          id?: string;
          resident_id: string;
          task_id: string;
          completed_on?: string;
          completed_at?: string;
          points_awarded?: number;
          note?: string | null;
        };
        Update: Partial<{
          completed_on: string;
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
          original_question: string | null;
          claw_answer: string | null;
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
          type?: string;
          title: string;
          description?: string | null;
          original_question?: string | null;
          claw_answer?: string | null;
          risk_level: DatabaseRiskLevel;
          status?: "pending" | "processing" | "done" | "ignored";
          source?: string | null;
        };
        Update: Partial<{
          assigned_to: string | null;
          type: string;
          title: string;
          description: string | null;
          original_question: string | null;
          claw_answer: string | null;
          risk_level: DatabaseRiskLevel;
          status: "pending" | "processing" | "done" | "ignored";
          source: string | null;
          updated_at: string;
        }>;
      };
      todo_status_events: {
        Row: {
          id: string;
          todo_id: string;
          actor_id: string | null;
          old_status: "pending" | "processing" | "done" | "ignored" | null;
          new_status: "pending" | "processing" | "done" | "ignored";
          note: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          todo_id: string;
          actor_id?: string | null;
          old_status?: "pending" | "processing" | "done" | "ignored" | null;
          new_status: "pending" | "processing" | "done" | "ignored";
          note?: string | null;
          created_at?: string;
        };
        Update: never;
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
      notifications: {
        Row: {
          id: string;
          user_id: string;
          actor_id: string | null;
          type: "ask_todo_created" | "todo_status_changed" | "task_completed" | "points_changed" | "family_binding_created" | "leader_matched" | "course_recommended" | "group_notice" | "system";
          title: string;
          content: string;
          link_url: string | null;
          is_read: boolean;
          metadata: Record<string, unknown> | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          actor_id?: string | null;
          type: "ask_todo_created" | "todo_status_changed" | "task_completed" | "points_changed" | "family_binding_created" | "leader_matched" | "course_recommended" | "group_notice" | "system";
          title: string;
          content: string;
          link_url?: string | null;
          is_read?: boolean;
          metadata?: Record<string, unknown> | null;
          created_at?: string;
        };
        Update: Partial<{
          actor_id: string | null;
          type: "ask_todo_created" | "todo_status_changed" | "task_completed" | "points_changed" | "family_binding_created" | "leader_matched" | "course_recommended" | "group_notice" | "system";
          title: string;
          content: string;
          link_url: string | null;
          is_read: boolean;
          metadata: Record<string, unknown> | null;
        }>;
      };
    };
  };
};

export type TypedSupabaseClient = SupabaseClient<any>;
