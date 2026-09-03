export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
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
      accounts_payable: {
        Row: {
          category: Database["public"]["Enums"]["expense_category"]
          competence_month: string | null
          created_at: string
          description: string
          due_date: string
          id: string
          is_recurring: boolean
          legacy_id: string | null
          payment_date: string | null
          payment_method: Database["public"]["Enums"]["payment_method"] | null
          project_id: string | null
          recurrence_count: number | null
          recurrence_end_date: string | null
          recurrence_frequency:
            | Database["public"]["Enums"]["recurrence_frequency"]
            | null
          recurrence_parent_id: string | null
          recurrence_start_date: string | null
          recurrence_status:
            | Database["public"]["Enums"]["recurrence_status"]
            | null
          status: Database["public"]["Enums"]["financial_status"]
          supplier_name: string
          tenant_id: string
          updated_at: string
          value: number
        }
        Insert: {
          category: Database["public"]["Enums"]["expense_category"]
          competence_month?: string | null
          created_at?: string
          description: string
          due_date: string
          id?: string
          is_recurring?: boolean
          legacy_id?: string | null
          payment_date?: string | null
          payment_method?: Database["public"]["Enums"]["payment_method"] | null
          project_id?: string | null
          recurrence_count?: number | null
          recurrence_end_date?: string | null
          recurrence_frequency?:
            | Database["public"]["Enums"]["recurrence_frequency"]
            | null
          recurrence_parent_id?: string | null
          recurrence_start_date?: string | null
          recurrence_status?:
            | Database["public"]["Enums"]["recurrence_status"]
            | null
          status?: Database["public"]["Enums"]["financial_status"]
          supplier_name: string
          tenant_id: string
          updated_at?: string
          value: number
        }
        Update: {
          category?: Database["public"]["Enums"]["expense_category"]
          competence_month?: string | null
          created_at?: string
          description?: string
          due_date?: string
          id?: string
          is_recurring?: boolean
          legacy_id?: string | null
          payment_date?: string | null
          payment_method?: Database["public"]["Enums"]["payment_method"] | null
          project_id?: string | null
          recurrence_count?: number | null
          recurrence_end_date?: string | null
          recurrence_frequency?:
            | Database["public"]["Enums"]["recurrence_frequency"]
            | null
          recurrence_parent_id?: string | null
          recurrence_start_date?: string | null
          recurrence_status?:
            | Database["public"]["Enums"]["recurrence_status"]
            | null
          status?: Database["public"]["Enums"]["financial_status"]
          supplier_name?: string
          tenant_id?: string
          updated_at?: string
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "accounts_payable_project_id_fkey"
            columns: ["project_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "project_progress"
            referencedColumns: ["project_id", "tenant_id"]
          },
          {
            foreignKeyName: "accounts_payable_project_id_fkey"
            columns: ["project_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "accounts_payable_recurrence_parent_id_fkey"
            columns: ["recurrence_parent_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "accounts_payable"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "accounts_payable_recurrence_parent_id_fkey"
            columns: ["recurrence_parent_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "accounts_payable_status"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "accounts_payable_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      accounts_receivable: {
        Row: {
          client_id: string | null
          contract_id: string | null
          created_at: string
          description: string
          due_date: string
          id: string
          installment_number: number | null
          installment_total: number | null
          issue_date: string | null
          legacy_id: string | null
          payment_date: string | null
          payment_method: Database["public"]["Enums"]["payment_method"] | null
          project_id: string | null
          status: Database["public"]["Enums"]["financial_status"]
          tenant_id: string
          updated_at: string
          value: number
        }
        Insert: {
          client_id?: string | null
          contract_id?: string | null
          created_at?: string
          description: string
          due_date: string
          id?: string
          installment_number?: number | null
          installment_total?: number | null
          issue_date?: string | null
          legacy_id?: string | null
          payment_date?: string | null
          payment_method?: Database["public"]["Enums"]["payment_method"] | null
          project_id?: string | null
          status?: Database["public"]["Enums"]["financial_status"]
          tenant_id: string
          updated_at?: string
          value: number
        }
        Update: {
          client_id?: string | null
          contract_id?: string | null
          created_at?: string
          description?: string
          due_date?: string
          id?: string
          installment_number?: number | null
          installment_total?: number | null
          issue_date?: string | null
          legacy_id?: string | null
          payment_date?: string | null
          payment_method?: Database["public"]["Enums"]["payment_method"] | null
          project_id?: string | null
          status?: Database["public"]["Enums"]["financial_status"]
          tenant_id?: string
          updated_at?: string
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "accounts_receivable_client_id_fkey"
            columns: ["client_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "accounts_receivable_contract_id_fkey"
            columns: ["contract_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "accounts_receivable_project_id_fkey"
            columns: ["project_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "project_progress"
            referencedColumns: ["project_id", "tenant_id"]
          },
          {
            foreignKeyName: "accounts_receivable_project_id_fkey"
            columns: ["project_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "accounts_receivable_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      activities: {
        Row: {
          client_id: string | null
          collaborator_id: string | null
          completed_at: string | null
          completed_by: string | null
          coordinator_id: string | null
          created_at: string
          deleted_at: string | null
          deleted_by: string | null
          description: string
          end_date: string
          execution_order: number | null
          id: string
          last_alert_on: string | null
          legacy_id: string | null
          notes: string | null
          priority: Database["public"]["Enums"]["priority_level"]
          project_id: string | null
          start_date: string
          started_at: string | null
          started_by: string | null
          status: Database["public"]["Enums"]["work_status"]
          tenant_id: string
          total_minutes: number | null
          updated_at: string
        }
        Insert: {
          client_id?: string | null
          collaborator_id?: string | null
          completed_at?: string | null
          completed_by?: string | null
          coordinator_id?: string | null
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          description: string
          end_date: string
          execution_order?: number | null
          id?: string
          last_alert_on?: string | null
          legacy_id?: string | null
          notes?: string | null
          priority?: Database["public"]["Enums"]["priority_level"]
          project_id?: string | null
          start_date: string
          started_at?: string | null
          started_by?: string | null
          status?: Database["public"]["Enums"]["work_status"]
          tenant_id: string
          total_minutes?: number | null
          updated_at?: string
        }
        Update: {
          client_id?: string | null
          collaborator_id?: string | null
          completed_at?: string | null
          completed_by?: string | null
          coordinator_id?: string | null
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string
          end_date?: string
          execution_order?: number | null
          id?: string
          last_alert_on?: string | null
          legacy_id?: string | null
          notes?: string | null
          priority?: Database["public"]["Enums"]["priority_level"]
          project_id?: string | null
          start_date?: string
          started_at?: string | null
          started_by?: string | null
          status?: Database["public"]["Enums"]["work_status"]
          tenant_id?: string
          total_minutes?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "activities_client_id_fkey"
            columns: ["client_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "activities_collaborator_id_fkey"
            columns: ["collaborator_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "collaborators"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "activities_completed_by_fkey"
            columns: ["completed_by", "tenant_id"]
            isOneToOne: false
            referencedRelation: "collaborators"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "activities_coordinator_id_fkey"
            columns: ["coordinator_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "collaborators"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "activities_deleted_by_fkey"
            columns: ["deleted_by", "tenant_id"]
            isOneToOne: false
            referencedRelation: "collaborators"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "activities_project_id_fkey"
            columns: ["project_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "project_progress"
            referencedColumns: ["project_id", "tenant_id"]
          },
          {
            foreignKeyName: "activities_project_id_fkey"
            columns: ["project_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "activities_started_by_fkey"
            columns: ["started_by", "tenant_id"]
            isOneToOne: false
            referencedRelation: "collaborators"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "activities_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      budget_checklist_items: {
        Row: {
          approval_date: string | null
          approved_value: number | null
          budget_file_name: string | null
          budget_file_path: string | null
          category: Database["public"]["Enums"]["supplier_category"] | null
          checklist_id: string
          chosen_supplier_id: string | null
          client_approved: boolean
          commission_percent: number | null
          commission_received: boolean
          commission_value: number | null
          created_at: string
          description: string | null
          due_date: string | null
          estimated_value: number | null
          id: string
          is_required: boolean
          legacy_id: string | null
          name: string
          notes: string | null
          priority: Database["public"]["Enums"]["priority_level"]
          responsible_id: string | null
          status: Database["public"]["Enums"]["budget_item_status"]
          tenant_id: string
          updated_at: string
        }
        Insert: {
          approval_date?: string | null
          approved_value?: number | null
          budget_file_name?: string | null
          budget_file_path?: string | null
          category?: Database["public"]["Enums"]["supplier_category"] | null
          checklist_id: string
          chosen_supplier_id?: string | null
          client_approved?: boolean
          commission_percent?: number | null
          commission_received?: boolean
          commission_value?: number | null
          created_at?: string
          description?: string | null
          due_date?: string | null
          estimated_value?: number | null
          id?: string
          is_required?: boolean
          legacy_id?: string | null
          name: string
          notes?: string | null
          priority?: Database["public"]["Enums"]["priority_level"]
          responsible_id?: string | null
          status?: Database["public"]["Enums"]["budget_item_status"]
          tenant_id: string
          updated_at?: string
        }
        Update: {
          approval_date?: string | null
          approved_value?: number | null
          budget_file_name?: string | null
          budget_file_path?: string | null
          category?: Database["public"]["Enums"]["supplier_category"] | null
          checklist_id?: string
          chosen_supplier_id?: string | null
          client_approved?: boolean
          commission_percent?: number | null
          commission_received?: boolean
          commission_value?: number | null
          created_at?: string
          description?: string | null
          due_date?: string | null
          estimated_value?: number | null
          id?: string
          is_required?: boolean
          legacy_id?: string | null
          name?: string
          notes?: string | null
          priority?: Database["public"]["Enums"]["priority_level"]
          responsible_id?: string | null
          status?: Database["public"]["Enums"]["budget_item_status"]
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "budget_checklist_items_checklist_id_fkey"
            columns: ["checklist_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "budget_checklist_totals"
            referencedColumns: ["checklist_id", "tenant_id"]
          },
          {
            foreignKeyName: "budget_checklist_items_checklist_id_fkey"
            columns: ["checklist_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "budget_checklists"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "budget_checklist_items_chosen_supplier_id_fkey"
            columns: ["chosen_supplier_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "supplier_commission_totals"
            referencedColumns: ["supplier_id", "tenant_id"]
          },
          {
            foreignKeyName: "budget_checklist_items_chosen_supplier_id_fkey"
            columns: ["chosen_supplier_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "budget_checklist_items_responsible_id_fkey"
            columns: ["responsible_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "collaborators"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "budget_checklist_items_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      budget_checklists: {
        Row: {
          client_id: string
          completion_date: string | null
          created_at: string
          curation_percent: number | null
          id: string
          legacy_id: string | null
          notes: string | null
          project_id: string | null
          project_phase: Database["public"]["Enums"]["project_phase"] | null
          responsible_id: string | null
          start_date: string | null
          status: Database["public"]["Enums"]["budget_checklist_status"]
          tenant_id: string
          updated_at: string
        }
        Insert: {
          client_id: string
          completion_date?: string | null
          created_at?: string
          curation_percent?: number | null
          id?: string
          legacy_id?: string | null
          notes?: string | null
          project_id?: string | null
          project_phase?: Database["public"]["Enums"]["project_phase"] | null
          responsible_id?: string | null
          start_date?: string | null
          status?: Database["public"]["Enums"]["budget_checklist_status"]
          tenant_id: string
          updated_at?: string
        }
        Update: {
          client_id?: string
          completion_date?: string | null
          created_at?: string
          curation_percent?: number | null
          id?: string
          legacy_id?: string | null
          notes?: string | null
          project_id?: string | null
          project_phase?: Database["public"]["Enums"]["project_phase"] | null
          responsible_id?: string | null
          start_date?: string | null
          status?: Database["public"]["Enums"]["budget_checklist_status"]
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "budget_checklists_client_id_fkey"
            columns: ["client_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "budget_checklists_project_id_fkey"
            columns: ["project_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "project_progress"
            referencedColumns: ["project_id", "tenant_id"]
          },
          {
            foreignKeyName: "budget_checklists_project_id_fkey"
            columns: ["project_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "budget_checklists_responsible_id_fkey"
            columns: ["responsible_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "collaborators"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "budget_checklists_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      budget_item_approval_files: {
        Row: {
          created_at: string
          file_name: string
          file_path: string
          id: string
          item_id: string
          legacy_id: string | null
          tenant_id: string
          updated_at: string
          uploaded_on: string
        }
        Insert: {
          created_at?: string
          file_name: string
          file_path: string
          id?: string
          item_id: string
          legacy_id?: string | null
          tenant_id: string
          updated_at?: string
          uploaded_on?: string
        }
        Update: {
          created_at?: string
          file_name?: string
          file_path?: string
          id?: string
          item_id?: string
          legacy_id?: string | null
          tenant_id?: string
          updated_at?: string
          uploaded_on?: string
        }
        Relationships: [
          {
            foreignKeyName: "budget_item_approval_files_item_id_fkey"
            columns: ["item_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "budget_checklist_items"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "budget_item_approval_files_item_id_fkey"
            columns: ["item_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "budget_item_attachments"
            referencedColumns: ["item_id", "tenant_id"]
          },
          {
            foreignKeyName: "budget_item_approval_files_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      budget_item_quotes: {
        Row: {
          created_at: string
          id: string
          item_id: string
          legacy_id: string | null
          notes: string | null
          quote_file_name: string | null
          quote_file_path: string | null
          supplier_id: string
          tenant_id: string
          updated_at: string
          value: number | null
        }
        Insert: {
          created_at?: string
          id?: string
          item_id: string
          legacy_id?: string | null
          notes?: string | null
          quote_file_name?: string | null
          quote_file_path?: string | null
          supplier_id: string
          tenant_id: string
          updated_at?: string
          value?: number | null
        }
        Update: {
          created_at?: string
          id?: string
          item_id?: string
          legacy_id?: string | null
          notes?: string | null
          quote_file_name?: string | null
          quote_file_path?: string | null
          supplier_id?: string
          tenant_id?: string
          updated_at?: string
          value?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "budget_item_quotes_item_id_fkey"
            columns: ["item_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "budget_checklist_items"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "budget_item_quotes_item_id_fkey"
            columns: ["item_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "budget_item_attachments"
            referencedColumns: ["item_id", "tenant_id"]
          },
          {
            foreignKeyName: "budget_item_quotes_supplier_id_fkey"
            columns: ["supplier_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "supplier_commission_totals"
            referencedColumns: ["supplier_id", "tenant_id"]
          },
          {
            foreignKeyName: "budget_item_quotes_supplier_id_fkey"
            columns: ["supplier_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "budget_item_quotes_tenant_id_fkey"
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
          client_id: string | null
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
          client_id?: string | null
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
          client_id?: string | null
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
          address_city: string | null
          address_complement: string | null
          address_country: string
          address_district: string | null
          address_number: string | null
          address_state: string | null
          address_street: string | null
          address_zipcode: string | null
          birth_date: string | null
          client_key: string | null
          client_type: Database["public"]["Enums"]["client_type"] | null
          company_address_city: string | null
          company_address_complement: string | null
          company_address_district: string | null
          company_address_number: string | null
          company_address_state: string | null
          company_address_street: string | null
          company_address_zipcode: string | null
          company_legal_name: string | null
          company_state_registration: string | null
          company_trade_name: string | null
          created_at: string
          email: string | null
          email_normalized: string | null
          id: string
          lead_source: Database["public"]["Enums"]["lead_source"] | null
          legacy_id: string | null
          name: string
          notes: string | null
          phone: string
          phone_digits: string | null
          referrer_client_id: string | null
          referrer_name: string | null
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
          address_city?: string | null
          address_complement?: string | null
          address_country?: string
          address_district?: string | null
          address_number?: string | null
          address_state?: string | null
          address_street?: string | null
          address_zipcode?: string | null
          birth_date?: string | null
          client_key?: string | null
          client_type?: Database["public"]["Enums"]["client_type"] | null
          company_address_city?: string | null
          company_address_complement?: string | null
          company_address_district?: string | null
          company_address_number?: string | null
          company_address_state?: string | null
          company_address_street?: string | null
          company_address_zipcode?: string | null
          company_legal_name?: string | null
          company_state_registration?: string | null
          company_trade_name?: string | null
          created_at?: string
          email?: string | null
          email_normalized?: string | null
          id?: string
          lead_source?: Database["public"]["Enums"]["lead_source"] | null
          legacy_id?: string | null
          name: string
          notes?: string | null
          phone: string
          phone_digits?: string | null
          referrer_client_id?: string | null
          referrer_name?: string | null
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
          address_city?: string | null
          address_complement?: string | null
          address_country?: string
          address_district?: string | null
          address_number?: string | null
          address_state?: string | null
          address_street?: string | null
          address_zipcode?: string | null
          birth_date?: string | null
          client_key?: string | null
          client_type?: Database["public"]["Enums"]["client_type"] | null
          company_address_city?: string | null
          company_address_complement?: string | null
          company_address_district?: string | null
          company_address_number?: string | null
          company_address_state?: string | null
          company_address_street?: string | null
          company_address_zipcode?: string | null
          company_legal_name?: string | null
          company_state_registration?: string | null
          company_trade_name?: string | null
          created_at?: string
          email?: string | null
          email_normalized?: string | null
          id?: string
          lead_source?: Database["public"]["Enums"]["lead_source"] | null
          legacy_id?: string | null
          name?: string
          notes?: string | null
          phone?: string
          phone_digits?: string | null
          referrer_client_id?: string | null
          referrer_name?: string | null
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
            foreignKeyName: "clients_referrer_client_fkey"
            columns: ["referrer_client_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id", "tenant_id"]
          },
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
          avatar_path: string | null
          coordinator_id: string | null
          created_at: string
          email: string
          id: string
          legacy_id: string | null
          name: string
          phone: string | null
          role: Database["public"]["Enums"]["collaborator_role"]
          status: Database["public"]["Enums"]["collaborator_status"]
          tenant_id: string
          updated_at: string
          user_id: string | null
          weekly_hours: number | null
        }
        Insert: {
          area?: Database["public"]["Enums"]["collaborator_area"] | null
          avatar_path?: string | null
          coordinator_id?: string | null
          created_at?: string
          email: string
          id?: string
          legacy_id?: string | null
          name: string
          phone?: string | null
          role: Database["public"]["Enums"]["collaborator_role"]
          status?: Database["public"]["Enums"]["collaborator_status"]
          tenant_id: string
          updated_at?: string
          user_id?: string | null
          weekly_hours?: number | null
        }
        Update: {
          area?: Database["public"]["Enums"]["collaborator_area"] | null
          avatar_path?: string | null
          coordinator_id?: string | null
          created_at?: string
          email?: string
          id?: string
          legacy_id?: string | null
          name?: string
          phone?: string | null
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
      financial_categories: {
        Row: {
          cost_center: Database["public"]["Enums"]["cost_center"] | null
          created_at: string
          id: string
          legacy_id: string | null
          name: string
          tenant_id: string
          type: Database["public"]["Enums"]["financial_category_type"]
          updated_at: string
        }
        Insert: {
          cost_center?: Database["public"]["Enums"]["cost_center"] | null
          created_at?: string
          id?: string
          legacy_id?: string | null
          name: string
          tenant_id: string
          type: Database["public"]["Enums"]["financial_category_type"]
          updated_at?: string
        }
        Update: {
          cost_center?: Database["public"]["Enums"]["cost_center"] | null
          created_at?: string
          id?: string
          legacy_id?: string | null
          name?: string
          tenant_id?: string
          type?: Database["public"]["Enums"]["financial_category_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "financial_categories_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      google_calendar_connections: {
        Row: {
          calendar_id: string
          calendar_label: string | null
          connected_at: string
          connected_by_id: string | null
          created_at: string
          google_account_email: string
          granted_scopes: string
          id: string
          last_error: string | null
          last_error_at: string | null
          last_success_at: string | null
          refresh_token_secret_id: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          calendar_id?: string
          calendar_label?: string | null
          connected_at?: string
          connected_by_id?: string | null
          created_at?: string
          google_account_email: string
          granted_scopes: string
          id?: string
          last_error?: string | null
          last_error_at?: string | null
          last_success_at?: string | null
          refresh_token_secret_id: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          calendar_id?: string
          calendar_label?: string | null
          connected_at?: string
          connected_by_id?: string | null
          created_at?: string
          google_account_email?: string
          granted_scopes?: string
          id?: string
          last_error?: string | null
          last_error_at?: string | null
          last_success_at?: string | null
          refresh_token_secret_id?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "google_calendar_connections_connected_by_fkey"
            columns: ["connected_by_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "collaborators"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "google_calendar_connections_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      google_oauth_states: {
        Row: {
          collaborator_id: string
          consumed_at: string | null
          created_at: string
          expires_at: string
          state_hash: string
          tenant_id: string
        }
        Insert: {
          collaborator_id: string
          consumed_at?: string | null
          created_at?: string
          expires_at?: string
          state_hash: string
          tenant_id: string
        }
        Update: {
          collaborator_id?: string
          consumed_at?: string | null
          created_at?: string
          expires_at?: string
          state_hash?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "google_oauth_states_collaborator_fkey"
            columns: ["collaborator_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "collaborators"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "google_oauth_states_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      integration_api_keys: {
        Row: {
          created_at: string
          created_by_id: string | null
          id: string
          key_hash: string
          key_prefix: string
          key_secret_id: string | null
          last_used_at: string | null
          name: string
          revoked_at: string | null
          revoked_by_id: string | null
          scope: Database["public"]["Enums"]["integration_scope"]
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by_id?: string | null
          id?: string
          key_hash: string
          key_prefix: string
          key_secret_id?: string | null
          last_used_at?: string | null
          name: string
          revoked_at?: string | null
          revoked_by_id?: string | null
          scope?: Database["public"]["Enums"]["integration_scope"]
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by_id?: string | null
          id?: string
          key_hash?: string
          key_prefix?: string
          key_secret_id?: string | null
          last_used_at?: string | null
          name?: string
          revoked_at?: string | null
          revoked_by_id?: string | null
          scope?: Database["public"]["Enums"]["integration_scope"]
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "integration_api_keys_created_by_fkey"
            columns: ["created_by_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "collaborators"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "integration_api_keys_revoked_by_fkey"
            columns: ["revoked_by_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "collaborators"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "integration_api_keys_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      map_properties: {
        Row: {
          address: string | null
          city: string | null
          client_id: string | null
          client_label: string | null
          created_at: string
          id: string
          land_area_m2: number | null
          lat: number
          legacy_id: string | null
          lng: number
          project_area_m2: number | null
          project_id: string | null
          project_label: string | null
          state: string | null
          subdivision_block: string | null
          subdivision_lot: string | null
          subdivision_name: string | null
          tenant_id: string
          updated_at: string
          visual_status: Database["public"]["Enums"]["map_visual_status"]
        }
        Insert: {
          address?: string | null
          city?: string | null
          client_id?: string | null
          client_label?: string | null
          created_at?: string
          id?: string
          land_area_m2?: number | null
          lat: number
          legacy_id?: string | null
          lng: number
          project_area_m2?: number | null
          project_id?: string | null
          project_label?: string | null
          state?: string | null
          subdivision_block?: string | null
          subdivision_lot?: string | null
          subdivision_name?: string | null
          tenant_id: string
          updated_at?: string
          visual_status?: Database["public"]["Enums"]["map_visual_status"]
        }
        Update: {
          address?: string | null
          city?: string | null
          client_id?: string | null
          client_label?: string | null
          created_at?: string
          id?: string
          land_area_m2?: number | null
          lat?: number
          legacy_id?: string | null
          lng?: number
          project_area_m2?: number | null
          project_id?: string | null
          project_label?: string | null
          state?: string | null
          subdivision_block?: string | null
          subdivision_lot?: string | null
          subdivision_name?: string | null
          tenant_id?: string
          updated_at?: string
          visual_status?: Database["public"]["Enums"]["map_visual_status"]
        }
        Relationships: [
          {
            foreignKeyName: "map_properties_client_id_fkey"
            columns: ["client_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "map_properties_project_id_fkey"
            columns: ["project_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "project_progress"
            referencedColumns: ["project_id", "tenant_id"]
          },
          {
            foreignKeyName: "map_properties_project_id_fkey"
            columns: ["project_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "map_properties_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      map_property_land_types: {
        Row: {
          created_at: string
          id: string
          land_type: string
          map_property_id: string
          tenant_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          land_type: string
          map_property_id: string
          tenant_id: string
        }
        Update: {
          created_at?: string
          id?: string
          land_type?: string
          map_property_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "map_property_land_types_map_property_id_fkey"
            columns: ["map_property_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "map_properties"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "map_property_land_types_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      map_property_purposes: {
        Row: {
          created_at: string
          id: string
          map_property_id: string
          purpose: string
          tenant_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          map_property_id: string
          purpose: string
          tenant_id: string
        }
        Update: {
          created_at?: string
          id?: string
          map_property_id?: string
          purpose?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "map_property_purposes_map_property_id_fkey"
            columns: ["map_property_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "map_properties"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "map_property_purposes_tenant_id_fkey"
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
          service_type_id: string
          tenant_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          negotiation_id: string
          service_type_id: string
          tenant_id: string
        }
        Update: {
          created_at?: string
          id?: string
          negotiation_id?: string
          service_type_id?: string
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
            foreignKeyName: "negotiation_services_service_type_id_fkey"
            columns: ["service_type_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "service_types"
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
          commercial_owner_id: string | null
          created_at: string
          estimated_value: number | null
          expected_close_date: string | null
          funnel_entry_date: string | null
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
          commercial_owner_id?: string | null
          created_at?: string
          estimated_value?: number | null
          expected_close_date?: string | null
          funnel_entry_date?: string | null
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
          commercial_owner_id?: string | null
          created_at?: string
          estimated_value?: number | null
          expected_close_date?: string | null
          funnel_entry_date?: string | null
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
      project_diary_entries: {
        Row: {
          created_at: string
          created_by_id: string | null
          description: string | null
          entry_type: Database["public"]["Enums"]["diary_entry_type"]
          event_key: string | null
          from_phase: Database["public"]["Enums"]["project_phase"] | null
          id: string
          is_automatic: boolean
          legacy_id: string | null
          occurrence_date: string
          occurrence_time: string | null
          operational_tag: Database["public"]["Enums"]["operational_tag"] | null
          project_id: string
          responsible_id: string | null
          status: Database["public"]["Enums"]["diary_entry_status"]
          system_event: Database["public"]["Enums"]["diary_system_event"] | null
          tenant_id: string
          title: string
          to_phase: Database["public"]["Enums"]["project_phase"] | null
          updated_at: string
          updated_by_id: string | null
          visibility: Database["public"]["Enums"]["diary_visibility"]
        }
        Insert: {
          created_at?: string
          created_by_id?: string | null
          description?: string | null
          entry_type: Database["public"]["Enums"]["diary_entry_type"]
          event_key?: string | null
          from_phase?: Database["public"]["Enums"]["project_phase"] | null
          id?: string
          is_automatic?: boolean
          legacy_id?: string | null
          occurrence_date: string
          occurrence_time?: string | null
          operational_tag?:
            | Database["public"]["Enums"]["operational_tag"]
            | null
          project_id: string
          responsible_id?: string | null
          status?: Database["public"]["Enums"]["diary_entry_status"]
          system_event?:
            | Database["public"]["Enums"]["diary_system_event"]
            | null
          tenant_id: string
          title: string
          to_phase?: Database["public"]["Enums"]["project_phase"] | null
          updated_at?: string
          updated_by_id?: string | null
          visibility?: Database["public"]["Enums"]["diary_visibility"]
        }
        Update: {
          created_at?: string
          created_by_id?: string | null
          description?: string | null
          entry_type?: Database["public"]["Enums"]["diary_entry_type"]
          event_key?: string | null
          from_phase?: Database["public"]["Enums"]["project_phase"] | null
          id?: string
          is_automatic?: boolean
          legacy_id?: string | null
          occurrence_date?: string
          occurrence_time?: string | null
          operational_tag?:
            | Database["public"]["Enums"]["operational_tag"]
            | null
          project_id?: string
          responsible_id?: string | null
          status?: Database["public"]["Enums"]["diary_entry_status"]
          system_event?:
            | Database["public"]["Enums"]["diary_system_event"]
            | null
          tenant_id?: string
          title?: string
          to_phase?: Database["public"]["Enums"]["project_phase"] | null
          updated_at?: string
          updated_by_id?: string | null
          visibility?: Database["public"]["Enums"]["diary_visibility"]
        }
        Relationships: [
          {
            foreignKeyName: "project_diary_entries_created_by_id_fkey"
            columns: ["created_by_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "collaborators"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "project_diary_entries_project_id_fkey"
            columns: ["project_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "project_progress"
            referencedColumns: ["project_id", "tenant_id"]
          },
          {
            foreignKeyName: "project_diary_entries_project_id_fkey"
            columns: ["project_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "project_diary_entries_responsible_id_fkey"
            columns: ["responsible_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "collaborators"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "project_diary_entries_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_diary_entries_updated_by_id_fkey"
            columns: ["updated_by_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "collaborators"
            referencedColumns: ["id", "tenant_id"]
          },
        ]
      }
      project_diary_files: {
        Row: {
          byte_size: number | null
          created_at: string
          display_order: number | null
          entry_id: string | null
          file_kind: Database["public"]["Enums"]["diary_file_kind"]
          file_name: string
          file_path: string
          id: string
          issue_id: string | null
          legacy_id: string | null
          mime_type: string | null
          tenant_id: string
          updated_at: string
          uploaded_by_id: string | null
          visit_id: string | null
        }
        Insert: {
          byte_size?: number | null
          created_at?: string
          display_order?: number | null
          entry_id?: string | null
          file_kind: Database["public"]["Enums"]["diary_file_kind"]
          file_name: string
          file_path: string
          id?: string
          issue_id?: string | null
          legacy_id?: string | null
          mime_type?: string | null
          tenant_id: string
          updated_at?: string
          uploaded_by_id?: string | null
          visit_id?: string | null
        }
        Update: {
          byte_size?: number | null
          created_at?: string
          display_order?: number | null
          entry_id?: string | null
          file_kind?: Database["public"]["Enums"]["diary_file_kind"]
          file_name?: string
          file_path?: string
          id?: string
          issue_id?: string | null
          legacy_id?: string | null
          mime_type?: string | null
          tenant_id?: string
          updated_at?: string
          uploaded_by_id?: string | null
          visit_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "project_diary_files_entry_id_fkey"
            columns: ["entry_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "project_diary_entries"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "project_diary_files_issue_id_fkey"
            columns: ["issue_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "project_issues"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "project_diary_files_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_diary_files_uploaded_by_id_fkey"
            columns: ["uploaded_by_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "collaborators"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "project_diary_files_visit_id_fkey"
            columns: ["visit_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "project_site_visits"
            referencedColumns: ["id", "tenant_id"]
          },
        ]
      }
      project_issue_events: {
        Row: {
          author_id: string | null
          created_at: string
          description: string | null
          event_type: Database["public"]["Enums"]["project_issue_event_type"]
          from_status:
            | Database["public"]["Enums"]["project_issue_status"]
            | null
          id: string
          issue_id: string
          occurred_at: string
          tenant_id: string
          to_status: Database["public"]["Enums"]["project_issue_status"] | null
        }
        Insert: {
          author_id?: string | null
          created_at?: string
          description?: string | null
          event_type: Database["public"]["Enums"]["project_issue_event_type"]
          from_status?:
            | Database["public"]["Enums"]["project_issue_status"]
            | null
          id?: string
          issue_id: string
          occurred_at?: string
          tenant_id: string
          to_status?: Database["public"]["Enums"]["project_issue_status"] | null
        }
        Update: {
          author_id?: string | null
          created_at?: string
          description?: string | null
          event_type?: Database["public"]["Enums"]["project_issue_event_type"]
          from_status?:
            | Database["public"]["Enums"]["project_issue_status"]
            | null
          id?: string
          issue_id?: string
          occurred_at?: string
          tenant_id?: string
          to_status?: Database["public"]["Enums"]["project_issue_status"] | null
        }
        Relationships: [
          {
            foreignKeyName: "project_issue_events_author_id_fkey"
            columns: ["author_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "collaborators"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "project_issue_events_issue_id_fkey"
            columns: ["issue_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "project_issues"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "project_issue_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      project_issues: {
        Row: {
          category: Database["public"]["Enums"]["project_issue_category"]
          created_at: string
          description: string
          due_date: string | null
          id: string
          identified_date: string
          issue_number: number
          legacy_id: string | null
          notes: string | null
          project_id: string
          resolved_at: string | null
          resolved_by_id: string | null
          responsible_id: string | null
          status: Database["public"]["Enums"]["project_issue_status"]
          tenant_id: string
          updated_at: string
          visit_id: string | null
        }
        Insert: {
          category: Database["public"]["Enums"]["project_issue_category"]
          created_at?: string
          description: string
          due_date?: string | null
          id?: string
          identified_date: string
          issue_number: number
          legacy_id?: string | null
          notes?: string | null
          project_id: string
          resolved_at?: string | null
          resolved_by_id?: string | null
          responsible_id?: string | null
          status?: Database["public"]["Enums"]["project_issue_status"]
          tenant_id: string
          updated_at?: string
          visit_id?: string | null
        }
        Update: {
          category?: Database["public"]["Enums"]["project_issue_category"]
          created_at?: string
          description?: string
          due_date?: string | null
          id?: string
          identified_date?: string
          issue_number?: number
          legacy_id?: string | null
          notes?: string | null
          project_id?: string
          resolved_at?: string | null
          resolved_by_id?: string | null
          responsible_id?: string | null
          status?: Database["public"]["Enums"]["project_issue_status"]
          tenant_id?: string
          updated_at?: string
          visit_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "project_issues_project_id_fkey"
            columns: ["project_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "project_progress"
            referencedColumns: ["project_id", "tenant_id"]
          },
          {
            foreignKeyName: "project_issues_project_id_fkey"
            columns: ["project_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "project_issues_resolved_by_id_fkey"
            columns: ["resolved_by_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "collaborators"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "project_issues_responsible_id_fkey"
            columns: ["responsible_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "collaborators"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "project_issues_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_issues_visit_id_fkey"
            columns: ["visit_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "project_site_visits"
            referencedColumns: ["id", "tenant_id"]
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
      project_site_visits: {
        Row: {
          created_at: string
          created_by_id: string | null
          diary_entry_id: string | null
          id: string
          legacy_id: string | null
          notes: string | null
          project_id: string
          responsible_id: string | null
          status: Database["public"]["Enums"]["site_visit_status"]
          summary: string | null
          tenant_id: string
          updated_at: string
          visit_date: string
          visit_time: string | null
          visit_type: Database["public"]["Enums"]["site_visit_type"]
        }
        Insert: {
          created_at?: string
          created_by_id?: string | null
          diary_entry_id?: string | null
          id?: string
          legacy_id?: string | null
          notes?: string | null
          project_id: string
          responsible_id?: string | null
          status?: Database["public"]["Enums"]["site_visit_status"]
          summary?: string | null
          tenant_id: string
          updated_at?: string
          visit_date: string
          visit_time?: string | null
          visit_type: Database["public"]["Enums"]["site_visit_type"]
        }
        Update: {
          created_at?: string
          created_by_id?: string | null
          diary_entry_id?: string | null
          id?: string
          legacy_id?: string | null
          notes?: string | null
          project_id?: string
          responsible_id?: string | null
          status?: Database["public"]["Enums"]["site_visit_status"]
          summary?: string | null
          tenant_id?: string
          updated_at?: string
          visit_date?: string
          visit_time?: string | null
          visit_type?: Database["public"]["Enums"]["site_visit_type"]
        }
        Relationships: [
          {
            foreignKeyName: "project_site_visits_created_by_id_fkey"
            columns: ["created_by_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "collaborators"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "project_site_visits_diary_entry_id_fkey"
            columns: ["diary_entry_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "project_diary_entries"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "project_site_visits_project_id_fkey"
            columns: ["project_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "project_progress"
            referencedColumns: ["project_id", "tenant_id"]
          },
          {
            foreignKeyName: "project_site_visits_project_id_fkey"
            columns: ["project_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "project_site_visits_responsible_id_fkey"
            columns: ["responsible_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "collaborators"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "project_site_visits_tenant_id_fkey"
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
          site_geocode_status: Database["public"]["Enums"]["geocode_status"]
          site_geocode_updated_at: string | null
          site_lat: number | null
          site_lng: number | null
          site_pin_manual: boolean
          site_pin_updated_at: string | null
          site_pin_updated_by: string | null
          site_place_id: string | null
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
          site_geocode_status?: Database["public"]["Enums"]["geocode_status"]
          site_geocode_updated_at?: string | null
          site_lat?: number | null
          site_lng?: number | null
          site_pin_manual?: boolean
          site_pin_updated_at?: string | null
          site_pin_updated_by?: string | null
          site_place_id?: string | null
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
          site_geocode_status?: Database["public"]["Enums"]["geocode_status"]
          site_geocode_updated_at?: string | null
          site_lat?: number | null
          site_lng?: number | null
          site_pin_manual?: boolean
          site_pin_updated_at?: string | null
          site_pin_updated_by?: string | null
          site_place_id?: string | null
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
            foreignKeyName: "projects_site_pin_updated_by_fkey"
            columns: ["site_pin_updated_by", "tenant_id"]
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
      service_types: {
        Row: {
          contract_group: Database["public"]["Enums"]["service_contract_group"]
          created_at: string
          display_order: number
          id: string
          is_active: boolean
          key: string
          label: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          contract_group?: Database["public"]["Enums"]["service_contract_group"]
          created_at?: string
          display_order?: number
          id?: string
          is_active?: boolean
          key: string
          label: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          contract_group?: Database["public"]["Enums"]["service_contract_group"]
          created_at?: string
          display_order?: number
          id?: string
          is_active?: boolean
          key?: string
          label?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_types_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      supplier_brands: {
        Row: {
          created_at: string
          id: string
          name: string
          supplier_id: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          supplier_id: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          supplier_id?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "supplier_brands_supplier_id_fkey"
            columns: ["supplier_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "supplier_commission_totals"
            referencedColumns: ["supplier_id", "tenant_id"]
          },
          {
            foreignKeyName: "supplier_brands_supplier_id_fkey"
            columns: ["supplier_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "supplier_brands_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      suppliers: {
        Row: {
          address: string | null
          average_delivery_time: string | null
          category: Database["public"]["Enums"]["supplier_category"]
          city: string | null
          commission_payment_term:
            | Database["public"]["Enums"]["commission_payment_term"]
            | null
          commission_percent: number | null
          contact_email: string | null
          contact_name: string | null
          contact_whatsapp: string
          created_at: string
          has_showroom: boolean
          id: string
          last_order_date: string | null
          legacy_id: string | null
          name: string
          notes: string | null
          partnership_model:
            | Database["public"]["Enums"]["partnership_model"]
            | null
          partnership_tier: Database["public"]["Enums"]["partnership_tier"]
          phone: string | null
          serves_outside_fortaleza: boolean
          standard_discount_percent: number | null
          state: string | null
          status: Database["public"]["Enums"]["supplier_status"]
          tenant_id: string
          updated_at: string
          website: string | null
        }
        Insert: {
          address?: string | null
          average_delivery_time?: string | null
          category: Database["public"]["Enums"]["supplier_category"]
          city?: string | null
          commission_payment_term?:
            | Database["public"]["Enums"]["commission_payment_term"]
            | null
          commission_percent?: number | null
          contact_email?: string | null
          contact_name?: string | null
          contact_whatsapp: string
          created_at?: string
          has_showroom?: boolean
          id?: string
          last_order_date?: string | null
          legacy_id?: string | null
          name: string
          notes?: string | null
          partnership_model?:
            | Database["public"]["Enums"]["partnership_model"]
            | null
          partnership_tier?: Database["public"]["Enums"]["partnership_tier"]
          phone?: string | null
          serves_outside_fortaleza?: boolean
          standard_discount_percent?: number | null
          state?: string | null
          status?: Database["public"]["Enums"]["supplier_status"]
          tenant_id: string
          updated_at?: string
          website?: string | null
        }
        Update: {
          address?: string | null
          average_delivery_time?: string | null
          category?: Database["public"]["Enums"]["supplier_category"]
          city?: string | null
          commission_payment_term?:
            | Database["public"]["Enums"]["commission_payment_term"]
            | null
          commission_percent?: number | null
          contact_email?: string | null
          contact_name?: string | null
          contact_whatsapp?: string
          created_at?: string
          has_showroom?: boolean
          id?: string
          last_order_date?: string | null
          legacy_id?: string | null
          name?: string
          notes?: string | null
          partnership_model?:
            | Database["public"]["Enums"]["partnership_model"]
            | null
          partnership_tier?: Database["public"]["Enums"]["partnership_tier"]
          phone?: string | null
          serves_outside_fortaleza?: boolean
          standard_discount_percent?: number | null
          state?: string | null
          status?: Database["public"]["Enums"]["supplier_status"]
          tenant_id?: string
          updated_at?: string
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "suppliers_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
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
          operational_tag: Database["public"]["Enums"]["operational_tag"] | null
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
          operational_tag?:
            | Database["public"]["Enums"]["operational_tag"]
            | null
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
          operational_tag?:
            | Database["public"]["Enums"]["operational_tag"]
            | null
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
      accounts_payable_status: {
        Row: {
          category: Database["public"]["Enums"]["expense_category"] | null
          competence_month: string | null
          created_at: string | null
          description: string | null
          due_date: string | null
          generated_count: number | null
          id: string | null
          is_overdue: boolean | null
          is_recurring: boolean | null
          legacy_id: string | null
          payment_date: string | null
          payment_method: Database["public"]["Enums"]["payment_method"] | null
          project_id: string | null
          recurrence_count: number | null
          recurrence_end_date: string | null
          recurrence_frequency:
            | Database["public"]["Enums"]["recurrence_frequency"]
            | null
          recurrence_parent_id: string | null
          recurrence_start_date: string | null
          recurrence_status:
            | Database["public"]["Enums"]["recurrence_status"]
            | null
          status: Database["public"]["Enums"]["financial_status"] | null
          supplier_name: string | null
          tenant_id: string | null
          updated_at: string | null
          value: number | null
        }
        Insert: {
          category?: Database["public"]["Enums"]["expense_category"] | null
          competence_month?: string | null
          created_at?: string | null
          description?: string | null
          due_date?: string | null
          generated_count?: never
          id?: string | null
          is_overdue?: never
          is_recurring?: boolean | null
          legacy_id?: string | null
          payment_date?: string | null
          payment_method?: Database["public"]["Enums"]["payment_method"] | null
          project_id?: string | null
          recurrence_count?: number | null
          recurrence_end_date?: string | null
          recurrence_frequency?:
            | Database["public"]["Enums"]["recurrence_frequency"]
            | null
          recurrence_parent_id?: string | null
          recurrence_start_date?: string | null
          recurrence_status?:
            | Database["public"]["Enums"]["recurrence_status"]
            | null
          status?: Database["public"]["Enums"]["financial_status"] | null
          supplier_name?: string | null
          tenant_id?: string | null
          updated_at?: string | null
          value?: number | null
        }
        Update: {
          category?: Database["public"]["Enums"]["expense_category"] | null
          competence_month?: string | null
          created_at?: string | null
          description?: string | null
          due_date?: string | null
          generated_count?: never
          id?: string | null
          is_overdue?: never
          is_recurring?: boolean | null
          legacy_id?: string | null
          payment_date?: string | null
          payment_method?: Database["public"]["Enums"]["payment_method"] | null
          project_id?: string | null
          recurrence_count?: number | null
          recurrence_end_date?: string | null
          recurrence_frequency?:
            | Database["public"]["Enums"]["recurrence_frequency"]
            | null
          recurrence_parent_id?: string | null
          recurrence_start_date?: string | null
          recurrence_status?:
            | Database["public"]["Enums"]["recurrence_status"]
            | null
          status?: Database["public"]["Enums"]["financial_status"] | null
          supplier_name?: string | null
          tenant_id?: string | null
          updated_at?: string | null
          value?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "accounts_payable_project_id_fkey"
            columns: ["project_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "project_progress"
            referencedColumns: ["project_id", "tenant_id"]
          },
          {
            foreignKeyName: "accounts_payable_project_id_fkey"
            columns: ["project_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "accounts_payable_recurrence_parent_id_fkey"
            columns: ["recurrence_parent_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "accounts_payable"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "accounts_payable_recurrence_parent_id_fkey"
            columns: ["recurrence_parent_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "accounts_payable_status"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "accounts_payable_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      accounts_receivable_status: {
        Row: {
          client_id: string | null
          contract_id: string | null
          created_at: string | null
          description: string | null
          due_date: string | null
          id: string | null
          installment_number: number | null
          installment_total: number | null
          is_overdue: boolean | null
          issue_date: string | null
          legacy_id: string | null
          payment_date: string | null
          payment_method: Database["public"]["Enums"]["payment_method"] | null
          project_id: string | null
          status: Database["public"]["Enums"]["financial_status"] | null
          tenant_id: string | null
          updated_at: string | null
          value: number | null
        }
        Insert: {
          client_id?: string | null
          contract_id?: string | null
          created_at?: string | null
          description?: string | null
          due_date?: string | null
          id?: string | null
          installment_number?: number | null
          installment_total?: number | null
          is_overdue?: never
          issue_date?: string | null
          legacy_id?: string | null
          payment_date?: string | null
          payment_method?: Database["public"]["Enums"]["payment_method"] | null
          project_id?: string | null
          status?: Database["public"]["Enums"]["financial_status"] | null
          tenant_id?: string | null
          updated_at?: string | null
          value?: number | null
        }
        Update: {
          client_id?: string | null
          contract_id?: string | null
          created_at?: string | null
          description?: string | null
          due_date?: string | null
          id?: string | null
          installment_number?: number | null
          installment_total?: number | null
          is_overdue?: never
          issue_date?: string | null
          legacy_id?: string | null
          payment_date?: string | null
          payment_method?: Database["public"]["Enums"]["payment_method"] | null
          project_id?: string | null
          status?: Database["public"]["Enums"]["financial_status"] | null
          tenant_id?: string | null
          updated_at?: string | null
          value?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "accounts_receivable_client_id_fkey"
            columns: ["client_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "accounts_receivable_contract_id_fkey"
            columns: ["contract_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "accounts_receivable_project_id_fkey"
            columns: ["project_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "project_progress"
            referencedColumns: ["project_id", "tenant_id"]
          },
          {
            foreignKeyName: "accounts_receivable_project_id_fkey"
            columns: ["project_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "accounts_receivable_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      budget_checklist_totals: {
        Row: {
          approved_total: number | null
          attachment_count: number | null
          checklist_id: string | null
          commission_received_total: number | null
          commission_total: number | null
          completed_item_count: number | null
          estimated_total: number | null
          item_count: number | null
          progress_percent: number | null
          tenant_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "budget_checklists_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      budget_item_attachments: {
        Row: {
          approval_file_count: number | null
          attachment_count: number | null
          checklist_id: string | null
          item_id: string | null
          quote_file_count: number | null
          tenant_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "budget_checklist_items_checklist_id_fkey"
            columns: ["checklist_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "budget_checklist_totals"
            referencedColumns: ["checklist_id", "tenant_id"]
          },
          {
            foreignKeyName: "budget_checklist_items_checklist_id_fkey"
            columns: ["checklist_id", "tenant_id"]
            isOneToOne: false
            referencedRelation: "budget_checklists"
            referencedColumns: ["id", "tenant_id"]
          },
          {
            foreignKeyName: "budget_checklist_items_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
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
      supplier_commission_totals: {
        Row: {
          chosen_item_count: number | null
          commission_received_total: number | null
          commission_total: number | null
          supplier_id: string | null
          tenant_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "suppliers_tenant_id_fkey"
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
      approve_contract_proposal: {
        Args: { p_contract_id: string }
        Returns: Json
      }
      auth_collaborator_id: { Args: never; Returns: string }
      auth_collaborator_role: {
        Args: never
        Returns: Database["public"]["Enums"]["collaborator_role"]
      }
      auth_tenant_id: { Args: never; Returns: string }
      can_edit_menu: { Args: { p_menu_key: string }; Returns: boolean }
      can_view_menu: { Args: { p_menu_key: string }; Returns: boolean }
      collaborator_can_edit_menu: {
        Args: { p_menu_key: string; p_user_id: string }
        Returns: {
          collaborator_id: string
          tenant_id: string
        }[]
      }
      create_integration_api_key: {
        Args: {
          p_name: string
          p_scope?: Database["public"]["Enums"]["integration_scope"]
        }
        Returns: {
          api_key: string
          id: string
        }[]
      }
      custom_access_token_hook: { Args: { event: Json }; Returns: Json }
      delete_contract_cascade: {
        Args: { p_confirm?: boolean; p_contract_id: string }
        Returns: Json
      }
      generate_contract_installments: {
        Args: { p_contract_id: string }
        Returns: Json
      }
      google_calendar_connect: {
        Args: {
          p_collaborator_id: string
          p_email: string
          p_refresh_token: string
          p_scopes: string
          p_tenant_id: string
        }
        Returns: string
      }
      google_calendar_disconnect: {
        Args: { p_tenant_id: string }
        Returns: boolean
      }
      google_calendar_record_result: {
        Args: { p_error?: string; p_tenant_id: string }
        Returns: undefined
      }
      google_calendar_refresh_token: {
        Args: { p_tenant_id: string }
        Returns: string
      }
      google_oauth_state_consume: {
        Args: { p_state_hash: string }
        Returns: {
          collaborator_id: string
          tenant_id: string
        }[]
      }
      google_oauth_state_issue: {
        Args: { p_state_hash: string; p_user_id: string }
        Returns: string
      }
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
      increment_contract_number: { Args: { p_atual: string }; Returns: string }
      is_active_collaborator: { Args: never; Returns: boolean }
      is_financial_overdue: {
        Args: {
          p_due_date: string
          p_status: Database["public"]["Enums"]["financial_status"]
        }
        Returns: boolean
      }
      is_project_diary_writer: { Args: never; Returns: boolean }
      is_tenant_director: { Args: never; Returns: boolean }
      issue_integration_api_key: {
        Args: {
          p_collaborator_id: string
          p_name: string
          p_scope?: Database["public"]["Enums"]["integration_scope"]
          p_tenant_id: string
        }
        Returns: {
          api_key: string
          id: string
        }[]
      }
      mark_negotiation_won: {
        Args: { p_negotiation_id: string }
        Returns: Json
      }
      open_client_intake: {
        Args: { p_token: string }
        Returns: {
          client_name: string
          expires_at: string
          outcome: Database["public"]["Enums"]["client_intake_outcome"]
        }[]
      }
      record_project_diary_event: {
        Args: {
          p_description?: string
          p_event_key?: string
          p_from_phase?: Database["public"]["Enums"]["project_phase"]
          p_occurrence_date?: string
          p_occurrence_time?: string
          p_operational_tag?: Database["public"]["Enums"]["operational_tag"]
          p_project_id: string
          p_responsible_id?: string
          p_system_event: Database["public"]["Enums"]["diary_system_event"]
          p_title: string
          p_to_phase?: Database["public"]["Enums"]["project_phase"]
        }
        Returns: Json
      }
      resolve_integration_api_key: {
        Args: {
          p_key: string
          p_scope: Database["public"]["Enums"]["integration_scope"]
        }
        Returns: string
      }
      reveal_integration_api_key: { Args: { p_id: string }; Returns: string }
      revoke_integration_api_key: { Args: { p_id: string }; Returns: boolean }
      submit_client_intake: {
        Args: { p_payload: Json; p_token: string }
        Returns: boolean
      }
      suggest_contract_number: { Args: never; Returns: string }
      update_own_profile: {
        Args: { p_avatar_path?: string; p_name: string; p_phone?: string }
        Returns: {
          area: Database["public"]["Enums"]["collaborator_area"] | null
          avatar_path: string | null
          coordinator_id: string | null
          created_at: string
          email: string
          id: string
          legacy_id: string | null
          name: string
          phone: string | null
          role: Database["public"]["Enums"]["collaborator_role"]
          status: Database["public"]["Enums"]["collaborator_status"]
          tenant_id: string
          updated_at: string
          user_id: string | null
          weekly_hours: number | null
        }
        SetofOptions: {
          from: "*"
          to: "collaborators"
          isOneToOne: true
          isSetofReturn: false
        }
      }
    }
    Enums: {
      access_request_status: "pending" | "approved" | "rejected"
      billing_type:
        | "by_phase"
        | "monthly_installments"
        | "upfront"
        | "percent_of_construction"
      budget_checklist_status:
        | "open"
        | "in_progress"
        | "awaiting_client"
        | "completed"
        | "cancelled"
      budget_item_status:
        | "pending"
        | "quoting"
        | "quoted"
        | "presented_to_client"
        | "approved"
        | "cancelled"
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
      commission_payment_term:
        | "on_delivery"
        | "net_30_after_delivery"
        | "net_60_after_delivery"
        | "after_client_payment"
        | "to_be_agreed"
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
      cost_center:
        | "architecture"
        | "interiors"
        | "construction"
        | "mentoring"
        | "administrative"
      diary_entry_status: "in_progress" | "completed" | "cancelled"
      diary_entry_type:
        | "client_request"
        | "project_change"
        | "decision"
        | "meeting"
        | "approval"
        | "correction"
        | "delivery"
        | "note"
        | "other"
        | "system"
      diary_file_kind: "photo" | "attachment"
      diary_system_event:
        | "phase_change"
        | "responsible_change"
        | "tag_on"
        | "tag_off"
        | "site_visit"
        | "issue_created"
        | "issue_resolved"
        | "report_generated"
      diary_visibility: "internal" | "client"
      expense_category:
        | "payroll"
        | "taxes"
        | "office"
        | "software"
        | "marketing"
        | "travel"
        | "contractors"
        | "materials"
        | "equipment"
        | "other"
      financial_category_type: "revenue" | "expense"
      financial_status: "forecast" | "paid" | "renegotiated"
      funnel_stage:
        | "lead_received"
        | "qualified"
        | "proposal_sent"
        | "negotiating"
        | "closing"
      geocode_status: "pending" | "ok" | "failed"
      installment_frequency: "monthly" | "biweekly" | "weekly" | "single"
      integration_scope: "calendar_agenda"
      lead_origin: "instagram" | "referral" | "website" | "event" | "other"
      lead_source: "instagram" | "referral" | "website" | "other"
      loss_reason:
        | "price"
        | "timeline"
        | "chose_competitor"
        | "postponed"
        | "no_response"
        | "other"
      map_visual_status:
        | "not_started"
        | "in_development"
        | "paused"
        | "completed"
      negotiation_status: "active" | "won" | "lost"
      operational_tag: "in_review" | "awaiting_client"
      partnership_model:
        | "sales_commission"
        | "price_discount"
        | "commission_and_discount"
        | "spec_exclusivity"
        | "none"
      partnership_tier:
        | "strategic"
        | "preferred"
        | "registered"
        | "under_evaluation"
      payment_method:
        | "pix"
        | "boleto"
        | "card"
        | "ted"
        | "cash"
        | "direct_debit"
      priority_level: "low" | "medium" | "high" | "urgent"
      project_issue_category:
        | "architecture"
        | "interiors"
        | "joinery"
        | "frames"
        | "electrical"
        | "plumbing"
        | "lighting"
        | "structural"
        | "landscaping"
        | "finishing"
        | "other"
      project_issue_event_type:
        | "created"
        | "updated"
        | "status_changed"
        | "resolved"
        | "reopened"
        | "cancelled"
      project_issue_status: "open" | "in_progress" | "resolved" | "cancelled"
      project_phase:
        | "not_started"
        | "briefing"
        | "preliminary_study"
        | "layout"
        | "preliminary_design"
        | "renderings"
        | "revision"
        | "legal_permit"
        | "hoa_approval"
        | "construction_docs"
        | "engineering_docs"
        | "building_permit"
        | "under_construction"
        | "awaiting_client"
        | "finished"
        | "post_approval"
      project_status:
        | "prospecting"
        | "under_contract"
        | "in_development"
        | "in_approval"
        | "completed"
        | "suspended"
      recurrence_frequency:
        | "monthly"
        | "bimonthly"
        | "quarterly"
        | "semiannual"
        | "annual"
      recurrence_status: "active" | "paused" | "ended"
      service_contract_group: "none" | "interiors" | "engineering"
      service_type:
        | "architecture"
        | "interiors"
        | "structural"
        | "plumbing"
        | "electrical"
        | "consulting"
      site_visit_status:
        | "no_issues"
        | "with_issues"
        | "awaiting_execution"
        | "resolved"
      site_visit_type:
        | "follow_up"
        | "verification"
        | "inspection"
        | "meeting"
        | "measurement"
        | "correction"
        | "delivery"
        | "survey"
        | "other"
      supplier_category:
        | "ceramics_porcelain"
        | "fixtures_sanitaryware"
        | "natural_stone"
        | "indoor_lighting"
        | "outdoor_lighting"
        | "frames_openings"
        | "facade_cladding"
        | "pool_cladding"
        | "home_automation"
        | "solar_energy"
        | "paint_texture"
        | "landscaping"
        | "cabinetry"
        | "wood"
        | "structure_foundation"
        | "waterproofing"
        | "drywall_plaster"
        | "electrical_plumbing"
        | "hvac"
        | "glass_mirrors"
        | "elevators"
        | "pool_equipment"
        | "other"
      supplier_status: "active" | "inactive" | "negotiating"
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
      budget_checklist_status: [
        "open",
        "in_progress",
        "awaiting_client",
        "completed",
        "cancelled",
      ],
      budget_item_status: [
        "pending",
        "quoting",
        "quoted",
        "presented_to_client",
        "approved",
        "cancelled",
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
      commission_payment_term: [
        "on_delivery",
        "net_30_after_delivery",
        "net_60_after_delivery",
        "after_client_payment",
        "to_be_agreed",
      ],
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
      cost_center: [
        "architecture",
        "interiors",
        "construction",
        "mentoring",
        "administrative",
      ],
      diary_entry_status: ["in_progress", "completed", "cancelled"],
      diary_entry_type: [
        "client_request",
        "project_change",
        "decision",
        "meeting",
        "approval",
        "correction",
        "delivery",
        "note",
        "other",
        "system",
      ],
      diary_file_kind: ["photo", "attachment"],
      diary_system_event: [
        "phase_change",
        "responsible_change",
        "tag_on",
        "tag_off",
        "site_visit",
        "issue_created",
        "issue_resolved",
        "report_generated",
      ],
      diary_visibility: ["internal", "client"],
      expense_category: [
        "payroll",
        "taxes",
        "office",
        "software",
        "marketing",
        "travel",
        "contractors",
        "materials",
        "equipment",
        "other",
      ],
      financial_category_type: ["revenue", "expense"],
      financial_status: ["forecast", "paid", "renegotiated"],
      funnel_stage: [
        "lead_received",
        "qualified",
        "proposal_sent",
        "negotiating",
        "closing",
      ],
      geocode_status: ["pending", "ok", "failed"],
      installment_frequency: ["monthly", "biweekly", "weekly", "single"],
      integration_scope: ["calendar_agenda"],
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
      map_visual_status: [
        "not_started",
        "in_development",
        "paused",
        "completed",
      ],
      negotiation_status: ["active", "won", "lost"],
      operational_tag: ["in_review", "awaiting_client"],
      partnership_model: [
        "sales_commission",
        "price_discount",
        "commission_and_discount",
        "spec_exclusivity",
        "none",
      ],
      partnership_tier: [
        "strategic",
        "preferred",
        "registered",
        "under_evaluation",
      ],
      payment_method: ["pix", "boleto", "card", "ted", "cash", "direct_debit"],
      priority_level: ["low", "medium", "high", "urgent"],
      project_issue_category: [
        "architecture",
        "interiors",
        "joinery",
        "frames",
        "electrical",
        "plumbing",
        "lighting",
        "structural",
        "landscaping",
        "finishing",
        "other",
      ],
      project_issue_event_type: [
        "created",
        "updated",
        "status_changed",
        "resolved",
        "reopened",
        "cancelled",
      ],
      project_issue_status: ["open", "in_progress", "resolved", "cancelled"],
      project_phase: [
        "not_started",
        "briefing",
        "preliminary_study",
        "layout",
        "preliminary_design",
        "renderings",
        "revision",
        "legal_permit",
        "hoa_approval",
        "construction_docs",
        "engineering_docs",
        "building_permit",
        "under_construction",
        "awaiting_client",
        "finished",
        "post_approval",
      ],
      project_status: [
        "prospecting",
        "under_contract",
        "in_development",
        "in_approval",
        "completed",
        "suspended",
      ],
      recurrence_frequency: [
        "monthly",
        "bimonthly",
        "quarterly",
        "semiannual",
        "annual",
      ],
      recurrence_status: ["active", "paused", "ended"],
      service_contract_group: ["none", "interiors", "engineering"],
      service_type: [
        "architecture",
        "interiors",
        "structural",
        "plumbing",
        "electrical",
        "consulting",
      ],
      site_visit_status: [
        "no_issues",
        "with_issues",
        "awaiting_execution",
        "resolved",
      ],
      site_visit_type: [
        "follow_up",
        "verification",
        "inspection",
        "meeting",
        "measurement",
        "correction",
        "delivery",
        "survey",
        "other",
      ],
      supplier_category: [
        "ceramics_porcelain",
        "fixtures_sanitaryware",
        "natural_stone",
        "indoor_lighting",
        "outdoor_lighting",
        "frames_openings",
        "facade_cladding",
        "pool_cladding",
        "home_automation",
        "solar_energy",
        "paint_texture",
        "landscaping",
        "cabinetry",
        "wood",
        "structure_foundation",
        "waterproofing",
        "drywall_plaster",
        "electrical_plumbing",
        "hvac",
        "glass_mirrors",
        "elevators",
        "pool_equipment",
        "other",
      ],
      supplier_status: ["active", "inactive", "negotiating"],
      task_type: ["technical", "meeting", "review", "administrative"],
      tenant_role: ["owner", "member"],
      tenant_status: ["active", "suspended"],
      work_status: ["not_started", "in_progress", "completed"],
    },
  },
} as const

