-- GENERATED FILE — do not edit.
-- Source: docs/enumerations.json
-- Regenerate: node scripts/gen-enum-fixture.mjs
--
-- Loaded by scripts/verify-invariants.sql into the temp table _expected_enum.
-- Only enumerations that exist as a Postgres enum type are compared; the
-- rest are deliberately reference tables or external standards.

INSERT INTO _expected_enum (typname, label) VALUES
  ('account_subtype', 'cost_of_goods_sold'),
  ('account_subtype', 'current_asset'),
  ('account_subtype', 'current_liability'),
  ('account_subtype', 'equity'),
  ('account_subtype', 'fixed_asset'),
  ('account_subtype', 'income'),
  ('account_subtype', 'long_term_liability'),
  ('account_subtype', 'operating_expense'),
  ('account_subtype', 'other_asset'),
  ('account_subtype', 'other_expense'),
  ('account_subtype', 'other_income');
INSERT INTO _expected_enum (typname, label) VALUES
  ('account_type', 'asset'),
  ('account_type', 'equity'),
  ('account_type', 'expense'),
  ('account_type', 'liability'),
  ('account_type', 'revenue');
INSERT INTO _expected_enum (typname, label) VALUES
  ('accounting_period_status', 'archived'),
  ('accounting_period_status', 'closed'),
  ('accounting_period_status', 'locked'),
  ('accounting_period_status', 'open');
INSERT INTO _expected_enum (typname, label) VALUES
  ('accrual_method', 'anniversary_based'),
  ('accrual_method', 'annual_grant'),
  ('accrual_method', 'monthly_grant'),
  ('accrual_method', 'none'),
  ('accrual_method', 'per_hour_worked'),
  ('accrual_method', 'per_pay_period');
INSERT INTO _expected_enum (typname, label) VALUES
  ('activity_status', 'cancelled'),
  ('activity_status', 'completed'),
  ('activity_status', 'planned'),
  ('activity_status', 'rescheduled');
INSERT INTO _expected_enum (typname, label) VALUES
  ('activity_type', 'call'),
  ('activity_type', 'demo'),
  ('activity_type', 'email'),
  ('activity_type', 'meeting'),
  ('activity_type', 'note'),
  ('activity_type', 'presentation'),
  ('activity_type', 'task');
INSERT INTO _expected_enum (typname, label) VALUES
  ('address_type', 'billing'),
  ('address_type', 'home'),
  ('address_type', 'mailing'),
  ('address_type', 'other'),
  ('address_type', 'shipping'),
  ('address_type', 'work');
INSERT INTO _expected_enum (typname, label) VALUES
  ('allowance_type', 'car'),
  ('allowance_type', 'childcare'),
  ('allowance_type', 'education'),
  ('allowance_type', 'fitness'),
  ('allowance_type', 'fuel'),
  ('allowance_type', 'housing'),
  ('allowance_type', 'internet'),
  ('allowance_type', 'meal'),
  ('allowance_type', 'other'),
  ('allowance_type', 'parking'),
  ('allowance_type', 'phone'),
  ('allowance_type', 'relocation'),
  ('allowance_type', 'transportation'),
  ('allowance_type', 'travel'),
  ('allowance_type', 'uniform');
INSERT INTO _expected_enum (typname, label) VALUES
  ('asset_condition', 'fair'),
  ('asset_condition', 'good'),
  ('asset_condition', 'new'),
  ('asset_condition', 'poor');
INSERT INTO _expected_enum (typname, label) VALUES
  ('asset_type', 'computer'),
  ('asset_type', 'headset'),
  ('asset_type', 'keyboard'),
  ('asset_type', 'monitor'),
  ('asset_type', 'mouse'),
  ('asset_type', 'other'),
  ('asset_type', 'phone'),
  ('asset_type', 'tablet');
INSERT INTO _expected_enum (typname, label) VALUES
  ('attendance_status', 'approved'),
  ('attendance_status', 'draft'),
  ('attendance_status', 'rejected'),
  ('attendance_status', 'submitted');
INSERT INTO _expected_enum (typname, label) VALUES
  ('audit_event_type', 'approval'),
  ('audit_event_type', 'config_change'),
  ('audit_event_type', 'create'),
  ('audit_event_type', 'delete'),
  ('audit_event_type', 'export'),
  ('audit_event_type', 'failed_login'),
  ('audit_event_type', 'import'),
  ('audit_event_type', 'login'),
  ('audit_event_type', 'logout'),
  ('audit_event_type', 'password_change'),
  ('audit_event_type', 'permission_change'),
  ('audit_event_type', 'rejection'),
  ('audit_event_type', 'update'),
  ('audit_event_type', 'view');
INSERT INTO _expected_enum (typname, label) VALUES
  ('bank_transaction_status', 'ignored'),
  ('bank_transaction_status', 'matched'),
  ('bank_transaction_status', 'reconciled'),
  ('bank_transaction_status', 'review_needed'),
  ('bank_transaction_status', 'unmatched');
INSERT INTO _expected_enum (typname, label) VALUES
  ('benefit_type', 'accident_insurance'),
  ('benefit_type', 'commuter_benefits'),
  ('benefit_type', 'critical_illness'),
  ('benefit_type', 'dental_insurance'),
  ('benefit_type', 'disability_insurance'),
  ('benefit_type', 'education_assistance'),
  ('benefit_type', 'employee_assistance'),
  ('benefit_type', 'fsa_dependent_care'),
  ('benefit_type', 'fsa_healthcare'),
  ('benefit_type', 'health_insurance'),
  ('benefit_type', 'hsa'),
  ('benefit_type', 'legal_services'),
  ('benefit_type', 'life_insurance'),
  ('benefit_type', 'other'),
  ('benefit_type', 'parental_leave'),
  ('benefit_type', 'pension'),
  ('benefit_type', 'pet_insurance'),
  ('benefit_type', 'pto'),
  ('benefit_type', 'retirement_401k'),
  ('benefit_type', 'retirement_403b'),
  ('benefit_type', 'sick_leave'),
  ('benefit_type', 'vision_insurance'),
  ('benefit_type', 'wellness_program');
INSERT INTO _expected_enum (typname, label) VALUES
  ('billing_method', 'fixed'),
  ('billing_method', 'hourly'),
  ('billing_method', 'milestone'),
  ('billing_method', 'retainer'),
  ('billing_method', 'value_based');
INSERT INTO _expected_enum (typname, label) VALUES
  ('billing_status', 'active'),
  ('billing_status', 'cancelled'),
  ('billing_status', 'past_due'),
  ('billing_status', 'suspended'),
  ('billing_status', 'trial');
INSERT INTO _expected_enum (typname, label) VALUES
  ('budget_range', '100k-250k'),
  ('budget_range', '10k-25k'),
  ('budget_range', '1m+'),
  ('budget_range', '250k-500k'),
  ('budget_range', '25k-50k'),
  ('budget_range', '500k-1m'),
  ('budget_range', '50k-100k'),
  ('budget_range', 'under_10k');
INSERT INTO _expected_enum (typname, label) VALUES
  ('budget_type', 'fixed_price'),
  ('budget_type', 'milestone_based'),
  ('budget_type', 'not_to_exceed'),
  ('budget_type', 'retainer'),
  ('budget_type', 'time_and_materials');
