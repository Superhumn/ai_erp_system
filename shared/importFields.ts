// Canonical catalogue of the fields each import target accepts.
//
// This is the single source of truth shared by the Import UI (column-mapping
// dropdowns + auto-suggestion) and the server `sheetsImport.importData` handler.
// The `key` values MUST match the column names on the destination Drizzle table
// (see drizzle/schema.ts) so a mapped column actually persists. Keeping the
// list here — with field types — means "what the UI lets you map" always equals
// "what the server writes", instead of silently dropping mismatched columns.

export type ImportModule =
  | "customers"
  | "vendors"
  | "products"
  | "invoices"
  | "employees"
  | "contracts"
  | "projects";

export type ImportFieldType = "string" | "int" | "decimal" | "date" | "boolean" | "enum";

export type ImportFieldDef = {
  /** Canonical column name on the destination table (or a synthetic key the
   *  server maps explicitly, e.g. invoices `amount`). */
  key: string;
  /** Human-readable label shown in the mapping UI. */
  label: string;
  /** Whether a row is rejected when this field is unmapped/empty. */
  required?: boolean;
  /** Value type, used for server-side coercion. Defaults to "string". */
  type?: ImportFieldType;
  /** Allowed values for `type: "enum"` (case-insensitive match). */
  enumValues?: readonly string[];
  /** Lowercased header fragments used to auto-suggest a mapping. */
  aliases?: string[];
};

const ADDRESS_FIELDS: ImportFieldDef[] = [
  { key: "address", label: "Address", aliases: ["street", "address line 1", "address1"] },
  { key: "city", label: "City", aliases: ["town"] },
  { key: "state", label: "State", aliases: ["province", "region"] },
  { key: "country", label: "Country" },
  { key: "postalCode", label: "Postal code", aliases: ["zip", "zip code", "postcode", "postal"] },
];

