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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      companies: {
        Row: {
          id: string
          name: string
          slug: string
          invite_token: string
          created_at: string
          is_contract_paid: boolean
          trial_started_at: string
        }
        Insert: {
          id?: string
          name: string
          slug: string
          invite_token: string
          created_at?: string
          is_contract_paid?: boolean
          trial_started_at?: string
        }
        Update: {
          id?: string
          name?: string
          slug?: string
          invite_token?: string
          created_at?: string
          is_contract_paid?: boolean
          trial_started_at?: string
        }
        Relationships: []
      }
      entitlements: {
        Row: {
          created_at: string
          current_period_end: string | null
          plan: string
          status: string
          stripe_customer_id: string | null
          stripe_session_id: string | null
          stripe_subscription_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          current_period_end?: string | null
          plan: string
          status?: string
          stripe_customer_id?: string | null
          stripe_session_id?: string | null
          stripe_subscription_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          current_period_end?: string | null
          plan?: string
          status?: string
          stripe_customer_id?: string | null
          stripe_session_id?: string | null
          stripe_subscription_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          beta_points: number
          company_id: string | null
          created_at: string
          credits: number
          current_streak: number
          email: string | null
          failure_count: number
          full_name: string | null
          id: string
          last_action_logged: string | null
          max_streak: number
          onboarding_completed: boolean
          operational_status: string
          subscription_tier: string
          unlocked_layouts: string[]
          updated_at: string
        }
        Insert: {
          beta_points?: number
          company_id?: string | null
          created_at?: string
          credits?: number
          current_streak?: number
          email?: string | null
          failure_count?: number
          full_name?: string | null
          id: string
          last_action_logged?: string | null
          max_streak?: number
          onboarding_completed?: boolean
          operational_status?: string
          subscription_tier?: string
          unlocked_layouts?: string[]
          updated_at?: string
        }
        Update: {
          beta_points?: number
          company_id?: string | null
          created_at?: string
          credits?: number
          current_streak?: number
          email?: string | null
          failure_count?: number
          full_name?: string | null
          id?: string
          last_action_logged?: string | null
          max_streak?: number
          onboarding_completed?: boolean
          operational_status?: string
          subscription_tier?: string
          unlocked_layouts?: string[]
          updated_at?: string
        }
        Relationships: []
      }
      points_ledger: {
        Row: {
          amount_changed: number
          created_at: string
          id: string
          profile_id: string
          transaction_reason: string
        }
        Insert: {
          amount_changed: number
          created_at?: string
          id?: string
          profile_id: string
          transaction_reason: string
        }
        Update: {
          amount_changed?: number
          created_at?: string
          id?: string
          profile_id?: string
          transaction_reason?: string
        }
        Relationships: []
      }
      tasks: {
        Row: {
          id: string
          company_id: string | null
          user_id: string
          task_text: string
          impact_tier: string
          is_done: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          company_id?: string | null
          user_id: string
          task_text: string
          impact_tier: string
          is_done?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          company_id?: string | null
          user_id?: string
          task_text?: string
          impact_tier?: string
          is_done?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_company_invite: {
        Args: {
          p_invite_token: string
        }
        Returns: string
      }
      get_company_id_by_invite_token: {
        Args: {
          p_token: string
        }
        Returns: string
      }
      get_operator_leaderboard: {
        Args: Record<PropertyKey, never>
        Returns: {
          credits: number
          current_streak: number
          failure_count: number
          id: string
          max_streak: number
          operator_name: string
          operational_status: string
          rank_position: number
        }[]
      }
      get_workspace_access_status: {
        Args: Record<PropertyKey, never>
        Returns: {
          company_id: string
          company_name: string
          company_slug: string
          is_contract_paid: boolean
          trial_started_at: string
          trial_ends_at: string
          is_pilot_expired: boolean
        }[]
      }
      resolve_session_tenant: {
        Args: {
          p_subdomain: string
        }
        Returns: {
          company_id: string
          company_name: string
          company_slug: string
          is_member: boolean
        }[]
      }
    }
    Enums: {
      [_ in never]: never
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