INSERT INTO _expected_enum (typname, label) VALUES
  ('campaign_status', 'cancelled'),
  ('campaign_status', 'completed'),
  ('campaign_status', 'draft'),
  ('campaign_status', 'paused'),
  ('campaign_status', 'scheduled'),
  ('campaign_status', 'sending'),
  ('campaign_status', 'sent');
INSERT INTO _expected_enum (typname, label) VALUES
  ('campaign_type', 'content'),
  ('campaign_type', 'direct_mail'),
  ('campaign_type', 'email'),
  ('campaign_type', 'event'),
  ('campaign_type', 'other'),
  ('campaign_type', 'paid_ads'),
  ('campaign_type', 'social_media'),
  ('campaign_type', 'webinar');
INSERT INTO _expected_enum (typname, label) VALUES
  ('canada_province', 'AB'),
  ('canada_province', 'BC'),
  ('canada_province', 'MB'),
  ('canada_province', 'NB'),
  ('canada_province', 'NL'),
  ('canada_province', 'NS'),
  ('canada_province', 'NT'),
  ('canada_province', 'NU'),
  ('canada_province', 'ON'),
  ('canada_province', 'PE'),
  ('canada_province', 'QC'),
  ('canada_province', 'SK'),
  ('canada_province', 'YT');
INSERT INTO _expected_enum (typname, label) VALUES
  ('carryover_rule', 'capped_carryover'),
  ('carryover_rule', 'no_carryover'),
  ('carryover_rule', 'payout'),
  ('carryover_rule', 'unlimited_carryover'),
  ('carryover_rule', 'use_or_lose_with_grace');
INSERT INTO _expected_enum (typname, label) VALUES
  ('certification_status', 'active'),
  ('certification_status', 'expired'),
  ('certification_status', 'pending_renewal'),
  ('certification_status', 'revoked');
INSERT INTO _expected_enum (typname, label) VALUES
  ('change_reason', 'annual_review'),
  ('change_reason', 'contract_renewal'),
  ('change_reason', 'correction'),
  ('change_reason', 'cost_of_living'),
  ('change_reason', 'demotion'),
  ('change_reason', 'equity_adjustment'),
  ('change_reason', 'market_adjustment'),
  ('change_reason', 'merit_increase'),
  ('change_reason', 'new_hire'),
  ('change_reason', 'promotion'),
  ('change_reason', 'retention'),
  ('change_reason', 'transfer');
INSERT INTO _expected_enum (typname, label) VALUES
  ('change_request_category', 'adoption'),
  ('change_request_category', 'birth'),
  ('change_request_category', 'correction'),
  ('change_request_category', 'divorce'),
  ('change_request_category', 'life_event'),
  ('change_request_category', 'marriage'),
  ('change_request_category', 'other'),
  ('change_request_category', 'promotion'),
  ('change_request_category', 'relocation'),
  ('change_request_category', 'transfer');
INSERT INTO _expected_enum (typname, label) VALUES
  ('change_request_status', 'approved'),
  ('change_request_status', 'cancelled'),
  ('change_request_status', 'completed'),
  ('change_request_status', 'draft'),
  ('change_request_status', 'pending_hr'),
  ('change_request_status', 'pending_manager'),
  ('change_request_status', 'rejected'),
  ('change_request_status', 'submitted');
INSERT INTO _expected_enum (typname, label) VALUES
  ('change_request_type', 'address_change'),
  ('change_request_type', 'benefits_change'),
  ('change_request_type', 'compensation_change'),
  ('change_request_type', 'contact_information'),
  ('change_request_type', 'direct_deposit'),
  ('change_request_type', 'emergency_contact'),
  ('change_request_type', 'job_change'),
  ('change_request_type', 'name_change'),
  ('change_request_type', 'other'),
  ('change_request_type', 'personal_information'),
  ('change_request_type', 'tax_withholding'),
  ('change_request_type', 'time_off_adjustment');
INSERT INTO _expected_enum (typname, label) VALUES
  ('chart_type', 'area'),
  ('chart_type', 'bar'),
  ('chart_type', 'donut'),
  ('chart_type', 'line'),
  ('chart_type', 'metric'),
  ('chart_type', 'pie'),
  ('chart_type', 'scatter'),
  ('chart_type', 'table');
INSERT INTO _expected_enum (typname, label) VALUES
  ('company_size_range', '1-10'),
  ('company_size_range', '1001-5000'),
  ('company_size_range', '11-50'),
  ('company_size_range', '201-500'),
  ('company_size_range', '5000+'),
  ('company_size_range', '501-1000'),
  ('company_size_range', '51-200');
INSERT INTO _expected_enum (typname, label) VALUES
  ('compensation_type', 'contract'),
  ('compensation_type', 'daily'),
  ('compensation_type', 'hourly'),
  ('compensation_type', 'salary'),
  ('compensation_type', 'weekly');
INSERT INTO _expected_enum (typname, label) VALUES
  ('contact_lifecycle_stage', 'customer'),
  ('contact_lifecycle_stage', 'evangelist'),
  ('contact_lifecycle_stage', 'lead'),
  ('contact_lifecycle_stage', 'marketing_qualified_lead'),
  ('contact_lifecycle_stage', 'opportunity'),
  ('contact_lifecycle_stage', 'other'),
  ('contact_lifecycle_stage', 'sales_qualified_lead'),
  ('contact_lifecycle_stage', 'subscriber');
INSERT INTO _expected_enum (typname, label) VALUES
  ('contract_status', 'active'),
  ('contract_status', 'draft'),
  ('contract_status', 'expired'),
  ('contract_status', 'renewed'),
  ('contract_status', 'terminated'),
  ('contract_status', 'under_review');
INSERT INTO _expected_enum (typname, label) VALUES
  ('contract_type', 'licensing'),
  ('contract_type', 'msa'),
  ('contract_type', 'nda'),
  ('contract_type', 'partnership'),
  ('contract_type', 'retainer_agreement'),
  ('contract_type', 'service_agreement'),
  ('contract_type', 'sow');
INSERT INTO _expected_enum (typname, label) VALUES
  ('country', 'BE'),
  ('country', 'CA'),
  ('country', 'CH'),
  ('country', 'DE'),
  ('country', 'FR'),
  ('country', 'GB'),
  ('country', 'IL'),
  ('country', 'IN'),
  ('country', 'IT'),
  ('country', 'JP'),
  ('country', 'NL'),
  ('country', 'SE'),
  ('country', 'US');
INSERT INTO _expected_enum (typname, label) VALUES
  ('coverage_level', 'employee_children'),
  ('coverage_level', 'employee_family'),
  ('coverage_level', 'employee_only'),
  ('coverage_level', 'employee_spouse');
INSERT INTO _expected_enum (typname, label) VALUES
  ('currency', 'AUD'),
  ('currency', 'BRL'),
  ('currency', 'CAD'),
  ('currency', 'CHF'),
  ('currency', 'CNY'),
  ('currency', 'EUR'),
  ('currency', 'GBP'),
  ('currency', 'ILS'),
  ('currency', 'INR'),
  ('currency', 'JPY'),
  ('currency', 'MXN'),
  ('currency', 'SEK'),
  ('currency', 'USD');