export const IMPORT_FIELDS: Record<ImportModule, ImportFieldDef[]> = {
  customers: [
    { key: "name", label: "Name", required: true, aliases: ["customer", "customer name", "company", "client", "account"] },
    { key: "email", label: "Email", aliases: ["e-mail", "email address"] },
    { key: "phone", label: "Phone", aliases: ["telephone", "mobile", "cell", "phone number"] },
    ...ADDRESS_FIELDS,
    { key: "type", label: "Type", type: "enum", enumValues: ["individual", "business"] },
    { key: "status", label: "Status", type: "enum", enumValues: ["active", "inactive", "prospect"] },
    { key: "creditLimit", label: "Credit limit", type: "decimal", aliases: ["credit"] },
    { key: "paymentTerms", label: "Payment terms (days)", type: "int", aliases: ["terms", "net", "payment term"] },
    { key: "notes", label: "Notes", aliases: ["note", "comment", "comments"] },
  ],
  vendors: [
    { key: "name", label: "Name", required: true, aliases: ["vendor", "vendor name", "supplier", "company"] },
    { key: "contactName", label: "Contact name", aliases: ["contact", "primary contact", "attention"] },
    { key: "email", label: "Email", aliases: ["e-mail", "email address"] },
    { key: "phone", label: "Phone", aliases: ["telephone", "mobile", "phone number"] },
    ...ADDRESS_FIELDS,
    { key: "type", label: "Type", type: "enum", enumValues: ["supplier", "contractor", "service"] },
    { key: "status", label: "Status", type: "enum", enumValues: ["active", "inactive", "pending"] },
    { key: "paymentTerms", label: "Payment terms (days)", type: "int", aliases: ["terms", "net", "payment term"] },
    { key: "taxId", label: "Tax ID", aliases: ["tax id", "ein", "vat", "vat number"] },
    { key: "bankAccount", label: "Bank account", aliases: ["account number", "bank acct"] },
    { key: "bankRouting", label: "Bank routing", aliases: ["routing", "routing number", "aba"] },
    { key: "defaultLeadTimeDays", label: "Lead time (days)", type: "int", aliases: ["lead time", "lead time days"] },
    { key: "minOrderAmount", label: "Min order amount", type: "decimal", aliases: ["minimum order", "moq amount"] },
    { key: "shippingMethod", label: "Shipping method", aliases: ["ship method", "shipping"] },
    { key: "notes", label: "Notes", aliases: ["note", "comment", "comments"] },
  ],
  products: [
    { key: "name", label: "Name", required: true, aliases: ["product", "product name", "item", "item name", "title"] },
    { key: "sku", label: "SKU", aliases: ["item code", "product code", "code", "part number", "part no"] },
    { key: "description", label: "Description", aliases: ["desc", "details"] },
    { key: "category", label: "Category", aliases: ["group", "grouping"] },
    { key: "type", label: "Type", type: "enum", enumValues: ["physical", "digital", "service"] },
    { key: "manufacturingStage", label: "Manufacturing stage", type: "enum", enumValues: ["raw_material", "semi_finished_good", "finished_product"], aliases: ["stage", "mfg stage"] },
    { key: "unitPrice", label: "Unit price", type: "decimal", aliases: ["price", "sell price", "sale price", "list price"] },
    { key: "costPrice", label: "Cost price", type: "decimal", aliases: ["cost", "buy price", "purchase price"] },
    { key: "currency", label: "Currency", aliases: ["ccy"] },
    { key: "taxable", label: "Taxable", type: "boolean", aliases: ["is taxable"] },
    { key: "taxRate", label: "Tax rate", type: "decimal", aliases: ["tax", "vat rate"] },
    { key: "status", label: "Status", type: "enum", enumValues: ["active", "inactive", "discontinued"] },
  ],
  employees: [
    { key: "firstName", label: "First name", required: true, aliases: ["first name", "given name", "forename"] },
    { key: "lastName", label: "Last name", required: true, aliases: ["last name", "surname", "family name"] },
    { key: "email", label: "Work email", aliases: ["e-mail", "work email", "email address"] },
    { key: "personalEmail", label: "Personal email", aliases: ["personal email", "home email"] },
    { key: "phone", label: "Phone", aliases: ["telephone", "mobile", "phone number"] },
    ...ADDRESS_FIELDS,
    { key: "jobTitle", label: "Job title", aliases: ["title", "job title", "role", "position", "job"] },
    { key: "dateOfBirth", label: "Date of birth", type: "date", aliases: ["dob", "birth date", "birthday"] },
    { key: "hireDate", label: "Hire date", type: "date", aliases: ["hire date", "start date", "joined"] },
    { key: "terminationDate", label: "Termination date", type: "date", aliases: ["term date", "end date", "left"] },
    { key: "employmentType", label: "Employment type", type: "enum", enumValues: ["full_time", "part_time", "contractor", "intern"], aliases: ["employment", "worker type"] },
    { key: "status", label: "Status", type: "enum", enumValues: ["active", "inactive", "on_leave", "terminated"] },
    { key: "salary", label: "Salary", type: "decimal", aliases: ["pay", "compensation", "comp"] },
    { key: "salaryFrequency", label: "Salary frequency", type: "enum", enumValues: ["hourly", "weekly", "biweekly", "monthly", "annual"], aliases: ["pay frequency", "frequency"] },
    { key: "currency", label: "Currency", aliases: ["ccy"] },
    { key: "bankAccount", label: "Bank account", aliases: ["account number", "bank acct"] },
    { key: "bankRouting", label: "Bank routing", aliases: ["routing", "routing number", "aba"] },
    { key: "taxId", label: "Tax ID / SSN", aliases: ["ssn", "tax id", "national id"] },
    { key: "notes", label: "Notes", aliases: ["note", "comment", "comments"] },
  ],
  invoices: [
    { key: "customerId", label: "Customer ID", required: true, type: "int", aliases: ["customer id", "customerid", "customer", "client id"] },
    { key: "amount", label: "Amount", required: true, type: "decimal", aliases: ["total", "total amount", "invoice amount", "value"] },
    { key: "type", label: "Type", type: "enum", enumValues: ["invoice", "credit_note", "quote"] },
    { key: "status", label: "Status", type: "enum", enumValues: ["draft", "sent", "paid", "partial", "overdue", "cancelled"] },
    { key: "dueDate", label: "Due date", type: "date", aliases: ["due", "due date", "payment due"] },
    { key: "taxAmount", label: "Tax amount", type: "decimal", aliases: ["tax", "vat"] },
    { key: "discountAmount", label: "Discount amount", type: "decimal", aliases: ["discount"] },
    { key: "currency", label: "Currency", aliases: ["ccy"] },
    { key: "notes", label: "Notes", aliases: ["note", "memo"] },
    { key: "terms", label: "Terms", aliases: ["payment terms"] },
  ],
  contracts: [
    { key: "title", label: "Title", required: true, aliases: ["name", "contract", "contract name", "agreement"] },
    { key: "type", label: "Type", type: "enum", enumValues: ["customer", "vendor", "employment", "nda", "partnership", "lease", "service", "other"] },
    { key: "status", label: "Status", type: "enum", enumValues: ["draft", "pending_review", "pending_signature", "active", "expired", "terminated", "renewed"] },
    { key: "partyName", label: "Party name", aliases: ["party", "counterparty", "company"] },
    { key: "partyType", label: "Party type", type: "enum", enumValues: ["customer", "vendor", "employee", "other"] },
    { key: "startDate", label: "Start date", type: "date", aliases: ["start", "effective date", "start date"] },
    { key: "endDate", label: "End date", type: "date", aliases: ["end", "expiry", "expiration", "end date"] },
    { key: "renewalDate", label: "Renewal date", type: "date", aliases: ["renewal", "renew date"] },
    { key: "value", label: "Value", type: "decimal", aliases: ["amount", "contract value"] },
    { key: "currency", label: "Currency", aliases: ["ccy"] },
    { key: "description", label: "Description", aliases: ["desc", "details"] },
    { key: "terms", label: "Terms", aliases: ["payment terms"] },
  ],
  projects: [
    { key: "name", label: "Name", required: true, aliases: ["project", "project name", "title"] },
    { key: "description", label: "Description", aliases: ["desc", "details"] },
    { key: "type", label: "Type", type: "enum", enumValues: ["internal", "client", "product", "research", "other"] },
    { key: "status", label: "Status", type: "enum", enumValues: ["planning", "active", "on_hold", "completed", "cancelled"] },
    { key: "priority", label: "Priority", type: "enum", enumValues: ["low", "medium", "high", "critical"] },
    { key: "startDate", label: "Start date", type: "date", aliases: ["start", "start date", "kickoff"] },
    { key: "targetEndDate", label: "Target end date", type: "date", aliases: ["end date", "target date", "deadline", "due"] },
    { key: "budget", label: "Budget", type: "decimal", aliases: ["budgeted"] },
    { key: "actualCost", label: "Actual cost", type: "decimal", aliases: ["cost", "spent"] },
    { key: "currency", label: "Currency", aliases: ["ccy"] },
    { key: "progress", label: "Progress (%)", type: "int", aliases: ["percent complete", "completion"] },
    { key: "notes", label: "Notes", aliases: ["note", "comment", "comments"] },
  ],
};

