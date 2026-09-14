export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      accounting_periods: {
        Row: {
          closed_at: string | null
          closed_by: string | null
          created_at: string | null
          end_date: string
          fiscal_year: number
          id: string
          period_name: string
          period_type: Database["public"]["Enums"]["period_type"]
          start_date: string
          status: string | null
          tenant_id: string
          updated_at: string | null
        }
        Insert: {
          closed_at?: string | null
          closed_by?: string | null
          created_at?: string | null
          end_date: string
          fiscal_year: number
          id?: string
          period_name: string
          period_type: Database["public"]["Enums"]["period_type"]
          start_date: string
          status?: string | null
          tenant_id: string
          updated_at?: string | null
        }
        Update: {
          closed_at?: string | null
          closed_by?: string | null
          created_at?: string | null
          end_date?: string
          fiscal_year?: number
          id?: string
          period_name?: string
          period_type?: Database["public"]["Enums"]["period_type"]
          start_date?: string
          status?: string | null
          tenant_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "accounting_periods_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          action: string
          actor_employee_id: string | null
          actor_user_id: string | null
          changes: Json | null
          entity_id: string | null
          entity_type: string
          id: number
          ip_address: unknown
          module: string | null
          occurred_at: string
          tenant_id: string
          user_agent: string | null
        }
        Insert: {
          action: string
          actor_employee_id?: string | null
          actor_user_id?: string | null
          changes?: Json | null
          entity_id?: string | null
          entity_type: string
          id?: never
          ip_address?: unknown
          module?: string | null
          occurred_at?: string
          tenant_id: string
          user_agent?: string | null
        }
        Update: {
          action?: string
          actor_employee_id?: string | null
          actor_user_id?: string | null
          changes?: Json | null
          entity_id?: string | null
          entity_type?: string
          id?: never
          ip_address?: unknown
          module?: string | null
          occurred_at?: string
          tenant_id?: string
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      bank_accounts: {
        Row: {
          account_name: string
          account_number_ct: string | null
          available_balance: number | null
          bank_branch: string | null
          bank_name: string
          created_at: string | null
          created_by: string | null
          currency: string
          current_balance: number | null
          feed_connection_id: string | null
          feed_enabled: boolean | null
          feed_provider: string | null
          gl_account_id: string | null
          iban_ct: string | null
          id: string
          is_active: boolean | null
          last_synced_at: string | null
          notes: string | null
          routing_number_ct: string | null
          swift_code_ct: string | null
          tenant_id: string
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          account_name: string
          account_number_ct?: string | null
          available_balance?: number | null
          bank_branch?: string | null
          bank_name: string
          created_at?: string | null
          created_by?: string | null
          currency: string
          current_balance?: number | null
          feed_connection_id?: string | null
          feed_enabled?: boolean | null
          feed_provider?: string | null
          gl_account_id?: string | null
          iban_ct?: string | null
          id?: string
          is_active?: boolean | null
          last_synced_at?: string | null
          notes?: string | null
          routing_number_ct?: string | null
          swift_code_ct?: string | null
          tenant_id: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          account_name?: string
          account_number_ct?: string | null
          available_balance?: number | null
          bank_branch?: string | null
          bank_name?: string
          created_at?: string | null
          created_by?: string | null
          currency?: string
          current_balance?: number | null
          feed_connection_id?: string | null
          feed_enabled?: boolean | null
          feed_provider?: string | null
          gl_account_id?: string | null
          iban_ct?: string | null
          id?: string
          is_active?: boolean | null
          last_synced_at?: string | null
          notes?: string | null
          routing_number_ct?: string | null
          swift_code_ct?: string | null
          tenant_id?: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bank_accounts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_bank_accounts_gl_account_id"
            columns: ["gl_account_id"]
            isOneToOne: false
            referencedRelation: "chart_of_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      bank_reconciliation_rules: {
        Row: {
          action_type: string
          amount_equals: number | null
          amount_max: number | null
          amount_min: number | null
          amount_tolerance: number | null
          auto_match: boolean | null
          bank_account_id: string | null
          category_account_id: string | null
          create_transaction: boolean | null
          created_at: string | null
          created_by: string | null
          customer_id: string | null
          description_contains: string | null
          description_regex: string | null
          id: string
          is_active: boolean | null
          last_applied_at: string | null
          priority: number | null
          rule_name: string
          tenant_id: string
          times_applied: number | null
          tracking_categories: Json | null
          transaction_type: string | null
          updated_at: string | null
          updated_by: string | null
          vendor_id: string | null
        }
        Insert: {
          action_type: string
          amount_equals?: number | null
          amount_max?: number | null
          amount_min?: number | null
          amount_tolerance?: number | null
          auto_match?: boolean | null
          bank_account_id?: string | null
          category_account_id?: string | null
          create_transaction?: boolean | null
          created_at?: string | null
          created_by?: string | null
          customer_id?: string | null
          description_contains?: string | null
          description_regex?: string | null
          id?: string
          is_active?: boolean | null
          last_applied_at?: string | null
          priority?: number | null
          rule_name: string
          tenant_id: string
          times_applied?: number | null
          tracking_categories?: Json | null
          transaction_type?: string | null
          updated_at?: string | null
          updated_by?: string | null
          vendor_id?: string | null
        }
        Update: {
          action_type?: string
          amount_equals?: number | null
          amount_max?: number | null
          amount_min?: number | null
          amount_tolerance?: number | null
          auto_match?: boolean | null
          bank_account_id?: string | null
          category_account_id?: string | null
          create_transaction?: boolean | null
          created_at?: string | null
          created_by?: string | null
          customer_id?: string | null
          description_contains?: string | null
          description_regex?: string | null
          id?: string
          is_active?: boolean | null
          last_applied_at?: string | null
          priority?: number | null
          rule_name?: string
          tenant_id?: string
          times_applied?: number | null
          tracking_categories?: Json | null
          transaction_type?: string | null
          updated_at?: string | null
          updated_by?: string | null
          vendor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bank_reconciliation_rules_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_bank_reconciliation_rules_bank_account_id"
            columns: ["bank_account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_bank_reconciliation_rules_category_account_id"
            columns: ["category_account_id"]
            isOneToOne: false
            referencedRelation: "chart_of_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_bank_reconciliation_rules_customer_id"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_bank_reconciliation_rules_vendor_id"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      bank_transactions: {
        Row: {
          amount: number
          balance: number | null
          bank_account_id: string
          bank_transaction_id: string | null
          category_account_id: string | null
          created_at: string | null
          description: string
          id: string
          imported_at: string | null
          match_confidence: number | null
          matched_to_id: string | null
          matched_to_type: string | null
          matching_rule_id: string | null
          notes: string | null
          reference: string | null
          status: string | null
          tenant_id: string
          transaction_date: string
          transaction_type: string | null
          updated_at: string | null
          value_date: string | null
        }
        Insert: {
          amount: number
          balance?: number | null
          bank_account_id: string
          bank_transaction_id?: string | null
          category_account_id?: string | null
          created_at?: string | null
          description: string
          id?: string
          imported_at?: string | null
          match_confidence?: number | null
          matched_to_id?: string | null
          matched_to_type?: string | null
          matching_rule_id?: string | null
          notes?: string | null
          reference?: string | null
          status?: string | null
          tenant_id: string
          transaction_date: string
          transaction_type?: string | null
          updated_at?: string | null
          value_date?: string | null
        }
        Update: {
          amount?: number
          balance?: number | null
          bank_account_id?: string
          bank_transaction_id?: string | null
          category_account_id?: string | null
          created_at?: string | null
          description?: string
          id?: string
          imported_at?: string | null
          match_confidence?: number | null
          matched_to_id?: string | null
          matched_to_type?: string | null
          matching_rule_id?: string | null
          notes?: string | null
          reference?: string | null
          status?: string | null
          tenant_id?: string
          transaction_date?: string
          transaction_type?: string | null
          updated_at?: string | null
          value_date?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bank_transactions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_bank_transactions_bank_account_id"
            columns: ["bank_account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_bank_transactions_category_account_id"
            columns: ["category_account_id"]
            isOneToOne: false
            referencedRelation: "chart_of_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      bill_lines: {
        Row: {
          amount: number
          bill_id: string
          created_at: string | null
          description: string
          expense_account_id: string
          id: string
          line_number: number
          quantity: number
          tax_amount: number | null
          tax_rate_id: string | null
          tenant_id: string
          tracking_categories: Json | null
          unit_price: number
        }
        Insert: {
          amount: number
          bill_id: string
          created_at?: string | null
          description: string
          expense_account_id: string
          id?: string
          line_number: number
          quantity?: number
          tax_amount?: number | null
          tax_rate_id?: string | null
          tenant_id: string
          tracking_categories?: Json | null
          unit_price: number
        }
        Update: {
          amount?: number
          bill_id?: string
          created_at?: string | null
          description?: string
          expense_account_id?: string
          id?: string
          line_number?: number
          quantity?: number
          tax_amount?: number | null
          tax_rate_id?: string | null
          tenant_id?: string
          tracking_categories?: Json | null
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "bill_lines_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_bill_lines_bill_id"
            columns: ["bill_id"]
            isOneToOne: false
            referencedRelation: "bills"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_bill_lines_expense_account_id"
            columns: ["expense_account_id"]
            isOneToOne: false
            referencedRelation: "chart_of_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_bill_lines_tax_rate_id"
            columns: ["tax_rate_id"]
            isOneToOne: false
            referencedRelation: "tax_rates"
            referencedColumns: ["id"]
          },
        ]
      }
      bills: {
        Row: {
          amount_due: number
          amount_paid: number | null
          approved_at: string | null
          approved_by: string | null
          base_amount_due: number
          base_amount_paid: number | null
          base_currency: string
          base_subtotal: number
          base_tax_total: number | null
          base_total: number
          bill_date: string
          bill_number: string
          created_at: string | null
          created_by: string | null
          currency: string
          due_date: string
          exchange_rate: number | null
          file_url: string | null
          id: string
          journal_entry_id: string | null
          notes: string | null
          ocr_data: Json | null
          ocr_processed: boolean | null
          payment_scheduled_date: string | null
          payment_terms: string | null
          reference: string | null
          requires_approval: boolean | null
          status: string | null
          subtotal: number
          tax_total: number | null
          tenant_id: string
          total: number
          tracking_categories: Json | null
          updated_at: string | null
          updated_by: string | null
          vendor_id: string
        }
        Insert: {
          amount_due: number
          amount_paid?: number | null
          approved_at?: string | null
          approved_by?: string | null
          base_amount_due: number
          base_amount_paid?: number | null
          base_currency: string
          base_subtotal: number
          base_tax_total?: number | null
          base_total: number
          bill_date: string
          bill_number: string
          created_at?: string | null
          created_by?: string | null
          currency: string
          due_date: string
          exchange_rate?: number | null
          file_url?: string | null
          id?: string
          journal_entry_id?: string | null
          notes?: string | null
          ocr_data?: Json | null
          ocr_processed?: boolean | null
          payment_scheduled_date?: string | null
          payment_terms?: string | null
          reference?: string | null
          requires_approval?: boolean | null
          status?: string | null
          subtotal: number
          tax_total?: number | null
          tenant_id: string
          total: number
          tracking_categories?: Json | null
          updated_at?: string | null
          updated_by?: string | null
          vendor_id: string
        }
        Update: {
          amount_due?: number
          amount_paid?: number | null
          approved_at?: string | null
          approved_by?: string | null
          base_amount_due?: number
          base_amount_paid?: number | null
          base_currency?: string
          base_subtotal?: number
          base_tax_total?: number | null
          base_total?: number
          bill_date?: string
          bill_number?: string
          created_at?: string | null
          created_by?: string | null
          currency?: string
          due_date?: string
          exchange_rate?: number | null
          file_url?: string | null
          id?: string
          journal_entry_id?: string | null
          notes?: string | null
          ocr_data?: Json | null
          ocr_processed?: boolean | null
          payment_scheduled_date?: string | null
          payment_terms?: string | null
          reference?: string | null
          requires_approval?: boolean | null
          status?: string | null
          subtotal?: number
          tax_total?: number | null
          tenant_id?: string
          total?: number
          tracking_categories?: Json | null
          updated_at?: string | null
          updated_by?: string | null
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bills_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_bills_journal_entry_id"
            columns: ["journal_entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_bills_vendor_id"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      chart_of_accounts: {
        Row: {
          account_code: string
          account_name: string
          account_name_i18n: Json | null
          account_subtype: string | null
          account_type: Database["public"]["Enums"]["account_type"]
          created_at: string | null
          created_by: string | null
          currency: string | null
          current_balance: number | null
          current_balance_base: number | null
          description: string | null
          description_i18n: Json | null
          enable_payments: boolean | null
          id: string
          is_active: boolean | null
          is_bank_account: boolean | null
          parent_account_id: string | null
          tax_rate_id: string | null
          tenant_id: string
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          account_code: string
          account_name: string
          account_name_i18n?: Json | null
          account_subtype?: string | null
          account_type: Database["public"]["Enums"]["account_type"]
          created_at?: string | null
          created_by?: string | null
          currency?: string | null
          current_balance?: number | null
          current_balance_base?: number | null
          description?: string | null
          description_i18n?: Json | null
          enable_payments?: boolean | null
          id?: string
          is_active?: boolean | null
          is_bank_account?: boolean | null
          parent_account_id?: string | null
          tax_rate_id?: string | null
          tenant_id: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          account_code?: string
          account_name?: string
          account_name_i18n?: Json | null
          account_subtype?: string | null
          account_type?: Database["public"]["Enums"]["account_type"]
          created_at?: string | null
          created_by?: string | null
          currency?: string | null
          current_balance?: number | null
          current_balance_base?: number | null
          description?: string | null
          description_i18n?: Json | null
          enable_payments?: boolean | null
          id?: string
          is_active?: boolean | null
          is_bank_account?: boolean | null
          parent_account_id?: string | null
          tax_rate_id?: string | null
          tenant_id?: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "chart_of_accounts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_chart_of_accounts_parent_account_id"
            columns: ["parent_account_id"]
            isOneToOne: false
            referencedRelation: "chart_of_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_chart_of_accounts_tax_rate_id"
            columns: ["tax_rate_id"]
            isOneToOne: false
            referencedRelation: "tax_rates"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          account_manager_id: string | null
          acquisition_date: string | null
          acquisition_source: string | null
          address_line1: string | null
          address_line2: string | null
          billing_contact_email: string | null
          billing_contact_name: string | null
          billing_contact_phone: string | null
          city: string | null
          client_code: string | null
          client_name: string
          client_type: string | null
          company_size: string | null
          country: string | null
          created_at: string
          created_by: string
          currency: string | null
          custom_fields: Json | null
          default_hourly_rate: number | null
          id: string
          industry: string | null
          is_active: boolean | null
          legal_entity_name: string | null
          notes: string | null
          payment_terms: string | null
          portal_access_enabled: boolean | null
          postal_code: string | null
          primary_contact_email: string | null
          primary_contact_name: string | null
          primary_contact_phone: string | null
          primary_contact_title: string | null
          state_province: string | null
          status: string | null
          tax_id_ct: string | null
          tenant_id: string
          updated_at: string
          version: number | null
          website: string | null
        }
        Insert: {
          account_manager_id?: string | null
          acquisition_date?: string | null
          acquisition_source?: string | null
          address_line1?: string | null
          address_line2?: string | null
          billing_contact_email?: string | null
          billing_contact_name?: string | null
          billing_contact_phone?: string | null
          city?: string | null
          client_code?: string | null
          client_name: string
          client_type?: string | null
          company_size?: string | null
          country?: string | null
          created_at?: string
          created_by: string
          currency?: string | null
          custom_fields?: Json | null
          default_hourly_rate?: number | null
          id?: string
          industry?: string | null
          is_active?: boolean | null
          legal_entity_name?: string | null
          notes?: string | null
          payment_terms?: string | null
          portal_access_enabled?: boolean | null
          postal_code?: string | null
          primary_contact_email?: string | null
          primary_contact_name?: string | null
          primary_contact_phone?: string | null
          primary_contact_title?: string | null
          state_province?: string | null
          status?: string | null
          tax_id_ct?: string | null
          tenant_id: string
          updated_at?: string
          version?: number | null
          website?: string | null
        }
        Update: {
          account_manager_id?: string | null
          acquisition_date?: string | null
          acquisition_source?: string | null
          address_line1?: string | null
          address_line2?: string | null
          billing_contact_email?: string | null
          billing_contact_name?: string | null
          billing_contact_phone?: string | null
          city?: string | null
          client_code?: string | null
          client_name?: string
          client_type?: string | null
          company_size?: string | null
          country?: string | null
          created_at?: string
          created_by?: string
          currency?: string | null
          custom_fields?: Json | null
          default_hourly_rate?: number | null
          id?: string
          industry?: string | null
          is_active?: boolean | null
          legal_entity_name?: string | null
          notes?: string | null
          payment_terms?: string | null
          portal_access_enabled?: boolean | null
          postal_code?: string | null
          primary_contact_email?: string | null
          primary_contact_name?: string | null
          primary_contact_phone?: string | null
          primary_contact_title?: string | null
          state_province?: string | null
          status?: string | null
          tax_id_ct?: string | null
          tenant_id?: string
          updated_at?: string
          version?: number | null
          website?: string | null
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
      compensation_allowances: {
        Row: {
          allowance_id: string | null
          allowance_name: string | null
          allowance_type: Database["public"]["Enums"]["allowance_type"]
          amount: number
          created_at: string | null
          created_by: string | null
          currency: string
          description: string | null
          effective_from: string
          effective_to: string | null
          eligibility_criteria: string | null
          employee_id: string
          frequency: string | null
          id: string
          is_reimbursement: boolean | null
          is_taxable: boolean | null
          max_reimbursement_per_period: number | null
          requires_receipts: boolean | null
          status: string | null
          tenant_id: string
          updated_at: string | null
        }
        Insert: {
          allowance_id?: string | null
          allowance_name?: string | null
          allowance_type: Database["public"]["Enums"]["allowance_type"]
          amount: number
          created_at?: string | null
          created_by?: string | null
          currency?: string
          description?: string | null
          effective_from: string
          effective_to?: string | null
          eligibility_criteria?: string | null
          employee_id: string
          frequency?: string | null
          id?: string
          is_reimbursement?: boolean | null
          is_taxable?: boolean | null
          max_reimbursement_per_period?: number | null
          requires_receipts?: boolean | null
          status?: string | null
          tenant_id: string
          updated_at?: string | null
        }
        Update: {
          allowance_id?: string | null
          allowance_name?: string | null
          allowance_type?: Database["public"]["Enums"]["allowance_type"]
          amount?: number
          created_at?: string | null
          created_by?: string | null
          currency?: string
          description?: string | null
          effective_from?: string
          effective_to?: string | null
          eligibility_criteria?: string | null
          employee_id?: string
          frequency?: string | null
          id?: string
          is_reimbursement?: boolean | null
          is_taxable?: boolean | null
          max_reimbursement_per_period?: number | null
          requires_receipts?: boolean | null
          status?: string | null
          tenant_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "compensation_allowances_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_compensation_allowances_employee_id"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      compensation_base: {
        Row: {
          amount: number
          annual_equivalent: number | null
          change_reason: Database["public"]["Enums"]["change_reason"] | null
          compensation_type: Database["public"]["Enums"]["compensation_type"]
          created_at: string | null
          created_by: string | null
          currency: string
          effective_from: string
          effective_to: string | null
          employee_id: string
          id: string
          overtime_eligible: boolean | null
          overtime_rules: Json | null
          pay_frequency: Database["public"]["Enums"]["pay_frequency"] | null
          standard_days_per_week: number | null
          standard_hours_per_day: number | null
          tenant_id: string
        }
        Insert: {
          amount: number
          annual_equivalent?: number | null
          change_reason?: Database["public"]["Enums"]["change_reason"] | null
          compensation_type: Database["public"]["Enums"]["compensation_type"]
          created_at?: string | null
          created_by?: string | null
          currency?: string
          effective_from: string
          effective_to?: string | null
          employee_id: string
          id?: string
          overtime_eligible?: boolean | null
          overtime_rules?: Json | null
          pay_frequency?: Database["public"]["Enums"]["pay_frequency"] | null
          standard_days_per_week?: number | null
          standard_hours_per_day?: number | null
          tenant_id: string
        }
        Update: {
          amount?: number
          annual_equivalent?: number | null
          change_reason?: Database["public"]["Enums"]["change_reason"] | null
          compensation_type?: Database["public"]["Enums"]["compensation_type"]
          created_at?: string | null
          created_by?: string | null
          currency?: string
          effective_from?: string
          effective_to?: string | null
          employee_id?: string
          id?: string
          overtime_eligible?: boolean | null
          overtime_rules?: Json | null
          pay_frequency?: Database["public"]["Enums"]["pay_frequency"] | null
          standard_days_per_week?: number | null
          standard_hours_per_day?: number | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "compensation_base_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_compensation_base_employee_id"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      compensation_equity: {
        Row: {
          created_at: string | null
          created_by: string | null
          currency: string | null
          employee_id: string
          equity_id: string | null
          equity_type: string
          exercise_price: number | null
          expiration_date: string | null
          fair_market_value: number | null
          grant_date: string
          grant_number: string | null
          grant_price: number | null
          grant_type: Database["public"]["Enums"]["equity_type"]
          id: string
          performance_conditions: Json | null
          shares_exercised: number | null
          shares_forfeited: number | null
          shares_granted: number
          shares_vested: number | null
          status: string | null
          strike_price: number | null
          tenant_id: string
          total_shares: number | null
          updated_at: string | null
          vesting_cliff_months: number | null
          vesting_period_months: number | null
          vesting_schedule: Json | null
          vesting_start_date: string
          vesting_type: Database["public"]["Enums"]["vesting_type"]
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          currency?: string | null
          employee_id: string
          equity_id?: string | null
          equity_type: string
          exercise_price?: number | null
          expiration_date?: string | null
          fair_market_value?: number | null
          grant_date: string
          grant_number?: string | null
          grant_price?: number | null
          grant_type: Database["public"]["Enums"]["equity_type"]
          id?: string
          performance_conditions?: Json | null
          shares_exercised?: number | null
          shares_forfeited?: number | null
          shares_granted: number
          shares_vested?: number | null
          status?: string | null
          strike_price?: number | null
          tenant_id: string
          total_shares?: number | null
          updated_at?: string | null
          vesting_cliff_months?: number | null
          vesting_period_months?: number | null
          vesting_schedule?: Json | null
          vesting_start_date: string
          vesting_type: Database["public"]["Enums"]["vesting_type"]
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          currency?: string | null
          employee_id?: string
          equity_id?: string | null
          equity_type?: string
          exercise_price?: number | null
          expiration_date?: string | null
          fair_market_value?: number | null
          grant_date?: string
          grant_number?: string | null
          grant_price?: number | null
          grant_type?: Database["public"]["Enums"]["equity_type"]
          id?: string
          performance_conditions?: Json | null
          shares_exercised?: number | null
          shares_forfeited?: number | null
          shares_granted?: number
          shares_vested?: number | null
          status?: string | null
          strike_price?: number | null
          tenant_id?: string
          total_shares?: number | null
          updated_at?: string | null
          vesting_cliff_months?: number | null
          vesting_period_months?: number | null
          vesting_schedule?: Json | null
          vesting_start_date?: string
          vesting_type?: Database["public"]["Enums"]["vesting_type"]
        }
        Relationships: [
          {
            foreignKeyName: "compensation_equity_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_compensation_equity_employee_id"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      compensation_premiums: {
        Row: {
          amount: number | null
          calculation_method: string | null
          conditions: Json | null
          created_at: string | null
          created_by: string | null
          currency: string | null
          effective_from: string
          effective_to: string | null
          eligibility_rules: Json | null
          employee_id: string
          id: string
          premium_amount: number | null
          premium_id: string | null
          premium_name: string | null
          premium_percentage: number | null
          premium_type: Database["public"]["Enums"]["premium_type"]
          rate_multiplier: number | null
          status: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          amount?: number | null
          calculation_method?: string | null
          conditions?: Json | null
          created_at?: string | null
          created_by?: string | null
          currency?: string | null
          effective_from: string
          effective_to?: string | null
          eligibility_rules?: Json | null
          employee_id: string
          id?: string
          premium_amount?: number | null
          premium_id?: string | null
          premium_name?: string | null
          premium_percentage?: number | null
          premium_type: Database["public"]["Enums"]["premium_type"]
          rate_multiplier?: number | null
          status?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          amount?: number | null
          calculation_method?: string | null
          conditions?: Json | null
          created_at?: string | null
          created_by?: string | null
          currency?: string | null
          effective_from?: string
          effective_to?: string | null
          eligibility_rules?: Json | null
          employee_id?: string
          id?: string
          premium_amount?: number | null
          premium_id?: string | null
          premium_name?: string | null
          premium_percentage?: number | null
          premium_type?: Database["public"]["Enums"]["premium_type"]
          rate_multiplier?: number | null
          status?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "compensation_premiums_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_compensation_premiums_employee_id"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      compensation_variable: {
        Row: {
          commission_structure: Json | null
          comp_name: string | null
          comp_type: string
          component_name: string | null
          component_type: Database["public"]["Enums"]["variable_comp_type"]
          created_at: string | null
          created_by: string | null
          currency: string
          description: string | null
          effective_from: string
          effective_to: string | null
          employee_id: string
          frequency: string | null
          id: string
          next_payment_date: string | null
          payment_frequency: string | null
          performance_metrics: Json | null
          quota_structure: Json | null
          status: string | null
          target_amount: number | null
          tenant_id: string
          updated_at: string | null
          variable_comp_id: string | null
        }
        Insert: {
          commission_structure?: Json | null
          comp_name?: string | null
          comp_type: string
          component_name?: string | null
          component_type: Database["public"]["Enums"]["variable_comp_type"]
          created_at?: string | null
          created_by?: string | null
          currency?: string
          description?: string | null
          effective_from: string
          effective_to?: string | null
          employee_id: string
          frequency?: string | null
          id?: string
          next_payment_date?: string | null
          payment_frequency?: string | null
          performance_metrics?: Json | null
          quota_structure?: Json | null
          status?: string | null
          target_amount?: number | null
          tenant_id: string
          updated_at?: string | null
          variable_comp_id?: string | null
        }
        Update: {
          commission_structure?: Json | null
          comp_name?: string | null
          comp_type?: string
          component_name?: string | null
          component_type?: Database["public"]["Enums"]["variable_comp_type"]
          created_at?: string | null
          created_by?: string | null
          currency?: string
          description?: string | null
          effective_from?: string
          effective_to?: string | null
          employee_id?: string
          frequency?: string | null
          id?: string
          next_payment_date?: string | null
          payment_frequency?: string | null
          performance_metrics?: Json | null
          quota_structure?: Json | null
          status?: string | null
          target_amount?: number | null
          tenant_id?: string
          updated_at?: string | null
          variable_comp_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "compensation_variable_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_compensation_variable_employee_id"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      compensation_work_schedules: {
        Row: {
          break_policy: Json | null
          core_hours: Json | null
          created_at: string | null
          created_by: string | null
          effective_from: string
          effective_to: string | null
          employee_id: string
          id: string
          is_active: boolean | null
          schedule_id: string | null
          schedule_name: string | null
          schedule_type: Database["public"]["Enums"]["work_arrangement"]
          shift_pattern: Json | null
          standard_hours_per_week: number | null
          tenant_id: string
          time_tracking_required: Database["public"]["Enums"]["time_tracking_type"]
          timezone: string
          updated_at: string | null
          weekly_schedule: Json | null
        }
        Insert: {
          break_policy?: Json | null
          core_hours?: Json | null
          created_at?: string | null
          created_by?: string | null
          effective_from: string
          effective_to?: string | null
          employee_id: string
          id?: string
          is_active?: boolean | null
          schedule_id?: string | null
          schedule_name?: string | null
          schedule_type?: Database["public"]["Enums"]["work_arrangement"]
          shift_pattern?: Json | null
          standard_hours_per_week?: number | null
          tenant_id: string
          time_tracking_required?: Database["public"]["Enums"]["time_tracking_type"]
          timezone?: string
          updated_at?: string | null
          weekly_schedule?: Json | null
        }
        Update: {
          break_policy?: Json | null
          core_hours?: Json | null
          created_at?: string | null
          created_by?: string | null
          effective_from?: string
          effective_to?: string | null
          employee_id?: string
          id?: string
          is_active?: boolean | null
          schedule_id?: string | null
          schedule_name?: string | null
          schedule_type?: Database["public"]["Enums"]["work_arrangement"]
          shift_pattern?: Json | null
          standard_hours_per_week?: number | null
          tenant_id?: string
          time_tracking_required?: Database["public"]["Enums"]["time_tracking_type"]
          timezone?: string
          updated_at?: string | null
          weekly_schedule?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "compensation_work_schedules_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_compensation_work_schedules_employee_id"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_requests: {
        Row: {
          company_name: string | null
          email: string | null
          first_name: string | null
          id: string
          last_name: string | null
          message_body: string | null
          phone: string | null
          updated_at: string | null
        }
        Insert: {
          company_name?: string | null
          email?: string | null
          first_name?: string | null
          id?: string
          last_name?: string | null
          message_body?: string | null
          phone?: string | null
          updated_at?: string | null
        }
        Update: {
          company_name?: string | null
          email?: string | null
          first_name?: string | null
          id?: string
          last_name?: string | null
          message_body?: string | null
          phone?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      cross_module_links: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          link_type: string
          metadata: Json
          source_entity_id: string
          source_entity_type: string
          source_module: string
          target_entity_id: string
          target_entity_type: string
          target_module: string
          tenant_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          link_type?: string
          metadata?: Json
          source_entity_id: string
          source_entity_type: string
          source_module: string
          target_entity_id: string
          target_entity_type: string
          target_module: string
          tenant_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          link_type?: string
          metadata?: Json
          source_entity_id?: string
          source_entity_type?: string
          source_module?: string
          target_entity_id?: string
          target_entity_type?: string
          target_module?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cross_module_links_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      custom_field_definitions: {
        Row: {
          business_area_id: string | null
          created_at: string
          data_type: string
          default_value: Json | null
          display_order: number
          entity_type: string
          field_group: string | null
          field_key: string
          help_text: string | null
          id: string
          is_active: boolean
          is_required: boolean
          label: string
          label_i18n: Json | null
          options: Json | null
          tenant_id: string
          updated_at: string
          validation: Json | null
        }
        Insert: {
          business_area_id?: string | null
          created_at?: string
          data_type: string
          default_value?: Json | null
          display_order?: number
          entity_type: string
          field_group?: string | null
          field_key: string
          help_text?: string | null
          id?: string
          is_active?: boolean
          is_required?: boolean
          label: string
          label_i18n?: Json | null
          options?: Json | null
          tenant_id: string
          updated_at?: string
          validation?: Json | null
        }
        Update: {
          business_area_id?: string | null
          created_at?: string
          data_type?: string
          default_value?: Json | null
          display_order?: number
          entity_type?: string
          field_group?: string | null
          field_key?: string
          help_text?: string | null
          id?: string
          is_active?: boolean
          is_required?: boolean
          label?: string
          label_i18n?: Json | null
          options?: Json | null
          tenant_id?: string
          updated_at?: string
          validation?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "custom_field_definitions_business_area_id_fkey"
            columns: ["business_area_id"]
            isOneToOne: false
            referencedRelation: "ticketing_business_areas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "custom_field_definitions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_contacts: {
        Row: {
          created_at: string
          customer_id: string
          email: string
          first_name: string
          id: string
          is_active: boolean
          is_primary: boolean
          last_name: string
          phone: string | null
          tenant_id: string
          title: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          customer_id: string
          email: string
          first_name: string
          id?: string
          is_active?: boolean
          is_primary?: boolean
          last_name: string
          phone?: string | null
          tenant_id: string
          title?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          customer_id?: string
          email?: string
          first_name?: string
          id?: string
          is_active?: boolean
          is_primary?: boolean
          last_name?: string
          phone?: string | null
          tenant_id?: string
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_contacts_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_contacts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          ar_account_id: string | null
          billing_address: Json | null
          created_at: string | null
          created_by: string | null
          credit_limit: number | null
          currency: string
          custom_fields: Json | null
          customer_name: string
          customer_number: string | null
          display_name: string | null
          email: string | null
          id: string
          is_active: boolean | null
          is_tax_exempt: boolean | null
          notes: string | null
          payment_terms: string | null
          phone: string | null
          portal_access_token: string | null
          portal_enabled: boolean | null
          shipping_address: Json | null
          tax_exempt_until: string | null
          tax_number: string | null
          tax_rate_id: string | null
          tenant_id: string
          updated_at: string | null
          updated_by: string | null
          website: string | null
        }
        Insert: {
          ar_account_id?: string | null
          billing_address?: Json | null
          created_at?: string | null
          created_by?: string | null
          credit_limit?: number | null
          currency: string
          custom_fields?: Json | null
          customer_name: string
          customer_number?: string | null
          display_name?: string | null
          email?: string | null
          id?: string
          is_active?: boolean | null
          is_tax_exempt?: boolean | null
          notes?: string | null
          payment_terms?: string | null
          phone?: string | null
          portal_access_token?: string | null
          portal_enabled?: boolean | null
          shipping_address?: Json | null
          tax_exempt_until?: string | null
          tax_number?: string | null
          tax_rate_id?: string | null
          tenant_id: string
          updated_at?: string | null
          updated_by?: string | null
          website?: string | null
        }
        Update: {
          ar_account_id?: string | null
          billing_address?: Json | null
          created_at?: string | null
          created_by?: string | null
          credit_limit?: number | null
          currency?: string
          custom_fields?: Json | null
          customer_name?: string
          customer_number?: string | null
          display_name?: string | null
          email?: string | null
          id?: string
          is_active?: boolean | null
          is_tax_exempt?: boolean | null
          notes?: string | null
          payment_terms?: string | null
          phone?: string | null
          portal_access_token?: string | null
          portal_enabled?: boolean | null
          shipping_address?: Json | null
          tax_exempt_until?: string | null
          tax_number?: string | null
          tax_rate_id?: string | null
          tenant_id?: string
          updated_at?: string | null
          updated_by?: string | null
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customers_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_customers_ar_account_id"
            columns: ["ar_account_id"]
            isOneToOne: false
            referencedRelation: "chart_of_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_customers_tax_rate_id"
            columns: ["tax_rate_id"]
            isOneToOne: false
            referencedRelation: "tax_rates"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_assets: {
        Row: {
          asset_id: string | null
          asset_tag: string | null
          asset_type: string
          assigned_date: string
          condition: string | null
          created_at: string
          employee_id: string
          id: string
          make_model: string
          notes: string | null
          return_date: string | null
          serial_number: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          asset_id?: string | null
          asset_tag?: string | null
          asset_type: string
          assigned_date: string
          condition?: string | null
          created_at?: string
          employee_id: string
          id?: string
          make_model: string
          notes?: string | null
          return_date?: string | null
          serial_number?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          asset_id?: string | null
          asset_tag?: string | null
          asset_type?: string
          assigned_date?: string
          condition?: string | null
          created_at?: string
          employee_id?: string
          id?: string
          make_model?: string
          notes?: string | null
          return_date?: string | null
          serial_number?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_assets_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_employee_assets_employee_id"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_bank_accounts: {
        Row: {
          account_holder_name: string
          account_number_encrypted: string
          account_number_last4: string | null
          account_type: string
          allocation_type: string
          allocation_value: number | null
          bank_name: string
          bic_swift_ct: string | null
          branch_name: string | null
          country: string
          created_at: string
          created_by: string | null
          currency: string
          effective_from: string
          effective_to: string | null
          employee_id: string
          iban_ct: string | null
          id: string
          ifsc_code_ct: string | null
          is_active: boolean
          is_primary: boolean
          prenote_sent_at: string | null
          priority: number
          routing_number_ct: string | null
          sort_code_ct: string | null
          tenant_id: string
          updated_at: string
          verification_status: string
          verified_at: string | null
        }
        Insert: {
          account_holder_name: string
          account_number_encrypted: string
          account_number_last4?: string | null
          account_type?: string
          allocation_type?: string
          allocation_value?: number | null
          bank_name: string
          bic_swift_ct?: string | null
          branch_name?: string | null
          country: string
          created_at?: string
          created_by?: string | null
          currency: string
          effective_from?: string
          effective_to?: string | null
          employee_id: string
          iban_ct?: string | null
          id?: string
          ifsc_code_ct?: string | null
          is_active?: boolean
          is_primary?: boolean
          prenote_sent_at?: string | null
          priority?: number
          routing_number_ct?: string | null
          sort_code_ct?: string | null
          tenant_id: string
          updated_at?: string
          verification_status?: string
          verified_at?: string | null
        }
        Update: {
          account_holder_name?: string
          account_number_encrypted?: string
          account_number_last4?: string | null
          account_type?: string
          allocation_type?: string
          allocation_value?: number | null
          bank_name?: string
          bic_swift_ct?: string | null
          branch_name?: string | null
          country?: string
          created_at?: string
          created_by?: string | null
          currency?: string
          effective_from?: string
          effective_to?: string | null
          employee_id?: string
          iban_ct?: string | null
          id?: string
          ifsc_code_ct?: string | null
          is_active?: boolean
          is_primary?: boolean
          prenote_sent_at?: string | null
          priority?: number
          routing_number_ct?: string | null
          sort_code_ct?: string | null
          tenant_id?: string
          updated_at?: string
          verification_status?: string
          verified_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "employee_bank_accounts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_eba_employee"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_certifications: {
        Row: {
          certification_id: string | null
          certification_name: string
          certification_number_ct: string | null
          created_at: string
          employee_id: string
          expiration_date: string | null
          id: string
          issue_date: string
          issuing_organization: string
          notes: string | null
          status: string
          tenant_id: string
          updated_at: string
          verification_url: string | null
        }
        Insert: {
          certification_id?: string | null
          certification_name: string
          certification_number_ct?: string | null
          created_at?: string
          employee_id: string
          expiration_date?: string | null
          id?: string
          issue_date: string
          issuing_organization: string
          notes?: string | null
          status?: string
          tenant_id: string
          updated_at?: string
          verification_url?: string | null
        }
        Update: {
          certification_id?: string | null
          certification_name?: string
          certification_number_ct?: string | null
          created_at?: string
          employee_id?: string
          expiration_date?: string | null
          id?: string
          issue_date?: string
          issuing_organization?: string
          notes?: string | null
          status?: string
          tenant_id?: string
          updated_at?: string
          verification_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "employee_certifications_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_employee_certifications_employee_id"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_group_members: {
        Row: {
          employee_id: string
          expires_at: string | null
          group_name: string
          id: string
          joined_at: string
          joined_by: string
          role: string
          tenant_id: string
        }
        Insert: {
          employee_id: string
          expires_at?: string | null
          group_name: string
          id?: string
          joined_at: string
          joined_by: string
          role?: string
          tenant_id: string
        }
        Update: {
          employee_id?: string
          expires_at?: string | null
          group_name?: string
          id?: string
          joined_at?: string
          joined_by?: string
          role?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_group_members_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_employee_group_members_employee_id"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_group_roles: {
        Row: {
          department_code: string | null
          expires_at: string | null
          granted_at: string
          granted_by: string
          group_name: string
          group_role_id: string | null
          id: string
          location_code: string | null
          role_name: string
          tenant_id: string
        }
        Insert: {
          department_code?: string | null
          expires_at?: string | null
          granted_at: string
          granted_by: string
          group_name: string
          group_role_id?: string | null
          id?: string
          location_code?: string | null
          role_name: string
          tenant_id: string
        }
        Update: {
          department_code?: string | null
          expires_at?: string | null
          granted_at?: string
          granted_by?: string
          group_name?: string
          group_role_id?: string | null
          id?: string
          location_code?: string | null
          role_name?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_group_roles_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_training_records: {
        Row: {
          assigned_date: string
          certificate_url: string | null
          completion_date: string | null
          created_at: string
          credits_hours: number | null
          due_date: string
          employee_id: string
          expiration_date: string | null
          id: string
          notes: string | null
          provider: string | null
          status: string
          tenant_id: string
          training_name: string
          training_record_id: string | null
          training_type: string
          updated_at: string
        }
        Insert: {
          assigned_date: string
          certificate_url?: string | null
          completion_date?: string | null
          created_at?: string
          credits_hours?: number | null
          due_date: string
          employee_id: string
          expiration_date?: string | null
          id?: string
          notes?: string | null
          provider?: string | null
          status?: string
          tenant_id: string
          training_name: string
          training_record_id?: string | null
          training_type: string
          updated_at?: string
        }
        Update: {
          assigned_date?: string
          certificate_url?: string | null
          completion_date?: string | null
          created_at?: string
          credits_hours?: number | null
          due_date?: string
          employee_id?: string
          expiration_date?: string | null
          id?: string
          notes?: string | null
          provider?: string | null
          status?: string
          tenant_id?: string
          training_name?: string
          training_record_id?: string | null
          training_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_training_records_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_employee_training_records_employee_id"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_user_groups: {
        Row: {
          approver_id: string
          backup_approver_id: string
          created_at: string
          created_by: string
          department_code: string | null
          description: string | null
          display_name: string
          group_name: string | null
          group_type: Database["public"]["Enums"]["group_type"]
          id: string
          is_active: boolean | null
          is_system_group: boolean | null
          location_code: string | null
          parent_group_name: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          approver_id: string
          backup_approver_id: string
          created_at?: string
          created_by: string
          department_code?: string | null
          description?: string | null
          display_name: string
          group_name?: string | null
          group_type?: Database["public"]["Enums"]["group_type"]
          id?: string
          is_active?: boolean | null
          is_system_group?: boolean | null
          location_code?: string | null
          parent_group_name?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          approver_id?: string
          backup_approver_id?: string
          created_at?: string
          created_by?: string
          department_code?: string | null
          description?: string | null
          display_name?: string
          group_name?: string | null
          group_type?: Database["public"]["Enums"]["group_type"]
          id?: string
          is_active?: boolean | null
          is_system_group?: boolean | null
          location_code?: string | null
          parent_group_name?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_user_groups_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      employees: {
        Row: {
          affinity_groups: Json | null
          base_amount_pvt: number | null
          benefits_elections_pvt: Json | null
          birth_date: string | null
          celebration_preferences: Json | null
          compensation_band_pvt: string | null
          compensation_type: string | null
          created_at: string
          created_by: string
          currency: string | null
          custom_fields: Json | null
          default_billable_rate_pvt: number | null
          default_hourly_rate_pvt: number | null
          department_code: string | null
          email: string
          employee_id: string | null
          employee_number: string | null
          employment_status: Database["public"]["Enums"]["employment_status"]
          employment_type: string
          end_date: string | null
          first_name: string
          fte: number | null
          gender: Database["public"]["Enums"]["gender"] | null
          hobbies: Json | null
          id: string
          introduction: string | null
          is_active: boolean | null
          job_level: string | null
          job_title: string | null
          last_name: string
          location_code: string | null
          manager_id: string | null
          marital_status: Database["public"]["Enums"]["marital_status"] | null
          middle_name: string | null
          overtime_eligible: boolean | null
          pay_frequency: Database["public"]["Enums"]["pay_frequency"] | null
          phone: string | null
          preferred_name: string | null
          prior_education: Json | null
          prior_employers: Json | null
          profile_picture: string | null
          pronouns: Database["public"]["Enums"]["pronouns"] | null
          pto_balances: Json | null
          salary_structure_pvt: Json | null
          social_media_links: Json | null
          ssn_tax_id_ct: string | null
          start_date: string
          tax_withholding_pvt: Json | null
          tenant_id: string
          timezone: string | null
          updated_at: string
          variable_compensation_pvt: Json | null
          version: number | null
        }
        Insert: {
          affinity_groups?: Json | null
          base_amount_pvt?: number | null
          benefits_elections_pvt?: Json | null
          birth_date?: string | null
          celebration_preferences?: Json | null
          compensation_band_pvt?: string | null
          compensation_type?: string | null
          created_at?: string
          created_by: string
          currency?: string | null
          custom_fields?: Json | null
          default_billable_rate_pvt?: number | null
          default_hourly_rate_pvt?: number | null
          department_code?: string | null
          email: string
          employee_id?: string | null
          employee_number?: string | null
          employment_status?: Database["public"]["Enums"]["employment_status"]
          employment_type?: string
          end_date?: string | null
          first_name: string
          fte?: number | null
          gender?: Database["public"]["Enums"]["gender"] | null
          hobbies?: Json | null
          id?: string
          introduction?: string | null
          is_active?: boolean | null
          job_level?: string | null
          job_title?: string | null
          last_name: string
          location_code?: string | null
          manager_id?: string | null
          marital_status?: Database["public"]["Enums"]["marital_status"] | null
          middle_name?: string | null
          overtime_eligible?: boolean | null
          pay_frequency?: Database["public"]["Enums"]["pay_frequency"] | null
          phone?: string | null
          preferred_name?: string | null
          prior_education?: Json | null
          prior_employers?: Json | null
          profile_picture?: string | null
          pronouns?: Database["public"]["Enums"]["pronouns"] | null
          pto_balances?: Json | null
          salary_structure_pvt?: Json | null
          social_media_links?: Json | null
          ssn_tax_id_ct?: string | null
          start_date: string
          tax_withholding_pvt?: Json | null
          tenant_id: string
          timezone?: string | null
          updated_at?: string
          variable_compensation_pvt?: Json | null
          version?: number | null
        }
        Update: {
          affinity_groups?: Json | null
          base_amount_pvt?: number | null
          benefits_elections_pvt?: Json | null
          birth_date?: string | null
          celebration_preferences?: Json | null
          compensation_band_pvt?: string | null
          compensation_type?: string | null
          created_at?: string
          created_by?: string
          currency?: string | null
          custom_fields?: Json | null
          default_billable_rate_pvt?: number | null
          default_hourly_rate_pvt?: number | null
          department_code?: string | null
          email?: string
          employee_id?: string | null
          employee_number?: string | null
          employment_status?: Database["public"]["Enums"]["employment_status"]
          employment_type?: string
          end_date?: string | null
          first_name?: string
          fte?: number | null
          gender?: Database["public"]["Enums"]["gender"] | null
          hobbies?: Json | null
          id?: string
          introduction?: string | null
          is_active?: boolean | null
          job_level?: string | null
          job_title?: string | null
          last_name?: string
          location_code?: string | null
          manager_id?: string | null
          marital_status?: Database["public"]["Enums"]["marital_status"] | null
          middle_name?: string | null
          overtime_eligible?: boolean | null
          pay_frequency?: Database["public"]["Enums"]["pay_frequency"] | null
          phone?: string | null
          preferred_name?: string | null
          prior_education?: Json | null
          prior_employers?: Json | null
          profile_picture?: string | null
          pronouns?: Database["public"]["Enums"]["pronouns"] | null
          pto_balances?: Json | null
          salary_structure_pvt?: Json | null
          social_media_links?: Json | null
          ssn_tax_id_ct?: string | null
          start_date?: string
          tax_withholding_pvt?: Json | null
          tenant_id?: string
          timezone?: string | null
          updated_at?: string
          variable_compensation_pvt?: Json | null
          version?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "employees_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      employment_terms: {
        Row: {
          actual_end_date: string | null
          contract_type: string | null
          created_at: string | null
          employee_id: string
          employment_type: Database["public"]["Enums"]["employment_type"]
          fte: number | null
          id: string
          notice_period_days: number | null
          planned_end_date: string | null
          probation_end_date: string | null
          probation_period_days: number | null
          renewal_option: boolean | null
          start_date: string
          tenant_id: string
          updated_at: string | null
          work_authorization_expiry: string | null
          work_authorization_type:
            Database["public"]["Enums"]["work_authorization_type"] | null
        }
        Insert: {
          actual_end_date?: string | null
          contract_type?: string | null
          created_at?: string | null
          employee_id: string
          employment_type: Database["public"]["Enums"]["employment_type"]
          fte?: number | null
          id?: string
          notice_period_days?: number | null
          planned_end_date?: string | null
          probation_end_date?: string | null
          probation_period_days?: number | null
          renewal_option?: boolean | null
          start_date: string
          tenant_id: string
          updated_at?: string | null
          work_authorization_expiry?: string | null
          work_authorization_type?:
            Database["public"]["Enums"]["work_authorization_type"] | null
        }
        Update: {
          actual_end_date?: string | null
          contract_type?: string | null
          created_at?: string | null
          employee_id?: string
          employment_type?: Database["public"]["Enums"]["employment_type"]
          fte?: number | null
          id?: string
          notice_period_days?: number | null
          planned_end_date?: string | null
          probation_end_date?: string | null
          probation_period_days?: number | null
          renewal_option?: boolean | null
          start_date?: string
          tenant_id?: string
          updated_at?: string | null
          work_authorization_expiry?: string | null
          work_authorization_type?:
            Database["public"]["Enums"]["work_authorization_type"] | null
        }
        Relationships: [
          {
            foreignKeyName: "employment_terms_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_employment_terms_employee_id"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      exchange_rates: {
        Row: {
          created_at: string | null
          created_by: string | null
          from_currency: string
          id: string
          inverse_rate: number
          is_manual: boolean | null
          rate: number
          rate_date: string
          source: string
          to_currency: string
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          from_currency: string
          id?: string
          inverse_rate: number
          is_manual?: boolean | null
          rate: number
          rate_date: string
          source: string
          to_currency: string
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          from_currency?: string
          id?: string
          inverse_rate?: number
          is_manual?: boolean | null
          rate?: number
          rate_date?: string
          source?: string
          to_currency?: string
        }
        Relationships: []
      }
      expenses: {
        Row: {
          amount: number
          approved_at: string | null
          approved_by: string | null
          base_amount: number
          bill_id: string | null
          category_account_id: string
          created_at: string | null
          created_by: string | null
          currency: string
          department_id: string | null
          description: string | null
          employee_id: string
          exchange_rate: number | null
          expense_date: string
          expense_type: string | null
          id: string
          is_reimbursable: boolean | null
          journal_entry_id: string | null
          mileage_distance: number | null
          mileage_rate: number | null
          payment_id: string | null
          receipt_ocr_data: Json | null
          receipt_url: string | null
          reimbursement_status:
            Database["public"]["Enums"]["reimbursement_status"] | null
          rejection_reason: string | null
          tenant_id: string
          tracking_categories: Json | null
          updated_at: string | null
          updated_by: string | null
          vendor_id: string | null
          vendor_name: string | null
        }
        Insert: {
          amount: number
          approved_at?: string | null
          approved_by?: string | null
          base_amount: number
          bill_id?: string | null
          category_account_id: string
          created_at?: string | null
          created_by?: string | null
          currency: string
          department_id?: string | null
          description?: string | null
          employee_id: string
          exchange_rate?: number | null
          expense_date: string
          expense_type?: string | null
          id?: string
          is_reimbursable?: boolean | null
          journal_entry_id?: string | null
          mileage_distance?: number | null
          mileage_rate?: number | null
          payment_id?: string | null
          receipt_ocr_data?: Json | null
          receipt_url?: string | null
          reimbursement_status?:
            Database["public"]["Enums"]["reimbursement_status"] | null
          rejection_reason?: string | null
          tenant_id: string
          tracking_categories?: Json | null
          updated_at?: string | null
          updated_by?: string | null
          vendor_id?: string | null
          vendor_name?: string | null
        }
        Update: {
          amount?: number
          approved_at?: string | null
          approved_by?: string | null
          base_amount?: number
          bill_id?: string | null
          category_account_id?: string
          created_at?: string | null
          created_by?: string | null
          currency?: string
          department_id?: string | null
          description?: string | null
          employee_id?: string
          exchange_rate?: number | null
          expense_date?: string
          expense_type?: string | null
          id?: string
          is_reimbursable?: boolean | null
          journal_entry_id?: string | null
          mileage_distance?: number | null
          mileage_rate?: number | null
          payment_id?: string | null
          receipt_ocr_data?: Json | null
          receipt_url?: string | null
          reimbursement_status?:
            Database["public"]["Enums"]["reimbursement_status"] | null
          rejection_reason?: string | null
          tenant_id?: string
          tracking_categories?: Json | null
          updated_at?: string | null
          updated_by?: string | null
          vendor_id?: string | null
          vendor_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "expenses_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_expenses_bill_id"
            columns: ["bill_id"]
            isOneToOne: false
            referencedRelation: "bills"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_expenses_category_account_id"
            columns: ["category_account_id"]
            isOneToOne: false
            referencedRelation: "chart_of_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_expenses_department_id"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "firm_departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_expenses_employee_id"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_expenses_journal_entry_id"
            columns: ["journal_entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_expenses_payment_id"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_expenses_vendor_id"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      firm_benefit_items: {
        Row: {
          benefit_name: string
          benefit_name_i18n: Json | null
          benefit_type: string
          benefits_package_id: string
          carrier_name: string | null
          carrier_varies_by_location: boolean | null
          costs_by_currency: Json | null
          created_at: string | null
          created_by: string | null
          id: string
          is_active: boolean
          plan_details: Json | null
          plan_details_i18n: Json | null
          tenant_id: string
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          benefit_name: string
          benefit_name_i18n?: Json | null
          benefit_type: string
          benefits_package_id: string
          carrier_name?: string | null
          carrier_varies_by_location?: boolean | null
          costs_by_currency?: Json | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          is_active?: boolean
          plan_details?: Json | null
          plan_details_i18n?: Json | null
          tenant_id: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          benefit_name?: string
          benefit_name_i18n?: Json | null
          benefit_type?: string
          benefits_package_id?: string
          carrier_name?: string | null
          carrier_varies_by_location?: boolean | null
          costs_by_currency?: Json | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          is_active?: boolean
          plan_details?: Json | null
          plan_details_i18n?: Json | null
          tenant_id?: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "firm_benefit_items_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_firm_benefit_items_benefits_package_id"
            columns: ["benefits_package_id"]
            isOneToOne: false
            referencedRelation: "firm_benefits_packages"
            referencedColumns: ["id"]
          },
        ]
      }
      firm_benefits_packages: {
        Row: {
          created_at: string | null
          created_by: string | null
          description: string | null
          description_i18n: Json | null
          eligibility_rules: Json | null
          id: string
          is_active: boolean | null
          name: string
          name_i18n: Json | null
          tenant_id: string
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          description_i18n?: Json | null
          eligibility_rules?: Json | null
          id?: string
          is_active?: boolean | null
          name: string
          name_i18n?: Json | null
          tenant_id: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          description_i18n?: Json | null
          eligibility_rules?: Json | null
          id?: string
          is_active?: boolean | null
          name?: string
          name_i18n?: Json | null
          tenant_id?: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "firm_benefits_packages_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      firm_benefits_plans: {
        Row: {
          allows_life_event_changes: boolean | null
          allows_new_hire_enrollment: boolean | null
          carrier_name: string | null
          carrier_policy_number: string | null
          cost_tiers: string | null
          coverage_type: string | null
          created_at: string
          created_by: string
          currency: string | null
          description: string | null
          effective_date: string
          eligibility_rules: Json | null
          employee_cost_monthly: number | null
          employer_cost_monthly: number | null
          end_date: string | null
          id: string
          internal_notes: string | null
          is_active: boolean | null
          life_event_window_days: number | null
          network_type: string | null
          new_hire_enrollment_window_days: number | null
          open_enrollment_end: string | null
          open_enrollment_start: string | null
          plan_code: string | null
          plan_details: Json | null
          plan_document_url: string | null
          plan_name: string
          plan_type: string
          summary_of_benefits_url: string | null
          tenant_id: string
          total_premium_monthly: number | null
          updated_at: string
          version: number | null
        }
        Insert: {
          allows_life_event_changes?: boolean | null
          allows_new_hire_enrollment?: boolean | null
          carrier_name?: string | null
          carrier_policy_number?: string | null
          cost_tiers?: string | null
          coverage_type?: string | null
          created_at?: string
          created_by: string
          currency?: string | null
          description?: string | null
          effective_date: string
          eligibility_rules?: Json | null
          employee_cost_monthly?: number | null
          employer_cost_monthly?: number | null
          end_date?: string | null
          id?: string
          internal_notes?: string | null
          is_active?: boolean | null
          life_event_window_days?: number | null
          network_type?: string | null
          new_hire_enrollment_window_days?: number | null
          open_enrollment_end?: string | null
          open_enrollment_start?: string | null
          plan_code?: string | null
          plan_details?: Json | null
          plan_document_url?: string | null
          plan_name: string
          plan_type: string
          summary_of_benefits_url?: string | null
          tenant_id: string
          total_premium_monthly?: number | null
          updated_at?: string
          version?: number | null
        }
        Update: {
          allows_life_event_changes?: boolean | null
          allows_new_hire_enrollment?: boolean | null
          carrier_name?: string | null
          carrier_policy_number?: string | null
          cost_tiers?: string | null
          coverage_type?: string | null
          created_at?: string
          created_by?: string
          currency?: string | null
          description?: string | null
          effective_date?: string
          eligibility_rules?: Json | null
          employee_cost_monthly?: number | null
          employer_cost_monthly?: number | null
          end_date?: string | null
          id?: string
          internal_notes?: string | null
          is_active?: boolean | null
          life_event_window_days?: number | null
          network_type?: string | null
          new_hire_enrollment_window_days?: number | null
          open_enrollment_end?: string | null
          open_enrollment_start?: string | null
          plan_code?: string | null
          plan_details?: Json | null
          plan_document_url?: string | null
          plan_name?: string
          plan_type?: string
          summary_of_benefits_url?: string | null
          tenant_id?: string
          total_premium_monthly?: number | null
          updated_at?: string
          version?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "firm_benefits_plans_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      firm_departments: {
        Row: {
          budget_currency: string | null
          code: string | null
          cost_center: string | null
          created_at: string | null
          created_by: string | null
          department_code: string | null
          description: string | null
          description_i18n: Json | null
          head_employee_id: string | null
          id: string
          is_active: boolean | null
          location_code: string | null
          location_id: string | null
          name: string
          name_i18n: Json | null
          parent_department_code: string | null
          parent_department_id: string | null
          tenant_id: string
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          budget_currency?: string | null
          code?: string | null
          cost_center?: string | null
          created_at?: string | null
          created_by?: string | null
          department_code?: string | null
          description?: string | null
          description_i18n?: Json | null
          head_employee_id?: string | null
          id?: string
          is_active?: boolean | null
          location_code?: string | null
          location_id?: string | null
          name: string
          name_i18n?: Json | null
          parent_department_code?: string | null
          parent_department_id?: string | null
          tenant_id: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          budget_currency?: string | null
          code?: string | null
          cost_center?: string | null
          created_at?: string | null
          created_by?: string | null
          department_code?: string | null
          description?: string | null
          description_i18n?: Json | null
          head_employee_id?: string | null
          id?: string
          is_active?: boolean | null
          location_code?: string | null
          location_id?: string | null
          name?: string
          name_i18n?: Json | null
          parent_department_code?: string | null
          parent_department_id?: string | null
          tenant_id?: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "firm_departments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_firm_departments_location_id"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "firm_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_firm_departments_parent_department_id"
            columns: ["parent_department_id"]
            isOneToOne: false
            referencedRelation: "firm_departments"
            referencedColumns: ["id"]
          },
        ]
      }
      firm_holidays: {
        Row: {
          created_at: string | null
          created_by: string | null
          date: string
          holiday_id: string | null
          id: string
          is_active: boolean
          is_mandatory: boolean | null
          is_paid: boolean | null
          is_recurring: boolean | null
          location_code: string
          location_id: string
          name: string
          name_i18n: Json | null
          observed_at: string | null
          recurrence_rule: string | null
          tenant_id: string
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          date: string
          holiday_id?: string | null
          id?: string
          is_active?: boolean
          is_mandatory?: boolean | null
          is_paid?: boolean | null
          is_recurring?: boolean | null
          location_code: string
          location_id: string
          name: string
          name_i18n?: Json | null
          observed_at?: string | null
          recurrence_rule?: string | null
          tenant_id: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          date?: string
          holiday_id?: string | null
          id?: string
          is_active?: boolean
          is_mandatory?: boolean | null
          is_paid?: boolean | null
          is_recurring?: boolean | null
          location_code?: string
          location_id?: string
          name?: string
          name_i18n?: Json | null
          observed_at?: string | null
          recurrence_rule?: string | null
          tenant_id?: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "firm_holidays_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_firm_holidays_location_id"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "firm_locations"
            referencedColumns: ["id"]
          },
        ]
      }
      firm_job_levels: {
        Row: {
          created_at: string | null
          created_by: string | null
          id: string
          is_active: boolean
          job_title_id: string
          level_name: string
          level_name_i18n: Json | null
          salary_ranges: Json
          sort_order: number | null
          tenant_id: string
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          id?: string
          is_active?: boolean
          job_title_id: string
          level_name: string
          level_name_i18n?: Json | null
          salary_ranges: Json
          sort_order?: number | null
          tenant_id: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          id?: string
          is_active?: boolean
          job_title_id?: string
          level_name?: string
          level_name_i18n?: Json | null
          salary_ranges?: Json
          sort_order?: number | null
          tenant_id?: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "firm_job_levels_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_firm_job_levels_job_title_id"
            columns: ["job_title_id"]
            isOneToOne: false
            referencedRelation: "firm_job_titles"
            referencedColumns: ["id"]
          },
        ]
      }
      firm_job_titles: {
        Row: {
          created_at: string | null
          created_by: string | null
          description: string | null
          description_i18n: Json | null
          eeoc_category: Database["public"]["Enums"]["eeoc_category"] | null
          id: string
          is_active: boolean | null
          is_exempt: boolean | null
          isco_code: string | null
          tenant_id: string
          title: string
          title_i18n: Json | null
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          description_i18n?: Json | null
          eeoc_category?: Database["public"]["Enums"]["eeoc_category"] | null
          id?: string
          is_active?: boolean | null
          is_exempt?: boolean | null
          isco_code?: string | null
          tenant_id: string
          title: string
          title_i18n?: Json | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          description_i18n?: Json | null
          eeoc_category?: Database["public"]["Enums"]["eeoc_category"] | null
          id?: string
          is_active?: boolean | null
          is_exempt?: boolean | null
          isco_code?: string | null
          tenant_id?: string
          title?: string
          title_i18n?: Json | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "firm_job_titles_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      firm_locations: {
        Row: {
          address_line1: string | null
          address_line2: string | null
          capacity: number | null
          city: string | null
          country: string
          created_at: string | null
          created_by: string | null
          currency: string | null
          email: string | null
          holiday_calendar_id: string | null
          id: string
          is_active: boolean | null
          is_headquarters: boolean | null
          locale: string | null
          location_code: string | null
          name: string
          name_i18n: Json | null
          phone: string | null
          postal_code: string | null
          state: string | null
          tenant_id: string
          timezone: string
          updated_at: string | null
          updated_by: string | null
          working_hours: Json | null
        }
        Insert: {
          address_line1?: string | null
          address_line2?: string | null
          capacity?: number | null
          city?: string | null
          country?: string
          created_at?: string | null
          created_by?: string | null
          currency?: string | null
          email?: string | null
          holiday_calendar_id?: string | null
          id?: string
          is_active?: boolean | null
          is_headquarters?: boolean | null
          locale?: string | null
          location_code?: string | null
          name: string
          name_i18n?: Json | null
          phone?: string | null
          postal_code?: string | null
          state?: string | null
          tenant_id: string
          timezone?: string
          updated_at?: string | null
          updated_by?: string | null
          working_hours?: Json | null
        }
        Update: {
          address_line1?: string | null
          address_line2?: string | null
          capacity?: number | null
          city?: string | null
          country?: string
          created_at?: string | null
          created_by?: string | null
          currency?: string | null
          email?: string | null
          holiday_calendar_id?: string | null
          id?: string
          is_active?: boolean | null
          is_headquarters?: boolean | null
          locale?: string | null
          location_code?: string | null
          name?: string
          name_i18n?: Json | null
          phone?: string | null
          postal_code?: string | null
          state?: string | null
          tenant_id?: string
          timezone?: string
          updated_at?: string | null
          updated_by?: string | null
          working_hours?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "firm_locations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      firm_payroll_policies: {
        Row: {
          created_at: string | null
          created_by: string | null
          id: string
          is_active: boolean
          location_id: string | null
          overtime_rules: Json | null
          require_time_tracking: boolean | null
          tenant_id: string
          time_rounding: string | null
          updated_at: string | null
          updated_by: string | null
          workweek_start_day: number | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          id?: string
          is_active?: boolean
          location_id?: string | null
          overtime_rules?: Json | null
          require_time_tracking?: boolean | null
          tenant_id: string
          time_rounding?: string | null
          updated_at?: string | null
          updated_by?: string | null
          workweek_start_day?: number | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          id?: string
          is_active?: boolean
          location_id?: string | null
          overtime_rules?: Json | null
          require_time_tracking?: boolean | null
          tenant_id?: string
          time_rounding?: string | null
          updated_at?: string | null
          updated_by?: string | null
          workweek_start_day?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "firm_payroll_policies_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_firm_payroll_policies_location_id"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "firm_locations"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_attendance: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          attendance_date: string
          attendance_id: string | null
          break_minutes: number | null
          clock_in_location: string | null
          clock_in_time: string | null
          clock_out_location: string | null
          clock_out_time: string | null
          created_at: string
          employee_id: string
          id: string
          notes: string | null
          overtime_hours: number | null
          regular_hours: number | null
          status: string
          tenant_id: string
          total_hours: number | null
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          attendance_date: string
          attendance_id?: string | null
          break_minutes?: number | null
          clock_in_location?: string | null
          clock_in_time?: string | null
          clock_out_location?: string | null
          clock_out_time?: string | null
          created_at?: string
          employee_id: string
          id?: string
          notes?: string | null
          overtime_hours?: number | null
          regular_hours?: number | null
          status?: string
          tenant_id: string
          total_hours?: number | null
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          attendance_date?: string
          attendance_id?: string | null
          break_minutes?: number | null
          clock_in_location?: string | null
          clock_in_time?: string | null
          clock_out_location?: string | null
          clock_out_time?: string | null
          created_at?: string
          employee_id?: string
          id?: string
          notes?: string | null
          overtime_hours?: number | null
          regular_hours?: number | null
          status?: string
          tenant_id?: string
          total_hours?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "hr_attendance_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_benefits_enrollments: {
        Row: {
          annual_election_amount: number | null
          beneficiaries: Json | null
          benefit_type: string
          carrier: string | null
          coverage_level: Database["public"]["Enums"]["coverage_level"] | null
          created_at: string
          dependents: Json | null
          effective_date: string
          election_details: Json | null
          employee_cost_monthly: number | null
          employee_id: string
          employer_cost_monthly: number | null
          end_date: string | null
          enrollment_date: string
          enrollment_id: string | null
          id: string
          plan_name: string
          plan_year: number
          status: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          annual_election_amount?: number | null
          beneficiaries?: Json | null
          benefit_type: string
          carrier?: string | null
          coverage_level?: Database["public"]["Enums"]["coverage_level"] | null
          created_at?: string
          dependents?: Json | null
          effective_date: string
          election_details?: Json | null
          employee_cost_monthly?: number | null
          employee_id: string
          employer_cost_monthly?: number | null
          end_date?: string | null
          enrollment_date: string
          enrollment_id?: string | null
          id?: string
          plan_name: string
          plan_year: number
          status?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          annual_election_amount?: number | null
          beneficiaries?: Json | null
          benefit_type?: string
          carrier?: string | null
          coverage_level?: Database["public"]["Enums"]["coverage_level"] | null
          created_at?: string
          dependents?: Json | null
          effective_date?: string
          election_details?: Json | null
          employee_cost_monthly?: number | null
          employee_id?: string
          employer_cost_monthly?: number | null
          end_date?: string | null
          enrollment_date?: string
          enrollment_id?: string | null
          id?: string
          plan_name?: string
          plan_year?: number
          status?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "hr_benefits_enrollments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_change_requests: {
        Row: {
          approval_chain: Json | null
          attached_documents: Json | null
          comments: Json | null
          created_at: string
          id: string
          request_details: Json
          request_id: string | null
          request_type: string
          requested_by: string
          requested_for: string
          resolved_at: string | null
          resolved_by: string | null
          status: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          approval_chain?: Json | null
          attached_documents?: Json | null
          comments?: Json | null
          created_at?: string
          id?: string
          request_details: Json
          request_id?: string | null
          request_type: string
          requested_by: string
          requested_for: string
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          approval_chain?: Json | null
          attached_documents?: Json | null
          comments?: Json | null
          created_at?: string
          id?: string
          request_details?: Json
          request_id?: string | null
          request_type?: string
          requested_by?: string
          requested_for?: string
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "hr_change_requests_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_company_news: {
        Row: {
          attachments: Json
          audience_department_code: string | null
          audience_group_id: string | null
          audience_location_code: string | null
          author_employee_id: string | null
          body: string
          body_i18n: Json | null
          created_at: string
          created_by: string | null
          event_date: string | null
          event_location: string | null
          expires_at: string | null
          id: string
          is_pinned: boolean
          post_type: string
          publish_at: string
          status: string
          subject_employee_id: string | null
          summary: string | null
          tenant_id: string
          title: string
          title_i18n: Json | null
          updated_at: string
        }
        Insert: {
          attachments?: Json
          audience_department_code?: string | null
          audience_group_id?: string | null
          audience_location_code?: string | null
          author_employee_id?: string | null
          body: string
          body_i18n?: Json | null
          created_at?: string
          created_by?: string | null
          event_date?: string | null
          event_location?: string | null
          expires_at?: string | null
          id?: string
          is_pinned?: boolean
          post_type?: string
          publish_at?: string
          status?: string
          subject_employee_id?: string | null
          summary?: string | null
          tenant_id: string
          title: string
          title_i18n?: Json | null
          updated_at?: string
        }
        Update: {
          attachments?: Json
          audience_department_code?: string | null
          audience_group_id?: string | null
          audience_location_code?: string | null
          author_employee_id?: string | null
          body?: string
          body_i18n?: Json | null
          created_at?: string
          created_by?: string | null
          event_date?: string | null
          event_location?: string | null
          expires_at?: string | null
          id?: string
          is_pinned?: boolean
          post_type?: string
          publish_at?: string
          status?: string
          subject_employee_id?: string | null
          summary?: string | null
          tenant_id?: string
          title?: string
          title_i18n?: Json | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_hcn_author"
            columns: ["author_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_hcn_group"
            columns: ["audience_group_id"]
            isOneToOne: false
            referencedRelation: "employee_user_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_hcn_subject"
            columns: ["subject_employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_company_news_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_emergency_contacts: {
        Row: {
          address_ct: string | null
          contact_id: string | null
          contact_name: string
          created_at: string
          email_ct: string | null
          employee_id: string
          id: string
          is_primary: boolean | null
          notes: string | null
          phone_primary_ct: string | null
          phone_secondary_ct: string | null
          relationship: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          address_ct?: string | null
          contact_id?: string | null
          contact_name: string
          created_at?: string
          email_ct?: string | null
          employee_id: string
          id?: string
          is_primary?: boolean | null
          notes?: string | null
          phone_primary_ct?: string | null
          phone_secondary_ct?: string | null
          relationship: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          address_ct?: string | null
          contact_id?: string | null
          contact_name?: string
          created_at?: string
          email_ct?: string | null
          employee_id?: string
          id?: string
          is_primary?: boolean | null
          notes?: string | null
          phone_primary_ct?: string | null
          phone_secondary_ct?: string | null
          relationship?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "hr_emergency_contacts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_employee_documents: {
        Row: {
          created_at: string
          document_id: string | null
          document_name: string
          document_type: string
          employee_id: string
          expiration_date: string | null
          file_size_bytes: number | null
          file_url: string
          id: string
          mime_type: string | null
          notes: string | null
          status: string | null
          tenant_id: string
          updated_at: string
          upload_date: string
          uploaded_by: string
        }
        Insert: {
          created_at?: string
          document_id?: string | null
          document_name: string
          document_type: string
          employee_id: string
          expiration_date?: string | null
          file_size_bytes?: number | null
          file_url: string
          id?: string
          mime_type?: string | null
          notes?: string | null
          status?: string | null
          tenant_id: string
          updated_at?: string
          upload_date: string
          uploaded_by: string
        }
        Update: {
          created_at?: string
          document_id?: string | null
          document_name?: string
          document_type?: string
          employee_id?: string
          expiration_date?: string | null
          file_size_bytes?: number | null
          file_url?: string
          id?: string
          mime_type?: string | null
          notes?: string | null
          status?: string | null
          tenant_id?: string
          updated_at?: string
          upload_date?: string
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_hr_employee_documents_employee_id"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_employee_documents_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_employment_history: {
        Row: {
          approved_by: string | null
          change_type: string
          compensation_amount: number | null
          compensation_currency: string | null
          compensation_id: string | null
          compensation_type:
            Database["public"]["Enums"]["compensation_type"] | null
          created_at: string
          created_by: string | null
          department_code: string | null
          effective_date: string
          employee_id: string
          fte: number | null
          id: string
          job_level: string | null
          job_title: string | null
          location_code: string | null
          manager_id: string | null
          new_employment_type:
            Database["public"]["Enums"]["employment_type"] | null
          previous_department_code: string | null
          previous_employment_type:
            Database["public"]["Enums"]["employment_type"] | null
          previous_fte: number | null
          previous_job_level: string | null
          previous_job_title: string | null
          previous_location_code: string | null
          previous_manager_id: string | null
          reason: string
          reason_notes: string | null
          tenant_id: string
        }
        Insert: {
          approved_by?: string | null
          change_type: string
          compensation_amount?: number | null
          compensation_currency?: string | null
          compensation_id?: string | null
          compensation_type?:
            Database["public"]["Enums"]["compensation_type"] | null
          created_at?: string
          created_by?: string | null
          department_code?: string | null
          effective_date: string
          employee_id: string
          fte?: number | null
          id?: string
          job_level?: string | null
          job_title?: string | null
          location_code?: string | null
          manager_id?: string | null
          new_employment_type?:
            Database["public"]["Enums"]["employment_type"] | null
          previous_department_code?: string | null
          previous_employment_type?:
            Database["public"]["Enums"]["employment_type"] | null
          previous_fte?: number | null
          previous_job_level?: string | null
          previous_job_title?: string | null
          previous_location_code?: string | null
          previous_manager_id?: string | null
          reason: string
          reason_notes?: string | null
          tenant_id: string
        }
        Update: {
          approved_by?: string | null
          change_type?: string
          compensation_amount?: number | null
          compensation_currency?: string | null
          compensation_id?: string | null
          compensation_type?:
            Database["public"]["Enums"]["compensation_type"] | null
          created_at?: string
          created_by?: string | null
          department_code?: string | null
          effective_date?: string
          employee_id?: string
          fte?: number | null
          id?: string
          job_level?: string | null
          job_title?: string | null
          location_code?: string | null
          manager_id?: string | null
          new_employment_type?:
            Database["public"]["Enums"]["employment_type"] | null
          previous_department_code?: string | null
          previous_employment_type?:
            Database["public"]["Enums"]["employment_type"] | null
          previous_fte?: number | null
          previous_job_level?: string | null
          previous_job_title?: string | null
          previous_location_code?: string | null
          previous_manager_id?: string | null
          reason?: string
          reason_notes?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_heh_compensation"
            columns: ["compensation_id"]
            isOneToOne: false
            referencedRelation: "compensation_base"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_heh_employee"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_heh_manager"
            columns: ["manager_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_heh_prev_manager"
            columns: ["previous_manager_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_employment_history_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_feedback: {
        Row: {
          content: string
          created_at: string
          feedback_date: string | null
          feedback_id: string | null
          feedback_type: string
          from_employee_id: string
          id: string
          is_anonymous: boolean | null
          status: string | null
          tags: Json | null
          tenant_id: string
          to_employee_id: string
          updated_at: string
          visibility: string | null
        }
        Insert: {
          content: string
          created_at?: string
          feedback_date?: string | null
          feedback_id?: string | null
          feedback_type: string
          from_employee_id: string
          id?: string
          is_anonymous?: boolean | null
          status?: string | null
          tags?: Json | null
          tenant_id: string
          to_employee_id: string
          updated_at?: string
          visibility?: string | null
        }
        Update: {
          content?: string
          created_at?: string
          feedback_date?: string | null
          feedback_id?: string | null
          feedback_type?: string
          from_employee_id?: string
          id?: string
          is_anonymous?: boolean | null
          status?: string | null
          tags?: Json | null
          tenant_id?: string
          to_employee_id?: string
          updated_at?: string
          visibility?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "hr_feedback_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_goals: {
        Row: {
          category: string | null
          completed_at: string | null
          created_at: string
          created_by: string | null
          current_value: number | null
          description: string | null
          employee_id: string
          goal_title: string
          goal_title_i18n: Json | null
          id: string
          measurement_type: string
          objective_id: string | null
          progress_percentage: number
          review_id: string | null
          start_date: string | null
          status: string
          target_date: string | null
          target_value: number | null
          tenant_id: string
          unit: string | null
          updated_at: string
          weight: number | null
        }
        Insert: {
          category?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          current_value?: number | null
          description?: string | null
          employee_id: string
          goal_title: string
          goal_title_i18n?: Json | null
          id?: string
          measurement_type?: string
          objective_id?: string | null
          progress_percentage?: number
          review_id?: string | null
          start_date?: string | null
          status?: string
          target_date?: string | null
          target_value?: number | null
          tenant_id: string
          unit?: string | null
          updated_at?: string
          weight?: number | null
        }
        Update: {
          category?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          current_value?: number | null
          description?: string | null
          employee_id?: string
          goal_title?: string
          goal_title_i18n?: Json | null
          id?: string
          measurement_type?: string
          objective_id?: string | null
          progress_percentage?: number
          review_id?: string | null
          start_date?: string | null
          status?: string
          target_date?: string | null
          target_value?: number | null
          tenant_id?: string
          unit?: string | null
          updated_at?: string
          weight?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "hr_goals_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_onboarding_tasks: {
        Row: {
          assigned_to_employee_id: string | null
          completion_date: string | null
          created_at: string
          description: string | null
          due_date: string | null
          employee_id: string
          id: string
          priority: string | null
          result_data: Json | null
          status: string | null
          task_id: string | null
          task_name: string
          task_type: Database["public"]["Enums"]["task_type"]
          template_data: Json | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          assigned_to_employee_id?: string | null
          completion_date?: string | null
          created_at?: string
          description?: string | null
          due_date?: string | null
          employee_id: string
          id?: string
          priority?: string | null
          result_data?: Json | null
          status?: string | null
          task_id?: string | null
          task_name: string
          task_type: Database["public"]["Enums"]["task_type"]
          template_data?: Json | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          assigned_to_employee_id?: string | null
          completion_date?: string | null
          created_at?: string
          description?: string | null
          due_date?: string | null
          employee_id?: string
          id?: string
          priority?: string | null
          result_data?: Json | null
          status?: string | null
          task_id?: string | null
          task_name?: string
          task_type?: Database["public"]["Enums"]["task_type"]
          template_data?: Json | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "hr_onboarding_tasks_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_onboarding_template_tasks: {
        Row: {
          assignee_role: string
          created_at: string
          description: string | null
          due_offset_days: number
          id: string
          is_active: boolean
          is_required: boolean
          phase: string
          reminder_days_before: number | null
          sort_order: number
          task_config: Json
          task_name: string
          task_name_i18n: Json | null
          task_type: string
          template_id: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          assignee_role?: string
          created_at?: string
          description?: string | null
          due_offset_days?: number
          id?: string
          is_active?: boolean
          is_required?: boolean
          phase?: string
          reminder_days_before?: number | null
          sort_order?: number
          task_config?: Json
          task_name: string
          task_name_i18n?: Json | null
          task_type: string
          template_id: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          assignee_role?: string
          created_at?: string
          description?: string | null
          due_offset_days?: number
          id?: string
          is_active?: boolean
          is_required?: boolean
          phase?: string
          reminder_days_before?: number | null
          sort_order?: number
          task_config?: Json
          task_name?: string
          task_name_i18n?: Json | null
          task_type?: string
          template_id?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_hott_template"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "hr_onboarding_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_onboarding_template_tasks_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_onboarding_templates: {
        Row: {
          applies_to_department_code: string | null
          applies_to_employment_types: Json
          applies_to_location_code: string | null
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_active: boolean
          is_default: boolean
          template_code: string
          template_name: string
          template_name_i18n: Json | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          applies_to_department_code?: string | null
          applies_to_employment_types?: Json
          applies_to_location_code?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          is_default?: boolean
          template_code: string
          template_name: string
          template_name_i18n?: Json | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          applies_to_department_code?: string | null
          applies_to_employment_types?: Json
          applies_to_location_code?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          is_default?: boolean
          template_code?: string
          template_name?: string
          template_name_i18n?: Json | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "hr_onboarding_templates_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_review_cycles: {
        Row: {
          created_at: string
          created_by: string
          cycle_close_date: string | null
          cycle_code: string | null
          cycle_name: string
          id: string
          is_active: boolean | null
          manager_assessment_due: string | null
          review_meetings_due: string | null
          review_type: string
          self_assessment_due: string | null
          start_date: string
          status: string
          template: Json | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          cycle_close_date?: string | null
          cycle_code?: string | null
          cycle_name: string
          id?: string
          is_active?: boolean | null
          manager_assessment_due?: string | null
          review_meetings_due?: string | null
          review_type: string
          self_assessment_due?: string | null
          start_date: string
          status?: string
          template?: Json | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          cycle_close_date?: string | null
          cycle_code?: string | null
          cycle_name?: string
          id?: string
          is_active?: boolean | null
          manager_assessment_due?: string | null
          review_meetings_due?: string | null
          review_type?: string
          self_assessment_due?: string | null
          start_date?: string
          status?: string
          template?: Json | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "hr_review_cycles_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_reviews: {
        Row: {
          competencies: Json | null
          created_at: string
          cycle_code: string
          employee_id: string
          goals: Json | null
          id: string
          manager_assessment: Json | null
          overall_rating: number | null
          review_date: string | null
          review_id: string | null
          review_type: string | null
          reviewer_id: string
          self_assessment: Json | null
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          competencies?: Json | null
          created_at?: string
          cycle_code: string
          employee_id: string
          goals?: Json | null
          id?: string
          manager_assessment?: Json | null
          overall_rating?: number | null
          review_date?: string | null
          review_id?: string | null
          review_type?: string | null
          reviewer_id: string
          self_assessment?: Json | null
          status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          competencies?: Json | null
          created_at?: string
          cycle_code?: string
          employee_id?: string
          goals?: Json | null
          id?: string
          manager_assessment?: Json | null
          overall_rating?: number | null
          review_date?: string | null
          review_id?: string | null
          review_type?: string | null
          reviewer_id?: string
          self_assessment?: Json | null
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "hr_reviews_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_survey_responses: {
        Row: {
          created_at: string
          id: string
          is_complete: boolean | null
          respondent_id: string | null
          response_id: string | null
          responses: string
          submitted_at: string
          survey_id: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_complete?: boolean | null
          respondent_id?: string | null
          response_id?: string | null
          responses: string
          submitted_at: string
          survey_id: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_complete?: boolean | null
          respondent_id?: string | null
          response_id?: string | null
          responses?: string
          submitted_at?: string
          survey_id?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_hr_survey_responses_survey_id"
            columns: ["survey_id"]
            isOneToOne: false
            referencedRelation: "hr_surveys"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hr_survey_responses_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_surveys: {
        Row: {
          aggregate_results: string | null
          created_at: string
          created_by: string
          description: string | null
          end_date: string
          id: string
          is_anonymous: boolean | null
          questions: Json
          response_count: number | null
          response_rate: number | null
          start_date: string
          status: string | null
          survey_id: string | null
          survey_name: string
          survey_type: string
          target_audience: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          aggregate_results?: string | null
          created_at?: string
          created_by: string
          description?: string | null
          end_date: string
          id?: string
          is_anonymous?: boolean | null
          questions: Json
          response_count?: number | null
          response_rate?: number | null
          start_date: string
          status?: string | null
          survey_id?: string | null
          survey_name: string
          survey_type: string
          target_audience?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          aggregate_results?: string | null
          created_at?: string
          created_by?: string
          description?: string | null
          end_date?: string
          id?: string
          is_anonymous?: boolean | null
          questions?: Json
          response_count?: number | null
          response_rate?: number | null
          start_date?: string
          status?: string | null
          survey_id?: string | null
          survey_name?: string
          survey_type?: string
          target_audience?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "hr_surveys_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_time_off_balances: {
        Row: {
          accrual_year: number
          accrued: number
          adjusted: number
          carried_over: number
          carryover_expires_on: string | null
          created_at: string
          current_balance: number
          employee_id: string
          forfeited: number
          id: string
          last_accrual_at: string | null
          opening_balance: number
          pending: number
          policy_id: string
          tenant_id: string
          unit: string
          updated_at: string
          used: number
        }
        Insert: {
          accrual_year: number
          accrued?: number
          adjusted?: number
          carried_over?: number
          carryover_expires_on?: string | null
          created_at?: string
          current_balance?: number
          employee_id: string
          forfeited?: number
          id?: string
          last_accrual_at?: string | null
          opening_balance?: number
          pending?: number
          policy_id: string
          tenant_id: string
          unit?: string
          updated_at?: string
          used?: number
        }
        Update: {
          accrual_year?: number
          accrued?: number
          adjusted?: number
          carried_over?: number
          carryover_expires_on?: string | null
          created_at?: string
          current_balance?: number
          employee_id?: string
          forfeited?: number
          id?: string
          last_accrual_at?: string | null
          opening_balance?: number
          pending?: number
          policy_id?: string
          tenant_id?: string
          unit?: string
          updated_at?: string
          used?: number
        }
        Relationships: [
          {
            foreignKeyName: "hr_time_off_balances_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_time_off_policies: {
        Row: {
          accrual_rules: Json | null
          created_at: string
          created_by: string
          employment_types: Json | null
          id: string
          is_active: boolean | null
          location_codes: Json | null
          policy_code: string | null
          policy_name: string
          template_id: string | null
          tenant_id: string
          time_off_type: string
          updated_at: string
        }
        Insert: {
          accrual_rules?: Json | null
          created_at?: string
          created_by: string
          employment_types?: Json | null
          id?: string
          is_active?: boolean | null
          location_codes?: Json | null
          policy_code?: string | null
          policy_name: string
          template_id?: string | null
          tenant_id: string
          time_off_type: string
          updated_at?: string
        }
        Update: {
          accrual_rules?: Json | null
          created_at?: string
          created_by?: string
          employment_types?: Json | null
          id?: string
          is_active?: boolean | null
          location_codes?: Json | null
          policy_code?: string | null
          policy_name?: string
          template_id?: string | null
          tenant_id?: string
          time_off_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "hr_time_off_policies_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      hr_time_off_requests: {
        Row: {
          approved_at: string | null
          approver_id: string | null
          denial_reason: string | null
          denied_at: string | null
          employee_id: string
          end_date: string
          id: string
          policy_code: string
          reason: string | null
          request_id: string | null
          start_date: string
          status: string
          submitted_at: string
          tenant_id: string
          total_hours: number
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approver_id?: string | null
          denial_reason?: string | null
          denied_at?: string | null
          employee_id: string
          end_date: string
          id?: string
          policy_code: string
          reason?: string | null
          request_id?: string | null
          start_date: string
          status?: string
          submitted_at: string
          tenant_id: string
          total_hours: number
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approver_id?: string | null
          denial_reason?: string | null
          denied_at?: string | null
          employee_id?: string
          end_date?: string
          id?: string
          policy_code?: string
          reason?: string | null
          request_id?: string | null
          start_date?: string
          status?: string
          submitted_at?: string
          tenant_id?: string
          total_hours?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "hr_time_off_requests_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_credits: {
        Row: {
          amount: number
          base_amount: number
          created_at: string
          created_by: string | null
          credit_number: string
          credit_type: string
          currency: string
          exchange_rate: number
          id: string
          invoice_id: string
          journal_entry_id: string | null
          reason: string
          tenant_id: string
        }
        Insert: {
          amount: number
          base_amount: number
          created_at?: string
          created_by?: string | null
          credit_number: string
          credit_type?: string
          currency: string
          exchange_rate?: number
          id?: string
          invoice_id: string
          journal_entry_id?: string | null
          reason: string
          tenant_id: string
        }
        Update: {
          amount?: number
          base_amount?: number
          created_at?: string
          created_by?: string | null
          credit_number?: string
          credit_type?: string
          currency?: string
          exchange_rate?: number
          id?: string
          invoice_id?: string
          journal_entry_id?: string | null
          reason?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoice_credits_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_credits_journal_entry_id_fkey"
            columns: ["journal_entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_credits_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_lines: {
        Row: {
          amount: number
          created_at: string | null
          description: string
          discount_amount: number | null
          discount_percent: number | null
          id: string
          invoice_id: string
          line_number: number
          quantity: number
          revenue_account_id: string
          tax_amount: number | null
          tax_rate_id: string | null
          tenant_id: string
          tracking_categories: Json | null
          unit_price: number
        }
        Insert: {
          amount: number
          created_at?: string | null
          description: string
          discount_amount?: number | null
          discount_percent?: number | null
          id?: string
          invoice_id: string
          line_number: number
          quantity?: number
          revenue_account_id: string
          tax_amount?: number | null
          tax_rate_id?: string | null
          tenant_id: string
          tracking_categories?: Json | null
          unit_price: number
        }
        Update: {
          amount?: number
          created_at?: string | null
          description?: string
          discount_amount?: number | null
          discount_percent?: number | null
          id?: string
          invoice_id?: string
          line_number?: number
          quantity?: number
          revenue_account_id?: string
          tax_amount?: number | null
          tax_rate_id?: string | null
          tenant_id?: string
          tracking_categories?: Json | null
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "fk_invoice_lines_invoice_id"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_invoice_lines_revenue_account_id"
            columns: ["revenue_account_id"]
            isOneToOne: false
            referencedRelation: "chart_of_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_invoice_lines_tax_rate_id"
            columns: ["tax_rate_id"]
            isOneToOne: false
            referencedRelation: "tax_rates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_lines_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          amount_credited: number
          amount_due: number
          amount_paid: number | null
          base_amount_credited: number
          base_amount_due: number
          base_amount_paid: number | null
          base_currency: string
          base_subtotal: number
          base_tax_total: number | null
          base_total: number
          created_at: string | null
          created_by: string | null
          currency: string
          customer_id: string
          due_date: string
          exchange_rate: number | null
          footer_text: string | null
          id: string
          invoice_date: string
          invoice_number: string
          is_recurring: boolean | null
          journal_entry_id: string | null
          notes: string | null
          paid_at: string | null
          payment_gateway: string | null
          payment_gateway_id: string | null
          payment_terms: string | null
          payment_url: string | null
          pdf_url: string | null
          recurring_schedule_id: string | null
          reference: string | null
          sent_at: string | null
          status: string | null
          subtotal: number
          tax_total: number | null
          tenant_id: string
          total: number
          tracking_categories: Json | null
          updated_at: string | null
          updated_by: string | null
          viewed_at: string | null
        }
        Insert: {
          amount_credited?: number
          amount_due: number
          amount_paid?: number | null
          base_amount_credited?: number
          base_amount_due: number
          base_amount_paid?: number | null
          base_currency: string
          base_subtotal: number
          base_tax_total?: number | null
          base_total: number
          created_at?: string | null
          created_by?: string | null
          currency: string
          customer_id: string
          due_date: string
          exchange_rate?: number | null
          footer_text?: string | null
          id?: string
          invoice_date: string
          invoice_number: string
          is_recurring?: boolean | null
          journal_entry_id?: string | null
          notes?: string | null
          paid_at?: string | null
          payment_gateway?: string | null
          payment_gateway_id?: string | null
          payment_terms?: string | null
          payment_url?: string | null
          pdf_url?: string | null
          recurring_schedule_id?: string | null
          reference?: string | null
          sent_at?: string | null
          status?: string | null
          subtotal: number
          tax_total?: number | null
          tenant_id: string
          total: number
          tracking_categories?: Json | null
          updated_at?: string | null
          updated_by?: string | null
          viewed_at?: string | null
        }
        Update: {
          amount_credited?: number
          amount_due?: number
          amount_paid?: number | null
          base_amount_credited?: number
          base_amount_due?: number
          base_amount_paid?: number | null
          base_currency?: string
          base_subtotal?: number
          base_tax_total?: number | null
          base_total?: number
          created_at?: string | null
          created_by?: string | null
          currency?: string
          customer_id?: string
          due_date?: string
          exchange_rate?: number | null
          footer_text?: string | null
          id?: string
          invoice_date?: string
          invoice_number?: string
          is_recurring?: boolean | null
          journal_entry_id?: string | null
          notes?: string | null
          paid_at?: string | null
          payment_gateway?: string | null
          payment_gateway_id?: string | null
          payment_terms?: string | null
          payment_url?: string | null
          pdf_url?: string | null
          recurring_schedule_id?: string | null
          reference?: string | null
          sent_at?: string | null
          status?: string | null
          subtotal?: number
          tax_total?: number | null
          tenant_id?: string
          total?: number
          tracking_categories?: Json | null
          updated_at?: string | null
          updated_by?: string | null
          viewed_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_invoices_customer_id"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_invoices_journal_entry_id"
            columns: ["journal_entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      jobs: {
        Row: {
          attempts: number
          completed_at: string | null
          created_at: string
          created_by: string | null
          id: string
          job_type: string
          last_error: string | null
          max_attempts: number
          payload: Json
          priority: number
          result: Json | null
          run_after: string
          started_at: string | null
          status: string
          tenant_id: string
        }
        Insert: {
          attempts?: number
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          job_type: string
          last_error?: string | null
          max_attempts?: number
          payload?: Json
          priority?: number
          result?: Json | null
          run_after?: string
          started_at?: string | null
          status?: string
          tenant_id: string
        }
        Update: {
          attempts?: number
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          job_type?: string
          last_error?: string | null
          max_attempts?: number
          payload?: Json
          priority?: number
          result?: Json | null
          run_after?: string
          started_at?: string | null
          status?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "jobs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      journal_entries: {
        Row: {
          accounting_period: string | null
          created_at: string | null
          created_by: string | null
          description: string
          entry_date: string
          entry_number: string
          fiscal_year: number | null
          id: string
          is_adjusting: boolean | null
          posted_at: string | null
          posted_by: string | null
          reference: string | null
          source_id: string | null
          source_type: string | null
          status: string | null
          tenant_id: string
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          accounting_period?: string | null
          created_at?: string | null
          created_by?: string | null
          description: string
          entry_date: string
          entry_number: string
          fiscal_year?: number | null
          id?: string
          is_adjusting?: boolean | null
          posted_at?: string | null
          posted_by?: string | null
          reference?: string | null
          source_id?: string | null
          source_type?: string | null
          status?: string | null
          tenant_id: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          accounting_period?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string
          entry_date?: string
          entry_number?: string
          fiscal_year?: number | null
          id?: string
          is_adjusting?: boolean | null
          posted_at?: string | null
          posted_by?: string | null
          reference?: string | null
          source_id?: string | null
          source_type?: string | null
          status?: string | null
          tenant_id?: string
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "journal_entries_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      journal_entry_lines: {
        Row: {
          account_id: string
          base_credit_amount: number | null
          base_currency: string
          base_debit_amount: number | null
          created_at: string | null
          credit_amount: number | null
          currency: string
          debit_amount: number | null
          department_id: string | null
          description: string | null
          entry_id: string
          exchange_rate: number | null
          id: string
          line_number: number
          location_id: string | null
          tax_amount: number | null
          tax_rate_id: string | null
          tenant_id: string
          tracking_categories: Json | null
        }
        Insert: {
          account_id: string
          base_credit_amount?: number | null
          base_currency: string
          base_debit_amount?: number | null
          created_at?: string | null
          credit_amount?: number | null
          currency: string
          debit_amount?: number | null
          department_id?: string | null
          description?: string | null
          entry_id: string
          exchange_rate?: number | null
          id?: string
          line_number: number
          location_id?: string | null
          tax_amount?: number | null
          tax_rate_id?: string | null
          tenant_id: string
          tracking_categories?: Json | null
        }
        Update: {
          account_id?: string
          base_credit_amount?: number | null
          base_currency?: string
          base_debit_amount?: number | null
          created_at?: string | null
          credit_amount?: number | null
          currency?: string
          debit_amount?: number | null
          department_id?: string | null
          description?: string | null
          entry_id?: string
          exchange_rate?: number | null
          id?: string
          line_number?: number
          location_id?: string | null
          tax_amount?: number | null
          tax_rate_id?: string | null
          tenant_id?: string
          tracking_categories?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_journal_entry_lines_account_id"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "chart_of_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_journal_entry_lines_department_id"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "firm_departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_journal_entry_lines_entry_id"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_journal_entry_lines_location_id"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "firm_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_journal_entry_lines_tax_rate_id"
            columns: ["tax_rate_id"]
            isOneToOne: false
            referencedRelation: "tax_rates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_entry_lines_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_allocations: {
        Row: {
          amount: number
          base_amount: number
          bill_id: string | null
          created_at: string | null
          fx_gain_loss: number | null
          id: string
          invoice_id: string | null
          payment_id: string
          tenant_id: string
        }
        Insert: {
          amount: number
          base_amount: number
          bill_id?: string | null
          created_at?: string | null
          fx_gain_loss?: number | null
          id?: string
          invoice_id?: string | null
          payment_id: string
          tenant_id: string
        }
        Update: {
          amount?: number
          base_amount?: number
          bill_id?: string | null
          created_at?: string | null
          fx_gain_loss?: number | null
          id?: string
          invoice_id?: string | null
          payment_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_payment_allocations_bill_id"
            columns: ["bill_id"]
            isOneToOne: false
            referencedRelation: "bills"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_payment_allocations_invoice_id"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_payment_allocations_payment_id"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_allocations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number
          bank_account_id: string | null
          base_amount: number
          check_number: string | null
          created_at: string | null
          created_by: string | null
          currency: string
          customer_id: string | null
          exchange_rate: number | null
          gateway_fee: number | null
          id: string
          journal_entry_id: string | null
          notes: string | null
          payment_date: string
          payment_gateway: string | null
          payment_gateway_id: string | null
          payment_method: Database["public"]["Enums"]["payment_method"]
          payment_number: string | null
          reference: string | null
          status: string | null
          tenant_id: string
          updated_at: string | null
          updated_by: string | null
          vendor_id: string | null
        }
        Insert: {
          amount: number
          bank_account_id?: string | null
          base_amount: number
          check_number?: string | null
          created_at?: string | null
          created_by?: string | null
          currency: string
          customer_id?: string | null
          exchange_rate?: number | null
          gateway_fee?: number | null
          id?: string
          journal_entry_id?: string | null
          notes?: string | null
          payment_date: string
          payment_gateway?: string | null
          payment_gateway_id?: string | null
          payment_method: Database["public"]["Enums"]["payment_method"]
          payment_number?: string | null
          reference?: string | null
          status?: string | null
          tenant_id: string
          updated_at?: string | null
          updated_by?: string | null
          vendor_id?: string | null
        }
        Update: {
          amount?: number
          bank_account_id?: string | null
          base_amount?: number
          check_number?: string | null
          created_at?: string | null
          created_by?: string | null
          currency?: string
          customer_id?: string | null
          exchange_rate?: number | null
          gateway_fee?: number | null
          id?: string
          journal_entry_id?: string | null
          notes?: string | null
          payment_date?: string
          payment_gateway?: string | null
          payment_gateway_id?: string | null
          payment_method?: Database["public"]["Enums"]["payment_method"]
          payment_number?: string | null
          reference?: string | null
          status?: string | null
          tenant_id?: string
          updated_at?: string | null
          updated_by?: string | null
          vendor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_payments_bank_account_id"
            columns: ["bank_account_id"]
            isOneToOne: false
            referencedRelation: "bank_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_payments_customer_id"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_payments_journal_entry_id"
            columns: ["journal_entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_payments_vendor_id"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      payroll_deduction_definitions: {
        Row: {
          annual_limit_amount: number | null
          calculation_method: string | null
          category: string
          created_at: string | null
          deduction_code: string
          deduction_def_id: string | null
          deduction_name: string
          deduction_type: string | null
          default_amount: number | null
          default_percentage: number | null
          description: string | null
          employer_match_config: Json | null
          has_annual_limit: boolean | null
          has_employer_match: boolean | null
          has_per_pay_limit: boolean | null
          id: string
          is_active: boolean | null
          is_pretax: boolean | null
          max_amount: number | null
          per_pay_limit_amount: number | null
          priority_order: number | null
          reduces_federal_taxable: boolean | null
          reduces_fica_taxable: boolean | null
          reduces_india_taxable: boolean | null
          reduces_state_taxable: boolean | null
          tenant_id: string
          updated_at: string | null
        }
        Insert: {
          annual_limit_amount?: number | null
          calculation_method?: string | null
          category: string
          created_at?: string | null
          deduction_code: string
          deduction_def_id?: string | null
          deduction_name: string
          deduction_type?: string | null
          default_amount?: number | null
          default_percentage?: number | null
          description?: string | null
          employer_match_config?: Json | null
          has_annual_limit?: boolean | null
          has_employer_match?: boolean | null
          has_per_pay_limit?: boolean | null
          id?: string
          is_active?: boolean | null
          is_pretax?: boolean | null
          max_amount?: number | null
          per_pay_limit_amount?: number | null
          priority_order?: number | null
          reduces_federal_taxable?: boolean | null
          reduces_fica_taxable?: boolean | null
          reduces_india_taxable?: boolean | null
          reduces_state_taxable?: boolean | null
          tenant_id: string
          updated_at?: string | null
        }
        Update: {
          annual_limit_amount?: number | null
          calculation_method?: string | null
          category?: string
          created_at?: string | null
          deduction_code?: string
          deduction_def_id?: string | null
          deduction_name?: string
          deduction_type?: string | null
          default_amount?: number | null
          default_percentage?: number | null
          description?: string | null
          employer_match_config?: Json | null
          has_annual_limit?: boolean | null
          has_employer_match?: boolean | null
          has_per_pay_limit?: boolean | null
          id?: string
          is_active?: boolean | null
          is_pretax?: boolean | null
          max_amount?: number | null
          per_pay_limit_amount?: number | null
          priority_order?: number | null
          reduces_federal_taxable?: boolean | null
          reduces_fica_taxable?: boolean | null
          reduces_india_taxable?: boolean | null
          reduces_state_taxable?: boolean | null
          tenant_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payroll_deduction_definitions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      payroll_employee_deductions: {
        Row: {
          amount: number | null
          calculation_method: string | null
          created_at: string | null
          deduction_def_id: string
          deduction_id: string
          deduction_type: string
          effective_from: string
          effective_to: string | null
          employee_annual_limit: number | null
          employee_deduction_id: string | null
          employee_id: string
          frequency: string | null
          garnishment_amount_remaining: number | null
          garnishment_authority: string | null
          garnishment_case_number: string | null
          garnishment_total_amount: number | null
          id: string
          is_active: boolean | null
          percentage: number | null
          suspended_from: string | null
          suspended_to: string | null
          suspension_reason: string | null
          tenant_id: string
          updated_at: string | null
          ytd_deducted: number | null
        }
        Insert: {
          amount?: number | null
          calculation_method?: string | null
          created_at?: string | null
          deduction_def_id: string
          deduction_id: string
          deduction_type: string
          effective_from: string
          effective_to?: string | null
          employee_annual_limit?: number | null
          employee_deduction_id?: string | null
          employee_id: string
          frequency?: string | null
          garnishment_amount_remaining?: number | null
          garnishment_authority?: string | null
          garnishment_case_number?: string | null
          garnishment_total_amount?: number | null
          id?: string
          is_active?: boolean | null
          percentage?: number | null
          suspended_from?: string | null
          suspended_to?: string | null
          suspension_reason?: string | null
          tenant_id: string
          updated_at?: string | null
          ytd_deducted?: number | null
        }
        Update: {
          amount?: number | null
          calculation_method?: string | null
          created_at?: string | null
          deduction_def_id?: string
          deduction_id?: string
          deduction_type?: string
          effective_from?: string
          effective_to?: string | null
          employee_annual_limit?: number | null
          employee_deduction_id?: string | null
          employee_id?: string
          frequency?: string | null
          garnishment_amount_remaining?: number | null
          garnishment_authority?: string | null
          garnishment_case_number?: string | null
          garnishment_total_amount?: number | null
          id?: string
          is_active?: boolean | null
          percentage?: number | null
          suspended_from?: string | null
          suspended_to?: string | null
          suspension_reason?: string | null
          tenant_id?: string
          updated_at?: string | null
          ytd_deducted?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_payroll_employee_deductions_deduction_id"
            columns: ["deduction_id"]
            isOneToOne: false
            referencedRelation: "payroll_deduction_definitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_payroll_employee_deductions_employee_id"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_employee_deductions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      payroll_india_salary_structure: {
        Row: {
          annual_bonus: number | null
          annual_ctc: number
          basic_salary: number
          conveyance_allowance: number | null
          created_at: string | null
          currency: string | null
          dearness_allowance: number | null
          education_allowance: number | null
          effective_from: string
          effective_to: string | null
          employee_id: string
          employer_epf: number | null
          employer_esi: number | null
          employer_nps: number | null
          gratuity: number | null
          hra: number | null
          id: string
          internet_reimbursement: number | null
          medical_allowance: number | null
          mobile_reimbursement: number | null
          monthly_gross: number | null
          other_allowances: Json | null
          performance_bonus: number | null
          special_allowance: number | null
          tenant_id: string
          updated_at: string | null
        }
        Insert: {
          annual_bonus?: number | null
          annual_ctc: number
          basic_salary: number
          conveyance_allowance?: number | null
          created_at?: string | null
          currency?: string | null
          dearness_allowance?: number | null
          education_allowance?: number | null
          effective_from: string
          effective_to?: string | null
          employee_id: string
          employer_epf?: number | null
          employer_esi?: number | null
          employer_nps?: number | null
          gratuity?: number | null
          hra?: number | null
          id?: string
          internet_reimbursement?: number | null
          medical_allowance?: number | null
          mobile_reimbursement?: number | null
          monthly_gross?: number | null
          other_allowances?: Json | null
          performance_bonus?: number | null
          special_allowance?: number | null
          tenant_id: string
          updated_at?: string | null
        }
        Update: {
          annual_bonus?: number | null
          annual_ctc?: number
          basic_salary?: number
          conveyance_allowance?: number | null
          created_at?: string | null
          currency?: string | null
          dearness_allowance?: number | null
          education_allowance?: number | null
          effective_from?: string
          effective_to?: string | null
          employee_id?: string
          employer_epf?: number | null
          employer_esi?: number | null
          employer_nps?: number | null
          gratuity?: number | null
          hra?: number | null
          id?: string
          internet_reimbursement?: number | null
          medical_allowance?: number | null
          mobile_reimbursement?: number | null
          monthly_gross?: number | null
          other_allowances?: Json | null
          performance_bonus?: number | null
          special_allowance?: number | null
          tenant_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_payroll_india_salary_structure_employee_id"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_india_salary_structure_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      payroll_india_tax_declarations: {
        Row: {
          created_at: string | null
          documents: Json | null
          employee_id: string
          financial_year: string
          home_loan_interest: number | null
          hra_exemption_claimed: number | null
          id: string
          lta_claimed: number | null
          metro_city: boolean | null
          previous_employer_income: number | null
          previous_employer_tds: number | null
          rent_paid_monthly: number | null
          section_80c: number | null
          section_80d: number | null
          section_80e: number | null
          section_80g: number | null
          status: string | null
          submitted_at: string | null
          tax_regime: string
          tenant_id: string
          updated_at: string | null
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          created_at?: string | null
          documents?: Json | null
          employee_id: string
          financial_year: string
          home_loan_interest?: number | null
          hra_exemption_claimed?: number | null
          id?: string
          lta_claimed?: number | null
          metro_city?: boolean | null
          previous_employer_income?: number | null
          previous_employer_tds?: number | null
          rent_paid_monthly?: number | null
          section_80c?: number | null
          section_80d?: number | null
          section_80e?: number | null
          section_80g?: number | null
          status?: string | null
          submitted_at?: string | null
          tax_regime: string
          tenant_id: string
          updated_at?: string | null
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          created_at?: string | null
          documents?: Json | null
          employee_id?: string
          financial_year?: string
          home_loan_interest?: number | null
          hra_exemption_claimed?: number | null
          id?: string
          lta_claimed?: number | null
          metro_city?: boolean | null
          previous_employer_income?: number | null
          previous_employer_tds?: number | null
          rent_paid_monthly?: number | null
          section_80c?: number | null
          section_80d?: number | null
          section_80e?: number | null
          section_80g?: number | null
          status?: string | null
          submitted_at?: string | null
          tax_regime?: string
          tenant_id?: string
          updated_at?: string | null
          verified_at?: string | null
          verified_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_payroll_india_tax_declarations_employee_id"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_india_tax_declarations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      payroll_pay_schedules: {
        Row: {
          adjust_for_holidays: boolean | null
          adjust_for_weekends: boolean | null
          anchor_date: string
          configuration: string | null
          created_at: string | null
          created_by: string | null
          currency: string
          description: string | null
          frequency: string
          holiday_adjustment: string | null
          id: string
          is_active: boolean | null
          is_default: boolean | null
          location_ids: string[] | null
          name: string
          name_i18n: Json | null
          next_pay_date: string | null
          pay_day_of_month: number | null
          pay_day_of_week: string | null
          pay_days_of_month: string | null
          pay_period_days: number | null
          tenant_id: string
          timezone: string
          upcoming_pay_dates: string | null
          updated_at: string | null
          updated_by: string | null
          version: number | null
        }
        Insert: {
          adjust_for_holidays?: boolean | null
          adjust_for_weekends?: boolean | null
          anchor_date: string
          configuration?: string | null
          created_at?: string | null
          created_by?: string | null
          currency?: string
          description?: string | null
          frequency: string
          holiday_adjustment?: string | null
          id?: string
          is_active?: boolean | null
          is_default?: boolean | null
          location_ids?: string[] | null
          name: string
          name_i18n?: Json | null
          next_pay_date?: string | null
          pay_day_of_month?: number | null
          pay_day_of_week?: string | null
          pay_days_of_month?: string | null
          pay_period_days?: number | null
          tenant_id: string
          timezone?: string
          upcoming_pay_dates?: string | null
          updated_at?: string | null
          updated_by?: string | null
          version?: number | null
        }
        Update: {
          adjust_for_holidays?: boolean | null
          adjust_for_weekends?: boolean | null
          anchor_date?: string
          configuration?: string | null
          created_at?: string | null
          created_by?: string | null
          currency?: string
          description?: string | null
          frequency?: string
          holiday_adjustment?: string | null
          id?: string
          is_active?: boolean | null
          is_default?: boolean | null
          location_ids?: string[] | null
          name?: string
          name_i18n?: Json | null
          next_pay_date?: string | null
          pay_day_of_month?: number | null
          pay_day_of_week?: string | null
          pay_days_of_month?: string | null
          pay_period_days?: number | null
          tenant_id?: string
          timezone?: string
          upcoming_pay_dates?: string | null
          updated_at?: string | null
          updated_by?: string | null
          version?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "payroll_pay_schedules_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      payroll_run_employees: {
        Row: {
          calculation_details: Json | null
          created_at: string | null
          double_time_hours: number | null
          earnings: Json
          employee_id: string
          employer_taxes: Json | null
          gross_pay: number
          id: string
          net_pay: number
          notes: string | null
          overtime_hours: number | null
          pay_stub_generated_at: string | null
          pay_stub_url: string | null
          payment_details: Json | null
          payment_method: Database["public"]["Enums"]["payment_method"] | null
          payroll_run_id: string
          posttax_deductions: Json | null
          pretax_deductions: Json | null
          pto_hours: number | null
          regular_hours: number | null
          resident_state: string | null
          run_employee_id: string | null
          status: string | null
          taxable_wages: Json
          taxes: Json
          tenant_id: string
          total_posttax_deductions: number | null
          total_pretax_deductions: number | null
          total_taxes: number
          updated_at: string | null
          work_country: string
          work_state: string | null
          ytd_epf_employee: number | null
          ytd_epf_employer: number | null
          ytd_esi_employee: number | null
          ytd_esi_employer: number | null
          ytd_federal_tax: number | null
          ytd_federal_wages: number | null
          ytd_gross: number | null
          ytd_gross_inr: number | null
          ytd_medicare_tax: number | null
          ytd_medicare_wages: number | null
          ytd_ss_tax: number | null
          ytd_ss_wages: number | null
          ytd_state_tax: number | null
          ytd_state_wages: number | null
          ytd_tds: number | null
        }
        Insert: {
          calculation_details?: Json | null
          created_at?: string | null
          double_time_hours?: number | null
          earnings: Json
          employee_id: string
          employer_taxes?: Json | null
          gross_pay: number
          id?: string
          net_pay: number
          notes?: string | null
          overtime_hours?: number | null
          pay_stub_generated_at?: string | null
          pay_stub_url?: string | null
          payment_details?: Json | null
          payment_method?: Database["public"]["Enums"]["payment_method"] | null
          payroll_run_id: string
          posttax_deductions?: Json | null
          pretax_deductions?: Json | null
          pto_hours?: number | null
          regular_hours?: number | null
          resident_state?: string | null
          run_employee_id?: string | null
          status?: string | null
          taxable_wages: Json
          taxes: Json
          tenant_id: string
          total_posttax_deductions?: number | null
          total_pretax_deductions?: number | null
          total_taxes: number
          updated_at?: string | null
          work_country: string
          work_state?: string | null
          ytd_epf_employee?: number | null
          ytd_epf_employer?: number | null
          ytd_esi_employee?: number | null
          ytd_esi_employer?: number | null
          ytd_federal_tax?: number | null
          ytd_federal_wages?: number | null
          ytd_gross?: number | null
          ytd_gross_inr?: number | null
          ytd_medicare_tax?: number | null
          ytd_medicare_wages?: number | null
          ytd_ss_tax?: number | null
          ytd_ss_wages?: number | null
          ytd_state_tax?: number | null
          ytd_state_wages?: number | null
          ytd_tds?: number | null
        }
        Update: {
          calculation_details?: Json | null
          created_at?: string | null
          double_time_hours?: number | null
          earnings?: Json
          employee_id?: string
          employer_taxes?: Json | null
          gross_pay?: number
          id?: string
          net_pay?: number
          notes?: string | null
          overtime_hours?: number | null
          pay_stub_generated_at?: string | null
          pay_stub_url?: string | null
          payment_details?: Json | null
          payment_method?: Database["public"]["Enums"]["payment_method"] | null
          payroll_run_id?: string
          posttax_deductions?: Json | null
          pretax_deductions?: Json | null
          pto_hours?: number | null
          regular_hours?: number | null
          resident_state?: string | null
          run_employee_id?: string | null
          status?: string | null
          taxable_wages?: Json
          taxes?: Json
          tenant_id?: string
          total_posttax_deductions?: number | null
          total_pretax_deductions?: number | null
          total_taxes?: number
          updated_at?: string | null
          work_country?: string
          work_state?: string | null
          ytd_epf_employee?: number | null
          ytd_epf_employer?: number | null
          ytd_esi_employee?: number | null
          ytd_esi_employer?: number | null
          ytd_federal_tax?: number | null
          ytd_federal_wages?: number | null
          ytd_gross?: number | null
          ytd_gross_inr?: number | null
          ytd_medicare_tax?: number | null
          ytd_medicare_wages?: number | null
          ytd_ss_tax?: number | null
          ytd_ss_wages?: number | null
          ytd_state_tax?: number | null
          ytd_state_wages?: number | null
          ytd_tds?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_payroll_run_employees_employee_id"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_payroll_run_employees_payroll_run_id"
            columns: ["payroll_run_id"]
            isOneToOne: false
            referencedRelation: "payroll_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_run_employees_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      payroll_runs: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          calculated_at: string | null
          calculated_by: string | null
          country: string
          created_at: string | null
          created_by: string | null
          currency: string
          employee_count: number | null
          finalized_at: string | null
          finalized_by: string | null
          id: string
          notes: string | null
          pay_date: string
          pay_period_end: string
          pay_period_start: string
          pay_schedule_id: string | null
          payment_file_generated_at: string | null
          payment_file_url: string | null
          payment_submitted_at: string | null
          processed_at: string | null
          processed_by: string | null
          run_id: string | null
          run_number: string | null
          run_status: string
          run_type: string
          status: string
          tenant_id: string
          total_deductions: number | null
          total_gross_pay: number | null
          total_net_pay: number | null
          total_taxes: number | null
          updated_at: string | null
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          calculated_at?: string | null
          calculated_by?: string | null
          country: string
          created_at?: string | null
          created_by?: string | null
          currency?: string
          employee_count?: number | null
          finalized_at?: string | null
          finalized_by?: string | null
          id?: string
          notes?: string | null
          pay_date: string
          pay_period_end: string
          pay_period_start: string
          pay_schedule_id?: string | null
          payment_file_generated_at?: string | null
          payment_file_url?: string | null
          payment_submitted_at?: string | null
          processed_at?: string | null
          processed_by?: string | null
          run_id?: string | null
          run_number?: string | null
          run_status?: string
          run_type: string
          status?: string
          tenant_id: string
          total_deductions?: number | null
          total_gross_pay?: number | null
          total_net_pay?: number | null
          total_taxes?: number | null
          updated_at?: string | null
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          calculated_at?: string | null
          calculated_by?: string | null
          country?: string
          created_at?: string | null
          created_by?: string | null
          currency?: string
          employee_count?: number | null
          finalized_at?: string | null
          finalized_by?: string | null
          id?: string
          notes?: string | null
          pay_date?: string
          pay_period_end?: string
          pay_period_start?: string
          pay_schedule_id?: string | null
          payment_file_generated_at?: string | null
          payment_file_url?: string | null
          payment_submitted_at?: string | null
          processed_at?: string | null
          processed_by?: string | null
          run_id?: string | null
          run_number?: string | null
          run_status?: string
          run_type?: string
          status?: string
          tenant_id?: string
          total_deductions?: number | null
          total_gross_pay?: number | null
          total_net_pay?: number | null
          total_taxes?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_payroll_runs_pay_schedule_id"
            columns: ["pay_schedule_id"]
            isOneToOne: false
            referencedRelation: "payroll_pay_schedules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_runs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      payroll_tax_deposits: {
        Row: {
          amount: number
          confirmation_number: string | null
          created_at: string | null
          created_by: string | null
          currency: string
          deposit_date: string | null
          deposit_id: string | null
          deposit_type: string
          due_date: string
          id: string
          jurisdiction: string
          payment_date: string | null
          payment_method: Database["public"]["Enums"]["payment_method"] | null
          payment_status: Database["public"]["Enums"]["payment_status"] | null
          period_end: string | null
          period_start: string | null
          related_payroll_runs: string[] | null
          status: string | null
          tax_breakdown: Json | null
          tax_period: string | null
          tax_period_end: string | null
          tax_period_start: string | null
          tenant_id: string
          total_amount: number | null
          updated_at: string | null
        }
        Insert: {
          amount: number
          confirmation_number?: string | null
          created_at?: string | null
          created_by?: string | null
          currency: string
          deposit_date?: string | null
          deposit_id?: string | null
          deposit_type: string
          due_date: string
          id?: string
          jurisdiction: string
          payment_date?: string | null
          payment_method?: Database["public"]["Enums"]["payment_method"] | null
          payment_status?: Database["public"]["Enums"]["payment_status"] | null
          period_end?: string | null
          period_start?: string | null
          related_payroll_runs?: string[] | null
          status?: string | null
          tax_breakdown?: Json | null
          tax_period?: string | null
          tax_period_end?: string | null
          tax_period_start?: string | null
          tenant_id: string
          total_amount?: number | null
          updated_at?: string | null
        }
        Update: {
          amount?: number
          confirmation_number?: string | null
          created_at?: string | null
          created_by?: string | null
          currency?: string
          deposit_date?: string | null
          deposit_id?: string | null
          deposit_type?: string
          due_date?: string
          id?: string
          jurisdiction?: string
          payment_date?: string | null
          payment_method?: Database["public"]["Enums"]["payment_method"] | null
          payment_status?: Database["public"]["Enums"]["payment_status"] | null
          period_end?: string | null
          period_start?: string | null
          related_payroll_runs?: string[] | null
          status?: string | null
          tax_breakdown?: Json | null
          tax_period?: string | null
          tax_period_end?: string | null
          tax_period_start?: string | null
          tenant_id?: string
          total_amount?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payroll_tax_deposits_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      payroll_tax_rates: {
        Row: {
          additional_threshold: number | null
          components: Json | null
          country: string
          country_code: string | null
          created_at: string | null
          created_by: string | null
          effective_from: string
          effective_to: string | null
          id: string
          is_active: boolean | null
          is_compound: boolean | null
          is_reverse_charge: boolean | null
          jurisdiction: string | null
          jurisdiction_code: string | null
          jurisdiction_type: string
          personal_exemption: number | null
          rate: number
          rate_structure: Json
          region: string | null
          standard_deduction: number | null
          tax_collected_account_id: string | null
          tax_name: string
          tax_name_i18n: Json | null
          tax_paid_account_id: string | null
          tax_rate_id: string | null
          tax_type: Database["public"]["Enums"]["tax_type"]
          tax_year: number
          tenant_id: string | null
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          additional_threshold?: number | null
          components?: Json | null
          country: string
          country_code?: string | null
          created_at?: string | null
          created_by?: string | null
          effective_from: string
          effective_to?: string | null
          id?: string
          is_active?: boolean | null
          is_compound?: boolean | null
          is_reverse_charge?: boolean | null
          jurisdiction?: string | null
          jurisdiction_code?: string | null
          jurisdiction_type: string
          personal_exemption?: number | null
          rate: number
          rate_structure: Json
          region?: string | null
          standard_deduction?: number | null
          tax_collected_account_id?: string | null
          tax_name: string
          tax_name_i18n?: Json | null
          tax_paid_account_id?: string | null
          tax_rate_id?: string | null
          tax_type: Database["public"]["Enums"]["tax_type"]
          tax_year: number
          tenant_id?: string | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          additional_threshold?: number | null
          components?: Json | null
          country?: string
          country_code?: string | null
          created_at?: string | null
          created_by?: string | null
          effective_from?: string
          effective_to?: string | null
          id?: string
          is_active?: boolean | null
          is_compound?: boolean | null
          is_reverse_charge?: boolean | null
          jurisdiction?: string | null
          jurisdiction_code?: string | null
          jurisdiction_type?: string
          personal_exemption?: number | null
          rate?: number
          rate_structure?: Json
          region?: string | null
          standard_deduction?: number | null
          tax_collected_account_id?: string | null
          tax_name?: string
          tax_name_i18n?: Json | null
          tax_paid_account_id?: string | null
          tax_rate_id?: string | null
          tax_type?: Database["public"]["Enums"]["tax_type"]
          tax_year?: number
          tenant_id?: string | null
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_payroll_tax_rates_tax_collected_account_id"
            columns: ["tax_collected_account_id"]
            isOneToOne: false
            referencedRelation: "chart_of_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_payroll_tax_rates_tax_paid_account_id"
            columns: ["tax_paid_account_id"]
            isOneToOne: false
            referencedRelation: "chart_of_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_tax_rates_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      payroll_tax_withholding_certificates: {
        Row: {
          country: string
          created_at: string | null
          document_url: string | null
          effective_from: string
          effective_to: string | null
          employee_id: string
          id: string
          india_previous_employer_income: number | null
          india_previous_employer_tds: number | null
          india_section_declarations: Json | null
          india_tax_regime:
            Database["public"]["Enums"]["india_tax_regime"] | null
          state_withholding: Json | null
          submitted_at: string | null
          tax_year: number
          tenant_id: string
          updated_at: string | null
          us_exempt: boolean | null
          us_filing_status: string | null
          us_multiple_jobs: boolean | null
          us_step2_amount: number | null
          us_step3_dependents: number | null
          us_step4a_other_income: number | null
          us_step4b_deductions: number | null
          us_step4c_extra_withholding: number | null
        }
        Insert: {
          country: string
          created_at?: string | null
          document_url?: string | null
          effective_from: string
          effective_to?: string | null
          employee_id: string
          id?: string
          india_previous_employer_income?: number | null
          india_previous_employer_tds?: number | null
          india_section_declarations?: Json | null
          india_tax_regime?:
            Database["public"]["Enums"]["india_tax_regime"] | null
          state_withholding?: Json | null
          submitted_at?: string | null
          tax_year: number
          tenant_id: string
          updated_at?: string | null
          us_exempt?: boolean | null
          us_filing_status?: string | null
          us_multiple_jobs?: boolean | null
          us_step2_amount?: number | null
          us_step3_dependents?: number | null
          us_step4a_other_income?: number | null
          us_step4b_deductions?: number | null
          us_step4c_extra_withholding?: number | null
        }
        Update: {
          country?: string
          created_at?: string | null
          document_url?: string | null
          effective_from?: string
          effective_to?: string | null
          employee_id?: string
          id?: string
          india_previous_employer_income?: number | null
          india_previous_employer_tds?: number | null
          india_section_declarations?: Json | null
          india_tax_regime?:
            Database["public"]["Enums"]["india_tax_regime"] | null
          state_withholding?: Json | null
          submitted_at?: string | null
          tax_year?: number
          tenant_id?: string
          updated_at?: string | null
          us_exempt?: boolean | null
          us_filing_status?: string | null
          us_multiple_jobs?: boolean | null
          us_step2_amount?: number | null
          us_step3_dependents?: number | null
          us_step4a_other_income?: number | null
          us_step4b_deductions?: number | null
          us_step4c_extra_withholding?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_payroll_tax_withholding_certificates_employee_id"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_tax_withholding_certificates_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      pii_erasures: {
        Row: {
          created_at: string
          erased_at: string
          id: string
          reason: string
          requested_by: string | null
          subject_id: string
          subject_label: string | null
          subject_type: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          erased_at?: string
          id?: string
          reason: string
          requested_by?: string | null
          subject_id: string
          subject_label?: string | null
          subject_type: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          erased_at?: string
          id?: string
          reason?: string
          requested_by?: string | null
          subject_id?: string
          subject_label?: string | null
          subject_type?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pii_erasures_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      pii_keys: {
        Row: {
          created_at: string
          id: string
          kek_version: number
          key_label: string | null
          subject_id: string
          subject_type: string
          tenant_id: string
          updated_at: string
          wrapped_dek: string
        }
        Insert: {
          created_at?: string
          id?: string
          kek_version: number
          key_label?: string | null
          subject_id: string
          subject_type?: string
          tenant_id: string
          updated_at?: string
          wrapped_dek: string
        }
        Update: {
          created_at?: string
          id?: string
          kek_version?: number
          key_label?: string | null
          subject_id?: string
          subject_type?: string
          tenant_id?: string
          updated_at?: string
          wrapped_dek?: string
        }
        Relationships: [
          {
            foreignKeyName: "pii_keys_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      pm_automation_executions: {
        Row: {
          action_results: Json | null
          actions_executed: number | null
          actions_failed: number | null
          automation_id: string
          completed_at: string | null
          created_at: string
          entity_id: string
          entity_type: string
          error_message: string | null
          error_stack: string | null
          executed_at: string
          execution_id: string | null
          execution_status: string
          execution_time_ms: number | null
          id: string
          tenant_id: string
          trigger_data: Json | null
          triggered_at: string | null
          triggered_by: string
          triggered_by_user_id: string | null
        }
        Insert: {
          action_results?: Json | null
          actions_executed?: number | null
          actions_failed?: number | null
          automation_id: string
          completed_at?: string | null
          created_at?: string
          entity_id: string
          entity_type: string
          error_message?: string | null
          error_stack?: string | null
          executed_at: string
          execution_id?: string | null
          execution_status: string
          execution_time_ms?: number | null
          id?: string
          tenant_id: string
          trigger_data?: Json | null
          triggered_at?: string | null
          triggered_by: string
          triggered_by_user_id?: string | null
        }
        Update: {
          action_results?: Json | null
          actions_executed?: number | null
          actions_failed?: number | null
          automation_id?: string
          completed_at?: string | null
          created_at?: string
          entity_id?: string
          entity_type?: string
          error_message?: string | null
          error_stack?: string | null
          executed_at?: string
          execution_id?: string | null
          execution_status?: string
          execution_time_ms?: number | null
          id?: string
          tenant_id?: string
          trigger_data?: Json | null
          triggered_at?: string | null
          triggered_by?: string
          triggered_by_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_pm_automation_executions_automation_id"
            columns: ["automation_id"]
            isOneToOne: false
            referencedRelation: "pm_automations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pm_automation_executions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      pm_automations: {
        Row: {
          action_delays: Json | null
          actions: Json
          ai_confidence: number | null
          automation_id: string | null
          automation_name: string
          conditions: Json | null
          created_at: string
          created_by: string
          created_from_natural_language: string | null
          current_hour_executions: number | null
          current_hour_start: string | null
          description: string | null
          execution_count: number | null
          id: string
          is_active: boolean | null
          last_error: string | null
          last_executed_at: string | null
          max_executions_per_hour: number | null
          objective_id: string | null
          project_id: string | null
          scope: string
          suggested_by_ai: boolean | null
          tenant_id: string
          trigger: Json
          updated_at: string
        }
        Insert: {
          action_delays?: Json | null
          actions?: Json
          ai_confidence?: number | null
          automation_id?: string | null
          automation_name: string
          conditions?: Json | null
          created_at?: string
          created_by: string
          created_from_natural_language?: string | null
          current_hour_executions?: number | null
          current_hour_start?: string | null
          description?: string | null
          execution_count?: number | null
          id?: string
          is_active?: boolean | null
          last_error?: string | null
          last_executed_at?: string | null
          max_executions_per_hour?: number | null
          objective_id?: string | null
          project_id?: string | null
          scope: string
          suggested_by_ai?: boolean | null
          tenant_id: string
          trigger?: Json
          updated_at?: string
        }
        Update: {
          action_delays?: Json | null
          actions?: Json
          ai_confidence?: number | null
          automation_id?: string | null
          automation_name?: string
          conditions?: Json | null
          created_at?: string
          created_by?: string
          created_from_natural_language?: string | null
          current_hour_executions?: number | null
          current_hour_start?: string | null
          description?: string | null
          execution_count?: number | null
          id?: string
          is_active?: boolean | null
          last_error?: string | null
          last_executed_at?: string | null
          max_executions_per_hour?: number | null
          objective_id?: string | null
          project_id?: string | null
          scope?: string
          suggested_by_ai?: boolean | null
          tenant_id?: string
          trigger?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pm_automations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      pm_dashboard_widgets: {
        Row: {
          cache_enabled: boolean | null
          cache_ttl_seconds: number | null
          cache_updated_at: string | null
          cached_at: string | null
          cached_data: Json | null
          config: Json | null
          created_at: string
          created_by: string
          dashboard_id: string
          data_sources: Json | null
          display_order: number | null
          height: number
          id: string
          is_text_widget: boolean | null
          position_x: number
          position_y: number
          show_title: boolean | null
          tenant_id: string
          updated_at: string
          widget_id: string | null
          widget_title: string | null
          widget_type: string
          width: number
        }
        Insert: {
          cache_enabled?: boolean | null
          cache_ttl_seconds?: number | null
          cache_updated_at?: string | null
          cached_at?: string | null
          cached_data?: Json | null
          config?: Json | null
          created_at?: string
          created_by: string
          dashboard_id: string
          data_sources?: Json | null
          display_order?: number | null
          height?: number
          id?: string
          is_text_widget?: boolean | null
          position_x: number
          position_y: number
          show_title?: boolean | null
          tenant_id: string
          updated_at?: string
          widget_id?: string | null
          widget_title?: string | null
          widget_type: string
          width?: number
        }
        Update: {
          cache_enabled?: boolean | null
          cache_ttl_seconds?: number | null
          cache_updated_at?: string | null
          cached_at?: string | null
          cached_data?: Json | null
          config?: Json | null
          created_at?: string
          created_by?: string
          dashboard_id?: string
          data_sources?: Json | null
          display_order?: number | null
          height?: number
          id?: string
          is_text_widget?: boolean | null
          position_x?: number
          position_y?: number
          show_title?: boolean | null
          tenant_id?: string
          updated_at?: string
          widget_id?: string | null
          widget_title?: string | null
          widget_type?: string
          width?: number
        }
        Relationships: [
          {
            foreignKeyName: "fk_pm_dashboard_widgets_dashboard_id"
            columns: ["dashboard_id"]
            isOneToOne: false
            referencedRelation: "pm_dashboards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pm_dashboard_widgets_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      pm_dashboards: {
        Row: {
          auto_refresh_enabled: boolean | null
          created_at: string
          created_by: string
          dashboard_id: string | null
          dashboard_name: string
          description: string | null
          id: string
          is_default: boolean | null
          is_public: boolean | null
          is_template: boolean | null
          last_viewed_at: string | null
          layout_config: Json | null
          layout_type: string | null
          max_widgets: number | null
          objective_id: string | null
          owner_employee_id: string | null
          refresh_interval_seconds: number | null
          scope: string
          shared_with_teams: Json | null
          shared_with_users: Json | null
          tenant_id: string
          updated_at: string
          view_count: number | null
          visibility: string | null
          widget_count: number | null
        }
        Insert: {
          auto_refresh_enabled?: boolean | null
          created_at?: string
          created_by: string
          dashboard_id?: string | null
          dashboard_name: string
          description?: string | null
          id?: string
          is_default?: boolean | null
          is_public?: boolean | null
          is_template?: boolean | null
          last_viewed_at?: string | null
          layout_config?: Json | null
          layout_type?: string | null
          max_widgets?: number | null
          objective_id?: string | null
          owner_employee_id?: string | null
          refresh_interval_seconds?: number | null
          scope: string
          shared_with_teams?: Json | null
          shared_with_users?: Json | null
          tenant_id: string
          updated_at?: string
          view_count?: number | null
          visibility?: string | null
          widget_count?: number | null
        }
        Update: {
          auto_refresh_enabled?: boolean | null
          created_at?: string
          created_by?: string
          dashboard_id?: string | null
          dashboard_name?: string
          description?: string | null
          id?: string
          is_default?: boolean | null
          is_public?: boolean | null
          is_template?: boolean | null
          last_viewed_at?: string | null
          layout_config?: Json | null
          layout_type?: string | null
          max_widgets?: number | null
          objective_id?: string | null
          owner_employee_id?: string | null
          refresh_interval_seconds?: number | null
          scope?: string
          shared_with_teams?: Json | null
          shared_with_users?: Json | null
          tenant_id?: string
          updated_at?: string
          view_count?: number | null
          visibility?: string | null
          widget_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "pm_dashboards_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      pm_objectives: {
        Row: {
          actual_profit_margin: number | null
          actual_revenue: number | null
          archived_at: string | null
          client_id: string | null
          color: string | null
          created_at: string
          created_by: string
          currency: string | null
          custom_fields: Json | null
          default_dashboard_id: string | null
          department_code: string | null
          description: string | null
          fiscal_year: string | null
          health_status: string
          icon: string | null
          id: string
          is_archived: boolean | null
          is_visible_to_clients: boolean | null
          kpis: Json | null
          objective_id: string | null
          objective_name: string
          objective_number: string
          objective_type: string
          owner_employee_id: string | null
          primary_contact_id: string | null
          progress_percentage: number | null
          quarter: string | null
          start_date: string | null
          status: string
          success_criteria: string | null
          target_end_date: string | null
          target_profit_margin: number | null
          target_revenue: number | null
          team_members: Json | null
          tenant_id: string
          updated_at: string
          updated_by: string | null
          vision_statement: string | null
        }
        Insert: {
          actual_profit_margin?: number | null
          actual_revenue?: number | null
          archived_at?: string | null
          client_id?: string | null
          color?: string | null
          created_at?: string
          created_by: string
          currency?: string | null
          custom_fields?: Json | null
          default_dashboard_id?: string | null
          department_code?: string | null
          description?: string | null
          fiscal_year?: string | null
          health_status?: string
          icon?: string | null
          id?: string
          is_archived?: boolean | null
          is_visible_to_clients?: boolean | null
          kpis?: Json | null
          objective_id?: string | null
          objective_name: string
          objective_number: string
          objective_type?: string
          owner_employee_id?: string | null
          primary_contact_id?: string | null
          progress_percentage?: number | null
          quarter?: string | null
          start_date?: string | null
          status?: string
          success_criteria?: string | null
          target_end_date?: string | null
          target_profit_margin?: number | null
          target_revenue?: number | null
          team_members?: Json | null
          tenant_id: string
          updated_at?: string
          updated_by?: string | null
          vision_statement?: string | null
        }
        Update: {
          actual_profit_margin?: number | null
          actual_revenue?: number | null
          archived_at?: string | null
          client_id?: string | null
          color?: string | null
          created_at?: string
          created_by?: string
          currency?: string | null
          custom_fields?: Json | null
          default_dashboard_id?: string | null
          department_code?: string | null
          description?: string | null
          fiscal_year?: string | null
          health_status?: string
          icon?: string | null
          id?: string
          is_archived?: boolean | null
          is_visible_to_clients?: boolean | null
          kpis?: Json | null
          objective_id?: string | null
          objective_name?: string
          objective_number?: string
          objective_type?: string
          owner_employee_id?: string | null
          primary_contact_id?: string | null
          progress_percentage?: number | null
          quarter?: string | null
          start_date?: string | null
          status?: string
          success_criteria?: string | null
          target_end_date?: string | null
          target_profit_margin?: number | null
          target_revenue?: number | null
          team_members?: Json | null
          tenant_id?: string
          updated_at?: string
          updated_by?: string | null
          vision_statement?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pm_objectives_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      pm_project_templates: {
        Row: {
          category: string | null
          created_at: string
          created_by: string
          description: string | null
          estimated_budget: number | null
          estimated_duration_days: number | null
          estimated_hours: number | null
          id: string
          is_public: boolean | null
          name: string
          template_data: Json
          template_id: string | null
          tenant_id: string
          updated_at: string
          use_count: number | null
        }
        Insert: {
          category?: string | null
          created_at?: string
          created_by: string
          description?: string | null
          estimated_budget?: number | null
          estimated_duration_days?: number | null
          estimated_hours?: number | null
          id?: string
          is_public?: boolean | null
          name: string
          template_data?: Json
          template_id?: string | null
          tenant_id: string
          updated_at?: string
          use_count?: number | null
        }
        Update: {
          category?: string | null
          created_at?: string
          created_by?: string
          description?: string | null
          estimated_budget?: number | null
          estimated_duration_days?: number | null
          estimated_hours?: number | null
          id?: string
          is_public?: boolean | null
          name?: string
          template_data?: Json
          template_id?: string | null
          tenant_id?: string
          updated_at?: string
          use_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "pm_project_templates_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      pm_task_attachments: {
        Row: {
          attachment_id: string | null
          attachment_type: string | null
          client_visible: boolean | null
          description: string | null
          file_extension: string | null
          file_name: string
          file_size_bytes: number | null
          file_type: string | null
          file_url: string
          id: string
          is_latest_version: boolean | null
          mime_type: string | null
          parent_attachment_id: string | null
          project_id: string
          requires_approval: boolean | null
          task_id: string | null
          tenant_id: string
          uploaded_at: string
          uploaded_by: string
          version_number: number | null
        }
        Insert: {
          attachment_id?: string | null
          attachment_type?: string | null
          client_visible?: boolean | null
          description?: string | null
          file_extension?: string | null
          file_name: string
          file_size_bytes?: number | null
          file_type?: string | null
          file_url: string
          id?: string
          is_latest_version?: boolean | null
          mime_type?: string | null
          parent_attachment_id?: string | null
          project_id: string
          requires_approval?: boolean | null
          task_id?: string | null
          tenant_id: string
          uploaded_at: string
          uploaded_by: string
          version_number?: number | null
        }
        Update: {
          attachment_id?: string | null
          attachment_type?: string | null
          client_visible?: boolean | null
          description?: string | null
          file_extension?: string | null
          file_name?: string
          file_size_bytes?: number | null
          file_type?: string | null
          file_url?: string
          id?: string
          is_latest_version?: boolean | null
          mime_type?: string | null
          parent_attachment_id?: string | null
          project_id?: string
          requires_approval?: boolean | null
          task_id?: string | null
          tenant_id?: string
          uploaded_at?: string
          uploaded_by?: string
          version_number?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_pm_task_attachments_task_id"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pm_task_attachments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      pm_task_comments: {
        Row: {
          attachment_ids: Json | null
          author_client_id: string | null
          author_employee_id: string | null
          author_type: string
          comment_id: string | null
          comment_text: string | null
          comment_type: string | null
          created_at: string
          deleted_at: string | null
          edited_at: string | null
          id: string
          is_internal: boolean | null
          is_pinned: boolean | null
          mentioned_users: Json | null
          parent_comment_id: string | null
          project_id: string
          task_id: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          attachment_ids?: Json | null
          author_client_id?: string | null
          author_employee_id?: string | null
          author_type: string
          comment_id?: string | null
          comment_text?: string | null
          comment_type?: string | null
          created_at?: string
          deleted_at?: string | null
          edited_at?: string | null
          id?: string
          is_internal?: boolean | null
          is_pinned?: boolean | null
          mentioned_users?: Json | null
          parent_comment_id?: string | null
          project_id: string
          task_id: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          attachment_ids?: Json | null
          author_client_id?: string | null
          author_employee_id?: string | null
          author_type?: string
          comment_id?: string | null
          comment_text?: string | null
          comment_type?: string | null
          created_at?: string
          deleted_at?: string | null
          edited_at?: string | null
          id?: string
          is_internal?: boolean | null
          is_pinned?: boolean | null
          mentioned_users?: Json | null
          parent_comment_id?: string | null
          project_id?: string
          task_id?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_pm_task_comments_task_id"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pm_task_comments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          company_name: string | null
          full_name: string | null
          id: string
          unsubscribed: boolean
          updated_at: string | null
          website: string | null
        }
        Insert: {
          avatar_url?: string | null
          company_name?: string | null
          full_name?: string | null
          id: string
          unsubscribed?: boolean
          updated_at?: string | null
          website?: string | null
        }
        Update: {
          avatar_url?: string | null
          company_name?: string | null
          full_name?: string | null
          id?: string
          unsubscribed?: boolean
          updated_at?: string | null
          website?: string | null
        }
        Relationships: []
      }
      projects: {
        Row: {
          actual_cost: number | null
          actual_end_date: string | null
          actual_hours: number | null
          actual_start_date: string | null
          archived_at: string | null
          billing_method: Database["public"]["Enums"]["billing_method"] | null
          budget: number | null
          budget_type: Database["public"]["Enums"]["budget_type"] | null
          client_approval_required: boolean | null
          client_can_comment: boolean | null
          client_id: string | null
          client_visible: boolean | null
          color: string | null
          column_config_version: number | null
          completed_task_count: number | null
          contact_person_id: string | null
          contract_id: string | null
          created_at: string
          created_by: string
          currency: string | null
          custom_fields: Json | null
          default_view: string | null
          department_code: string | null
          description: string | null
          estimated_hours: number | null
          has_custom_columns: boolean | null
          health_status: string
          hourly_rate: number | null
          hourly_rate_override: number | null
          icon: string | null
          id: string
          industry: string | null
          is_billable: boolean | null
          is_recurring: boolean | null
          is_template: boolean | null
          last_activity_at: string | null
          location_code: string | null
          notify_on_status_change: boolean | null
          notify_on_task_completion: boolean | null
          objective_id: string | null
          parent_project_id: string | null
          priority: string
          progress_percentage: number | null
          project_id: string | null
          project_manager_id: string | null
          project_name: string
          project_number: string
          project_type: Database["public"]["Enums"]["project_type"]
          proposal_id: string | null
          recurrence_rule: Json | null
          service_type: string | null
          start_date: string | null
          status: string
          tags: Json | null
          target_end_date: string | null
          task_count: number | null
          team_members: Json | null
          template_id: string | null
          tenant_id: string
          total_billed: number | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          actual_cost?: number | null
          actual_end_date?: string | null
          actual_hours?: number | null
          actual_start_date?: string | null
          archived_at?: string | null
          billing_method?: Database["public"]["Enums"]["billing_method"] | null
          budget?: number | null
          budget_type?: Database["public"]["Enums"]["budget_type"] | null
          client_approval_required?: boolean | null
          client_can_comment?: boolean | null
          client_id?: string | null
          client_visible?: boolean | null
          color?: string | null
          column_config_version?: number | null
          completed_task_count?: number | null
          contact_person_id?: string | null
          contract_id?: string | null
          created_at?: string
          created_by: string
          currency?: string | null
          custom_fields?: Json | null
          default_view?: string | null
          department_code?: string | null
          description?: string | null
          estimated_hours?: number | null
          has_custom_columns?: boolean | null
          health_status?: string
          hourly_rate?: number | null
          hourly_rate_override?: number | null
          icon?: string | null
          id?: string
          industry?: string | null
          is_billable?: boolean | null
          is_recurring?: boolean | null
          is_template?: boolean | null
          last_activity_at?: string | null
          location_code?: string | null
          notify_on_status_change?: boolean | null
          notify_on_task_completion?: boolean | null
          objective_id?: string | null
          parent_project_id?: string | null
          priority?: string
          progress_percentage?: number | null
          project_id?: string | null
          project_manager_id?: string | null
          project_name: string
          project_number: string
          project_type?: Database["public"]["Enums"]["project_type"]
          proposal_id?: string | null
          recurrence_rule?: Json | null
          service_type?: string | null
          start_date?: string | null
          status?: string
          tags?: Json | null
          target_end_date?: string | null
          task_count?: number | null
          team_members?: Json | null
          template_id?: string | null
          tenant_id: string
          total_billed?: number | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          actual_cost?: number | null
          actual_end_date?: string | null
          actual_hours?: number | null
          actual_start_date?: string | null
          archived_at?: string | null
          billing_method?: Database["public"]["Enums"]["billing_method"] | null
          budget?: number | null
          budget_type?: Database["public"]["Enums"]["budget_type"] | null
          client_approval_required?: boolean | null
          client_can_comment?: boolean | null
          client_id?: string | null
          client_visible?: boolean | null
          color?: string | null
          column_config_version?: number | null
          completed_task_count?: number | null
          contact_person_id?: string | null
          contract_id?: string | null
          created_at?: string
          created_by?: string
          currency?: string | null
          custom_fields?: Json | null
          default_view?: string | null
          department_code?: string | null
          description?: string | null
          estimated_hours?: number | null
          has_custom_columns?: boolean | null
          health_status?: string
          hourly_rate?: number | null
          hourly_rate_override?: number | null
          icon?: string | null
          id?: string
          industry?: string | null
          is_billable?: boolean | null
          is_recurring?: boolean | null
          is_template?: boolean | null
          last_activity_at?: string | null
          location_code?: string | null
          notify_on_status_change?: boolean | null
          notify_on_task_completion?: boolean | null
          objective_id?: string | null
          parent_project_id?: string | null
          priority?: string
          progress_percentage?: number | null
          project_id?: string | null
          project_manager_id?: string | null
          project_name?: string
          project_number?: string
          project_type?: Database["public"]["Enums"]["project_type"]
          proposal_id?: string | null
          recurrence_rule?: Json | null
          service_type?: string | null
          start_date?: string | null
          status?: string
          tags?: Json | null
          target_end_date?: string | null
          task_count?: number | null
          team_members?: Json | null
          template_id?: string | null
          tenant_id?: string
          total_billed?: number | null
          updated_at?: string
          updated_by?: string | null
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
      stripe_customers: {
        Row: {
          stripe_customer_id: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          stripe_customer_id?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          stripe_customer_id?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      tasks: {
        Row: {
          actual_cost: number | null
          actual_hours: number | null
          assigned_team_id: string | null
          assigned_to: string | null
          attachment_count: number | null
          billable_hours: number | null
          blocks_task_ids: Json | null
          board_column: string | null
          board_position: number | null
          budget: number | null
          checklist_items: Json | null
          client_approved_at: string | null
          client_approved_by: string | null
          client_visible: boolean | null
          completed_at: string | null
          completed_date: string | null
          created_at: string
          created_by: string
          custom_fields: Json | null
          deliverable_type: string | null
          deliverable_url: string | null
          depends_on_task_ids: Json | null
          depth_level: number | null
          description: string | null
          due_date: string | null
          estimated_hours: number | null
          has_deliverable: boolean | null
          hourly_rate: number | null
          id: string
          is_billable: boolean | null
          is_recurring: boolean | null
          labels: Json | null
          non_billable_hours: number | null
          parent_task_id: string | null
          position: number | null
          priority: string | null
          progress_percentage: number | null
          project_id: string
          recurrence_parent_id: string | null
          recurrence_rule: Json | null
          requires_client_approval: boolean | null
          role_required: string | null
          start_date: string | null
          status: string
          tags: Json | null
          task_id: string | null
          task_name: string
          task_number: string
          task_type: Database["public"]["Enums"]["task_type"] | null
          tenant_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          actual_cost?: number | null
          actual_hours?: number | null
          assigned_team_id?: string | null
          assigned_to?: string | null
          attachment_count?: number | null
          billable_hours?: number | null
          blocks_task_ids?: Json | null
          board_column?: string | null
          board_position?: number | null
          budget?: number | null
          checklist_items?: Json | null
          client_approved_at?: string | null
          client_approved_by?: string | null
          client_visible?: boolean | null
          completed_at?: string | null
          completed_date?: string | null
          created_at?: string
          created_by: string
          custom_fields?: Json | null
          deliverable_type?: string | null
          deliverable_url?: string | null
          depends_on_task_ids?: Json | null
          depth_level?: number | null
          description?: string | null
          due_date?: string | null
          estimated_hours?: number | null
          has_deliverable?: boolean | null
          hourly_rate?: number | null
          id?: string
          is_billable?: boolean | null
          is_recurring?: boolean | null
          labels?: Json | null
          non_billable_hours?: number | null
          parent_task_id?: string | null
          position?: number | null
          priority?: string | null
          progress_percentage?: number | null
          project_id: string
          recurrence_parent_id?: string | null
          recurrence_rule?: Json | null
          requires_client_approval?: boolean | null
          role_required?: string | null
          start_date?: string | null
          status?: string
          tags?: Json | null
          task_id?: string | null
          task_name: string
          task_number: string
          task_type?: Database["public"]["Enums"]["task_type"] | null
          tenant_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          actual_cost?: number | null
          actual_hours?: number | null
          assigned_team_id?: string | null
          assigned_to?: string | null
          attachment_count?: number | null
          billable_hours?: number | null
          blocks_task_ids?: Json | null
          board_column?: string | null
          board_position?: number | null
          budget?: number | null
          checklist_items?: Json | null
          client_approved_at?: string | null
          client_approved_by?: string | null
          client_visible?: boolean | null
          completed_at?: string | null
          completed_date?: string | null
          created_at?: string
          created_by?: string
          custom_fields?: Json | null
          deliverable_type?: string | null
          deliverable_url?: string | null
          depends_on_task_ids?: Json | null
          depth_level?: number | null
          description?: string | null
          due_date?: string | null
          estimated_hours?: number | null
          has_deliverable?: boolean | null
          hourly_rate?: number | null
          id?: string
          is_billable?: boolean | null
          is_recurring?: boolean | null
          labels?: Json | null
          non_billable_hours?: number | null
          parent_task_id?: string | null
          position?: number | null
          priority?: string | null
          progress_percentage?: number | null
          project_id?: string
          recurrence_parent_id?: string | null
          recurrence_rule?: Json | null
          requires_client_approval?: boolean | null
          role_required?: string | null
          start_date?: string | null
          status?: string
          tags?: Json | null
          task_id?: string | null
          task_name?: string
          task_number?: string
          task_type?: Database["public"]["Enums"]["task_type"] | null
          tenant_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tasks_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tax_rates: {
        Row: {
          code: string
          country: string
          created_at: string
          created_by: string | null
          effective_from: string
          effective_to: string | null
          id: string
          is_active: boolean
          is_reverse_charge: boolean
          jurisdiction: string | null
          rate: number
          region: string | null
          tax_collected_account_id: string | null
          tax_name: string
          tax_paid_account_id: string | null
          tax_type: Database["public"]["Enums"]["tax_type"]
          tenant_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          code: string
          country: string
          created_at?: string
          created_by?: string | null
          effective_from: string
          effective_to?: string | null
          id?: string
          is_active?: boolean
          is_reverse_charge?: boolean
          jurisdiction?: string | null
          rate: number
          region?: string | null
          tax_collected_account_id?: string | null
          tax_name: string
          tax_paid_account_id?: string | null
          tax_type: Database["public"]["Enums"]["tax_type"]
          tenant_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          code?: string
          country?: string
          created_at?: string
          created_by?: string | null
          effective_from?: string
          effective_to?: string | null
          id?: string
          is_active?: boolean
          is_reverse_charge?: boolean
          jurisdiction?: string | null
          rate?: number
          region?: string | null
          tax_collected_account_id?: string | null
          tax_name?: string
          tax_paid_account_id?: string | null
          tax_type?: Database["public"]["Enums"]["tax_type"]
          tenant_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tax_rates_tax_collected_account_id_fkey"
            columns: ["tax_collected_account_id"]
            isOneToOne: false
            referencedRelation: "chart_of_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tax_rates_tax_paid_account_id_fkey"
            columns: ["tax_paid_account_id"]
            isOneToOne: false
            referencedRelation: "chart_of_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tax_rates_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_registry: {
        Row: {
          connection_secret_ref: string | null
          created_at: string
          last_health_check_at: string | null
          region: string
          schema_version: string
          status: string
          subdomain: string
          tenant_id: string
          tier: string
        }
        Insert: {
          connection_secret_ref?: string | null
          created_at?: string
          last_health_check_at?: string | null
          region?: string
          schema_version: string
          status?: string
          subdomain: string
          tenant_id: string
          tier?: string
        }
        Update: {
          connection_secret_ref?: string | null
          created_at?: string
          last_health_check_at?: string | null
          region?: string
          schema_version?: string
          status?: string
          subdomain?: string
          tenant_id?: string
          tier?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_registry_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_settings: {
        Row: {
          key: string
          namespace: string
          tenant_id: string
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          key: string
          namespace: string
          tenant_id: string
          updated_at?: string
          updated_by?: string | null
          value: Json
        }
        Update: {
          key?: string
          namespace?: string
          tenant_id?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Relationships: [
          {
            foreignKeyName: "tenant_settings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_users: {
        Row: {
          accepted_at: string | null
          created_at: string
          customer_contact_id: string | null
          employee_id: string | null
          functional_roles: string[]
          id: string
          invited_at: string | null
          is_active: boolean
          is_default_tenant: boolean
          last_active_at: string | null
          permissions: Json
          role: string
          tenant_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string
          customer_contact_id?: string | null
          employee_id?: string | null
          functional_roles?: string[]
          id?: string
          invited_at?: string | null
          is_active?: boolean
          is_default_tenant?: boolean
          last_active_at?: string | null
          permissions?: Json
          role?: string
          tenant_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          accepted_at?: string | null
          created_at?: string
          customer_contact_id?: string | null
          employee_id?: string | null
          functional_roles?: string[]
          id?: string
          invited_at?: string | null
          is_active?: boolean
          is_default_tenant?: boolean
          last_active_at?: string | null
          permissions?: Json
          role?: string
          tenant_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_users_customer_contact_id_fkey"
            columns: ["customer_contact_id"]
            isOneToOne: false
            referencedRelation: "customer_contacts"
            referencedColumns: ["id"]
          },
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
          address_line1: string | null
          address_line2: string | null
          billing_country: string | null
          billing_currency: string | null
          billing_email: string | null
          billing_status: Database["public"]["Enums"]["billing_status"] | null
          brand_color: string
          city: string | null
          company_name: string
          company_name_i18n: Json | null
          company_size: string | null
          created_at: string | null
          created_by: string | null
          data_residency_country: string | null
          date_format: string | null
          default_currency: string
          default_locale: string
          default_timezone: string
          features: Json | null
          fiscal_year_start: string | null
          gdpr_applicable: boolean | null
          id: string
          industry: string | null
          is_active: boolean | null
          is_suspended: boolean | null
          legal_entity_name: string | null
          max_employees: number | null
          max_storage_gb: number | null
          number_format: string | null
          plan_tier: Database["public"]["Enums"]["plan_tier"]
          postal_code: string | null
          primary_contact_email: string | null
          primary_contact_name: string | null
          primary_contact_phone: string | null
          region: string
          registration_number: string | null
          state_province: string | null
          subdomain: string
          supported_currencies: string[] | null
          supported_locales: string[] | null
          tax_id: string | null
          time_format: string | null
          trial_end_date: string | null
          updated_at: string | null
          version: number | null
        }
        Insert: {
          address_line1?: string | null
          address_line2?: string | null
          billing_country?: string | null
          billing_currency?: string | null
          billing_email?: string | null
          billing_status?: Database["public"]["Enums"]["billing_status"] | null
          brand_color?: string
          city?: string | null
          company_name: string
          company_name_i18n?: Json | null
          company_size?: string | null
          created_at?: string | null
          created_by?: string | null
          data_residency_country?: string | null
          date_format?: string | null
          default_currency?: string
          default_locale?: string
          default_timezone?: string
          features?: Json | null
          fiscal_year_start?: string | null
          gdpr_applicable?: boolean | null
          id?: string
          industry?: string | null
          is_active?: boolean | null
          is_suspended?: boolean | null
          legal_entity_name?: string | null
          max_employees?: number | null
          max_storage_gb?: number | null
          number_format?: string | null
          plan_tier?: Database["public"]["Enums"]["plan_tier"]
          postal_code?: string | null
          primary_contact_email?: string | null
          primary_contact_name?: string | null
          primary_contact_phone?: string | null
          region?: string
          registration_number?: string | null
          state_province?: string | null
          subdomain: string
          supported_currencies?: string[] | null
          supported_locales?: string[] | null
          tax_id?: string | null
          time_format?: string | null
          trial_end_date?: string | null
          updated_at?: string | null
          version?: number | null
        }
        Update: {
          address_line1?: string | null
          address_line2?: string | null
          billing_country?: string | null
          billing_currency?: string | null
          billing_email?: string | null
          billing_status?: Database["public"]["Enums"]["billing_status"] | null
          brand_color?: string
          city?: string | null
          company_name?: string
          company_name_i18n?: Json | null
          company_size?: string | null
          created_at?: string | null
          created_by?: string | null
          data_residency_country?: string | null
          date_format?: string | null
          default_currency?: string
          default_locale?: string
          default_timezone?: string
          features?: Json | null
          fiscal_year_start?: string | null
          gdpr_applicable?: boolean | null
          id?: string
          industry?: string | null
          is_active?: boolean | null
          is_suspended?: boolean | null
          legal_entity_name?: string | null
          max_employees?: number | null
          max_storage_gb?: number | null
          number_format?: string | null
          plan_tier?: Database["public"]["Enums"]["plan_tier"]
          postal_code?: string | null
          primary_contact_email?: string | null
          primary_contact_name?: string | null
          primary_contact_phone?: string | null
          region?: string
          registration_number?: string | null
          state_province?: string | null
          subdomain?: string
          supported_currencies?: string[] | null
          supported_locales?: string[] | null
          tax_id?: string | null
          time_format?: string | null
          trial_end_date?: string | null
          updated_at?: string | null
          version?: number | null
        }
        Relationships: []
      }
      ticketing_attachments: {
        Row: {
          attachment_id: string | null
          description: string | null
          file_name: string
          file_size: number
          file_size_bytes: number | null
          file_url: string
          id: string
          mime_type: string
          storage_key: string
          storage_url: string | null
          tenant_id: string
          ticket_id: string | null
          ticket_number: string
          update_id: string | null
          uploaded_at: string
          uploaded_by: string
          uploaded_by_name: string | null
        }
        Insert: {
          attachment_id?: string | null
          description?: string | null
          file_name: string
          file_size: number
          file_size_bytes?: number | null
          file_url: string
          id?: string
          mime_type: string
          storage_key: string
          storage_url?: string | null
          tenant_id: string
          ticket_id?: string | null
          ticket_number: string
          update_id?: string | null
          uploaded_at: string
          uploaded_by: string
          uploaded_by_name?: string | null
        }
        Update: {
          attachment_id?: string | null
          description?: string | null
          file_name?: string
          file_size?: number
          file_size_bytes?: number | null
          file_url?: string
          id?: string
          mime_type?: string
          storage_key?: string
          storage_url?: string | null
          tenant_id?: string
          ticket_id?: string | null
          ticket_number?: string
          update_id?: string | null
          uploaded_at?: string
          uploaded_by?: string
          uploaded_by_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_ticketing_attachments_ticket_id"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "ticketing_tickets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticketing_attachments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      ticketing_business_area_members: {
        Row: {
          added_at: string
          added_by: string
          business_area_id: string
          employee_id: string
          id: string
          is_active: boolean
          tenant_id: string
        }
        Insert: {
          added_at?: string
          added_by: string
          business_area_id: string
          employee_id: string
          id?: string
          is_active?: boolean
          tenant_id: string
        }
        Update: {
          added_at?: string
          added_by?: string
          business_area_id?: string
          employee_id?: string
          id?: string
          is_active?: boolean
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticketing_business_area_members_business_area_id_fkey"
            columns: ["business_area_id"]
            isOneToOne: false
            referencedRelation: "ticketing_business_areas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticketing_business_area_members_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticketing_business_area_members_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      ticketing_business_areas: {
        Row: {
          created_at: string
          created_by: string
          current_sequence: number | null
          description: string | null
          id: string
          is_active: boolean | null
          name: string
          prefix: string | null
          roles: Json
          settings: Json
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          current_sequence?: number | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          prefix?: string | null
          roles?: Json
          settings?: Json
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          current_sequence?: number | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          prefix?: string | null
          roles?: Json
          settings?: Json
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticketing_business_areas_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      ticketing_categories: {
        Row: {
          business_area_id: string
          created_at: string
          created_by: string
          id: string
          is_active: boolean
          name: string
          tenant_id: string
        }
        Insert: {
          business_area_id: string
          created_at?: string
          created_by: string
          id?: string
          is_active?: boolean
          name: string
          tenant_id: string
        }
        Update: {
          business_area_id?: string
          created_at?: string
          created_by?: string
          id?: string
          is_active?: boolean
          name?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticketing_categories_business_area_id_fkey"
            columns: ["business_area_id"]
            isOneToOne: false
            referencedRelation: "ticketing_business_areas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticketing_categories_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      ticketing_subcategories: {
        Row: {
          category_id: string
          created_at: string
          created_by: string
          id: string
          is_active: boolean
          name: string
          tenant_id: string
        }
        Insert: {
          category_id: string
          created_at?: string
          created_by: string
          id?: string
          is_active?: boolean
          name: string
          tenant_id: string
        }
        Update: {
          category_id?: string
          created_at?: string
          created_by?: string
          id?: string
          is_active?: boolean
          name?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticketing_subcategories_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "ticketing_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticketing_subcategories_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      ticketing_ticket_assignees: {
        Row: {
          added_at: string
          added_by: string
          employee_id: string
          id: string
          is_active: boolean
          tenant_id: string
          ticket_id: string
        }
        Insert: {
          added_at?: string
          added_by: string
          employee_id: string
          id?: string
          is_active?: boolean
          tenant_id: string
          ticket_id: string
        }
        Update: {
          added_at?: string
          added_by?: string
          employee_id?: string
          id?: string
          is_active?: boolean
          tenant_id?: string
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticketing_ticket_assignees_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticketing_ticket_assignees_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticketing_ticket_assignees_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "ticketing_tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      ticketing_ticket_links: {
        Row: {
          created_at: string
          created_by: string
          id: string
          is_active: boolean
          linked_ticket_id: string
          tenant_id: string
          ticket_id: string
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          is_active?: boolean
          linked_ticket_id: string
          tenant_id: string
          ticket_id: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          is_active?: boolean
          linked_ticket_id?: string
          tenant_id?: string
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticketing_ticket_links_linked_ticket_id_fkey"
            columns: ["linked_ticket_id"]
            isOneToOne: false
            referencedRelation: "ticketing_tickets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticketing_ticket_links_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticketing_ticket_links_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "ticketing_tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      ticketing_ticket_reference_links: {
        Row: {
          created_at: string
          created_by: string
          display_order: number
          id: string
          is_active: boolean
          label: string
          tenant_id: string
          ticket_id: string
          url: string
        }
        Insert: {
          created_at?: string
          created_by: string
          display_order?: number
          id?: string
          is_active?: boolean
          label: string
          tenant_id: string
          ticket_id: string
          url: string
        }
        Update: {
          created_at?: string
          created_by?: string
          display_order?: number
          id?: string
          is_active?: boolean
          label?: string
          tenant_id?: string
          ticket_id?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticketing_ticket_reference_links_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticketing_ticket_reference_links_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "ticketing_tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      ticketing_ticket_subscribers: {
        Row: {
          added_at: string
          added_by: string
          employee_id: string
          id: string
          is_active: boolean
          tenant_id: string
          ticket_id: string
        }
        Insert: {
          added_at?: string
          added_by: string
          employee_id: string
          id?: string
          is_active?: boolean
          tenant_id: string
          ticket_id: string
        }
        Update: {
          added_at?: string
          added_by?: string
          employee_id?: string
          id?: string
          is_active?: boolean
          tenant_id?: string
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticketing_ticket_subscribers_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticketing_ticket_subscribers_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticketing_ticket_subscribers_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "ticketing_tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      ticketing_ticket_tasks: {
        Row: {
          created_at: string
          created_by: string
          display_order: number
          done_at: string | null
          done_by: string | null
          id: string
          is_active: boolean
          is_done: boolean
          tenant_id: string
          ticket_id: string
          title: string
        }
        Insert: {
          created_at?: string
          created_by: string
          display_order?: number
          done_at?: string | null
          done_by?: string | null
          id?: string
          is_active?: boolean
          is_done?: boolean
          tenant_id: string
          ticket_id: string
          title: string
        }
        Update: {
          created_at?: string
          created_by?: string
          display_order?: number
          done_at?: string | null
          done_by?: string | null
          id?: string
          is_active?: boolean
          is_done?: boolean
          tenant_id?: string
          ticket_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticketing_ticket_tasks_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticketing_ticket_tasks_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "ticketing_tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      ticketing_tickets: {
        Row: {
          business_area_id: string | null
          category_id: string
          closed_at: string | null
          created_at: string
          custom_fields: Json | null
          customer_id: string | null
          description: string | null
          due_date: string | null
          external_summary: string | null
          first_response_at: string | null
          id: string
          last_updated_by: string
          logged_at: string
          logger_contact_id: string | null
          logger_employee_id: string | null
          parent_ticket_id: string | null
          private: boolean | null
          reported_by_email: string | null
          reported_by_name: string | null
          request_type: string
          resolved_at: string | null
          search_vector: unknown
          severity: string
          sla_due_at: string | null
          sla_paused_seconds: number
          sla_resolution_breached: boolean | null
          sla_response_breached: boolean | null
          sla_response_due_at: string | null
          status: string
          subcategory_id: string | null
          tags: Json | null
          tenant_id: string
          ticket_number: string | null
          title: string
          updated_at: string
          version: number | null
        }
        Insert: {
          business_area_id?: string | null
          category_id: string
          closed_at?: string | null
          created_at?: string
          custom_fields?: Json | null
          customer_id?: string | null
          description?: string | null
          due_date?: string | null
          external_summary?: string | null
          first_response_at?: string | null
          id?: string
          last_updated_by: string
          logged_at: string
          logger_contact_id?: string | null
          logger_employee_id?: string | null
          parent_ticket_id?: string | null
          private?: boolean | null
          reported_by_email?: string | null
          reported_by_name?: string | null
          request_type?: string
          resolved_at?: string | null
          search_vector?: unknown
          severity?: string
          sla_due_at?: string | null
          sla_paused_seconds?: number
          sla_resolution_breached?: boolean | null
          sla_response_breached?: boolean | null
          sla_response_due_at?: string | null
          status?: string
          subcategory_id?: string | null
          tags?: Json | null
          tenant_id: string
          ticket_number?: string | null
          title: string
          updated_at?: string
          version?: number | null
        }
        Update: {
          business_area_id?: string | null
          category_id?: string
          closed_at?: string | null
          created_at?: string
          custom_fields?: Json | null
          customer_id?: string | null
          description?: string | null
          due_date?: string | null
          external_summary?: string | null
          first_response_at?: string | null
          id?: string
          last_updated_by?: string
          logged_at?: string
          logger_contact_id?: string | null
          logger_employee_id?: string | null
          parent_ticket_id?: string | null
          private?: boolean | null
          reported_by_email?: string | null
          reported_by_name?: string | null
          request_type?: string
          resolved_at?: string | null
          search_vector?: unknown
          severity?: string
          sla_due_at?: string | null
          sla_paused_seconds?: number
          sla_resolution_breached?: boolean | null
          sla_response_breached?: boolean | null
          sla_response_due_at?: string | null
          status?: string
          subcategory_id?: string | null
          tags?: Json | null
          tenant_id?: string
          ticket_number?: string | null
          title?: string
          updated_at?: string
          version?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_ticketing_tickets_business_area_id"
            columns: ["business_area_id"]
            isOneToOne: false
            referencedRelation: "ticketing_business_areas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticketing_tickets_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "ticketing_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticketing_tickets_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticketing_tickets_logger_contact_id_fkey"
            columns: ["logger_contact_id"]
            isOneToOne: false
            referencedRelation: "customer_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticketing_tickets_parent_ticket_id_fkey"
            columns: ["parent_ticket_id"]
            isOneToOne: false
            referencedRelation: "ticketing_tickets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticketing_tickets_subcategory_id_fkey"
            columns: ["subcategory_id"]
            isOneToOne: false
            referencedRelation: "ticketing_subcategories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticketing_tickets_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      ticketing_updates: {
        Row: {
          attachments: Json | null
          author_contact_id: string | null
          author_employee_id: string | null
          author_name: string | null
          changes: Json | null
          content_text: string | null
          created_at: string
          id: string
          search_vector: unknown
          tenant_id: string
          ticket_id: string | null
          ticket_number: string
          update_type: string | null
          visibility: string | null
        }
        Insert: {
          attachments?: Json | null
          author_contact_id?: string | null
          author_employee_id?: string | null
          author_name?: string | null
          changes?: Json | null
          content_text?: string | null
          created_at?: string
          id?: string
          search_vector?: unknown
          tenant_id: string
          ticket_id?: string | null
          ticket_number: string
          update_type?: string | null
          visibility?: string | null
        }
        Update: {
          attachments?: Json | null
          author_contact_id?: string | null
          author_employee_id?: string | null
          author_name?: string | null
          changes?: Json | null
          content_text?: string | null
          created_at?: string
          id?: string
          search_vector?: unknown
          tenant_id?: string
          ticket_id?: string | null
          ticket_number?: string
          update_type?: string | null
          visibility?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_ticketing_updates_ticket_id"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "ticketing_tickets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticketing_updates_author_contact_id_fkey"
            columns: ["author_contact_id"]
            isOneToOne: false
            referencedRelation: "customer_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticketing_updates_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      time_tracking_billable_expenses: {
        Row: {
          amount: number
          approved_at: string | null
          approved_by: string | null
          billable_amount: number
          category: string | null
          client_id: string | null
          created_at: string
          currency: string | null
          description: string
          employee_id: string
          expense_date: string
          expense_id: string | null
          expense_type: string | null
          has_receipt: boolean | null
          id: string
          invoice_id: string | null
          invoiced_at: string | null
          is_billable: boolean | null
          is_reimbursable: boolean | null
          markup_amount: number | null
          markup_percentage: number | null
          project_id: string | null
          receipt_attachment_id: string | null
          receipt_url: string | null
          reimbursed_at: string | null
          status: string | null
          submitted_at: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          amount: number
          approved_at?: string | null
          approved_by?: string | null
          billable_amount: number
          category?: string | null
          client_id?: string | null
          created_at?: string
          currency?: string | null
          description: string
          employee_id: string
          expense_date: string
          expense_id?: string | null
          expense_type?: string | null
          has_receipt?: boolean | null
          id?: string
          invoice_id?: string | null
          invoiced_at?: string | null
          is_billable?: boolean | null
          is_reimbursable?: boolean | null
          markup_amount?: number | null
          markup_percentage?: number | null
          project_id?: string | null
          receipt_attachment_id?: string | null
          receipt_url?: string | null
          reimbursed_at?: string | null
          status?: string | null
          submitted_at?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          amount?: number
          approved_at?: string | null
          approved_by?: string | null
          billable_amount?: number
          category?: string | null
          client_id?: string | null
          created_at?: string
          currency?: string | null
          description?: string
          employee_id?: string
          expense_date?: string
          expense_id?: string | null
          expense_type?: string | null
          has_receipt?: boolean | null
          id?: string
          invoice_id?: string | null
          invoiced_at?: string | null
          is_billable?: boolean | null
          is_reimbursable?: boolean | null
          markup_amount?: number | null
          markup_percentage?: number | null
          project_id?: string | null
          receipt_attachment_id?: string | null
          receipt_url?: string | null
          reimbursed_at?: string | null
          status?: string | null
          submitted_at?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "time_tracking_billable_expenses_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      time_tracking_entries: {
        Row: {
          activity_type: Database["public"]["Enums"]["activity_type"] | null
          amount: number | null
          approved_at: string | null
          approved_by: string | null
          billable_amount: number | null
          client_id: string | null
          created_at: string
          created_by: string | null
          currency: string | null
          description: string
          duration_hours: number | null
          duration_minutes: number | null
          employee_id: string
          end_time: string | null
          entry_date: string
          entry_id: string | null
          entry_type: string | null
          hourly_rate: number | null
          hours: number
          id: string
          internal_notes: string | null
          invoice_id: string | null
          invoice_line_item_id: string | null
          invoiced_at: string | null
          is_billable: boolean | null
          is_locked: boolean | null
          is_running: boolean | null
          locked_at: string | null
          locked_by: string | null
          project_id: string | null
          rate_source: string | null
          rejection_reason: string | null
          start_time: string | null
          status: string | null
          submitted_at: string | null
          submitted_to: string | null
          tags: Json | null
          task_id: string | null
          tenant_id: string
          timesheet_id: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          activity_type?: Database["public"]["Enums"]["activity_type"] | null
          amount?: number | null
          approved_at?: string | null
          approved_by?: string | null
          billable_amount?: number | null
          client_id?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string | null
          description: string
          duration_hours?: number | null
          duration_minutes?: number | null
          employee_id: string
          end_time?: string | null
          entry_date: string
          entry_id?: string | null
          entry_type?: string | null
          hourly_rate?: number | null
          hours: number
          id?: string
          internal_notes?: string | null
          invoice_id?: string | null
          invoice_line_item_id?: string | null
          invoiced_at?: string | null
          is_billable?: boolean | null
          is_locked?: boolean | null
          is_running?: boolean | null
          locked_at?: string | null
          locked_by?: string | null
          project_id?: string | null
          rate_source?: string | null
          rejection_reason?: string | null
          start_time?: string | null
          status?: string | null
          submitted_at?: string | null
          submitted_to?: string | null
          tags?: Json | null
          task_id?: string | null
          tenant_id: string
          timesheet_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          activity_type?: Database["public"]["Enums"]["activity_type"] | null
          amount?: number | null
          approved_at?: string | null
          approved_by?: string | null
          billable_amount?: number | null
          client_id?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string | null
          description?: string
          duration_hours?: number | null
          duration_minutes?: number | null
          employee_id?: string
          end_time?: string | null
          entry_date?: string
          entry_id?: string | null
          entry_type?: string | null
          hourly_rate?: number | null
          hours?: number
          id?: string
          internal_notes?: string | null
          invoice_id?: string | null
          invoice_line_item_id?: string | null
          invoiced_at?: string | null
          is_billable?: boolean | null
          is_locked?: boolean | null
          is_running?: boolean | null
          locked_at?: string | null
          locked_by?: string | null
          project_id?: string | null
          rate_source?: string | null
          rejection_reason?: string | null
          start_time?: string | null
          status?: string | null
          submitted_at?: string | null
          submitted_to?: string | null
          tags?: Json | null
          task_id?: string | null
          tenant_id?: string
          timesheet_id?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "time_tracking_entries_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      time_tracking_hourly_rates: {
        Row: {
          billable_rate: number | null
          change_reason: string | null
          client_id: string | null
          cost_rate: number | null
          created_at: string
          created_by: string | null
          currency: string
          effective_from: string
          effective_to: string | null
          employee_id: string | null
          id: string
          is_active: boolean
          project_id: string | null
          role_code: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          billable_rate?: number | null
          change_reason?: string | null
          client_id?: string | null
          cost_rate?: number | null
          created_at?: string
          created_by?: string | null
          currency?: string
          effective_from: string
          effective_to?: string | null
          employee_id?: string | null
          id?: string
          is_active?: boolean
          project_id?: string | null
          role_code?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          billable_rate?: number | null
          change_reason?: string | null
          client_id?: string | null
          cost_rate?: number | null
          created_at?: string
          created_by?: string | null
          currency?: string
          effective_from?: string
          effective_to?: string | null
          employee_id?: string | null
          id?: string
          is_active?: boolean
          project_id?: string | null
          role_code?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "time_tracking_hourly_rates_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      time_tracking_timesheets: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          billable_hours: number | null
          created_at: string
          employee_id: string
          entry_count: number | null
          id: string
          non_billable_hours: number | null
          notes: string | null
          period_end: string
          period_start: string
          period_type: Database["public"]["Enums"]["period_type"]
          rejection_reason: string | null
          status: string | null
          submitted_at: string | null
          submitted_to: string | null
          tenant_id: string
          timesheet_number: string | null
          total_amount: number | null
          total_hours: number | null
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          billable_hours?: number | null
          created_at?: string
          employee_id: string
          entry_count?: number | null
          id?: string
          non_billable_hours?: number | null
          notes?: string | null
          period_end: string
          period_start: string
          period_type: Database["public"]["Enums"]["period_type"]
          rejection_reason?: string | null
          status?: string | null
          submitted_at?: string | null
          submitted_to?: string | null
          tenant_id: string
          timesheet_number?: string | null
          total_amount?: number | null
          total_hours?: number | null
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          billable_hours?: number | null
          created_at?: string
          employee_id?: string
          entry_count?: number | null
          id?: string
          non_billable_hours?: number | null
          notes?: string | null
          period_end?: string
          period_start?: string
          period_type?: Database["public"]["Enums"]["period_type"]
          rejection_reason?: string | null
          status?: string | null
          submitted_at?: string | null
          submitted_to?: string | null
          tenant_id?: string
          timesheet_number?: string | null
          total_amount?: number | null
          total_hours?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "time_tracking_timesheets_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      translations: {
        Row: {
          id: string
          key: string
          locale: string
          namespace: string
          tenant_id: string | null
          updated_at: string
          value: string
        }
        Insert: {
          id?: string
          key: string
          locale: string
          namespace?: string
          tenant_id?: string | null
          updated_at?: string
          value: string
        }
        Update: {
          id?: string
          key?: string
          locale?: string
          namespace?: string
          tenant_id?: string | null
          updated_at?: string
          value?: string
        }
        Relationships: [
          {
            foreignKeyName: "translations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      vendors: {
        Row: {
          address: Json | null
          ap_account_id: string | null
          bank_account_number_ct: string | null
          bank_name: string | null
          bank_routing_number_ct: string | null
          created_at: string | null
          created_by: string | null
          currency: string
          custom_fields: Json | null
          display_name: string | null
          email: string | null
          id: string
          is_1099_vendor: boolean | null
          is_active: boolean | null
          notes: string | null
          payment_terms: string | null
          phone: string | null
          tax_number: string | null
          tenant_id: string
          updated_at: string | null
          updated_by: string | null
          vendor_name: string
          vendor_number: string | null
          website: string | null
        }
        Insert: {
          address?: Json | null
          ap_account_id?: string | null
          bank_account_number_ct?: string | null
          bank_name?: string | null
          bank_routing_number_ct?: string | null
          created_at?: string | null
          created_by?: string | null
          currency: string
          custom_fields?: Json | null
          display_name?: string | null
          email?: string | null
          id?: string
          is_1099_vendor?: boolean | null
          is_active?: boolean | null
          notes?: string | null
          payment_terms?: string | null
          phone?: string | null
          tax_number?: string | null
          tenant_id: string
          updated_at?: string | null
          updated_by?: string | null
          vendor_name: string
          vendor_number?: string | null
          website?: string | null
        }
        Update: {
          address?: Json | null
          ap_account_id?: string | null
          bank_account_number_ct?: string | null
          bank_name?: string | null
          bank_routing_number_ct?: string | null
          created_at?: string | null
          created_by?: string | null
          currency?: string
          custom_fields?: Json | null
          display_name?: string | null
          email?: string | null
          id?: string
          is_1099_vendor?: boolean | null
          is_active?: boolean | null
          notes?: string | null
          payment_terms?: string | null
          phone?: string | null
          tax_number?: string | null
          tenant_id?: string
          updated_at?: string | null
          updated_by?: string | null
          vendor_name?: string
          vendor_number?: string | null
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_vendors_ap_account_id"
            columns: ["ap_account_id"]
            isOneToOne: false
            referencedRelation: "chart_of_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendors_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      v_upcoming_celebrations: {
        Row: {
          celebration_date: string | null
          celebration_type: string | null
          department_code: string | null
          employee_id: string | null
          first_name: string | null
          last_name: string | null
          location_code: string | null
          preferred_name: string | null
          show_detail: boolean | null
          tenant_id: string | null
          years: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      custom_access_token_hook: { Args: { event: Json }; Returns: Json }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
    }
    Enums: {
      account_type: "asset" | "equity" | "expense" | "liability" | "revenue"
      activity_type:
        "call" | "demo" | "email" | "meeting" | "note" | "presentation" | "task"
      allowance_type:
        | "housing"
        | "transportation"
        | "meal"
        | "phone"
        | "internet"
        | "education"
        | "fitness"
        | "childcare"
        | "parking"
        | "uniform"
        | "travel"
        | "relocation"
        | "car"
        | "fuel"
        | "other"
      billing_method:
        "fixed" | "hourly" | "milestone" | "retainer" | "value_based"
      billing_status:
        "active" | "cancelled" | "past_due" | "suspended" | "trial"
      budget_type:
        | "fixed_price"
        | "milestone_based"
        | "not_to_exceed"
        | "retainer"
        | "time_and_materials"
      change_reason:
        | "annual_review"
        | "contract_renewal"
        | "correction"
        | "cost_of_living"
        | "demotion"
        | "equity_adjustment"
        | "market_adjustment"
        | "merit_increase"
        | "new_hire"
        | "promotion"
        | "retention"
        | "transfer"
      compensation_type: "salary" | "hourly" | "daily" | "weekly" | "contract"
      contract_type:
        | "licensing"
        | "msa"
        | "nda"
        | "partnership"
        | "retainer_agreement"
        | "service_agreement"
        | "sow"
      coverage_level:
        | "employee_children"
        | "employee_family"
        | "employee_only"
        | "employee_spouse"
      eeoc_category:
        | "administrative_support"
        | "craft_workers"
        | "executive_senior_officials_managers"
        | "first_mid_level_officials_managers"
        | "laborers_helpers"
        | "operatives"
        | "professionals"
        | "sales_workers"
        | "service_workers"
        | "technicians"
      employment_status:
        | "active"
        | "deceased"
        | "on_leave"
        | "retired"
        | "suspended"
        | "terminated"
      employment_type:
        | "full_time"
        | "part_time"
        | "contractor"
        | "intern"
        | "temporary"
        | "consultant"
        | "freelance"
      equity_type:
        | "stock_options"
        | "iso"
        | "nso"
        | "rsu"
        | "restricted_stock"
        | "phantom_stock"
        | "sar"
        | "espp"
      gender: "female" | "male" | "non_binary" | "other" | "prefer_not_to_say"
      group_type:
        "affinity" | "custom" | "department" | "functional" | "project" | "team"
      india_tax_regime: "new_regime" | "old_regime"
      marital_status:
        | "divorced"
        | "domestic_partnership"
        | "married"
        | "prefer_not_to_say"
        | "separated"
        | "single"
        | "widowed"
      pay_frequency:
        | "annually"
        | "bi-weekly"
        | "monthly"
        | "quarterly"
        | "semi-monthly"
        | "weekly"
      payment_method:
        | "cash"
        | "check"
        | "direct_deposit"
        | "mobile_payment"
        | "paycard"
        | "wire_transfer"
      payment_status:
        | "cancelled"
        | "completed"
        | "failed"
        | "pending"
        | "processing"
        | "refunded"
      period_type: "bi_weekly" | "monthly" | "weekly"
      plan_tier: "custom" | "enterprise" | "professional" | "starter"
      premium_type:
        | "shift_differential"
        | "weekend"
        | "holiday"
        | "on_call"
        | "hazard_pay"
        | "geographic"
        | "skill_based"
        | "certification"
      project_type:
        | "client_project"
        | "internal"
        | "marketing_campaign"
        | "product_development"
        | "research"
      pronouns:
        | "he_him"
        | "other"
        | "prefer_not_to_say"
        | "she_her"
        | "they_them"
        | "ze_hir"
      reimbursement_status:
        "approved" | "cancelled" | "paid" | "pending" | "rejected"
      task_type:
        | "approval"
        | "bug"
        | "deliverable"
        | "feature"
        | "milestone"
        | "review"
        | "task"
      tax_type:
        "customs" | "excise" | "gst" | "none" | "sales_tax" | "use_tax" | "vat"
      time_tracking_type:
        | "none"
        | "hours_only"
        | "clock_in_out"
        | "task_based"
        | "deliverable_based"
      variable_comp_type:
        | "commission"
        | "bonus"
        | "profit_sharing"
        | "sales_incentive"
        | "performance_bonus"
        | "spot_bonus"
        | "retention_bonus"
      vesting_type:
        | "time_based"
        | "milestone_based"
        | "performance_based"
        | "hybrid"
        | "cliff_then_monthly"
        | "cliff_then_quarterly"
      work_arrangement:
        | "standard"
        | "flexible"
        | "shift_based"
        | "on_call"
        | "project_based"
        | "remote"
        | "hybrid"
      work_authorization_type:
        | "citizen"
        | "ead"
        | "h1b"
        | "other"
        | "permanent_resident"
        | "student_visa"
        | "tn"
        | "work_visa"
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
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
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
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
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
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
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
    Enums: {
      account_type: ["asset", "equity", "expense", "liability", "revenue"],
      activity_type: [
        "call",
        "demo",
        "email",
        "meeting",
        "note",
        "presentation",
        "task",
      ],
      allowance_type: [
        "housing",
        "transportation",
        "meal",
        "phone",
        "internet",
        "education",
        "fitness",
        "childcare",
        "parking",
        "uniform",
        "travel",
        "relocation",
        "car",
        "fuel",
        "other",
      ],
      billing_method: [
        "fixed",
        "hourly",
        "milestone",
        "retainer",
        "value_based",
      ],
      billing_status: ["active", "cancelled", "past_due", "suspended", "trial"],
      budget_type: [
        "fixed_price",
        "milestone_based",
        "not_to_exceed",
        "retainer",
        "time_and_materials",
      ],
      change_reason: [
        "annual_review",
        "contract_renewal",
        "correction",
        "cost_of_living",
        "demotion",
        "equity_adjustment",
        "market_adjustment",
        "merit_increase",
        "new_hire",
        "promotion",
        "retention",
        "transfer",
      ],
      compensation_type: ["salary", "hourly", "daily", "weekly", "contract"],
      contract_type: [
        "licensing",
        "msa",
        "nda",
        "partnership",
        "retainer_agreement",
        "service_agreement",
        "sow",
      ],
      coverage_level: [
        "employee_children",
        "employee_family",
        "employee_only",
        "employee_spouse",
      ],
      eeoc_category: [
        "administrative_support",
        "craft_workers",
        "executive_senior_officials_managers",
        "first_mid_level_officials_managers",
        "laborers_helpers",
        "operatives",
        "professionals",
        "sales_workers",
        "service_workers",
        "technicians",
      ],
      employment_status: [
        "active",
        "deceased",
        "on_leave",
        "retired",
        "suspended",
        "terminated",
      ],
      employment_type: [
        "full_time",
        "part_time",
        "contractor",
        "intern",
        "temporary",
        "consultant",
        "freelance",
      ],
      equity_type: [
        "stock_options",
        "iso",
        "nso",
        "rsu",
        "restricted_stock",
        "phantom_stock",
        "sar",
        "espp",
      ],
      gender: ["female", "male", "non_binary", "other", "prefer_not_to_say"],
      group_type: [
        "affinity",
        "custom",
        "department",
        "functional",
        "project",
        "team",
      ],
      india_tax_regime: ["new_regime", "old_regime"],
      marital_status: [
        "divorced",
        "domestic_partnership",
        "married",
        "prefer_not_to_say",
        "separated",
        "single",
        "widowed",
      ],
      pay_frequency: [
        "annually",
        "bi-weekly",
        "monthly",
        "quarterly",
        "semi-monthly",
        "weekly",
      ],
      payment_method: [
        "cash",
        "check",
        "direct_deposit",
        "mobile_payment",
        "paycard",
        "wire_transfer",
      ],
      payment_status: [
        "cancelled",
        "completed",
        "failed",
        "pending",
        "processing",
        "refunded",
      ],
      period_type: ["bi_weekly", "monthly", "weekly"],
      plan_tier: ["custom", "enterprise", "professional", "starter"],
      premium_type: [
        "shift_differential",
        "weekend",
        "holiday",
        "on_call",
        "hazard_pay",
        "geographic",
        "skill_based",
        "certification",
      ],
      project_type: [
        "client_project",
        "internal",
        "marketing_campaign",
        "product_development",
        "research",
      ],
      pronouns: [
        "he_him",
        "other",
        "prefer_not_to_say",
        "she_her",
        "they_them",
        "ze_hir",
      ],
      reimbursement_status: [
        "approved",
        "cancelled",
        "paid",
        "pending",
        "rejected",
      ],
      task_type: [
        "approval",
        "bug",
        "deliverable",
        "feature",
        "milestone",
        "review",
        "task",
      ],
      tax_type: [
        "customs",
        "excise",
        "gst",
        "none",
        "sales_tax",
        "use_tax",
        "vat",
      ],
      time_tracking_type: [
        "none",
        "hours_only",
        "clock_in_out",
        "task_based",
        "deliverable_based",
      ],
      variable_comp_type: [
        "commission",
        "bonus",
        "profit_sharing",
        "sales_incentive",
        "performance_bonus",
        "spot_bonus",
        "retention_bonus",
      ],
      vesting_type: [
        "time_based",
        "milestone_based",
        "performance_based",
        "hybrid",
        "cliff_then_monthly",
        "cliff_then_quarterly",
      ],
      work_arrangement: [
        "standard",
        "flexible",
        "shift_based",
        "on_call",
        "project_based",
        "remote",
        "hybrid",
      ],
      work_authorization_type: [
        "citizen",
        "ead",
        "h1b",
        "other",
        "permanent_resident",
        "student_visa",
        "tn",
        "work_visa",
      ],
    },
  },
} as const