INSERT INTO _expected_enum (typname, label) VALUES
  ('date_format', 'DD.MM.YYYY'),
  ('date_format', 'DD/MM/YYYY'),
  ('date_format', 'MM/DD/YYYY'),
  ('date_format', 'YYYY-MM-DD'),
  ('date_format', 'YYYY/MM/DD');
INSERT INTO _expected_enum (typname, label) VALUES
  ('deal_stage', 'closed_lost'),
  ('deal_stage', 'closed_won'),
  ('deal_stage', 'negotiation'),
  ('deal_stage', 'proposal'),
  ('deal_stage', 'prospecting'),
  ('deal_stage', 'qualification');
INSERT INTO _expected_enum (typname, label) VALUES
  ('deduction_category', 'child_support'),
  ('deduction_category', 'commuter_benefits'),
  ('deduction_category', 'dental_insurance'),
  ('deduction_category', 'federal_tax'),
  ('deduction_category', 'fsa'),
  ('deduction_category', 'garnishment'),
  ('deduction_category', 'health_insurance'),
  ('deduction_category', 'hsa'),
  ('deduction_category', 'life_insurance'),
  ('deduction_category', 'local_tax'),
  ('deduction_category', 'medicare'),
  ('deduction_category', 'other'),
  ('deduction_category', 'retirement_401k'),
  ('deduction_category', 'retirement_403b'),
  ('deduction_category', 'social_security'),
  ('deduction_category', 'state_tax'),
  ('deduction_category', 'student_loan'),
  ('deduction_category', 'union_dues'),
  ('deduction_category', 'vision_insurance');
INSERT INTO _expected_enum (typname, label) VALUES
  ('disability_status', 'no'),
  ('disability_status', 'prefer_not_to_say'),
  ('disability_status', 'yes');
INSERT INTO _expected_enum (typname, label) VALUES
  ('document_action_type', 'delete'),
  ('document_action_type', 'download'),
  ('document_action_type', 'edit'),
  ('document_action_type', 'share'),
  ('document_action_type', 'upload'),
  ('document_action_type', 'version_upload'),
  ('document_action_type', 'view');
INSERT INTO _expected_enum (typname, label) VALUES
  ('document_category', 'contract'),
  ('document_category', 'deliverable'),
  ('document_category', 'design'),
  ('document_category', 'invoice'),
  ('document_category', 'other'),
  ('document_category', 'presentation'),
  ('document_category', 'proposal'),
  ('document_category', 'receipt'),
  ('document_category', 'report'),
  ('document_category', 'specification');
INSERT INTO _expected_enum (typname, label) VALUES
  ('document_visibility', 'client'),
  ('document_visibility', 'internal'),
  ('document_visibility', 'public'),
  ('document_visibility', 'team');
INSERT INTO _expected_enum (typname, label) VALUES
  ('eeoc_category', 'administrative_support'),
  ('eeoc_category', 'craft_workers'),
  ('eeoc_category', 'executive_senior_officials_managers'),
  ('eeoc_category', 'first_mid_level_officials_managers'),
  ('eeoc_category', 'laborers_helpers'),
  ('eeoc_category', 'operatives'),
  ('eeoc_category', 'professionals'),
  ('eeoc_category', 'sales_workers'),
  ('eeoc_category', 'service_workers'),
  ('eeoc_category', 'technicians');
INSERT INTO _expected_enum (typname, label) VALUES
  ('email_status', 'bounced'),
  ('email_status', 'clicked'),
  ('email_status', 'delivered'),
  ('email_status', 'failed'),
  ('email_status', 'opened'),
  ('email_status', 'queued'),
  ('email_status', 'sent'),
  ('email_status', 'spam'),
  ('email_status', 'unsubscribed');
INSERT INTO _expected_enum (typname, label) VALUES
  ('email_type', 'other'),
  ('email_type', 'personal'),
  ('email_type', 'primary'),
  ('email_type', 'work');
INSERT INTO _expected_enum (typname, label) VALUES
  ('employment_status', 'active'),
  ('employment_status', 'deceased'),
  ('employment_status', 'on_leave'),
  ('employment_status', 'retired'),
  ('employment_status', 'suspended'),
  ('employment_status', 'terminated');
INSERT INTO _expected_enum (typname, label) VALUES
  ('employment_type', 'consultant'),
  ('employment_type', 'contractor'),
  ('employment_type', 'freelance'),
  ('employment_type', 'full_time'),
  ('employment_type', 'intern'),
  ('employment_type', 'part_time'),
  ('employment_type', 'temporary');
INSERT INTO _expected_enum (typname, label) VALUES
  ('enrollment_status', 'active'),
  ('enrollment_status', 'cancelled'),
  ('enrollment_status', 'cobra'),
  ('enrollment_status', 'pending'),
  ('enrollment_status', 'terminated'),
  ('enrollment_status', 'waived');
INSERT INTO _expected_enum (typname, label) VALUES
  ('equity_type', 'espp'),
  ('equity_type', 'iso'),
  ('equity_type', 'nso'),
  ('equity_type', 'phantom_stock'),
  ('equity_type', 'restricted_stock'),
  ('equity_type', 'rsu'),
  ('equity_type', 'sar'),
  ('equity_type', 'stock_options');
INSERT INTO _expected_enum (typname, label) VALUES
  ('ethnicity', 'asian'),
  ('ethnicity', 'black_african_american'),
  ('ethnicity', 'hispanic_latino'),
  ('ethnicity', 'native_american_alaska_native'),
  ('ethnicity', 'native_hawaiian_pacific_islander'),
  ('ethnicity', 'prefer_not_to_say'),
  ('ethnicity', 'two_or_more_races'),
  ('ethnicity', 'white');
INSERT INTO _expected_enum (typname, label) VALUES
  ('expense_category', 'hardware'),
  ('expense_category', 'lodging'),
  ('expense_category', 'meals'),
  ('expense_category', 'mileage'),
  ('expense_category', 'other'),
  ('expense_category', 'parking'),
  ('expense_category', 'professional_services'),
  ('expense_category', 'shipping'),
  ('expense_category', 'software'),
  ('expense_category', 'supplies'),
  ('expense_category', 'travel');
INSERT INTO _expected_enum (typname, label) VALUES
  ('expense_status', 'approved'),
  ('expense_status', 'draft'),
  ('expense_status', 'invoiced'),
  ('expense_status', 'reimbursed'),
  ('expense_status', 'rejected'),
  ('expense_status', 'submitted');
INSERT INTO _expected_enum (typname, label) VALUES
  ('expense_type', 'entertainment'),
  ('expense_type', 'general'),
  ('expense_type', 'meals'),
  ('expense_type', 'mileage'),
  ('expense_type', 'office_supplies'),
  ('expense_type', 'other'),
  ('expense_type', 'per_diem'),
  ('expense_type', 'travel');
INSERT INTO _expected_enum (typname, label) VALUES
  ('feedback_type', '360_degree'),
  ('feedback_type', 'coaching'),
  ('feedback_type', 'constructive'),
  ('feedback_type', 'formal'),
  ('feedback_type', 'informal'),
  ('feedback_type', 'positive'),
  ('feedback_type', 'recognition');