/** Sentinel value meaning "do not import this column". */
export const IMPORT_SKIP = "";

/**
 * Destination types the Google Drive auto-sync importer can write to. MUST stay
 * in sync with `DRIVE_SUPPORTED_TYPES` in server/routers.ts — these are the
 * options offered when a user confirms/overrides a detected sheet type.
 */
export const DRIVE_IMPORT_TYPES = [
  { value: "vendors", label: "Vendors" },
  { value: "customers", label: "Customers" },
  { value: "products", label: "Products" },
  { value: "employees", label: "Employees" },
  { value: "raw_materials", label: "Raw materials" },
  { value: "crm_contacts", label: "CRM contacts" },
  { value: "crm_deals", label: "CRM deals" },
  { value: "fundraising", label: "Fundraising / investors" },
] as const;

function normalize(s: string): string {
  return s.toLowerCase().replace(/[\s_-]+/g, " ").trim();
}

/**
 * Suggest the best canonical field for a spreadsheet header. Returns the field
 * `key`, or `IMPORT_SKIP` ("") when nothing matches confidently.
 */
export function suggestFieldForHeader(header: string, module: ImportModule): string {
  const h = normalize(header);
  if (!h) return IMPORT_SKIP;
  const fields = IMPORT_FIELDS[module];

  // 1. Exact match on the canonical key (space/underscore-insensitive).
  for (const f of fields) {
    if (normalize(f.key) === h) return f.key;
  }
  // 2. Exact match on a declared alias or the label.
  for (const f of fields) {
    if (normalize(f.label) === h) return f.key;
    if (f.aliases?.some((a) => normalize(a) === h)) return f.key;
  }
  // 3. Substring match against key / label / aliases (header contains term or vice versa).
  for (const f of fields) {
    const terms = [f.key, f.label, ...(f.aliases ?? [])].map(normalize);
    if (terms.some((t) => t.length >= 3 && (h.includes(t) || t.includes(h)))) return f.key;
  }
  return IMPORT_SKIP;
}

