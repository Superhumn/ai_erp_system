/**
 * Legal Document Template Service
 * Handles importing templates from Google Docs, extracting variables,
 * and rendering documents with variable substitution.
 */

import { getGoogleDoc } from "./_core/googleWorkspace";

// Variable pattern: {{variable_name}} or {{Variable Name}}
const VARIABLE_PATTERN = /\{\{([^}]+)\}\}/g;

export interface TemplateVariable {
  key: string;
  label: string;
  type: "text" | "date" | "currency" | "number" | "email" | "select";
  required: boolean;
  defaultValue?: string;
  description?: string;
  options?: string[]; // For select type
}

/**
 * Extract plain text from Google Docs API body structure
 */
function extractTextFromDocBody(body: any): string {
  if (!body?.content) return "";

  let text = "";
  for (const element of body.content) {
    if (element.paragraph) {
      for (const elem of element.paragraph.elements || []) {
        if (elem.textRun?.content) {
          text += elem.textRun.content;
        }
      }
    } else if (element.table) {
      for (const row of element.table.tableRows || []) {
        for (const cell of row.tableCells || []) {
          text += extractTextFromDocBody(cell);
          text += "\t";
        }
        text += "\n";
      }
    }
  }
  return text;
}

/**
 * Import a template from Google Docs by document ID.
 * Extracts the document content and discovers {{variable}} placeholders.
 */
export async function importTemplateFromGoogleDoc(
  accessToken: string,
  googleDocId: string
): Promise<{
  success: boolean;
  title?: string;
  content?: string;
  variables?: TemplateVariable[];
  googleDocUrl?: string;
  error?: string;
}> {
  const result = await getGoogleDoc(accessToken, googleDocId);
  if (!result.success || !result.document) {
    return { success: false, error: result.error || "Failed to fetch Google Doc" };
  }

  const doc = result.document;
  const content = extractTextFromDocBody(doc.body);
  const variables = extractVariables(content);

  return {
    success: true,
    title: doc.title,
    content,
    variables,
    googleDocUrl: `https://docs.google.com/document/d/${googleDocId}/edit`,
  };
}

/**
 * Re-sync a template from its linked Google Doc
 */
export async function syncTemplateFromGoogleDoc(
  accessToken: string,
  googleDocId: string
): Promise<{
  success: boolean;
  content?: string;
  variables?: TemplateVariable[];
  error?: string;
}> {
  const result = await getGoogleDoc(accessToken, googleDocId);
  if (!result.success || !result.document) {
    return { success: false, error: result.error || "Failed to sync Google Doc" };
  }

  const content = extractTextFromDocBody(result.document.body);
  const variables = extractVariables(content);

  return { success: true, content, variables };
}

/**
 * Extract variable placeholders from template content.
 * Converts {{variable_name}} patterns into structured variable definitions.
 */
export function extractVariables(content: string): TemplateVariable[] {
  const matches = new Set<string>();
  let match;

  while ((match = VARIABLE_PATTERN.exec(content)) !== null) {
    matches.add(match[1].trim());
  }

  return Array.from(matches).map((raw) => {
    const key = raw
      .toLowerCase()
      .replace(/\s+/g, "_")
      .replace(/[^a-z0-9_]/g, "");
    const label = raw.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());

    // Infer type from variable name
    let type: TemplateVariable["type"] = "text";
    if (/date|start|end|effective/i.test(raw)) type = "date";
    else if (/salary|compensation|amount|price|value|pay/i.test(raw)) type = "currency";
    else if (/email/i.test(raw)) type = "email";
    else if (/number|count|quantity|years|days/i.test(raw)) type = "number";

    return {
      key,
      label,
      type,
      required: true,
      description: `Value for "${raw}"`,
    };
  });
}

/**
 * Render a template by replacing all {{variable}} placeholders with provided values.
 */
export function renderTemplate(
  content: string,
  variables: Record<string, string>
): string {
  return content.replace(VARIABLE_PATTERN, (fullMatch, varName) => {
    const key = varName
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "_")
      .replace(/[^a-z0-9_]/g, "");
    return variables[key] ?? fullMatch;
  });
}

/**
 * Built-in template definitions for common legal documents.
 * These can be used when no Google Docs source is available.
 */