INSERT INTO _expected_enum (typname, label) VALUES
  ('flsa_classification', 'exempt'),
  ('flsa_classification', 'non_exempt');
INSERT INTO _expected_enum (typname, label) VALUES
  ('gender', 'female'),
  ('gender', 'male'),
  ('gender', 'non_binary'),
  ('gender', 'other'),
  ('gender', 'prefer_not_to_say');
INSERT INTO _expected_enum (typname, label) VALUES
  ('goal_status', 'active'),
  ('goal_status', 'at_risk'),
  ('goal_status', 'cancelled'),
  ('goal_status', 'completed'),
  ('goal_status', 'deferred'),
  ('goal_status', 'exceeded'),
  ('goal_status', 'in_progress'),
  ('goal_status', 'not_started'),
  ('goal_status', 'on_hold');
INSERT INTO _expected_enum (typname, label) VALUES
  ('goal_type', 'department'),
  ('goal_type', 'individual'),
  ('goal_type', 'team');
INSERT INTO _expected_enum (typname, label) VALUES
  ('group_member_role', 'admin'),
  ('group_member_role', 'member'),
  ('group_member_role', 'moderator'),
  ('group_member_role', 'owner');
INSERT INTO _expected_enum (typname, label) VALUES
  ('group_type', 'affinity'),
  ('group_type', 'custom'),
  ('group_type', 'department'),
  ('group_type', 'functional'),
  ('group_type', 'project'),
  ('group_type', 'team');
INSERT INTO _expected_enum (typname, label) VALUES
  ('i9_status', 'completed'),
  ('i9_status', 'expired'),
  ('i9_status', 'not_started'),
  ('i9_status', 'reverification_needed'),
  ('i9_status', 'section_1_complete'),
  ('i9_status', 'section_2_pending');
INSERT INTO _expected_enum (typname, label) VALUES
  ('india_state', 'AN'),
  ('india_state', 'AP'),
  ('india_state', 'AR'),
  ('india_state', 'AS'),
  ('india_state', 'BR'),
  ('india_state', 'CH'),
  ('india_state', 'CT'),
  ('india_state', 'DD'),
  ('india_state', 'DL'),
  ('india_state', 'DN'),
  ('india_state', 'GA'),
  ('india_state', 'GJ'),
  ('india_state', 'HP'),
  ('india_state', 'HR'),
  ('india_state', 'JH'),
  ('india_state', 'JK'),
  ('india_state', 'KA'),
  ('india_state', 'KL'),
  ('india_state', 'LD'),
  ('india_state', 'MH'),
  ('india_state', 'ML'),
  ('india_state', 'MN'),
  ('india_state', 'MP'),
  ('india_state', 'MZ'),
  ('india_state', 'NL'),
  ('india_state', 'OR'),
  ('india_state', 'PB'),
  ('india_state', 'PY'),
  ('india_state', 'RJ'),
  ('india_state', 'SK'),
  ('india_state', 'TG'),
  ('india_state', 'TN'),
  ('india_state', 'TR'),
  ('india_state', 'UP'),
  ('india_state', 'UT'),
  ('india_state', 'WB');
INSERT INTO _expected_enum (typname, label) VALUES
  ('india_tax_regime', 'new_regime'),
  ('india_tax_regime', 'old_regime');
INSERT INTO _expected_enum (typname, label) VALUES
  ('integration_provider', 'adp'),
  ('integration_provider', 'calendly'),
  ('integration_provider', 'docusign'),
  ('integration_provider', 'google_workspace'),
  ('integration_provider', 'gusto'),
  ('integration_provider', 'hubspot'),
  ('integration_provider', 'mailchimp'),
  ('integration_provider', 'microsoft_365'),
  ('integration_provider', 'okta'),
  ('integration_provider', 'plaid'),
  ('integration_provider', 'quickbooks'),
  ('integration_provider', 'salesforce'),
  ('integration_provider', 'slack'),
  ('integration_provider', 'stripe'),
  ('integration_provider', 'teams'),
  ('integration_provider', 'xero'),
  ('integration_provider', 'zoom');
INSERT INTO _expected_enum (typname, label) VALUES
  ('integration_status', 'active'),
  ('integration_status', 'error'),
  ('integration_status', 'expired'),
  ('integration_status', 'inactive'),
  ('integration_status', 'pending'),
  ('integration_status', 'revoked');
INSERT INTO _expected_enum (typname, label) VALUES
  ('invoice_status', 'draft'),
  ('invoice_status', 'overdue'),
  ('invoice_status', 'paid'),
  ('invoice_status', 'partial'),
  ('invoice_status', 'sent'),
  ('invoice_status', 'viewed'),
  ('invoice_status', 'void'),
  ('invoice_status', 'written_off');
INSERT INTO _expected_enum (typname, label) VALUES
  ('journal_entry_source_type', 'bill'),
  ('journal_entry_source_type', 'depreciation'),
  ('journal_entry_source_type', 'expense'),
  ('journal_entry_source_type', 'import'),
  ('journal_entry_source_type', 'invoice'),
  ('journal_entry_source_type', 'manual'),
  ('journal_entry_source_type', 'payment'),
  ('journal_entry_source_type', 'payroll'),
  ('journal_entry_source_type', 'system');
INSERT INTO _expected_enum (typname, label) VALUES
  ('journal_entry_status', 'draft'),
  ('journal_entry_status', 'posted'),
  ('journal_entry_status', 'reversed'),
  ('journal_entry_status', 'void');
INSERT INTO _expected_enum (typname, label) VALUES
  ('lead_source', 'cold_call'),
  ('lead_source', 'email_campaign'),
  ('lead_source', 'event'),
  ('lead_source', 'organic_search'),
  ('lead_source', 'paid_ads'),
  ('lead_source', 'partner'),
  ('lead_source', 'referral'),
  ('lead_source', 'social_media'),
  ('lead_source', 'website');
INSERT INTO _expected_enum (typname, label) VALUES
  ('lead_status', 'contacted'),
  ('lead_status', 'converted'),
  ('lead_status', 'lost'),
  ('lead_status', 'new'),
  ('lead_status', 'qualified'),
  ('lead_status', 'unqualified');
INSERT INTO _expected_enum (typname, label) VALUES
  ('life_event_type', 'adoption'),
  ('life_event_type', 'birth'),
  ('life_event_type', 'change_in_employment'),
  ('life_event_type', 'death'),
  ('life_event_type', 'dependent_age_limit'),
  ('life_event_type', 'divorce'),
  ('life_event_type', 'domestic_partnership'),
  ('life_event_type', 'gain_of_coverage'),
  ('life_event_type', 'loss_of_coverage'),
  ('life_event_type', 'marriage'),
  ('life_event_type', 'residence_change');
