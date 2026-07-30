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
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      access_requests: {
        Row: {
          attempts: number
          created_at: string
          decided_at: string | null
          decided_by: string | null
          email: string
          id: string
          last_attempt_at: string | null
          legacy_id: string | null
          name: string
          requested_at: string
          source: string | null
          status: Database["public"]["Enums"]["access_request_status"]
          tenant_id: string
          updated_at: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          email: string
          id?: string
          last_attempt_at?: string | null
          legacy_id?: string | null
          name: string
          requested_at?: string
          source?: string | null
          status?: Database["public"]["Enums"]["access_request_status"]
          tenant_id: string
          updated_at?: string
        }
        Update: {
          attempts?: number
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          email?: string
          id?: string
          last_attempt_at?: string | null
          legacy_id?: string | null
          name?: string
          requested_at?: string
          source?: string | null
          status?: Database["public"]["Enums"]["access_request_status"]
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "access_requests_decided_by_fkey"
            columns: ["decided_by", "tenant_id"]
            isOneToOne: false
            referencedRelation: "collaborators"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "access_requests_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          address_city: string
          address_complement: string | null
          address_country: string
          address_district: string | null
          address_number: string | null
          address_state: string
          address_street: string | null
          address_zipcode: string | null
          birth_date: string | null
          client_key: string | null
          client_type: Database["public"]["Enums"]["client_type"] | null
          created_at: string
          email: string | null
          email_normalized: string | null
          id: string
          lead_source: Database["public"]["Enums"]["lead_source"] | null
          legacy_id: string | null
          name: string
          notes: string | null
          phone: string
          search_text: string | null
          site_city: string | null
          site_complement: string | null
          site_district: string | null
          site_number: string | null
          site_state: string | null
          site_street: string | null
          site_zipcode: string | null
          tax_id: string | null
          tax_id_digits: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          address_city: string
          address_complement?: string | null
          address_country?: string
          address_district?: string | null
          address_number?: string | null
          address_state: string
          address_street?: string | null
          address_zipcode?: string | null
          birth_date?: string | null
          client_key?: string | null
          client_type?: Database["public"]["Enums"]["client_type"] | null
          created_at?: string
          email?: string | null
          email_normalized?: string | null
          id?: string
          lead_source?: Database["public"]["Enums"]["lead_source"] | null
          legacy_id?: string | null
          name: string
          notes?: string | null
          phone: string
          search_text?: string | null
          site_city?: string | null
          site_complement?: string | null
          site_district?: string | null
          site_number?: string | null
          site_state?: string | null
          site_street?: string | null
          site_zipcode?: string | null
          tax_id?: string | null
          tax_id_digits?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          address_city?: string
          address_complement?: string | null
          address_country?: string
          address_district?: string | null
          address_number?: string | null
          address_state?: string
          address_street?: string | null
          address_zipcode?: string | null
          birth_date?: string | null
          client_key?: string | null
          client_type?: Database["public"]["Enums"]["client_type"] | null
          created_at?: string
          email?: string | null
          email_normalized?: string | null
          id?: string
          lead_source?: Database["public"]["Enums"]["lead_source"] | null
          legacy_id?: string | null
          name?: string
          notes?: string | null
          phone?: string
          search_text?: string | null
          site_city?: string | null
          site_complement?: string | null
          site_district?: string | null
          site_number?: string | null
          site_state?: string | null
          site_street?: string | null
          site_zipcode?: string | null
          tax_id?: string | null
          tax_id_digits?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "clients_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      collaborator_permissions: {
        Row: {
          can_edit: boolean
          can_view: boolean
          collaborator_id: string
          created_at: string
          legacy_id: string | null
          menu_key: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          can_edit?: boolean
          can_view?: boolean
          collaborator_id: string
          created_at?: string
          legacy_id?: string | null
          menu_key: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          can_edit?: boolean
          can_view?: boolean
          collaborator_id?: string
          created_at?: string
          legacy_id?: string | null
          menu_key?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "collaborator_permissions_collaborator_id_fkey"
            columns: ["collaborator_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "collaborators"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "collaborator_permissions_menu_key_fkey"
            columns: ["menu_key"]
            isOneToOne: false
            referencedRelation: "menus"
            referencedColumns: ["key"]
          },
          {
            foreignKeyName: "collaborator_permissions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      collaborators: {
        Row: {
          area: Database["public"]["Enums"]["collaborator_area"] | null
          coordinator_id: string | null
          created_at: string
          email: string
          id: string
          legacy_id: string | null
          name: string
          role: Database["public"]["Enums"]["collaborator_role"]
          status: Database["public"]["Enums"]["collaborator_status"]
          tenant_id: string
          updated_at: string
          user_id: string | null
          weekly_hours: number | null
        }
        Insert: {
          area?: Database["public"]["Enums"]["collaborator_area"] | null
          coordinator_id?: string | null
          created_at?: string
          email: string
          id?: string
          legacy_id?: string | null
          name: string
          role: Database["public"]["Enums"]["collaborator_role"]
          status?: Database["public"]["Enums"]["collaborator_status"]
          tenant_id: string
          updated_at?: string
          user_id?: string | null
          weekly_hours?: number | null
        }
        Update: {
          area?: Database["public"]["Enums"]["collaborator_area"] | null
          coordinator_id?: string | null
          created_at?: string
          email?: string
          id?: string
          legacy_id?: string | null
          name?: string
          role?: Database["public"]["Enums"]["collaborator_role"]
          status?: Database["public"]["Enums"]["collaborator_status"]
          tenant_id?: string
          updated_at?: string
          user_id?: string | null
          weekly_hours?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "collaborators_coordinator_id_fkey"
            columns: ["coordinator_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "collaborators"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "collaborators_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      menus: {
        Row: {
          created_at: string
          key: string
          label_pt: string
          parent_key: string | null
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          key: string
          label_pt: string
          parent_key?: string | null
          sort_order: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          key?: string
          label_pt?: string
          parent_key?: string | null
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "menus_parent_key_fkey"
            columns: ["parent_key"]
            isOneToOne: false
            referencedRelation: "menus"
            referencedColumns: ["key"]
          },
        ]
      }
      tenant_email_domains: {
        Row: {
          created_at: string
          domain: string
          id: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          domain: string
          id?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          domain?: string
          id?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_email_domains_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_users: {
        Row: {
          created_at: string
          role: Database["public"]["Enums"]["tenant_role"]
          tenant_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          role?: Database["public"]["Enums"]["tenant_role"]
          tenant_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          role?: Database["public"]["Enums"]["tenant_role"]
          tenant_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_users_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenants: {
        Row: {
          created_at: string
          id: string
          name: string
          slug: string
          status: Database["public"]["Enums"]["tenant_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          slug: string
          status?: Database["public"]["Enums"]["tenant_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          slug?: string
          status?: Database["public"]["Enums"]["tenant_status"]
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      approve_access_request: {
        Args: {
          p_approver_user_id: string
          p_area?: Database["public"]["Enums"]["collaborator_area"]
          p_coordinator_id?: string
          p_name: string
          p_request_id: string
          p_role: Database["public"]["Enums"]["collaborator_role"]
          p_weekly_hours?: number
        }
        Returns: Json
      }
      auth_collaborator_id: { Args: never; Returns: string }
      auth_collaborator_role: {
        Args: never
        Returns: Database["public"]["Enums"]["collaborator_role"]
      }
      auth_tenant_id: { Args: never; Returns: string }
      can_edit_menu: { Args: { p_menu_key: string }; Returns: boolean }
      custom_access_token_hook: { Args: { event: Json }; Returns: Json }
      is_active_collaborator: { Args: never; Returns: boolean }
      is_tenant_director: { Args: never; Returns: boolean }
    }
    Enums: {
      access_request_status: "pending" | "approved" | "rejected"
      client_type: "individual" | "company"
      collaborator_area:
        | "commercial"
        | "projects"
        | "operations"
        | "administrative"
        | "finance"
      collaborator_role:
        | "director"
        | "coordinator"
        | "admin_staff"
        | "finance"
        | "architect"
        | "intern"
      collaborator_status: "active" | "vacation" | "on_leave"
      lead_source: "instagram" | "referral" | "website" | "other"
      tenant_role: "owner" | "member"
      tenant_status: "active" | "suspended"
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      access_request_status: ["pending", "approved", "rejected"],
      client_type: ["individual", "company"],
      collaborator_area: [
        "commercial",
        "projects",
        "operations",
        "administrative",
        "finance",
      ],
      collaborator_role: [
        "director",
        "coordinator",
        "admin_staff",
        "finance",
        "architect",
        "intern",
      ],
      collaborator_status: ["active", "vacation", "on_leave"],
      lead_source: ["instagram", "referral", "website", "other"],
      tenant_role: ["owner", "member"],
      tenant_status: ["active", "suspended"],
    },
  },
} as const