export const BUILT_IN_TEMPLATES = {
  offer_letter: {
    name: "Offer Letter",
    category: "offer_letter" as const,
    description: "Standard employment offer letter with compensation details",
    content: `{{Company Name}}
{{Company Address}}

{{Current Date}}

Dear {{Candidate Name}},

We are pleased to extend an offer of employment for the position of {{Job Title}} at {{Company Name}}. We believe your skills and experience are an excellent match for our team.

Position Details:
- Title: {{Job Title}}
- Department: {{Department}}
- Reporting To: {{Manager Name}}
- Start Date: {{Start Date}}
- Employment Type: {{Employment Type}}
- Work Location: {{Work Location}}

Compensation:
- Base Salary: {{Base Salary}} per {{Salary Frequency}}
- Equity: {{Equity Grant}}
- Signing Bonus: {{Signing Bonus}}

Benefits:
You will be eligible for our standard benefits package, which includes health insurance, dental and vision coverage, 401(k) with company match, and {{PTO Days}} days of paid time off per year.

This offer is contingent upon:
- Successful completion of a background check
- Verification of your eligibility to work in {{Country}}
- Execution of our standard {{Confidentiality Agreement Type}} agreement

Please confirm your acceptance of this offer by signing below and returning this letter by {{Offer Expiry Date}}.

We are excited about the possibility of you joining our team!

Sincerely,

___________________________
{{Hiring Manager Name}}
{{Hiring Manager Title}}
{{Company Name}}

ACCEPTED AND AGREED:

___________________________
{{Candidate Name}}
Date: _______________`,
    variables: [
      { key: "company_name", label: "Company Name", type: "text" as const, required: true },
      { key: "company_address", label: "Company Address", type: "text" as const, required: true },
      { key: "current_date", label: "Current Date", type: "date" as const, required: true },
      { key: "candidate_name", label: "Candidate Name", type: "text" as const, required: true },
      { key: "job_title", label: "Job Title", type: "text" as const, required: true },
      { key: "department", label: "Department", type: "text" as const, required: true },
      { key: "manager_name", label: "Manager Name", type: "text" as const, required: true },
      { key: "start_date", label: "Start Date", type: "date" as const, required: true },
      { key: "employment_type", label: "Employment Type", type: "text" as const, required: true, defaultValue: "Full-time" },
      { key: "work_location", label: "Work Location", type: "text" as const, required: true },
      { key: "base_salary", label: "Base Salary", type: "currency" as const, required: true },
      { key: "salary_frequency", label: "Salary Frequency", type: "text" as const, required: true, defaultValue: "year" },
      { key: "equity_grant", label: "Equity Grant", type: "text" as const, required: false },
      { key: "signing_bonus", label: "Signing Bonus", type: "currency" as const, required: false },
      { key: "pto_days", label: "PTO Days", type: "number" as const, required: true, defaultValue: "20" },
      { key: "country", label: "Country", type: "text" as const, required: true, defaultValue: "the United States" },
      { key: "confidentiality_agreement_type", label: "Confidentiality Agreement Type", type: "text" as const, required: true, defaultValue: "PIIA" },
      { key: "offer_expiry_date", label: "Offer Expiry Date", type: "date" as const, required: true },
      { key: "hiring_manager_name", label: "Hiring Manager Name", type: "text" as const, required: true },
      { key: "hiring_manager_title", label: "Hiring Manager Title", type: "text" as const, required: true },
    ],
  },
  nda: {
    name: "Non-Disclosure Agreement (Mutual)",
    category: "nda" as const,
    description: "Mutual NDA for protecting confidential information between two parties",
    content: `MUTUAL NON-DISCLOSURE AGREEMENT

This Mutual Non-Disclosure Agreement ("Agreement") is entered into as of {{Effective Date}} ("Effective Date") by and between:

{{Company Name}}, a {{Company Entity Type}} organized under the laws of {{Company Jurisdiction}}, with its principal place of business at {{Company Address}} ("Company"),

and

{{Counterparty Name}}, a {{Counterparty Entity Type}} organized under the laws of {{Counterparty Jurisdiction}}, with its principal place of business at {{Counterparty Address}} ("Counterparty").

(each a "Party" and collectively the "Parties")

1. PURPOSE
The Parties wish to explore a potential business relationship concerning {{Purpose}} (the "Purpose") and, in connection therewith, may disclose to each other certain confidential and proprietary information.

2. DEFINITION OF CONFIDENTIAL INFORMATION
"Confidential Information" means any non-public, proprietary, or confidential information disclosed by either Party to the other Party, whether orally, in writing, electronically, or by any other means, including but not limited to business plans, financial data, technical specifications, customer lists, trade secrets, and any other information identified as confidential.

3. OBLIGATIONS
Each Party agrees to:
(a) Hold the other Party's Confidential Information in strict confidence;
(b) Not disclose Confidential Information to any third party without prior written consent;
(c) Use Confidential Information solely for the Purpose;
(d) Limit access to Confidential Information to employees and advisors who have a need to know.

4. TERM
This Agreement shall remain in effect for {{Term Duration}} from the Effective Date. The confidentiality obligations shall survive termination for a period of {{Survival Period}}.

5. GOVERNING LAW
This Agreement shall be governed by and construed in accordance with the laws of {{Governing Law Jurisdiction}}.

IN WITNESS WHEREOF, the Parties have executed this Agreement as of the date first written above.

{{Company Name}}                          {{Counterparty Name}}

By: ___________________________          By: ___________________________
Name: {{Company Signatory Name}}         Name: {{Counterparty Signatory Name}}
Title: {{Company Signatory Title}}       Title: {{Counterparty Signatory Title}}
Date: _______________                    Date: _______________`,
    variables: [
      { key: "effective_date", label: "Effective Date", type: "date" as const, required: true },
      { key: "company_name", label: "Company Name", type: "text" as const, required: true },
      { key: "company_entity_type", label: "Company Entity Type", type: "text" as const, required: true, defaultValue: "corporation" },
      { key: "company_jurisdiction", label: "Company Jurisdiction", type: "text" as const, required: true },
      { key: "company_address", label: "Company Address", type: "text" as const, required: true },
      { key: "counterparty_name", label: "Counterparty Name", type: "text" as const, required: true },
      { key: "counterparty_entity_type", label: "Counterparty Entity Type", type: "text" as const, required: true },
      { key: "counterparty_jurisdiction", label: "Counterparty Jurisdiction", type: "text" as const, required: true },
      { key: "counterparty_address", label: "Counterparty Address", type: "text" as const, required: true },
      { key: "purpose", label: "Purpose", type: "text" as const, required: true },
      { key: "term_duration", label: "Term Duration", type: "text" as const, required: true, defaultValue: "two (2) years" },
      { key: "survival_period", label: "Survival Period", type: "text" as const, required: true, defaultValue: "three (3) years" },
      { key: "governing_law_jurisdiction", label: "Governing Law Jurisdiction", type: "text" as const, required: true },
      { key: "company_signatory_name", label: "Company Signatory Name", type: "text" as const, required: true },
      { key: "company_signatory_title", label: "Company Signatory Title", type: "text" as const, required: true },
      { key: "counterparty_signatory_name", label: "Counterparty Signatory Name", type: "text" as const, required: true },
      { key: "counterparty_signatory_title", label: "Counterparty Signatory Title", type: "text" as const, required: true },
    ],
  },
  contractor_agreement: {
    name: "Independent Contractor Agreement",
    category: "contractor_agreement" as const,
    description: "Standard agreement for engaging independent contractors",
    content: `INDEPENDENT CONTRACTOR AGREEMENT

This Independent Contractor Agreement ("Agreement") is entered into as of {{Effective Date}} by and between:

{{Company Name}} ("Company")
{{Company Address}}

and

{{Contractor Name}} ("Contractor")
{{Contractor Address}}

1. SERVICES
Contractor agrees to perform the following services: {{Scope of Work}}

2. TERM
This Agreement shall commence on {{Start Date}} and continue until {{End Date}}, unless terminated earlier in accordance with this Agreement.

3. COMPENSATION
Company shall pay Contractor {{Payment Amount}} {{Payment Frequency}} for services rendered. Payment shall be made within {{Payment Terms}} of receiving a valid invoice.

4. INDEPENDENT CONTRACTOR STATUS
Contractor is an independent contractor and not an employee of Company. Contractor shall be responsible for all taxes, insurance, and other obligations.

5. INTELLECTUAL PROPERTY
All work product created by Contractor in connection with the Services shall be the exclusive property of Company.

6. CONFIDENTIALITY
Contractor agrees to maintain the confidentiality of all Company proprietary information during and after the term of this Agreement.

7. TERMINATION
Either party may terminate this Agreement with {{Notice Period}} written notice. Company may terminate immediately for cause.

8. GOVERNING LAW
This Agreement shall be governed by the laws of {{Governing Law Jurisdiction}}.

{{Company Name}}                          {{Contractor Name}}

By: ___________________________          By: ___________________________
Name: {{Company Signatory Name}}         Name: {{Contractor Name}}
Title: {{Company Signatory Title}}       Date: _______________
Date: _______________`,
    variables: [
      { key: "effective_date", label: "Effective Date", type: "date" as const, required: true },
      { key: "company_name", label: "Company Name", type: "text" as const, required: true },
      { key: "company_address", label: "Company Address", type: "text" as const, required: true },
      { key: "contractor_name", label: "Contractor Name", type: "text" as const, required: true },
      { key: "contractor_address", label: "Contractor Address", type: "text" as const, required: true },
      { key: "scope_of_work", label: "Scope of Work", type: "text" as const, required: true },
      { key: "start_date", label: "Start Date", type: "date" as const, required: true },
      { key: "end_date", label: "End Date", type: "date" as const, required: true },
      { key: "payment_amount", label: "Payment Amount", type: "currency" as const, required: true },
      { key: "payment_frequency", label: "Payment Frequency", type: "text" as const, required: true, defaultValue: "monthly" },
      { key: "payment_terms", label: "Payment Terms", type: "text" as const, required: true, defaultValue: "30 days" },
      { key: "notice_period", label: "Notice Period", type: "text" as const, required: true, defaultValue: "30 days" },
      { key: "governing_law_jurisdiction", label: "Governing Law Jurisdiction", type: "text" as const, required: true },
      { key: "company_signatory_name", label: "Company Signatory Name", type: "text" as const, required: true },
      { key: "company_signatory_title", label: "Company Signatory Title", type: "text" as const, required: true },
    ],
  },
};