INSERT INTO _expected_enum (typname, label) VALUES
  ('locale', 'de-CH'),
  ('locale', 'de-DE'),
  ('locale', 'en-CA'),
  ('locale', 'en-GB'),
  ('locale', 'en-US'),
  ('locale', 'es-ES'),
  ('locale', 'es-MX'),
  ('locale', 'fr-BE'),
  ('locale', 'fr-CH'),
  ('locale', 'fr-FR'),
  ('locale', 'he-IL'),
  ('locale', 'hi-IN'),
  ('locale', 'it-CH'),
  ('locale', 'it-IT'),
  ('locale', 'ja-JP'),
  ('locale', 'nl-BE'),
  ('locale', 'nl-NL'),
  ('locale', 'pt-BR'),
  ('locale', 'sv-SE'),
  ('locale', 'zh-CN');
INSERT INTO _expected_enum (typname, label) VALUES
  ('marital_status', 'divorced'),
  ('marital_status', 'domestic_partnership'),
  ('marital_status', 'married'),
  ('marital_status', 'prefer_not_to_say'),
  ('marital_status', 'separated'),
  ('marital_status', 'single'),
  ('marital_status', 'widowed');
INSERT INTO _expected_enum (typname, label) VALUES
  ('notification_channel', 'email'),
  ('notification_channel', 'in_app'),
  ('notification_channel', 'push'),
  ('notification_channel', 'slack'),
  ('notification_channel', 'sms'),
  ('notification_channel', 'teams');
INSERT INTO _expected_enum (typname, label) VALUES
  ('notification_frequency', 'daily_digest'),
  ('notification_frequency', 'hourly_digest'),
  ('notification_frequency', 'immediate'),
  ('notification_frequency', 'never'),
  ('notification_frequency', 'weekly_digest');
INSERT INTO _expected_enum (typname, label) VALUES
  ('notification_type', 'document_shared'),
  ('notification_type', 'invoice_ready'),
  ('notification_type', 'message_received'),
  ('notification_type', 'payment_received'),
  ('notification_type', 'project_update'),
  ('notification_type', 'task_completed');
INSERT INTO _expected_enum (typname, label) VALUES
  ('number_format', 'de-CH'),
  ('number_format', 'de-DE'),
  ('number_format', 'en-CA'),
  ('number_format', 'en-GB'),
  ('number_format', 'en-US'),
  ('number_format', 'es-ES'),
  ('number_format', 'fr-BE'),
  ('number_format', 'fr-CH'),
  ('number_format', 'fr-FR'),
  ('number_format', 'he-IL'),
  ('number_format', 'hi-IN'),
  ('number_format', 'it-CH'),
  ('number_format', 'it-IT'),
  ('number_format', 'ja-JP'),
  ('number_format', 'nl-BE'),
  ('number_format', 'nl-NL'),
  ('number_format', 'sv-SE');
INSERT INTO _expected_enum (typname, label) VALUES
  ('onboarding_task_status', 'blocked'),
  ('onboarding_task_status', 'completed'),
  ('onboarding_task_status', 'in_progress'),
  ('onboarding_task_status', 'not_started'),
  ('onboarding_task_status', 'overdue'),
  ('onboarding_task_status', 'skipped');
INSERT INTO _expected_enum (typname, label) VALUES
  ('onboarding_task_type', 'document_upload'),
  ('onboarding_task_type', 'equipment_request'),
  ('onboarding_task_type', 'form_completion'),
  ('onboarding_task_type', 'meeting'),
  ('onboarding_task_type', 'orientation'),
  ('onboarding_task_type', 'other'),
  ('onboarding_task_type', 'policy_acknowledgment'),
  ('onboarding_task_type', 'signature_required'),
  ('onboarding_task_type', 'system_access'),
  ('onboarding_task_type', 'training_module'),
  ('onboarding_task_type', 'training_video');
INSERT INTO _expected_enum (typname, label) VALUES
  ('opportunity_status', 'abandoned'),
  ('opportunity_status', 'lost'),
  ('opportunity_status', 'open'),
  ('opportunity_status', 'won');
INSERT INTO _expected_enum (typname, label) VALUES
  ('pay_frequency', 'annually'),
  ('pay_frequency', 'bi-weekly'),
  ('pay_frequency', 'monthly'),
  ('pay_frequency', 'quarterly'),
  ('pay_frequency', 'semi-monthly'),
  ('pay_frequency', 'weekly');
INSERT INTO _expected_enum (typname, label) VALUES
  ('payment_method', 'cash'),
  ('payment_method', 'check'),
  ('payment_method', 'direct_deposit'),
  ('payment_method', 'mobile_payment'),
  ('payment_method', 'paycard'),
  ('payment_method', 'wire_transfer');
INSERT INTO _expected_enum (typname, label) VALUES
  ('payment_status', 'cancelled'),
  ('payment_status', 'completed'),
  ('payment_status', 'failed'),
  ('payment_status', 'pending'),
  ('payment_status', 'processing'),
  ('payment_status', 'refunded');
INSERT INTO _expected_enum (typname, label) VALUES
  ('payroll_run_status', 'approved'),
  ('payroll_run_status', 'calculated'),
  ('payroll_run_status', 'calculating'),
  ('payroll_run_status', 'cancelled'),
  ('payroll_run_status', 'draft'),
  ('payroll_run_status', 'finalized'),
  ('payroll_run_status', 'paid'),
  ('payroll_run_status', 'pending_approval'),
  ('payroll_run_status', 'processing');
INSERT INTO _expected_enum (typname, label) VALUES
  ('payroll_run_type', 'adjustment'),
  ('payroll_run_type', 'bonus'),
  ('payroll_run_type', 'correction'),
  ('payroll_run_type', 'off_cycle'),
  ('payroll_run_type', 'preview'),
  ('payroll_run_type', 'regular'),
  ('payroll_run_type', 'termination');
INSERT INTO _expected_enum (typname, label) VALUES
  ('period_type', 'bi_weekly'),
  ('period_type', 'monthly'),
  ('period_type', 'weekly');
INSERT INTO _expected_enum (typname, label) VALUES
  ('permission_action', 'approve'),
  ('permission_action', 'configure'),
  ('permission_action', 'create'),
  ('permission_action', 'delete'),
  ('permission_action', 'export'),
  ('permission_action', 'import'),
  ('permission_action', 'read'),
  ('permission_action', 'update');
INSERT INTO _expected_enum (typname, label) VALUES
  ('permission_scope', 'all'),
  ('permission_scope', 'department'),
  ('permission_scope', 'location'),
  ('permission_scope', 'none'),
  ('permission_scope', 'self'),
  ('permission_scope', 'team');
INSERT INTO _expected_enum (typname, label) VALUES
  ('phone_type', 'fax'),
  ('phone_type', 'home'),
  ('phone_type', 'mobile'),
  ('phone_type', 'other'),
  ('phone_type', 'work');
INSERT INTO _expected_enum (typname, label) VALUES
  ('pipeline_stage', 'closed_lost'),
  ('pipeline_stage', 'closed_won'),
  ('pipeline_stage', 'negotiation'),
  ('pipeline_stage', 'proposal'),
  ('pipeline_stage', 'prospecting'),
  ('pipeline_stage', 'qualification');
INSERT INTO _expected_enum (typname, label) VALUES
  ('plan_tier', 'custom'),
  ('plan_tier', 'enterprise'),
  ('plan_tier', 'professional'),
  ('plan_tier', 'starter');
