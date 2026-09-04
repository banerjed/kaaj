import type { ISidebarMenuItem } from "$lib/components/admin-layout/SidebarMenuItem.svelte"

/**
 * The product's information architecture: doc 02 § Module Grouping Strategy,
 * five groups in that order. URLs come from the module specs. Nexus's own menu
 * (Ecommerce / Gen-AI / Agentic) was dropped wholesale.
 *
 * Unbuilt modules are listed and marked `disabled` — dimmed and unclickable —
 * so the shape of the product is legible now. Drop the flag when the routes
 * behind it land.
 */

// Not `as const`: that would make `badges` readonly against a mutable string[].
const soon: Pick<ISidebarMenuItem, "disabled" | "badges"> = {
  disabled: true,
  badges: ["soon"],
}

// An entry may carry `permission`. It is hidden from anyone who lacks it —
// which is navigation hygiene, NOT access control. The page's own `load` is
// what refuses the request; this only stops the app offering a link that leads
// to an error page (L44).

export const appMenuItems: ISidebarMenuItem[] = [
  {
    id: "overview-label",
    isTitle: true,
    label: "Overview",
  },
  {
    id: "dashboard",
    icon: "lucide--layout-dashboard",
    label: "Dashboard",
    ...soon,
  },

  // -- Group 1: People & Organization -------------------------------------
  {
    id: "people-label",
    isTitle: true,
    label: "People & Organization",
  },
  {
    id: "employees",
    icon: "lucide--users",
    label: "Employees",
    children: [
      { id: "employees-directory", label: "Directory", url: "/employees" },
      { id: "employees-org-chart", label: "Org Chart", ...soon },
    ],
  },
  {
    id: "hr",
    icon: "lucide--clipboard-list",
    label: "HR",
    children: [
      { id: "hr-time-off", label: "Time Off", url: "/time-off" },
      { id: "hr-attendance", label: "Attendance", url: "/attendance" },
      { id: "hr-reviews", label: "Performance", url: "/performance" },
      { id: "hr-onboarding", label: "Onboarding", url: "/onboarding" },
    ],
  },
  {
    id: "compensation",
    icon: "lucide--banknote",
    label: "Compensation",
    url: "/compensation",
  },
  {
    id: "payroll",
    icon: "lucide--wallet",
    label: "Payroll",
    children: [
      {
        id: "payroll-payslips",
        label: "My Payslips",
        url: "/payroll/payslips",
      },
      {
        id: "payroll-runs",
        label: "Pay Runs",
        url: "/payroll/runs",
        // Everyone in the firm's pay, on one page. Hidden from those who may
        // not open it — the load refuses them regardless.
        permission: "compensation.read.all",
      },
      { id: "payroll-taxes", label: "Taxes", ...soon },
    ],
  },
  {
    id: "change-requests",
    icon: "lucide--file-clock",
    label: "Change Requests",
    ...soon,
  },

  // -- Group 2: Business Operations ---------------------------------------
  {
    id: "operations-label",
    isTitle: true,
    label: "Business Operations",
  },
  {
    id: "projects",
    icon: "lucide--folder-kanban",
    label: "Projects",
    url: "/projects",
  },
  {
    id: "time-tracking",
    icon: "lucide--timer",
    label: "Time Tracking",
    url: "/time-tracking",
  },
  {
    id: "proposals",
    icon: "lucide--file-signature",
    label: "Proposals",
    ...soon,
  },
  {
    id: "crm",
    icon: "lucide--handshake",
    label: "CRM",
    ...soon,
  },
  {
    id: "client-portal",
    icon: "lucide--building-2",
    label: "Client Portal",
    ...soon,
  },

  // -- Group 3: Marketing & Sales -----------------------------------------
  {
    id: "marketing-label",
    isTitle: true,
    label: "Marketing & Sales",
  },
  {
    id: "marketing",
    icon: "lucide--megaphone",
    label: "Marketing Hub",
    ...soon,
  },
  {
    id: "analytics",
    icon: "lucide--chart-line",
    label: "Analytics",
    ...soon,
  },

  // -- Group 4: Finance & Accounting --------------------------------------
  {
    id: "finance-label",
    isTitle: true,
    label: "Finance & Accounting",
  },
  {
    id: "accounting",
    icon: "lucide--calculator",
    label: "Accounting",
    children: [
      {
        id: "accounting-invoices",
        label: "Invoices",
        url: "/accounting/invoices",
        permission: "accounting.read",
      },
      {
        id: "accounting-bills",
        label: "Bills",
        url: "/accounting/bills",
        permission: "accounting.read",
      },
      {
        id: "accounting-ledger",
        label: "General Ledger",
        url: "/accounting/ledger",
        permission: "accounting.read",
      },
      {
        id: "accounting-banking",
        label: "Banking",
        url: "/accounting/banking",
        permission: "accounting.read",
      },
    ],
  },
  {
    id: "expenses",
    icon: "lucide--receipt",
    label: "Expenses",
    ...soon,
  },
  {
    id: "documents",
    icon: "lucide--files",
    label: "Documents",
    ...soon,
  },

  // -- Group 5: Support & Services ----------------------------------------
  {
    id: "support-label",
    isTitle: true,
    label: "Support & Services",
  },
  {
    id: "ticketing",
    icon: "lucide--life-buoy",
    label: "Ticketing",
    url: "/ticketing",
    permission: "ticketing.read.own",
  },
  {
    id: "assistant",
    icon: "lucide--bot-message-square",
    label: "AI Assistant",
    ...soon,
  },
  {
    // The only module with real routes today, and the one every other module
    // foreign-keys into.
    id: "settings",
    icon: "lucide--settings",
    label: "Settings",
    children: [
      {
        id: "settings-company",
        label: "Company Profile",
        url: "/settings/company",
      },
      {
        id: "settings-locations",
        label: "Locations",
        url: "/settings/locations",
      },
      {
        id: "settings-departments",
        label: "Departments",
        url: "/settings/departments",
      },
      {
        id: "settings-job-titles",
        label: "Job Titles",
        url: "/settings/job-titles",
      },
      {
        id: "settings-benefits",
        label: "Benefits",
        url: "/settings/benefits",
      },
      {
        id: "settings-holidays",
        label: "Holidays",
        url: "/settings/holidays",
      },
      {
        id: "settings-pay-schedules",
        label: "Pay Schedules",
        url: "/settings/payroll/schedules",
      },
      {
        id: "settings-payroll",
        label: "Payroll Policies",
        url: "/settings/payroll/policies",
      },
    ],
  },
]
