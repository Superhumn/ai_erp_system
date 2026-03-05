import { useState } from "react";
import {
  BookOpen,
  ChevronRight,
  Rocket,
  CalendarCheck,
  ShoppingCart,
  CreditCard,
  Package,
  Factory,
  Building2,
  Truck,
  Mail,
  Ship,
  DollarSign,
  Heart,
  Brain,
  Search,
  ChevronDown,
  CheckCircle2,
  ArrowRight,
  Users,
  FileText,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useLocation } from "wouter";

type SOPSection = {
  id: string;
  title: string;
  icon: React.ElementType;
  audience: string[];
  purpose: string;
  steps: SOPStep[];
};

type SOPStep = {
  title: string;
  details: string[];
  link?: string;
  substeps?: { title: string; details: string[] }[];
};

const sops: SOPSection[] = [
  {
    id: "getting-started",
    title: "Getting Started",
    icon: Rocket,
    audience: ["All Users"],
    purpose: "First-time login and orientation for every user.",
    steps: [
      {
        title: "Receive your invitation",
        details: [
          "An admin sends you a team invitation with your assigned role.",
          "Check your email for the invitation link.",
        ],
      },
      {
        title: "Sign in",
        details: [
          "Navigate to the application URL.",
          "Sign in with your preferred method: Email, Google, Apple, Microsoft, or GitHub.",
        ],
      },
      {
        title: "Review the Dashboard",
        details: [
          "After login you land on the home dashboard.",
          "Review the KPI cards for a snapshot of the business.",
        ],
        link: "/",
      },
      {
        title: "Explore the Sidebar",
        details: [
          "The left sidebar contains all navigation grouped by department.",
          "Groups: Overview, Sales & Finance, CRM, Operations, People & Legal, Projects & Data, Settings.",
        ],
      },
      {
        title: "Try the AI Assistant",
        details: [
          "Press Ctrl+K (or Cmd+K on Mac) to open the AI Command Bar.",
          "Or navigate to the AI Assistant page.",
          "Ask questions about sales, inventory, or any data in the system.",
        ],
        link: "/ai",
      },
      {
        title: "Check Notifications",
        details: [
          "Click the notification bell in the top-right header.",
          "View pending approvals, alerts, and updates.",
        ],
      },
    ],
  },
  {
    id: "daily-operations",
    title: "Daily Operations",
    icon: CalendarCheck,
    audience: ["Ops", "Finance", "Sales", "Admin"],
    purpose: "Daily routine for operations, finance, and sales team members.",
    steps: [
      {
        title: "Morning Check",
        details: [],
        substeps: [
          {
            title: "Review Dashboard KPIs",
            details: ["Open the Dashboard and check for any anomalies in revenue, orders, or inventory."],
          },
          {
            title: "Check Approval Queue",
            details: ["Review pending workflow approvals that need your attention."],
          },
          {
            title: "Review Email Inbox",
            details: ["Check for new inbound emails that need action (invoices, POs, shipping notices)."],
          },
          {
            title: "Check Notifications",
            details: ["Look for alerts on low stock, overdue invoices, or expiring contracts."],
          },
        ],
      },
      {
        title: "Throughout the Day",
        details: [],
        substeps: [
          {
            title: "Process Sales Orders",
            details: ["Manage new and existing orders in the Sales Hub."],
          },
          {
            title: "Review Purchase Orders",
            details: ["Approve or update POs in the Procurement Hub."],
          },
          {
            title: "Monitor Shipments",
            details: ["Track delivery updates for inbound and outbound shipments."],
          },
          {
            title: "Process Invoices & Payments",
            details: ["Create invoices, record payments, and reconcile transactions."],
          },
        ],
      },
      {
        title: "End of Day",
        details: [],
        substeps: [
          {
            title: "Review Autonomous Dashboard",
            details: ["Check for any exceptions or failed AI workflows."],
          },
          {
            title: "Address Exception Log",
            details: ["Resolve any flagged issues before end of day."],
          },
        ],
      },
    ],
  },
  {
    id: "order-to-cash",
    title: "Order-to-Cash Workflow",
    icon: ShoppingCart,
    audience: ["Sales", "Ops", "Finance"],
    purpose: "Complete lifecycle from receiving a customer order to collecting payment.",
    steps: [
      {
        title: "Receive Order",
        details: [
          "Orders arrive via Shopify sync or manual creation in the Sales Hub.",
          "New orders start in 'pending' status.",
        ],
        link: "/sales/hub",
      },
      {
        title: "Confirm & Process",
        details: [
          "Review the order and confirm availability in the Inventory Hub.",
          "Move the order to 'confirmed', then 'processing'.",
          "The system automatically reserves inventory against the order.",
        ],
        link: "/operations/inventory-hub",
      },
      {
        title: "Pick, Pack & Ship",
        details: [
          "Create a shipment record with carrier, tracking number, and expected delivery date.",
          "Upload the bill of lading or packing list.",
          "Update order status to 'shipped'.",
        ],
        link: "/operations/shipments",
      },
      {
        title: "Generate Invoice",
        details: [
          "Create an invoice linked to the order.",
          "Review line items, then move from 'draft' to 'sent'.",
          "Optionally send via email using SendGrid integration.",
        ],
        link: "/finance/invoices",
      },
      {
        title: "Collect Payment",
        details: [
          "When payment is received, record it with the payment method (check, wire, ACH, credit card, etc.).",
          "Invoice updates to 'paid' (or 'partial' if partially paid).",
        ],
        link: "/finance/payments",
      },
      {
        title: "Reconcile",
        details: [
          "Match the payment against the invoice in Transactions.",
          "The order automatically updates to 'delivered' upon shipment confirmation.",
        ],
        link: "/finance/transactions",
      },
    ],
  },
  {
    id: "procure-to-pay",
    title: "Procure-to-Pay Workflow",
    icon: CreditCard,
    audience: ["Ops", "Procurement", "Finance"],
    purpose: "Complete lifecycle from identifying a purchasing need to paying the vendor.",
    steps: [
      {
        title: "Identify Need",
        details: [
          "The AI system flags items below reorder point, or operations staff identifies a need.",
          "Check the Procurement Hub for AI-suggested POs.",
        ],
        link: "/operations/procurement-hub",
      },
      {
        title: "Create Purchase Order",
        details: [
          "Create a PO with vendor, items, quantities, and expected delivery.",
          "PO starts as 'draft'. Review and move to 'sent'.",
        ],
        link: "/operations/purchase-orders",
      },
      {
        title: "Vendor Confirms",
        details: [
          "The vendor confirms via their portal or by email.",
          "PO status moves to 'confirmed'.",
        ],
      },
      {
        title: "Receive Goods",
        details: [
          "Record quantities received against the PO in the Receiving section.",
          "PO status moves to 'partial' (partial shipment) or 'received' (complete).",
          "Inventory automatically updates with received quantities.",
        ],
        link: "/operations/receiving",
      },
      {
        title: "Three-Way Match",
        details: [
          "Match the PO, goods receipt, and vendor invoice.",
          "Import the vendor invoice via Document Import or create manually.",
        ],
        link: "/operations/document-import",
      },
      {
        title: "Pay Vendor",
        details: [
          "Approve the matched invoice for payment.",
          "Record payment and optionally sync to QuickBooks.",
        ],
        link: "/finance/payments",
      },
    ],
  },
  {
    id: "inventory-management",
    title: "Inventory Management",
    icon: Package,
    audience: ["Ops", "Warehouse"],
    purpose: "Maintaining accurate inventory across all locations.",
    steps: [
      {
        title: "Monitor Stock Levels",
        details: [
          "View stock by product and warehouse in the Inventory Hub.",
          "Set reorder points and safety stock levels per product per location.",
          "The system alerts when stock falls below reorder point.",
        ],
        link: "/operations/inventory-hub",
      },
      {
        title: "Process Inventory Adjustments",
        details: [
          "For damaged, expired, or miscounted stock, create an inventory adjustment.",
          "Select the reason (damage, expiration, count correction, etc.) and enter the quantity change.",
          "All adjustments are logged in the audit trail.",
        ],
      },
      {
        title: "Transfer Between Warehouses",
        details: [
          "Create a transfer with source warehouse, destination warehouse, and items/quantities.",
          "Workflow: draft \u2192 pending \u2192 in_transit \u2192 received.",
          "Source inventory is deducted at 'in_transit'. Destination is credited at 'received'.",
        ],
        link: "/operations/transfers",
      },
      {
        title: "Physical Inventory Count",
        details: [
          "Schedule a physical count for a warehouse.",
          "Enter counted quantities per product.",
          "The system calculates variances and generates adjustment transactions.",
        ],
      },
      {
        title: "Lot & Expiration Management",
        details: [
          "Assign lot numbers and expiration dates during receiving.",
          "The system tracks FIFO (first-in, first-out) by expiration date.",
          "Alerts are generated for items approaching expiration.",
        ],
      },
    ],
  },
  {
    id: "manufacturing",
    title: "Manufacturing & Production",
    icon: Factory,
    audience: ["Ops", "Production"],
    purpose: "Managing production from BOM to finished goods.",
    steps: [
      {
        title: "Define Bill of Materials",
        details: [
          "Create a BOM for each finished product.",
          "Add raw material components with quantities per unit.",
          "BOMs support versioning for formula changes.",
        ],
        link: "/operations/bom",
      },
      {
        title: "Create Work Order",
        details: [
          "Create a work order referencing the product and BOM.",
          "Specify planned quantity and target completion date.",
          "Work order starts as 'draft'.",
        ],
        link: "/operations/work-orders",
      },
      {
        title: "Schedule Production",
        details: [
          "Move the work order to 'scheduled'.",
          "Verify raw material availability.",
          "If materials are short, create a purchase order for the missing items.",
        ],
        link: "/operations/raw-materials",
      },
      {
        title: "Start Production",
        details: [
          "From the Manufacturing Hub, click Start on the work order.",
          "Status moves to 'in_progress'.",
          "Raw materials are consumed (deducted from inventory).",
        ],
        link: "/operations/manufacturing-hub",
      },
      {
        title: "Complete Production",
        details: [
          "When the batch is finished, click Complete.",
          "Enter actual output quantity (may differ from planned).",
          "Finished goods are added to inventory.",
        ],
      },
      {
        title: "Track Production Batches",
        details: [
          "Each production run creates a batch record for traceability.",
          "Track batch number, production date, and yield percentage.",
        ],
      },
    ],
  },
  {
    id: "copacker",
    title: "Copacker Portal",
    icon: Building2,
    audience: ["Copacker"],
    purpose: "Guide for copacker partners using the Copacker Portal to report inventory, manage shipments, and upload documents.",
    steps: [
      {
        title: "Access the Portal",
        details: [
          "Sign in with your copacker credentials.",
          "Navigate to the Copacker Portal. You will see three tabs: Inventory, Shipments, and Customs.",
        ],
        link: "/portal/copacker",
      },
      {
        title: "Inventory Reporting",
        details: [
          "Open the Inventory tab to see all products stored at your facility.",
          "Click on any product row to edit the quantity.",
          "Update the current stock level and add a note (e.g., 'Counted 2/5, adjusted for damaged units').",
          "Click Save. The brand owner sees the updated quantity in real time.",
        ],
        substeps: [
          {
            title: "Frequency",
            details: ["Update inventory at least once per week, or after every production run and shipment."],
          },
        ],
      },
      {
        title: "Shipment Management",
        details: [
          "Open the Shipments tab to view all inbound and outbound shipments.",
          "For each shipment, review the carrier, tracking number, and status.",
        ],
        substeps: [
          {
            title: "Upload Documents",
            details: [
              "Click the upload button to attach: Bill of Lading (BOL), packing lists, delivery receipts, and any other shipping documentation.",
            ],
          },
          {
            title: "Frequency",
            details: ["Upload documents within 24 hours of shipment dispatch or receipt."],
          },
        ],
      },
      {
        title: "Customs Documentation (International)",
        details: [
          "Open the Customs tab to view clearances associated with your shipments.",
          "Upload required documents: Commercial Invoice, Packing List, Bill of Lading / Airway Bill, Certificate of Origin, Customs Declaration, Import/Export Licenses, Insurance Certificate, Inspection Certificates, Phytosanitary/Fumigation Certificates (if applicable), Dangerous Goods Declaration (if applicable).",
        ],
        substeps: [
          {
            title: "Frequency",
            details: ["Upload all documents before or at the time of shipment."],
          },
        ],
      },
      {
        title: "Communication",
        details: [
          "If you have questions or issues, use the messaging features or contact the ops team directly.",
          "The brand owner can monitor your inventory and shipment updates through the main system.",
        ],
      },
    ],
  },
  {
    id: "vendor",
    title: "Vendor / Supplier Portal",
    icon: Truck,
    audience: ["Vendor", "Supplier"],
    purpose: "Guide for vendor and supplier partners using the Vendor Portal or Public Supplier Portal.",
    steps: [
      {
        title: "Access Options",
        details: [
          "Option 1 (Registered Vendors): Sign in with your vendor credentials and open the Vendor Portal.",
          "Option 2 (Public Supplier Portal): Use the token-based link provided by the buyer. No login required.",
        ],
        link: "/portal/vendor",
      },
      {
        title: "Purchase Order Management (Registered)",
        details: [
          "Open the Purchase Orders tab to view all POs assigned to you.",
          "Each PO shows: PO number, order date, expected date, items, and total amount.",
          "Confirm a PO: Update status from 'sent' to 'confirmed' to acknowledge the order.",
          "Ship Partial or Full: Update status to 'partial' (multiple deliveries) or 'received' (full receipt).",
          "Upload documents: Attach invoices, shipping confirmations, or other documents to each PO.",
        ],
      },
      {
        title: "Shipment Tracking (Registered)",
        details: [
          "Open the Shipments tab to view shipments linked to your POs.",
          "Upload shipping documents (BOL, packing lists, delivery confirmations).",
          "Track status updates from the buyer.",
        ],
      },
      {
        title: "Customs Documentation (Registered)",
        details: [
          "Open the Customs tab.",
          "Upload all export-side customs documents (Commercial Invoice, Packing List, Bill of Lading, Certificate of Origin, Customs Declaration, etc.).",
        ],
      },
      {
        title: "Public Supplier Portal (Token Access)",
        details: [
          "Open the link provided by the buyer.",
          "Upload export documents: Commercial Invoice, Packing List, Dimensions & Weight, HS Codes, Certificate of Origin, MSDS/SDS, Bill of Lading, Customs Declaration.",
          "Configure freight info: Package dimensions, weight, volume, preferred shipping, dangerous goods info, Incoterms (FOB, CIF, EXW, etc.).",
          "Submit. The buyer receives all uploaded documents and freight data automatically.",
        ],
      },
    ],
  },
  {
    id: "email-document",
    title: "Email & Document Processing",
    icon: Mail,
    audience: ["Ops", "Finance", "Admin"],
    purpose: "Processing inbound emails and importing documents with OCR.",
    steps: [
      {
        title: "Email Inbox",
        details: [
          "Navigate to the Email Inbox. The system automatically scans the configured IMAP mailbox.",
          "Each email is auto-categorized: receipt, PO, invoice, shipping notice, freight quote, or general.",
        ],
        link: "/operations/email-inbox",
        substeps: [
          {
            title: "Take Action on Emails",
            details: [
              "Invoices/Receipts: Click to import and create a transaction or invoice record.",
              "POs: Review and link to existing purchase orders.",
              "Shipping Notices: Update shipment records with tracking info.",
            ],
          },
          {
            title: "Configure Auto-Reply Rules",
            details: ["Set up rules to automatically respond to common email types."],
          },
        ],
      },
      {
        title: "Document Import (OCR)",
        details: [
          "Navigate to Document Import and upload a PDF (invoice, PO, receipt, or other document).",
          "The system detects whether the PDF is text-based or scanned.",
          "Text PDFs are parsed directly. Scanned PDFs are processed through vision-based OCR.",
          "Review extracted data: vendor name, document type, date, total amount, and line items.",
          "The system matches vendors and products to existing records.",
          "Confirm the data and the system creates the corresponding record (invoice, PO, or transaction).",
        ],
        link: "/operations/document-import",
        substeps: [
          {
            title: "Confidence Scoring",
            details: ["Low-confidence extractions should be manually verified before confirming."],
          },
        ],
      },
    ],
  },
  {
    id: "freight",
    title: "Freight & Logistics",
    icon: Ship,
    audience: ["Ops", "Logistics"],
    purpose: "Managing freight quotes, bookings, and international shipments.",
    steps: [
      {
        title: "Create Freight RFQ",
        details: [
          "Navigate to the Logistics Hub.",
          "Create a Request for Quote specifying: origin, destination, cargo details, and required dates.",
        ],
        link: "/operations/logistics-hub",
      },
      {
        title: "Receive & Compare Quotes",
        details: [
          "Carriers respond with quotes (price, transit time, service level).",
          "Compare quotes side-by-side in the freight dashboard.",
        ],
      },
      {
        title: "Book Shipment",
        details: [
          "Select the winning quote and create a booking.",
          "The system generates the shipment record with carrier details.",
        ],
      },
      {
        title: "Track Shipment",
        details: [
          "Monitor status: pending \u2192 in_transit \u2192 delivered.",
          "View tracking updates and carrier notifications.",
        ],
        link: "/operations/shipments",
      },
      {
        title: "Customs Clearance (International)",
        details: [
          "For international shipments, create a customs clearance record.",
          "Upload all required customs documents.",
          "Track customs status through clearance.",
        ],
        link: "/freight/customs",
      },
    ],
  },
  {
    id: "finance",
    title: "Finance & Invoicing",
    icon: DollarSign,
    audience: ["Finance", "Admin"],
    purpose: "Day-to-day financial operations: invoicing, payments, journal entries, and QuickBooks sync.",
    steps: [
      {
        title: "Create Invoices",
        details: [
          "Navigate to Invoices and click New Invoice.",
          "Select the customer, add line items (product, quantity, price), and set payment terms.",
          "Save as 'draft', review, then move to 'sent'.",
          "Optionally email the invoice via SendGrid.",
        ],
        link: "/finance/invoices",
      },
      {
        title: "Record Payments",
        details: [
          "When payment is received, navigate to Payments.",
          "Select the invoice being paid, enter the amount and payment method.",
          "Partial payment moves the invoice to 'partial'. Full payment moves it to 'paid'.",
        ],
        link: "/finance/payments",
      },
      {
        title: "Journal Entries",
        details: [
          "Navigate to Transactions to create manual journal entries.",
          "Add debit and credit lines ensuring the entry balances.",
          "Post the entry. It appears in the general ledger immediately.",
        ],
        link: "/finance/transactions",
      },
      {
        title: "Recurring Invoices",
        details: [
          "Set up recurring invoice templates for subscription or regular billing.",
          "Configure frequency, start date, and template.",
          "The system auto-generates invoices on schedule.",
        ],
      },
      {
        title: "QuickBooks Sync",
        details: [
          "Connect QuickBooks from Integrations settings.",
          "Sync customers, vendors, invoices, and chart of accounts.",
          "Changes in either system can be synced bi-directionally.",
        ],
        link: "/settings/integrations",
      },
    ],
  },
  {
    id: "crm-fundraising",
    title: "CRM & Fundraising",
    icon: Heart,
    audience: ["Exec", "Sales", "Admin"],
    purpose: "Managing investor relationships and fundraising campaigns.",
    steps: [
      {
        title: "Add Investors",
        details: [
          "Navigate to Investors and add profiles with contact details, investment history, and notes.",
        ],
        link: "/crm/investors",
      },
      {
        title: "Create Campaigns",
        details: [
          "Create fundraising campaigns for each round: Pre-Seed, Seed, Series A/B/C, Bridge.",
        ],
        link: "/crm/campaigns",
      },
      {
        title: "Track Communications",
        details: [
          "Log every interaction (email, WhatsApp, phone call, meeting) with each investor.",
        ],
      },
      {
        title: "Manage Investments",
        details: [
          "Record commitments, amounts, and terms per investor per campaign.",
        ],
      },
      {
        title: "Cap Table",
        details: [
          "View and manage ownership snapshots over time.",
        ],
      },
      {
        title: "Data Rooms",
        details: [
          "Create secure data rooms for investor due diligence.",
          "Upload documents, set permissions, and share via link.",
        ],
        link: "/datarooms",
      },
      {
        title: "Follow-Up Reminders",
        details: [
          "Set reminders for follow-up calls, emails, or meetings.",
        ],
      },
    ],
  },
  {
    id: "ai-workflows",
    title: "AI Autonomous Workflows",
    icon: Brain,
    audience: ["Admin", "Ops"],
    purpose: "Leveraging AI automation for supply chain and business operations.",
    steps: [
      {
        title: "Review the Autonomous Dashboard",
        details: [
          "View active workflows, recent runs, and performance metrics.",
        ],
        link: "/autonomous-dashboard",
      },
      {
        title: "Workflow Types",
        details: [
          "Demand Forecast: AI analyzes historical sales and predicts future demand.",
          "Auto-Reorder: When stock hits reorder point, AI drafts a PO for approval.",
          "Production Planning: AI suggests production schedules based on demand and inventory.",
          "Freight Optimization: AI selects optimal carrier based on cost and transit time.",
        ],
      },
      {
        title: "Approval Process",
        details: [
          "Workflows exceeding configured thresholds (e.g., PO value > $5,000) go to the Approval Queue.",
          "Reviewers can approve, reject, or modify the AI's recommendation.",
          "Below-threshold actions execute automatically.",
        ],
        link: "/ai/approvals",
      },
      {
        title: "Exception Handling",
        details: [
          "When a workflow encounters an error or anomaly, it logs an exception.",
          "Review exceptions daily and take corrective action.",
          "Configure exception rules to define automatic escalation paths.",
        ],
        link: "/exceptions",
      },
      {
        title: "Monitoring & Tuning",
        details: [
          "Track AI decision confidence scores.",
          "Review autonomous decision logs for audit compliance.",
          "Adjust thresholds and rules as business needs evolve.",
        ],
      },
    ],
  },
];