INSERT INTO _expected_enum (typname, label) VALUES
  ('portal_action_type', 'download_file'),
  ('portal_action_type', 'login'),
  ('portal_action_type', 'logout'),
  ('portal_action_type', 'make_payment'),
  ('portal_action_type', 'submit_ticket'),
  ('portal_action_type', 'upload_file'),
  ('portal_action_type', 'view_document'),
  ('portal_action_type', 'view_invoice'),
  ('portal_action_type', 'view_project');
INSERT INTO _expected_enum (typname, label) VALUES
  ('premium_type', 'certification'),
  ('premium_type', 'geographic'),
  ('premium_type', 'hazard_pay'),
  ('premium_type', 'holiday'),
  ('premium_type', 'on_call'),
  ('premium_type', 'shift_differential'),
  ('premium_type', 'skill_based'),
  ('premium_type', 'weekend');
INSERT INTO _expected_enum (typname, label) VALUES
  ('pricing_model', 'daily'),
  ('pricing_model', 'fixed'),
  ('pricing_model', 'hourly'),
  ('pricing_model', 'per_unit'),
  ('pricing_model', 'subscription'),
  ('pricing_model', 'value_based');
INSERT INTO _expected_enum (typname, label) VALUES
  ('project_health_status', 'at_risk'),
  ('project_health_status', 'behind'),
  ('project_health_status', 'blocked'),
  ('project_health_status', 'on_track');
INSERT INTO _expected_enum (typname, label) VALUES
  ('project_priority', 'critical'),
  ('project_priority', 'high'),
  ('project_priority', 'low'),
  ('project_priority', 'medium');
INSERT INTO _expected_enum (typname, label) VALUES
  ('project_status', 'active'),
  ('project_status', 'archived'),
  ('project_status', 'cancelled'),
  ('project_status', 'completed'),
  ('project_status', 'draft'),
  ('project_status', 'on_hold'),
  ('project_status', 'planned');
INSERT INTO _expected_enum (typname, label) VALUES
  ('project_type', 'client_project'),
  ('project_type', 'internal'),
  ('project_type', 'marketing_campaign'),
  ('project_type', 'product_development'),
  ('project_type', 'research');
INSERT INTO _expected_enum (typname, label) VALUES
  ('pronouns', 'he_him'),
  ('pronouns', 'other'),
  ('pronouns', 'prefer_not_to_say'),
  ('pronouns', 'she_her'),
  ('pronouns', 'they_them'),
  ('pronouns', 'ze_hir');
INSERT INTO _expected_enum (typname, label) VALUES
  ('proposal_line_item_type', 'discount'),
  ('proposal_line_item_type', 'fee'),
  ('proposal_line_item_type', 'product'),
  ('proposal_line_item_type', 'service'),
  ('proposal_line_item_type', 'tax');
INSERT INTO _expected_enum (typname, label) VALUES
  ('proposal_status', 'accepted'),
  ('proposal_status', 'draft'),
  ('proposal_status', 'expired'),
  ('proposal_status', 'rejected'),
  ('proposal_status', 'revised'),
  ('proposal_status', 'sent'),
  ('proposal_status', 'viewed');
INSERT INTO _expected_enum (typname, label) VALUES
  ('rate_type', 'activity'),
  ('rate_type', 'client'),
  ('rate_type', 'employee_default'),
  ('rate_type', 'employee_role'),
  ('rate_type', 'project'),
  ('rate_type', 'task');
INSERT INTO _expected_enum (typname, label) VALUES
  ('rating_scale', '1_to_10'),
  ('rating_scale', '1_to_5'),
  ('rating_scale', 'custom'),
  ('rating_scale', 'exceeds_meets_below'),
  ('rating_scale', 'letter_grade'),
  ('rating_scale', 'percentile');
INSERT INTO _expected_enum (typname, label) VALUES
  ('region', 'ap-south-1'),
  ('region', 'ap-southeast-1'),
  ('region', 'eu-west-1'),
  ('region', 'us-east-1'),
  ('region', 'us-west-1');
INSERT INTO _expected_enum (typname, label) VALUES
  ('rehire_eligibility', 'maybe'),
  ('rehire_eligibility', 'no'),
  ('rehire_eligibility', 'yes');
INSERT INTO _expected_enum (typname, label) VALUES
  ('reimbursement_status', 'approved'),
  ('reimbursement_status', 'cancelled'),
  ('reimbursement_status', 'paid'),
  ('reimbursement_status', 'pending'),
  ('reimbursement_status', 'rejected');
INSERT INTO _expected_enum (typname, label) VALUES
  ('relationship_type', 'child'),
  ('relationship_type', 'colleague'),
  ('relationship_type', 'friend'),
  ('relationship_type', 'grandchild'),
  ('relationship_type', 'grandparent'),
  ('relationship_type', 'other'),
  ('relationship_type', 'parent'),
  ('relationship_type', 'partner'),
  ('relationship_type', 'sibling'),
  ('relationship_type', 'spouse');
INSERT INTO _expected_enum (typname, label) VALUES
  ('report_format', 'csv'),
  ('report_format', 'html'),
  ('report_format', 'json'),
  ('report_format', 'pdf'),
  ('report_format', 'xlsx'),
  ('report_format', 'xml');
INSERT INTO _expected_enum (typname, label) VALUES
  ('report_frequency', 'annually'),
  ('report_frequency', 'daily'),
  ('report_frequency', 'monthly'),
  ('report_frequency', 'once'),
  ('report_frequency', 'quarterly'),
  ('report_frequency', 'weekly');
INSERT INTO _expected_enum (typname, label) VALUES
  ('retainer_period_status', 'active'),
  ('retainer_period_status', 'carried_over'),
  ('retainer_period_status', 'completed'),
  ('retainer_period_status', 'invoiced');
INSERT INTO _expected_enum (typname, label) VALUES
  ('retainer_period_type', 'annually'),
  ('retainer_period_type', 'monthly'),
  ('retainer_period_type', 'quarterly'),
  ('retainer_period_type', 'semi_annually');
INSERT INTO _expected_enum (typname, label) VALUES
  ('retainer_status', 'active'),
  ('retainer_status', 'cancelled'),
  ('retainer_status', 'draft'),
  ('retainer_status', 'expired'),
  ('retainer_status', 'paused'),
  ('retainer_status', 'renewed');
INSERT INTO _expected_enum (typname, label) VALUES
  ('retainer_type', 'deliverables_based'),
  ('retainer_type', 'hours_based'),
  ('retainer_type', 'hybrid'),
  ('retainer_type', 'value_based');
INSERT INTO _expected_enum (typname, label) VALUES
  ('review_cycle_status', 'active'),
  ('review_cycle_status', 'archived'),
  ('review_cycle_status', 'completed'),
  ('review_cycle_status', 'draft');
INSERT INTO _expected_enum (typname, label) VALUES
  ('review_cycle_type', 'ad_hoc'),
  ('review_cycle_type', 'annual'),
  ('review_cycle_type', 'monthly'),
  ('review_cycle_type', 'probation'),
  ('review_cycle_type', 'project_end'),
  ('review_cycle_type', 'quarterly'),
  ('review_cycle_type', 'semi-annual');