/**
 * Build a default header -> field mapping for a freshly-parsed file. Avoids
 * mapping two headers to the same field (first match wins).
 */
export function buildDefaultMapping(headers: string[], module: ImportModule): Record<string, string> {
  const mapping: Record<string, string> = {};
  const used = new Set<string>();
  for (const header of headers) {
    const suggestion = suggestFieldForHeader(header, module);
    if (suggestion && !used.has(suggestion)) {
      mapping[header] = suggestion;
      used.add(suggestion);
    } else {
      mapping[header] = IMPORT_SKIP;
    }
  }
  return mapping;
}

/** Required field keys for a module that are not covered by the mapping. */
export function missingRequiredFields(module: ImportModule, mapping: Record<string, string>): ImportFieldDef[] {
  const mapped = new Set(Object.values(mapping));
  return IMPORT_FIELDS[module].filter((f) => f.required && !mapped.has(f.key));
}

/** Coerce a raw spreadsheet string into the typed value its field expects. */
export function coerceImportValue(raw: string, def: ImportFieldDef): { value?: any; error?: string } {
  const v = (raw ?? "").trim();
  if (v === "") return { value: undefined };
  switch (def.type) {
    case "int": {
      const n = parseInt(v.replace(/[,\s]/g, ""), 10);
      return Number.isNaN(n) ? { error: `"${def.label}" must be a whole number (got "${raw}")` } : { value: n };
    }
    case "decimal": {
      const cleaned = v.replace(/[$,\s]/g, "");
      return Number.isNaN(Number(cleaned)) ? { error: `"${def.label}" must be a number (got "${raw}")` } : { value: cleaned };
    }
    case "date": {
      const d = new Date(v);
      return Number.isNaN(d.getTime()) ? { error: `"${def.label}" is not a valid date (got "${raw}")` } : { value: d };
    }
    case "boolean":
      return { value: /^(1|true|yes|y|t)$/i.test(v) };
    case "enum": {
      const match = def.enumValues?.find((e) => normalize(e) === normalize(v));
      return match ? { value: match } : { error: `"${def.label}" must be one of: ${def.enumValues?.join(", ")} (got "${raw}")` };
    }
    default:
      return { value: v };
  }
}

/**
 * Turn one raw spreadsheet row + column mapping into a typed record ready for
 * the destination table's insert, plus any per-row validation errors. Only
 * fields the user mapped are written; required fields are enforced here.
 */
export function buildImportRecord(
  row: Record<string, string>,
  columnMapping: Record<string, string>,
  module: ImportModule,
): { record: Record<string, any>; errors: string[] } {
  const byKey = new Map(IMPORT_FIELDS[module].map((d) => [d.key, d]));
  const record: Record<string, any> = {};
  const errors: string[] = [];

  for (const [column, fieldKey] of Object.entries(columnMapping)) {
    if (!fieldKey) continue;
    const def = byKey.get(fieldKey);
    if (!def) continue;
    const raw = row[column];
    if (raw === undefined) continue;
    const { value, error } = coerceImportValue(String(raw), def);
    if (error) errors.push(error);
    else if (value !== undefined) record[fieldKey] = value;
  }

  for (const def of IMPORT_FIELDS[module]) {
    if (def.required && (record[def.key] === undefined || record[def.key] === "")) {
      errors.push(`Missing required field: ${def.label}`);
    }
  }

  return { record, errors };
}