const audienceColors: Record<string, string> = {
  "All Users": "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
  "Admin": "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  "Finance": "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  "Ops": "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  "Sales": "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
  "Procurement": "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400",
  "Logistics": "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400",
  "Warehouse": "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  "Production": "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
  "Exec": "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  "Copacker": "bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400",
  "Vendor": "bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400",
  "Supplier": "bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400",
};

function SOPCard({
  sop,
  index,
  isExpanded,
  onToggle,
}: {
  sop: SOPSection;
  index: number;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const [, setLocation] = useLocation();
  const Icon = sop.icon;

  return (
    <Card className={`transition-all duration-200 ${isExpanded ? "ring-1 ring-primary/20" : "hover:shadow-md"}`}>
      <button
        onClick={onToggle}
        className="w-full text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-t-lg"
      >
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${isExpanded ? "bg-primary text-primary-foreground" : "bg-primary/10 text-primary"}`}>
                <Icon className="h-5 w-5" />
              </div>
              <div>
                <CardTitle className="text-base font-semibold">
                  SOP {index + 1}: {sop.title}
                </CardTitle>
                <p className="text-sm text-muted-foreground mt-1">{sop.purpose}</p>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {sop.audience.map((a) => (
                    <Badge
                      key={a}
                      variant="secondary"
                      className={`text-[11px] font-medium ${audienceColors[a] || "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300"}`}
                    >
                      {a}
                    </Badge>
                  ))}
                </div>
              </div>
            </div>
            <ChevronDown
              className={`h-5 w-5 text-muted-foreground transition-transform duration-200 shrink-0 mt-1 ${isExpanded ? "rotate-180" : ""}`}
            />
          </div>
        </CardHeader>
      </button>

      {isExpanded && (
        <CardContent className="pt-0">
          <div className="border-t pt-4">
            <ol className="space-y-4">
              {sop.steps.map((step, stepIdx) => (
                <li key={stepIdx} className="relative">
                  <div className="flex gap-3">
                    <div className="flex flex-col items-center">
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-bold">
                        {stepIdx + 1}
                      </div>
                      {stepIdx < sop.steps.length - 1 && (
                        <div className="w-px flex-1 bg-border mt-1" />
                      )}
                    </div>
                    <div className="flex-1 pb-4">
                      <div className="flex items-center gap-2 mb-1.5">
                        <h4 className="font-medium text-sm">{step.title}</h4>
                        {step.link && (
                          <button
                            onClick={() => setLocation(step.link!)}
                            className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                          >
                            Open <ArrowRight className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                      {step.details.length > 0 && (
                        <ul className="space-y-1">
                          {step.details.map((detail, dIdx) => (
                            <li
                              key={dIdx}
                              className="flex gap-2 text-sm text-muted-foreground"
                            >
                              <CheckCircle2 className="h-4 w-4 shrink-0 text-primary/40 mt-0.5" />
                              <span>{detail}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                      {step.substeps && step.substeps.length > 0 && (
                        <div className="mt-2 ml-1 space-y-2">
                          {step.substeps.map((sub, sIdx) => (
                            <div
                              key={sIdx}
                              className="border-l-2 border-primary/20 pl-3"
                            >
                              <p className="text-sm font-medium text-foreground/80">
                                {sub.title}
                              </p>
                              <ul className="mt-1 space-y-0.5">
                                {sub.details.map((d, ddIdx) => (
                                  <li
                                    key={ddIdx}
                                    className="flex gap-2 text-sm text-muted-foreground"
                                  >
                                    <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/50 mt-0.5" />
                                    <span>{d}</span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </CardContent>
      )}
    </Card>
  );
}

export default function SOPs() {
  const [search, setSearch] = useState("");
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<string | null>(null);

  const allAudiences = Array.from(
    new Set(sops.flatMap((s) => s.audience))
  ).sort();

  const filtered = sops.filter((sop) => {
    const matchesSearch =
      !search ||
      sop.title.toLowerCase().includes(search.toLowerCase()) ||
      sop.purpose.toLowerCase().includes(search.toLowerCase()) ||
      sop.steps.some(
        (s) =>
          s.title.toLowerCase().includes(search.toLowerCase()) ||
          s.details.some((d) => d.toLowerCase().includes(search.toLowerCase()))
      );
    const matchesFilter = !filter || sop.audience.includes(filter);
    return matchesSearch && matchesFilter;
  });

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const expandAll = () => {
    setExpandedIds(new Set(filtered.map((s) => s.id)));
  };

  const collapseAll = () => {
    setExpandedIds(new Set());
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <BookOpen className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">
              Standard Operating Procedures
            </h1>
            <p className="text-muted-foreground mt-1">
              Step-by-step guides for every workflow in the system. Select an SOP to view detailed instructions.
            </p>
          </div>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid gap-3 grid-cols-2 sm:grid-cols-4">
        <Card className="p-4">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-muted-foreground" />
            <span className="text-2xl font-bold">{sops.length}</span>
          </div>
          <p className="text-xs text-muted-foreground mt-1">Total SOPs</p>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-muted-foreground" />
            <span className="text-2xl font-bold">{allAudiences.length}</span>
          </div>
          <p className="text-xs text-muted-foreground mt-1">Role Groups</p>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2">
            <Building2 className="h-4 w-4 text-teal-500" />
            <span className="text-2xl font-bold">1</span>
          </div>
          <p className="text-xs text-muted-foreground mt-1">Copacker SOP</p>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2">
            <Truck className="h-4 w-4 text-sky-500" />
            <span className="text-2xl font-bold">1</span>
          </div>
          <p className="text-xs text-muted-foreground mt-1">Vendor SOP</p>
        </Card>
      </div>

      {/* Search & Filter Bar */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search SOPs by title, step, or keyword..."
            className="pl-9"
          />
        </div>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => setFilter(null)}
            className={`inline-flex items-center px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              !filter
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:text-foreground"
            }`}
          >
            All
          </button>
          {allAudiences.map((a) => (
            <button
              key={a}
              onClick={() => setFilter(filter === a ? null : a)}
              className={`inline-flex items-center px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                filter === a
                  ? "bg-primary text-primary-foreground"
                  : `${audienceColors[a] || "bg-muted text-muted-foreground"} hover:opacity-80`
              }`}
            >
              {a}
            </button>
          ))}
        </div>
      </div>

      {/* Expand / Collapse controls */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {filtered.length} of {sops.length} SOPs
          {filter ? ` for ${filter}` : ""}
          {search ? ` matching "${search}"` : ""}
        </p>
        <div className="flex gap-2">
          <button
            onClick={expandAll}
            className="text-xs text-primary hover:underline"
          >
            Expand all
          </button>
          <span className="text-muted-foreground">|</span>
          <button
            onClick={collapseAll}
            className="text-xs text-primary hover:underline"
          >
            Collapse all
          </button>
        </div>
      </div>

      {/* SOP List */}
      <div className="space-y-3">
        {filtered.map((sop, idx) => (
          <SOPCard
            key={sop.id}
            sop={sop}
            index={sops.indexOf(sop)}
            isExpanded={expandedIds.has(sop.id)}
            onToggle={() => toggleExpand(sop.id)}
          />
        ))}
        {filtered.length === 0 && (
          <Card className="p-12">
            <div className="flex flex-col items-center text-center gap-3">
              <Search className="h-10 w-10 text-muted-foreground/30" />
              <div>
                <p className="font-medium">No SOPs found</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Try adjusting your search or filter.
                </p>
              </div>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