INSERT INTO _expected_enum (typname, label) VALUES
  ('review_status', 'acknowledged'),
  ('review_status', 'calibration'),
  ('review_status', 'cancelled'),
  ('review_status', 'completed'),
  ('review_status', 'manager_review'),
  ('review_status', 'not_started'),
  ('review_status', 'self_assessment');
INSERT INTO _expected_enum (typname, label) VALUES
  ('signature_provider', 'adobe_sign'),
  ('signature_provider', 'docusign'),
  ('signature_provider', 'hellosign'),
  ('signature_provider', 'internal'),
  ('signature_provider', 'pandadoc');
INSERT INTO _expected_enum (typname, label) VALUES
  ('swiss_canton', 'AG'),
  ('swiss_canton', 'AI'),
  ('swiss_canton', 'AR'),
  ('swiss_canton', 'BE'),
  ('swiss_canton', 'BL'),
  ('swiss_canton', 'BS'),
  ('swiss_canton', 'FR'),
  ('swiss_canton', 'GE'),
  ('swiss_canton', 'GL'),
  ('swiss_canton', 'GR'),
  ('swiss_canton', 'JU'),
  ('swiss_canton', 'LU'),
  ('swiss_canton', 'NE'),
  ('swiss_canton', 'NW'),
  ('swiss_canton', 'OW'),
  ('swiss_canton', 'SG'),
  ('swiss_canton', 'SH'),
  ('swiss_canton', 'SO'),
  ('swiss_canton', 'SZ'),
  ('swiss_canton', 'TG'),
  ('swiss_canton', 'TI'),
  ('swiss_canton', 'UR'),
  ('swiss_canton', 'VD'),
  ('swiss_canton', 'VS'),
  ('swiss_canton', 'ZG'),
  ('swiss_canton', 'ZH');
INSERT INTO _expected_enum (typname, label) VALUES
  ('task_assignee_type', 'buddy'),
  ('task_assignee_type', 'employee'),
  ('task_assignee_type', 'facilities'),
  ('task_assignee_type', 'hr'),
  ('task_assignee_type', 'it'),
  ('task_assignee_type', 'manager'),
  ('task_assignee_type', 'payroll'),
  ('task_assignee_type', 'recruiter');
INSERT INTO _expected_enum (typname, label) VALUES
  ('task_priority', 'critical'),
  ('task_priority', 'high'),
  ('task_priority', 'low'),
  ('task_priority', 'medium');
INSERT INTO _expected_enum (typname, label) VALUES
  ('task_status', 'blocked'),
  ('task_status', 'cancelled'),
  ('task_status', 'completed'),
  ('task_status', 'in_progress'),
  ('task_status', 'in_review'),
  ('task_status', 'todo');
INSERT INTO _expected_enum (typname, label) VALUES
  ('task_type', 'approval'),
  ('task_type', 'bug'),
  ('task_type', 'deliverable'),
  ('task_type', 'feature'),
  ('task_type', 'milestone'),
  ('task_type', 'review'),
  ('task_type', 'task');
INSERT INTO _expected_enum (typname, label) VALUES
  ('tax_filing_status', 'head_of_household'),
  ('tax_filing_status', 'married_filing_jointly'),
  ('tax_filing_status', 'married_filing_separately'),
  ('tax_filing_status', 'single');
INSERT INTO _expected_enum (typname, label) VALUES
  ('tax_type', 'customs'),
  ('tax_type', 'excise'),
  ('tax_type', 'gst'),
  ('tax_type', 'none'),
  ('tax_type', 'sales_tax'),
  ('tax_type', 'use_tax'),
  ('tax_type', 'vat');
INSERT INTO _expected_enum (typname, label) VALUES
  ('termination_type', 'deceased'),
  ('termination_type', 'end_of_contract'),
  ('termination_type', 'involuntary'),
  ('termination_type', 'layoff'),
  ('termination_type', 'mutual_agreement'),
  ('termination_type', 'retirement'),
  ('termination_type', 'voluntary');
INSERT INTO _expected_enum (typname, label) VALUES
  ('ticket_category', 'access_management'),
  ('ticket_category', 'benefits_question'),
  ('ticket_category', 'compliance'),
  ('ticket_category', 'data_request'),
  ('ticket_category', 'facilities'),
  ('ticket_category', 'hardware'),
  ('ticket_category', 'hr_inquiry'),
  ('ticket_category', 'it_support'),
  ('ticket_category', 'network'),
  ('ticket_category', 'other'),
  ('ticket_category', 'payroll_question'),
  ('ticket_category', 'report_request'),
  ('ticket_category', 'security'),
  ('ticket_category', 'software');
INSERT INTO _expected_enum (typname, label) VALUES
  ('ticket_request_type', 'bug_fix'),
  ('ticket_request_type', 'feature'),
  ('ticket_request_type', 'other'),
  ('ticket_request_type', 'qa_testing'),
  ('ticket_request_type', 'support');
INSERT INTO _expected_enum (typname, label) VALUES
  ('ticket_severity', 'critical'),
  ('ticket_severity', 'high'),
  ('ticket_severity', 'low'),
  ('ticket_severity', 'medium');
INSERT INTO _expected_enum (typname, label) VALUES
  ('ticket_status', 'Active'),
  ('ticket_status', 'Assigned'),
  ('ticket_status', 'Closed'),
  ('ticket_status', 'Duplicate'),
  ('ticket_status', 'Pending'),
  ('ticket_status', 'Suspended');
INSERT INTO _expected_enum (typname, label) VALUES
  ('time_entry_status', 'approved'),
  ('time_entry_status', 'draft'),
  ('time_entry_status', 'invoiced'),
  ('time_entry_status', 'paid'),
  ('time_entry_status', 'rejected'),
  ('time_entry_status', 'submitted');
INSERT INTO _expected_enum (typname, label) VALUES
  ('time_entry_type', 'auto_generated'),
  ('time_entry_type', 'imported'),
  ('time_entry_type', 'manual'),
  ('time_entry_type', 'timer');
INSERT INTO _expected_enum (typname, label) VALUES
  ('time_format', '12h'),
  ('time_format', '24h');
INSERT INTO _expected_enum (typname, label) VALUES
  ('time_off_request_status', 'approved'),
  ('time_off_request_status', 'cancelled'),
  ('time_off_request_status', 'denied'),
  ('time_off_request_status', 'pending');
INSERT INTO _expected_enum (typname, label) VALUES
  ('time_off_type', 'bereavement'),
  ('time_off_type', 'comp_time'),
  ('time_off_type', 'floating_holiday'),
  ('time_off_type', 'fmla'),
  ('time_off_type', 'jury_duty'),
  ('time_off_type', 'maternity_leave'),
  ('time_off_type', 'military_leave'),
  ('time_off_type', 'other'),
  ('time_off_type', 'parental_leave'),
  ('time_off_type', 'paternity_leave'),
  ('time_off_type', 'personal'),
  ('time_off_type', 'pto'),
  ('time_off_type', 'sabbatical'),
  ('time_off_type', 'sick'),
  ('time_off_type', 'unpaid'),
  ('time_off_type', 'vacation');
