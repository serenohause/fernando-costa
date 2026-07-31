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
      client_intakes: {
        Row: {
          address_city: string | null
          address_complement: string | null
          address_district: string | null
          address_number: string | null
          address_state: string | null
          address_street: string | null
          address_zipcode: string | null
          birth_date: string | null
          city: string | null
          client_id: string
          client_type: Database["public"]["Enums"]["client_type"] | null
          country: string | null
          created_at: string
          email: string | null
          expires_at: string
          full_name: string | null
          id: string
          last_access_at: string | null
          last_link_error: string | null
          last_validation_status: Database["public"]["Enums"]["client_intake_validation_status"]
          legacy_id: string | null
          negotiation_id: string | null
          phone: string | null
          site_city: string | null
          site_complement: string | null
          site_district: string | null
          site_number: string | null
          site_state: string | null
          site_street: string | null
          site_zipcode: string | null
          state: string | null
          status: Database["public"]["Enums"]["client_intake_status"]
          submitted_at: string | null
          tax_id: string | null
          tenant_id: string
          token: string
          updated_at: string
        }
        Insert: {
          address_city?: string | null
          address_complement?: string | null
          address_district?: string | null
          address_number?: string | null
          address_state?: string | null
          address_street?: string | null
          address_zipcode?: string | null
          birth_date?: string | null
          city?: string | null
          client_id: string
          client_type?: Database["public"]["Enums"]["client_type"] | null
          country?: string | null
          created_at?: string
          email?: string | null
          expires_at?: string
          full_name?: string | null
          id?: string
          last_access_at?: string | null
          last_link_error?: string | null
          last_validation_status?: Database["public"]["Enums"]["client_intake_validation_status"]
          legacy_id?: string | null
          negotiation_id?: string | null
          phone?: string | null
          site_city?: string | null
          site_complement?: string | null
          site_district?: string | null
          site_number?: string | null
          site_state?: string | null
          site_street?: string | null
          site_zipcode?: string | null
          state?: string | null
          status?: Database["public"]["Enums"]["client_intake_status"]
          submitted_at?: string | null
          tax_id?: string | null
          tenant_id: string
          token?: string
          updated_at?: string
        }
        Update: {
          address_city?: string | null
          address_complement?: string | null
          address_district?: string | null
          address_number?: string | null
          address_state?: string | null
          address_street?: string | null
          address_zipcode?: string | null
          birth_date?: string | null
          city?: string | null
          client_id?: string
          client_type?: Database["public"]["Enums"]["client_type"] | null
          country?: string | null
          created_at?: string
          email?: string | null
          expires_at?: string
          full_name?: string | null
          id?: string
          last_access_at?: string | null
          last_link_error?: string | null
          last_validation_status?: Database["public"]["Enums"]["client_intake_validation_status"]
          legacy_id?: string | null
          negotiation_id?: string | null
          phone?: string | null
          site_city?: string | null
          site_complement?: string | null
          site_district?: string | null
          site_number?: string | null
          site_state?: string | null
          site_street?: string | null
          site_zipcode?: string | null
          state?: string | null
          status?: Database["public"]["Enums"]["client_intake_status"]
          submitted_at?: string | null
          tax_id?: string | null
          tenant_id?: string
          token?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_intakes_client_id_fkey"
            columns: ["client_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "client_intakes_negotiation_id_fkey"
            columns: ["negotiation_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "negotiations"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "client_intakes_tenant_id_fkey"
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
      contracts: {
        Row: {
          billing_type: Database["public"]["Enums"]["billing_type"] | null
          client_address_city: string | null
          client_address_complement: string | null
          client_address_number: string | null
          client_address_state: string | null
          client_address_street: string | null
          client_address_zipcode: string | null
          client_birth_date: string | null
          client_email: string | null
          client_id: string | null
          client_legal_name: string | null
          client_tax_id: string | null
          construction_docs_days: number | null
          contract_number: string
          contract_type: Database["public"]["Enums"]["contract_type"]
          created_at: string
          display_order: number | null
          engineering_docs_days: number | null
          first_due_date: string | null
          id: string
          installment_count: number | null
          installment_frequency:
            | Database["public"]["Enums"]["installment_frequency"]
            | null
          installments_generated: boolean
          layout_study_days: number | null
          legacy_id: string | null
          legal_permit_days: number | null
          negotiation_id: string | null
          notes: string | null
          origin: Database["public"]["Enums"]["lead_origin"] | null
          project_name: string | null
          referrer_name: string | null
          renderings_days: number | null
          signature_date: string | null
          site_city: string | null
          site_complement: string | null
          site_number: string | null
          site_state: string | null
          site_street: string | null
          site_zipcode: string | null
          start_date: string | null
          status: Database["public"]["Enums"]["contract_status"]
          tenant_id: string
          total_value: number
          updated_at: string
        }
        Insert: {
          billing_type?: Database["public"]["Enums"]["billing_type"] | null
          client_address_city?: string | null
          client_address_complement?: string | null
          client_address_number?: string | null
          client_address_state?: string | null
          client_address_street?: string | null
          client_address_zipcode?: string | null
          client_birth_date?: string | null
          client_email?: string | null
          client_id?: string | null
          client_legal_name?: string | null
          client_tax_id?: string | null
          construction_docs_days?: number | null
          contract_number: string
          contract_type: Database["public"]["Enums"]["contract_type"]
          created_at?: string
          display_order?: number | null
          engineering_docs_days?: number | null
          first_due_date?: string | null
          id?: string
          installment_count?: number | null
          installment_frequency?:
            | Database["public"]["Enums"]["installment_frequency"]
            | null
          installments_generated?: boolean
          layout_study_days?: number | null
          legacy_id?: string | null
          legal_permit_days?: number | null
          negotiation_id?: string | null
          notes?: string | null
          origin?: Database["public"]["Enums"]["lead_origin"] | null
          project_name?: string | null
          referrer_name?: string | null
          renderings_days?: number | null
          signature_date?: string | null
          site_city?: string | null
          site_complement?: string | null
          site_number?: string | null
          site_state?: string | null
          site_street?: string | null
          site_zipcode?: string | null
          start_date?: string | null
          status?: Database["public"]["Enums"]["contract_status"]
          tenant_id: string
          total_value: number
          updated_at?: string
        }
        Update: {
          billing_type?: Database["public"]["Enums"]["billing_type"] | null
          client_address_city?: string | null
          client_address_complement?: string | null
          client_address_number?: string | null
          client_address_state?: string | null
          client_address_street?: string | null
          client_address_zipcode?: string | null
          client_birth_date?: string | null
          client_email?: string | null
          client_id?: string | null
          client_legal_name?: string | null
          client_tax_id?: string | null
          construction_docs_days?: number | null
          contract_number?: string
          contract_type?: Database["public"]["Enums"]["contract_type"]
          created_at?: string
          display_order?: number | null
          engineering_docs_days?: number | null
          first_due_date?: string | null
          id?: string
          installment_count?: number | null
          installment_frequency?:
            | Database["public"]["Enums"]["installment_frequency"]
            | null
          installments_generated?: boolean
          layout_study_days?: number | null
          legacy_id?: string | null
          legal_permit_days?: number | null
          negotiation_id?: string | null
          notes?: string | null
          origin?: Database["public"]["Enums"]["lead_origin"] | null
          project_name?: string | null
          referrer_name?: string | null
          renderings_days?: number | null
          signature_date?: string | null
          site_city?: string | null
          site_complement?: string | null
          site_number?: string | null
          site_state?: string | null
          site_street?: string | null
          site_zipcode?: string | null
          start_date?: string | null
          status?: Database["public"]["Enums"]["contract_status"]
          tenant_id?: string
          total_value?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contracts_client_id_fkey"
            columns: ["client_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "contracts_negotiation_id_fkey"
            columns: ["negotiation_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "negotiations"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "contracts_tenant_id_fkey"
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
      negotiation_owner_history: {
        Row: {
          changed_at: string
          changed_by_id: string | null
          id: string
          negotiation_id: string
          new_owner_id: string
          previous_owner_id: string | null
          tenant_id: string
        }
        Insert: {
          changed_at?: string
          changed_by_id?: string | null
          id?: string
          negotiation_id: string
          new_owner_id: string
          previous_owner_id?: string | null
          tenant_id: string
        }
        Update: {
          changed_at?: string
          changed_by_id?: string | null
          id?: string
          negotiation_id?: string
          new_owner_id?: string
          previous_owner_id?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "negotiation_owner_history_changed_by_id_fkey"
            columns: ["changed_by_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "collaborators"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "negotiation_owner_history_negotiation_id_fkey"
            columns: ["negotiation_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "negotiations"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "negotiation_owner_history_new_owner_id_fkey"
            columns: ["new_owner_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "collaborators"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "negotiation_owner_history_previous_owner_id_fkey"
            columns: ["previous_owner_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "collaborators"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "negotiation_owner_history_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      negotiation_services: {
        Row: {
          created_at: string
          id: string
          negotiation_id: string
          service_type: Database["public"]["Enums"]["service_type"]
          tenant_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          negotiation_id: string
          service_type: Database["public"]["Enums"]["service_type"]
          tenant_id: string
        }
        Update: {
          created_at?: string
          id?: string
          negotiation_id?: string
          service_type?: Database["public"]["Enums"]["service_type"]
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "negotiation_services_negotiation_id_fkey"
            columns: ["negotiation_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "negotiations"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "negotiation_services_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      negotiations: {
        Row: {
          client_id: string | null
          close_probability: number | null
          closed_at: string | null
          commercial_owner_id: string
          created_at: string
          estimated_value: number | null
          expected_close_date: string | null
          funnel_entry_date: string
          funnel_stage: Database["public"]["Enums"]["funnel_stage"]
          generates_contract: boolean
          id: string
          legacy_id: string | null
          loss_notes: string | null
          loss_reason: Database["public"]["Enums"]["loss_reason"] | null
          name: string
          origin: Database["public"]["Enums"]["lead_origin"] | null
          referrer_name: string | null
          status: Database["public"]["Enums"]["negotiation_status"]
          tenant_id: string
          updated_at: string
        }
        Insert: {
          client_id?: string | null
          close_probability?: number | null
          closed_at?: string | null
          commercial_owner_id: string
          created_at?: string
          estimated_value?: number | null
          expected_close_date?: string | null
          funnel_entry_date?: string
          funnel_stage?: Database["public"]["Enums"]["funnel_stage"]
          generates_contract?: boolean
          id?: string
          legacy_id?: string | null
          loss_notes?: string | null
          loss_reason?: Database["public"]["Enums"]["loss_reason"] | null
          name: string
          origin?: Database["public"]["Enums"]["lead_origin"] | null
          referrer_name?: string | null
          status?: Database["public"]["Enums"]["negotiation_status"]
          tenant_id: string
          updated_at?: string
        }
        Update: {
          client_id?: string | null
          close_probability?: number | null
          closed_at?: string | null
          commercial_owner_id?: string
          created_at?: string
          estimated_value?: number | null
          expected_close_date?: string | null
          funnel_entry_date?: string
          funnel_stage?: Database["public"]["Enums"]["funnel_stage"]
          generates_contract?: boolean
          id?: string
          legacy_id?: string | null
          loss_notes?: string | null
          loss_reason?: Database["public"]["Enums"]["loss_reason"] | null
          name?: string
          origin?: Database["public"]["Enums"]["lead_origin"] | null
          referrer_name?: string | null
          status?: Database["public"]["Enums"]["negotiation_status"]
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "negotiations_client_id_fkey"
            columns: ["client_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "negotiations_commercial_owner_id_fkey"
            columns: ["commercial_owner_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "collaborators"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "negotiations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      project_checklist_items: {
        Row: {
          completed_at: string | null
          created_at: string
          display_order: number | null
          id: string
          is_completed: boolean
          phase: Database["public"]["Enums"]["project_phase"] | null
          project_id: string
          tenant_id: string
          title: string
          updated_at: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          display_order?: number | null
          id?: string
          is_completed?: boolean
          phase?: Database["public"]["Enums"]["project_phase"] | null
          project_id: string
          tenant_id: string
          title: string
          updated_at?: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          display_order?: number | null
          id?: string
          is_completed?: boolean
          phase?: Database["public"]["Enums"]["project_phase"] | null
          project_id?: string
          tenant_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_checklist_items_project_id_fkey"
            columns: ["project_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "project_progress"
            referencedColumns: ["project_id", "tenant_id"]
          },
          {
            foreignKeyName: "project_checklist_items_project_id_fkey"
            columns: ["project_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "project_checklist_items_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      project_land_types: {
        Row: {
          created_at: string
          id: string
          land_type: string
          project_id: string
          tenant_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          land_type: string
          project_id: string
          tenant_id: string
        }
        Update: {
          created_at?: string
          id?: string
          land_type?: string
          project_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_land_types_project_id_fkey"
            columns: ["project_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "project_progress"
            referencedColumns: ["project_id", "tenant_id"]
          },
          {
            foreignKeyName: "project_land_types_project_id_fkey"
            columns: ["project_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "project_land_types_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      project_purposes: {
        Row: {
          created_at: string
          id: string
          project_id: string
          purpose: string
          tenant_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          project_id: string
          purpose: string
          tenant_id: string
        }
        Update: {
          created_at?: string
          id?: string
          project_id?: string
          purpose?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_purposes_project_id_fkey"
            columns: ["project_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "project_progress"
            referencedColumns: ["project_id", "tenant_id"]
          },
          {
            foreignKeyName: "project_purposes_project_id_fkey"
            columns: ["project_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "project_purposes_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          city: string | null
          client_id: string | null
          commercial_responsible_id: string | null
          construction_docs_days: number | null
          contract_id: string | null
          created_at: string
          current_phase: Database["public"]["Enums"]["project_phase"]
          display_order: number | null
          engineering_docs_days: number | null
          id: string
          land_area_m2: number | null
          layout_study_days: number | null
          legacy_id: string | null
          legal_permit_days: number | null
          location: string | null
          name: string
          notes: string | null
          operational_responsible_id: string | null
          project_area_m2: number | null
          project_type: Database["public"]["Enums"]["contract_type"]
          renderings_days: number | null
          site_address_text: string | null
          start_date: string | null
          state: string | null
          status: Database["public"]["Enums"]["project_status"]
          subdivision_block: string | null
          subdivision_lot: string | null
          subdivision_name: string | null
          tenant_id: string
          total_value: number | null
          updated_at: string
          visible_in_list: boolean
        }
        Insert: {
          city?: string | null
          client_id?: string | null
          commercial_responsible_id?: string | null
          construction_docs_days?: number | null
          contract_id?: string | null
          created_at?: string
          current_phase?: Database["public"]["Enums"]["project_phase"]
          display_order?: number | null
          engineering_docs_days?: number | null
          id?: string
          land_area_m2?: number | null
          layout_study_days?: number | null
          legacy_id?: string | null
          legal_permit_days?: number | null
          location?: string | null
          name: string
          notes?: string | null
          operational_responsible_id?: string | null
          project_area_m2?: number | null
          project_type: Database["public"]["Enums"]["contract_type"]
          renderings_days?: number | null
          site_address_text?: string | null
          start_date?: string | null
          state?: string | null
          status?: Database["public"]["Enums"]["project_status"]
          subdivision_block?: string | null
          subdivision_lot?: string | null
          subdivision_name?: string | null
          tenant_id: string
          total_value?: number | null
          updated_at?: string
          visible_in_list?: boolean
        }
        Update: {
          city?: string | null
          client_id?: string | null
          commercial_responsible_id?: string | null
          construction_docs_days?: number | null
          contract_id?: string | null
          created_at?: string
          current_phase?: Database["public"]["Enums"]["project_phase"]
          display_order?: number | null
          engineering_docs_days?: number | null
          id?: string
          land_area_m2?: number | null
          layout_study_days?: number | null
          legacy_id?: string | null
          legal_permit_days?: number | null
          location?: string | null
          name?: string
          notes?: string | null
          operational_responsible_id?: string | null
          project_area_m2?: number | null
          project_type?: Database["public"]["Enums"]["contract_type"]
          renderings_days?: number | null
          site_address_text?: string | null
          start_date?: string | null
          state?: string | null
          status?: Database["public"]["Enums"]["project_status"]
          subdivision_block?: string | null
          subdivision_lot?: string | null
          subdivision_name?: string | null
          tenant_id?: string
          total_value?: number | null
          updated_at?: string
          visible_in_list?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "projects_client_id_fkey"
            columns: ["client_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "projects_commercial_responsible_id_fkey"
            columns: ["commercial_responsible_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "collaborators"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "projects_contract_id_fkey"
            columns: ["contract_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "projects_operational_responsible_id_fkey"
            columns: ["operational_responsible_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "collaborators"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "projects_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      public_endpoint_hits: {
        Row: {
          client_key: string
          hit_count: number
          scope: string
          window_start: string
        }
        Insert: {
          client_key: string
          hit_count?: number
          scope: string
          window_start: string
        }
        Update: {
          client_key?: string
          hit_count?: number
          scope?: string
          window_start?: string
        }
        Relationships: []
      }
      task_checklist_items: {
        Row: {
          completed_at: string | null
          created_at: string
          display_order: number | null
          id: string
          is_completed: boolean
          is_required: boolean
          phase: Database["public"]["Enums"]["project_phase"] | null
          task_id: string
          tenant_id: string
          title: string
          updated_at: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          display_order?: number | null
          id?: string
          is_completed?: boolean
          is_required?: boolean
          phase?: Database["public"]["Enums"]["project_phase"] | null
          task_id: string
          tenant_id: string
          title: string
          updated_at?: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          display_order?: number | null
          id?: string
          is_completed?: boolean
          is_required?: boolean
          phase?: Database["public"]["Enums"]["project_phase"] | null
          task_id?: string
          tenant_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_checklist_items_task_id_fkey"
            columns: ["task_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "task_checklist_items_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          completion_date: string | null
          created_at: string
          description: string | null
          due_date: string | null
          estimated_hours: number | null
          id: string
          legacy_id: string | null
          phase: Database["public"]["Enums"]["project_phase"]
          priority: Database["public"]["Enums"]["priority_level"]
          project_id: string | null
          responsible_id: string | null
          spent_hours: number | null
          start_date: string | null
          status: Database["public"]["Enums"]["work_status"]
          task_type: Database["public"]["Enums"]["task_type"] | null
          tenant_id: string
          title: string
          updated_at: string
        }
        Insert: {
          completion_date?: string | null
          created_at?: string
          description?: string | null
          due_date?: string | null
          estimated_hours?: number | null
          id?: string
          legacy_id?: string | null
          phase?: Database["public"]["Enums"]["project_phase"]
          priority?: Database["public"]["Enums"]["priority_level"]
          project_id?: string | null
          responsible_id?: string | null
          spent_hours?: number | null
          start_date?: string | null
          status?: Database["public"]["Enums"]["work_status"]
          task_type?: Database["public"]["Enums"]["task_type"] | null
          tenant_id: string
          title: string
          updated_at?: string
        }
        Update: {
          completion_date?: string | null
          created_at?: string
          description?: string | null
          due_date?: string | null
          estimated_hours?: number | null
          id?: string
          legacy_id?: string | null
          phase?: Database["public"]["Enums"]["project_phase"]
          priority?: Database["public"]["Enums"]["priority_level"]
          project_id?: string | null
          responsible_id?: string | null
          spent_hours?: number | null
          start_date?: string | null
          status?: Database["public"]["Enums"]["work_status"]
          task_type?: Database["public"]["Enums"]["task_type"] | null
          tenant_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_project_id_fkey"
            columns: ["project_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "project_progress"
            referencedColumns: ["project_id", "tenant_id"]
          },
          {
            foreignKeyName: "tasks_project_id_fkey"
            columns: ["project_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "tasks_responsible_id_fkey"
            columns: ["responsible_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "collaborators"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "tasks_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
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
      project_progress: {
        Row: {
          phase_percent: number | null
          progress_percent: number | null
          project_id: string | null
          required_items_completed: number | null
          required_items_total: number | null
          tasks_completed: number | null
          tasks_total: number | null
          tenant_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "projects_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
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
      hit_public_endpoint: {
        Args: {
          p_client_key: string
          p_limit: number
          p_scope: string
          p_window_seconds: number
        }
        Returns: {
          allowed: boolean
          hit_count: number
        }[]
      }
      is_active_collaborator: { Args: never; Returns: boolean }
      is_tenant_director: { Args: never; Returns: boolean }
      open_client_intake: {
        Args: { p_token: string }
        Returns: {
          client_name: string
          expires_at: string
          outcome: Database["public"]["Enums"]["client_intake_outcome"]
        }[]
      }
      submit_client_intake: {
        Args: { p_payload: Json; p_token: string }
        Returns: boolean
      }
    }
    Enums: {
      access_request_status: "pending" | "approved" | "rejected"
      billing_type:
        | "by_phase"
        | "monthly_installments"
        | "upfront"
        | "percent_of_construction"
      client_intake_outcome:
        | "active"
        | "expired"
        | "already_submitted"
        | "not_found"
      client_intake_status: "active" | "expired" | "submitted"
      client_intake_validation_status:
        | "created"
        | "ok"
        | "expired"
        | "already_submitted"
        | "expired_on_submit"
        | "submitted"
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
      contract_status:
        | "negotiating"
        | "approved"
        | "in_progress"
        | "completed"
        | "terminated"
      contract_type:
        | "architecture"
        | "architecture_engineering"
        | "architecture_interiors"
        | "full"
      funnel_stage:
        | "lead_received"
        | "qualified"
        | "proposal_sent"
        | "negotiating"
        | "closing"
      installment_frequency: "monthly" | "biweekly" | "weekly" | "single"
      lead_origin: "instagram" | "referral" | "website" | "event" | "other"
      lead_source: "instagram" | "referral" | "website" | "other"
      loss_reason:
        | "price"
        | "timeline"
        | "chose_competitor"
        | "postponed"
        | "no_response"
        | "other"
      negotiation_status: "active" | "won" | "lost"
      priority_level: "low" | "medium" | "high" | "urgent"
      project_phase:
        | "not_started"
        | "briefing"
        | "layout"
        | "renderings"
        | "revision"
        | "legal_permit"
        | "hoa_approval"
        | "construction_docs"
        | "engineering_docs"
        | "building_permit"
        | "awaiting_client"
        | "finished"
      project_status:
        | "prospecting"
        | "under_contract"
        | "in_development"
        | "in_approval"
        | "completed"
        | "suspended"
      service_type:
        | "architecture"
        | "interiors"
        | "structural"
        | "plumbing"
        | "electrical"
        | "consulting"
      task_type: "technical" | "meeting" | "review" | "administrative"
      tenant_role: "owner" | "member"
      tenant_status: "active" | "suspended"
      work_status: "not_started" | "in_progress" | "completed"
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
      billing_type: [
        "by_phase",
        "monthly_installments",
        "upfront",
        "percent_of_construction",
      ],
      client_intake_outcome: [
        "active",
        "expired",
        "already_submitted",
        "not_found",
      ],
      client_intake_status: ["active", "expired", "submitted"],
      client_intake_validation_status: [
        "created",
        "ok",
        "expired",
        "already_submitted",
        "expired_on_submit",
        "submitted",
      ],
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
      contract_status: [
        "negotiating",
        "approved",
        "in_progress",
        "completed",
        "terminated",
      ],
      contract_type: [
        "architecture",
        "architecture_engineering",
        "architecture_interiors",
        "full",
      ],
      funnel_stage: [
        "lead_received",
        "qualified",
        "proposal_sent",
        "negotiating",
        "closing",
      ],
      installment_frequency: ["monthly", "biweekly", "weekly", "single"],
      lead_origin: ["instagram", "referral", "website", "event", "other"],
      lead_source: ["instagram", "referral", "website", "other"],
      loss_reason: [
        "price",
        "timeline",
        "chose_competitor",
        "postponed",
        "no_response",
        "other",
      ],
      negotiation_status: ["active", "won", "lost"],
      priority_level: ["low", "medium", "high", "urgent"],
      project_phase: [
        "not_started",
        "briefing",
        "layout",
        "renderings",
        "revision",
        "legal_permit",
        "hoa_approval",
        "construction_docs",
        "engineering_docs",
        "building_permit",
        "awaiting_client",
        "finished",
      ],
      project_status: [
        "prospecting",
        "under_contract",
        "in_development",
        "in_approval",
        "completed",
        "suspended",
      ],
      service_type: [
        "architecture",
        "interiors",
        "structural",
        "plumbing",
        "electrical",
        "consulting",
      ],
      task_type: ["technical", "meeting", "review", "administrative"],
      tenant_role: ["owner", "member"],
      tenant_status: ["active", "suspended"],
      work_status: ["not_started", "in_progress", "completed"],
    },
  },
} as const
