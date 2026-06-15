// Canonical catalogue of the fields each import target accepts.
//
// This is the single source of truth shared by the Import UI (column-mapping
// dropdowns + auto-suggestion) and the server `sheetsImport.importData` handler.
// The `key` values MUST match the field names the server reads off `mappedData`
// in server/routers.ts (the `importData` mutation). Keeping them here prevents
// the silent misfiling that happens when a spreadsheet header is naively
// snake_cased (e.g. "Customer Name" -> "customer_name") and no longer matches
// the field the server expects ("name").

export type ImportModule =
  | "customers"
  | "vendors"
  | "products"
  | "invoices"
  | "employees"
  | "contracts"
  | "projects";

export type ImportFieldDef = {
  /** Canonical ERP field name the server consumes. */
  key: string;
  /** Human-readable label shown in the mapping UI. */
  label: string;
  /** Whether a row is rejected when this field is unmapped/empty. */
  required?: boolean;
  /** Lowercased header fragments used to auto-suggest a mapping. */
  aliases?: string[];
};

export const IMPORT_FIELDS: Record<ImportModule, ImportFieldDef[]> = {
  customers: [
    { key: "name", label: "Name", required: true, aliases: ["customer", "customer name", "company", "client", "account"] },
    { key: "email", label: "Email", aliases: ["e-mail", "email address"] },
    { key: "phone", label: "Phone", aliases: ["telephone", "mobile", "cell", "phone number"] },
    { key: "address", label: "Address", aliases: ["street", "address line 1", "address1"] },
    { key: "city", label: "City", aliases: ["town"] },
    { key: "state", label: "State", aliases: ["province", "region"] },
    { key: "country", label: "Country" },
    { key: "postalCode", label: "Postal code", aliases: ["zip", "zip code", "postcode", "postal"] },
    { key: "notes", label: "Notes", aliases: ["note", "comment", "comments"] },
  ],
  vendors: [
    { key: "name", label: "Name", required: true, aliases: ["vendor", "vendor name", "supplier", "company"] },
    { key: "email", label: "Email", aliases: ["e-mail", "email address"] },
    { key: "phone", label: "Phone", aliases: ["telephone", "mobile", "phone number"] },
    { key: "address", label: "Address", aliases: ["street", "address line 1", "address1"] },
    { key: "city", label: "City", aliases: ["town"] },
    { key: "state", label: "State", aliases: ["province", "region"] },
    { key: "country", label: "Country" },
    { key: "postalCode", label: "Postal code", aliases: ["zip", "zip code", "postcode", "postal"] },
    { key: "paymentTerms", label: "Payment terms (days)", aliases: ["terms", "net", "payment term"] },
    { key: "notes", label: "Notes", aliases: ["note", "comment", "comments"] },
  ],
  products: [
    { key: "name", label: "Name", required: true, aliases: ["product", "product name", "item", "item name", "title"] },
    { key: "sku", label: "SKU", aliases: ["item code", "product code", "code", "part number", "part no"] },
    { key: "unitPrice", label: "Unit price", aliases: ["price", "sell price", "sale price", "list price", "unit cost"] },
    { key: "description", label: "Description", aliases: ["desc", "details"] },
    { key: "category", label: "Category", aliases: ["type", "group"] },
    { key: "costPrice", label: "Cost price", aliases: ["cost", "buy price", "purchase price"] },
  ],
  employees: [
    { key: "firstName", label: "First name", required: true, aliases: ["first name", "given name", "forename"] },
    { key: "lastName", label: "Last name", required: true, aliases: ["last name", "surname", "family name"] },
    { key: "email", label: "Email", aliases: ["e-mail", "work email", "email address"] },
    { key: "phone", label: "Phone", aliases: ["telephone", "mobile", "phone number"] },
    { key: "title", label: "Job title", aliases: ["role", "position", "job"] },
    { key: "department", label: "Department", aliases: ["dept", "team"] },
  ],
  invoices: [
    { key: "customerId", label: "Customer ID", required: true, aliases: ["customer id", "customerid", "customer", "client id"] },
    { key: "amount", label: "Amount", required: true, aliases: ["total", "total amount", "invoice amount", "value"] },
    { key: "dueDate", label: "Due date", aliases: ["due", "due date", "payment due"] },
  ],
  contracts: [
    { key: "title", label: "Title", required: true, aliases: ["name", "contract", "contract name", "agreement"] },
    { key: "type", label: "Type", aliases: ["category", "contract type"] },
  ],
  projects: [
    { key: "name", label: "Name", required: true, aliases: ["project", "project name", "title"] },
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