INSERT INTO _expected_enum (typname, label) VALUES
  ('time_tracking_type', 'clock_in_out'),
  ('time_tracking_type', 'deliverable_based'),
  ('time_tracking_type', 'hours_only'),
  ('time_tracking_type', 'none'),
  ('time_tracking_type', 'task_based');
INSERT INTO _expected_enum (typname, label) VALUES
  ('timesheet_status', 'approved'),
  ('timesheet_status', 'draft'),
  ('timesheet_status', 'fully_invoiced'),
  ('timesheet_status', 'partially_invoiced'),
  ('timesheet_status', 'rejected'),
  ('timesheet_status', 'submitted');
INSERT INTO _expected_enum (typname, label) VALUES
  ('timezone', 'America/Anchorage'),
  ('timezone', 'America/Chicago'),
  ('timezone', 'America/Denver'),
  ('timezone', 'America/Honolulu'),
  ('timezone', 'America/Los_Angeles'),
  ('timezone', 'America/New_York'),
  ('timezone', 'America/Phoenix'),
  ('timezone', 'Asia/Jerusalem'),
  ('timezone', 'Asia/Kolkata'),
  ('timezone', 'Asia/Shanghai'),
  ('timezone', 'Asia/Singapore'),
  ('timezone', 'Asia/Tokyo'),
  ('timezone', 'Australia/Sydney'),
  ('timezone', 'Europe/Amsterdam'),
  ('timezone', 'Europe/Berlin'),
  ('timezone', 'Europe/Brussels'),
  ('timezone', 'Europe/London'),
  ('timezone', 'Europe/Paris'),
  ('timezone', 'Europe/Rome'),
  ('timezone', 'Europe/Stockholm'),
  ('timezone', 'Europe/Zurich');
INSERT INTO _expected_enum (typname, label) VALUES
  ('training_status', 'completed'),
  ('training_status', 'expired'),
  ('training_status', 'in_progress'),
  ('training_status', 'not_started'),
  ('training_status', 'overdue');
INSERT INTO _expected_enum (typname, label) VALUES
  ('training_type', 'compliance'),
  ('training_type', 'onboarding'),
  ('training_type', 'professional_development'),
  ('training_type', 'safety'),
  ('training_type', 'technical');
INSERT INTO _expected_enum (typname, label) VALUES
  ('update_visibility', 'external'),
  ('update_visibility', 'internal');
INSERT INTO _expected_enum (typname, label) VALUES
  ('us_state', 'AK'),
  ('us_state', 'AL'),
  ('us_state', 'AR'),
  ('us_state', 'AZ'),
  ('us_state', 'CA'),
  ('us_state', 'CO'),
  ('us_state', 'CT'),
  ('us_state', 'DC'),
  ('us_state', 'DE'),
  ('us_state', 'FL'),
  ('us_state', 'GA'),
  ('us_state', 'HI'),
  ('us_state', 'IA'),
  ('us_state', 'ID'),
  ('us_state', 'IL'),
  ('us_state', 'IN'),
  ('us_state', 'KS'),
  ('us_state', 'KY'),
  ('us_state', 'LA'),
  ('us_state', 'MA'),
  ('us_state', 'MD'),
  ('us_state', 'ME'),
  ('us_state', 'MI'),
  ('us_state', 'MN'),
  ('us_state', 'MO'),
  ('us_state', 'MS'),
  ('us_state', 'MT'),
  ('us_state', 'NC'),
  ('us_state', 'ND'),
  ('us_state', 'NE'),
  ('us_state', 'NH'),
  ('us_state', 'NJ'),
  ('us_state', 'NM'),
  ('us_state', 'NV'),
  ('us_state', 'NY'),
  ('us_state', 'OH'),
  ('us_state', 'OK'),
  ('us_state', 'OR'),
  ('us_state', 'PA'),
  ('us_state', 'RI'),
  ('us_state', 'SC'),
  ('us_state', 'SD'),
  ('us_state', 'TN'),
  ('us_state', 'TX'),
  ('us_state', 'UT'),
  ('us_state', 'VA'),
  ('us_state', 'VT'),
  ('us_state', 'WA'),
  ('us_state', 'WI'),
  ('us_state', 'WV'),
  ('us_state', 'WY');
INSERT INTO _expected_enum (typname, label) VALUES
  ('user_role', 'contractor'),
  ('user_role', 'employee'),
  ('user_role', 'finance_admin'),
  ('user_role', 'firm_admin'),
  ('user_role', 'hr_admin'),
  ('user_role', 'manager'),
  ('user_role', 'payroll_admin'),
  ('user_role', 'read_only'),
  ('user_role', 'super_admin');
INSERT INTO _expected_enum (typname, label) VALUES
  ('variable_comp_type', 'bonus'),
  ('variable_comp_type', 'commission'),
  ('variable_comp_type', 'performance_bonus'),
  ('variable_comp_type', 'profit_sharing'),
  ('variable_comp_type', 'retention_bonus'),
  ('variable_comp_type', 'sales_incentive'),
  ('variable_comp_type', 'spot_bonus');
INSERT INTO _expected_enum (typname, label) VALUES
  ('vesting_type', 'cliff_then_monthly'),
  ('vesting_type', 'cliff_then_quarterly'),
  ('vesting_type', 'hybrid'),
  ('vesting_type', 'milestone_based'),
  ('vesting_type', 'performance_based'),
  ('vesting_type', 'time_based');
INSERT INTO _expected_enum (typname, label) VALUES
  ('veteran_status', 'active_duty_wartime_campaign'),
  ('veteran_status', 'armed_forces_service_medal'),
  ('veteran_status', 'disabled_veteran'),
  ('veteran_status', 'not_veteran'),
  ('veteran_status', 'prefer_not_to_say'),
  ('veteran_status', 'protected_veteran'),
  ('veteran_status', 'recently_separated');
INSERT INTO _expected_enum (typname, label) VALUES
  ('webhook_status', 'delivered'),
  ('webhook_status', 'expired'),
  ('webhook_status', 'failed'),
  ('webhook_status', 'pending'),
  ('webhook_status', 'retrying');
INSERT INTO _expected_enum (typname, label) VALUES
  ('work_arrangement', 'flexible'),
  ('work_arrangement', 'hybrid'),
  ('work_arrangement', 'on_call'),
  ('work_arrangement', 'project_based'),
  ('work_arrangement', 'remote'),
  ('work_arrangement', 'shift_based'),
  ('work_arrangement', 'standard');
INSERT INTO _expected_enum (typname, label) VALUES
  ('work_authorization_type', 'citizen'),
  ('work_authorization_type', 'ead'),
  ('work_authorization_type', 'h1b'),
  ('work_authorization_type', 'other'),
  ('work_authorization_type', 'permanent_resident'),
  ('work_authorization_type', 'student_visa'),
  ('work_authorization_type', 'tn'),
  ('work_authorization_type', 'work_visa');
INSERT INTO _expected_enum (typname, label) VALUES
  ('work_location_type', 'client_site'),
  ('work_location_type', 'field'),
  ('work_location_type', 'hybrid'),
  ('work_location_type', 'multiple_locations'),
  ('work_location_type', 'office'),
  ('work_location_type', 'remote');
