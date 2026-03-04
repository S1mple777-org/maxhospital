export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      admin_settings: {
        Row: {
          admin_type: Database["public"]["Enums"]["admin_type"]
          created_at: string
          department_id: string | null
          id: string
          month_reset_at: string
          month_spent: number
          monthly_limit: number
          user_id: string
        }
        Insert: {
          admin_type: Database["public"]["Enums"]["admin_type"]
          created_at?: string
          department_id?: string | null
          id?: string
          month_reset_at?: string
          month_spent?: number
          monthly_limit?: number
          user_id: string
        }
        Update: {
          admin_type?: Database["public"]["Enums"]["admin_type"]
          created_at?: string
          department_id?: string | null
          id?: string
          month_reset_at?: string
          month_spent?: number
          monthly_limit?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "admin_settings_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
        ]
      }
      consultation_ratings: {
        Row: {
          comment: string | null
          consultation_id: string
          created_at: string
          doctor_id: string
          id: string
          patient_id: string
          rating: number
        }
        Insert: {
          comment?: string | null
          consultation_id: string
          created_at?: string
          doctor_id: string
          id?: string
          patient_id: string
          rating: number
        }
        Update: {
          comment?: string | null
          consultation_id?: string
          created_at?: string
          doctor_id?: string
          id?: string
          patient_id?: string
          rating?: number
        }
        Relationships: [
          {
            foreignKeyName: "consultation_ratings_consultation_id_fkey"
            columns: ["consultation_id"]
            isOneToOne: true
            referencedRelation: "consultations"
            referencedColumns: ["id"]
          },
        ]
      }
      consultations: {
        Row: {
          created_at: string
          department_id: string | null
          doctor_id: string
          ended_at: string | null
          extended: boolean
          id: string
          max_end_time: string | null
          patient_id: string
          price_uzs: number
          started_at: string | null
          status: string
        }
        Insert: {
          created_at?: string
          department_id?: string | null
          doctor_id: string
          ended_at?: string | null
          extended?: boolean
          id?: string
          max_end_time?: string | null
          patient_id: string
          price_uzs?: number
          started_at?: string | null
          status?: string
        }
        Update: {
          created_at?: string
          department_id?: string | null
          doctor_id?: string
          ended_at?: string | null
          extended?: boolean
          id?: string
          max_end_time?: string | null
          patient_id?: string
          price_uzs?: number
          started_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "consultations_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consultations_doctor_id_fkey"
            columns: ["doctor_id"]
            isOneToOne: false
            referencedRelation: "doctors"
            referencedColumns: ["id"]
          },
        ]
      }
      departments: {
        Row: {
          created_at: string
          icon: string
          icon_url: string | null
          id: string
          is_active: boolean
          name_en: string
          name_ru: string
          name_uz: string
          price_uzs: number
        }
        Insert: {
          created_at?: string
          icon?: string
          icon_url?: string | null
          id?: string
          is_active?: boolean
          name_en: string
          name_ru: string
          name_uz: string
          price_uzs?: number
        }
        Update: {
          created_at?: string
          icon?: string
          icon_url?: string | null
          id?: string
          is_active?: boolean
          name_en?: string
          name_ru?: string
          name_uz?: string
          price_uzs?: number
        }
        Relationships: []
      }
      doctors: {
        Row: {
          address: string | null
          bio_en: string | null
          bio_ru: string | null
          bio_uz: string | null
          created_at: string
          department_id: string | null
          experience_years: number
          id: string
          is_online: boolean
          patients_count: number
          rating: number
          telegram_username: string | null
          title: string
          user_id: string
          workplace: string | null
        }
        Insert: {
          address?: string | null
          bio_en?: string | null
          bio_ru?: string | null
          bio_uz?: string | null
          created_at?: string
          department_id?: string | null
          experience_years?: number
          id?: string
          is_online?: boolean
          patients_count?: number
          rating?: number
          telegram_username?: string | null
          title?: string
          user_id: string
          workplace?: string | null
        }
        Update: {
          address?: string | null
          bio_en?: string | null
          bio_ru?: string | null
          bio_uz?: string | null
          created_at?: string
          department_id?: string | null
          experience_years?: number
          id?: string
          is_online?: boolean
          patients_count?: number
          rating?: number
          telegram_username?: string | null
          title?: string
          user_id?: string
          workplace?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "doctors_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          consultation_id: string
          content: string | null
          created_at: string
          file_url: string | null
          id: string
          message_type: string
          sender_id: string
        }
        Insert: {
          consultation_id: string
          content?: string | null
          created_at?: string
          file_url?: string | null
          id?: string
          message_type?: string
          sender_id: string
        }
        Update: {
          consultation_id?: string
          content?: string | null
          created_at?: string
          file_url?: string | null
          id?: string
          message_type?: string
          sender_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_consultation_id_fkey"
            columns: ["consultation_id"]
            isOneToOne: false
            referencedRelation: "consultations"
            referencedColumns: ["id"]
          },
        ]
      }
      posts: {
        Row: {
          author_id: string | null
          content_en: string
          content_ru: string
          content_uz: string
          created_at: string
          id: string
          image_url: string | null
          is_published: boolean
          title_en: string
          title_ru: string
          title_uz: string
        }
        Insert: {
          author_id?: string | null
          content_en: string
          content_ru: string
          content_uz: string
          created_at?: string
          id?: string
          image_url?: string | null
          is_published?: boolean
          title_en: string
          title_ru: string
          title_uz: string
        }
        Update: {
          author_id?: string | null
          content_en?: string
          content_ru?: string
          content_uz?: string
          created_at?: string
          id?: string
          image_url?: string | null
          is_published?: boolean
          title_en?: string
          title_ru?: string
          title_uz?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          balance_uzs: number
          ban_reason: string | null
          created_at: string
          full_name: string
          id: string
          is_banned: boolean
          phone: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          balance_uzs?: number
          ban_reason?: string | null
          created_at?: string
          full_name?: string
          id?: string
          is_banned?: boolean
          phone?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          balance_uzs?: number
          ban_reason?: string | null
          created_at?: string
          full_name?: string
          id?: string
          is_banned?: boolean
          phone?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      admin_type: "financial" | "dept_head" | "journalist"
      app_role: "owner" | "admin" | "doctor" | "user"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      admin_type: ["financial", "dept_head", "journalist"],
      app_role: ["owner", "admin", "doctor", "user"],
    },
  },
} as const
