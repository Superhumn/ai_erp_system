import { invokeLLM } from "./_core/llm";
import * as db from "./db";

// Data sources that can be auto-pulled from the ERP
export const DATA_SOURCES = {
  company: { label: "Company Profile", table: "companies", fields: ["name", "legalName", "taxId", "address", "city", "state", "country", "postalCode", "phone", "email", "website", "industry"] },
  employees: { label: "Employee Summary", table: "employees", fields: ["totalCount", "departmentCount"] },
  financials: { label: "Financial Summary", table: "invoices/purchaseOrders", fields: ["totalRevenue", "totalExpenses", "invoiceCount", "poCount"] },
  projects: { label: "Projects", table: "projects", fields: ["name", "description", "status", "budget", "actualCost", "startDate", "endDate"] },
} as const;

// Default template sections for common grant/bid types
export const DEFAULT_SECTIONS: Record<string, Array<{ name: string; fields: Array<{ key: string; label: string; type: string; dataSource?: string; dataField?: string; required?: boolean }> }>> = {
  grant: [
    {
      name: "Organization Information",
      fields: [
        { key: "org_legal_name", label: "Legal Organization Name", type: "text", dataSource: "companies", dataField: "legalName", required: true },
        { key: "org_tax_id", label: "Tax ID / EIN", type: "text", dataSource: "companies", dataField: "taxId", required: true },
        { key: "org_address", label: "Organization Address", type: "text", dataSource: "companies", dataField: "address" },
        { key: "org_city", label: "City", type: "text", dataSource: "companies", dataField: "city" },
        { key: "org_state", label: "State/Province", type: "text", dataSource: "companies", dataField: "state" },
        { key: "org_country", label: "Country", type: "text", dataSource: "companies", dataField: "country" },
        { key: "org_phone", label: "Phone", type: "text", dataSource: "companies", dataField: "phone" },
        { key: "org_email", label: "Email", type: "text", dataSource: "companies", dataField: "email" },
        { key: "org_website", label: "Website", type: "text", dataSource: "companies", dataField: "website" },
        { key: "org_industry", label: "Industry", type: "text", dataSource: "companies", dataField: "industry" },
      ],
    },
    {
      name: "Project Details",
      fields: [
        { key: "project_title", label: "Project Title", type: "text", required: true },
        { key: "project_description", label: "Project Description", type: "textarea", required: true },
        { key: "project_objectives", label: "Project Objectives", type: "textarea", required: true },
        { key: "project_timeline", label: "Project Timeline", type: "textarea" },
        { key: "project_start_date", label: "Start Date", type: "date" },
        { key: "project_end_date", label: "End Date", type: "date" },
      ],
    },
    {
      name: "Budget & Financials",
      fields: [
        { key: "total_project_cost", label: "Total Project Cost", type: "currency", required: true },
        { key: "requested_amount", label: "Requested Grant Amount", type: "currency", required: true },
        { key: "matching_funds", label: "Matching Funds", type: "currency" },
        { key: "budget_narrative", label: "Budget Narrative", type: "textarea" },
        { key: "annual_revenue", label: "Annual Revenue", type: "currency", dataSource: "financials", dataField: "totalRevenue" },
      ],
    },
    {
      name: "Organizational Capacity",
      fields: [
        { key: "employee_count", label: "Number of Employees", type: "number", dataSource: "employees", dataField: "totalCount" },
        { key: "org_mission", label: "Organization Mission", type: "textarea" },
        { key: "past_experience", label: "Relevant Past Experience", type: "textarea" },
        { key: "key_personnel", label: "Key Personnel", type: "textarea" },
      ],
    },
    {
      name: "Impact & Outcomes",
      fields: [
        { key: "expected_outcomes", label: "Expected Outcomes", type: "textarea", required: true },
        { key: "measurement_plan", label: "How Will Success Be Measured", type: "textarea" },
        { key: "community_impact", label: "Community Impact", type: "textarea" },
        { key: "sustainability_plan", label: "Sustainability Plan", type: "textarea" },
      ],
    },
  ],
  procurement_bid: [
    {
      name: "Bidder Information",
      fields: [
        { key: "company_name", label: "Company Legal Name", type: "text", dataSource: "companies", dataField: "legalName", required: true },
        { key: "company_tax_id", label: "Tax ID / DUNS", type: "text", dataSource: "companies", dataField: "taxId", required: true },
        { key: "company_address", label: "Business Address", type: "text", dataSource: "companies", dataField: "address" },
        { key: "company_phone", label: "Phone", type: "text", dataSource: "companies", dataField: "phone" },
        { key: "company_email", label: "Contact Email", type: "text", dataSource: "companies", dataField: "email" },
        { key: "company_website", label: "Website", type: "text", dataSource: "companies", dataField: "website" },
      ],
    },
    {
      name: "Technical Proposal",
      fields: [
        { key: "technical_approach", label: "Technical Approach", type: "textarea", required: true },
        { key: "methodology", label: "Methodology", type: "textarea", required: true },
        { key: "work_plan", label: "Work Plan & Schedule", type: "textarea" },
        { key: "quality_assurance", label: "Quality Assurance Plan", type: "textarea" },
        { key: "risk_mitigation", label: "Risk Mitigation Strategy", type: "textarea" },
      ],
    },
    {
      name: "Cost Proposal",
      fields: [
        { key: "total_bid_amount", label: "Total Bid Amount", type: "currency", required: true },
        { key: "cost_breakdown", label: "Cost Breakdown", type: "textarea", required: true },
        { key: "payment_terms", label: "Proposed Payment Terms", type: "text" },
        { key: "validity_period", label: "Bid Validity Period (days)", type: "number" },
      ],
    },
    {
      name: "Qualifications & Past Performance",
      fields: [
        { key: "company_overview", label: "Company Overview", type: "textarea" },
        { key: "employee_count", label: "Number of Employees", type: "number", dataSource: "employees", dataField: "totalCount" },
        { key: "relevant_experience", label: "Relevant Experience", type: "textarea" },
        { key: "past_contracts", label: "Past Contract References", type: "textarea" },
        { key: "certifications", label: "Certifications & Licenses", type: "textarea" },
      ],
    },
  ],
};

/**
 * Collect data from ERP system to auto-populate form fields
 */
export async function collectERPData(companyId?: number) {
  const [company, empSummary, financials] = await Promise.all([
    db.getCompanyProfile(companyId),
    db.getEmployeeSummary(companyId),
    db.getFinancialSummary(),
  ]);

  return {
    companies: company ? {
      name: company.name,
      legalName: company.legalName,
      taxId: company.taxId,
      address: company.address,
      city: company.city,
      state: company.state,
      country: company.country,
      postalCode: company.postalCode,
      phone: company.phone,
      email: company.email,
      website: company.website,
      industry: company.industry,
    } : null,
    employees: {
      totalCount: empSummary.totalEmployees,
      departmentCount: empSummary.departments,
    },
    financials: financials ? {
      totalRevenue: financials.totalRevenue,
      totalExpenses: financials.totalExpenses,
      invoiceCount: financials.invoiceCount,
      poCount: financials.poCount,
    } : null,
  };
}

/**
 * Auto-populate form fields using ERP data and field mappings
 */
export async function autoPopulateFields(
  sections: Array<{ name: string; fields: Array<{ key: string; dataSource?: string; dataField?: string; [k: string]: any }> }>,
  companyId?: number
): Promise<Record<string, any>> {
  const erpData = await collectERPData(companyId);
  const populated: Record<string, any> = {};

  for (const section of sections) {
    for (const field of section.fields) {
      if (field.dataSource && field.dataField) {
        const source = erpData[field.dataSource as keyof typeof erpData];
        if (source && typeof source === 'object') {
          const value = (source as Record<string, any>)[field.dataField];
          if (value !== undefined && value !== null) {
            populated[field.key] = value;
          }
        }
      }
    }
  }

  return populated;
}

/**
 * Use AI to generate narrative sections for the application
 */
export async function generateApplicationNarrative(
  applicationType: string,
  title: string,
  formData: Record<string, any>,
  programName?: string,
  customInstructions?: string,
): Promise<string> {
  const systemPrompt = `You are an expert grant writer and procurement bid specialist. Generate professional, compelling narrative content for a ${applicationType} application. The content should be well-structured, data-driven, and persuasive.`;

  const userPrompt = `Generate a complete narrative for the following ${applicationType} application:

Title: ${title}
${programName ? `Program/Organization: ${programName}` : ''}

Form Data Available:
${JSON.stringify(formData, null, 2)}

${customInstructions ? `Additional Instructions: ${customInstructions}` : ''}

Generate the following sections:
1. Executive Summary (2-3 paragraphs)
2. Project Description & Objectives
3. Methodology & Approach
4. Expected Outcomes & Impact
5. Organizational Qualifications
6. Budget Justification

Format the output as clean, professional prose suitable for submission. Use the data provided to make specific, quantitative claims where possible.`;

  try {
    const result = await invokeLLM({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      maxTokens: 4000,
    });

    const content = result.choices[0]?.message?.content;
    if (typeof content === 'string') return content;
    if (Array.isArray(content)) {
      return content.filter(c => c.type === 'text').map(c => (c as { text: string }).text).join('\n');
    }
    return '';
  } catch (error) {
    console.error('[GrantBidService] Error generating narrative:', error);
    return '';
  }
}

/**
 * Use AI to review and score an application before submission
 */
export async function reviewApplication(
  formData: Record<string, any>,
  narrative: string,
  applicationType: string,
): Promise<{ score: number; feedback: string; suggestions: string[] }> {
  const prompt = `Review this ${applicationType} application and provide:
1. A completeness score out of 100
2. Overall feedback
3. Specific suggestions for improvement

Application Data:
${JSON.stringify(formData, null, 2)}

Narrative:
${narrative}

Respond in JSON format: {"score": number, "feedback": "string", "suggestions": ["string"]}`;

  try {
    const result = await invokeLLM({
      messages: [
        { role: "system", content: "You are an expert grant/bid reviewer. Provide actionable feedback." },
        { role: "user", content: prompt },
      ],
      maxTokens: 2000,
      responseFormat: { type: "json_object" },
    });

    const content = result.choices[0]?.message?.content;
    const text = typeof content === 'string' ? content : Array.isArray(content) ? content.filter(c => c.type === 'text').map(c => (c as { text: string }).text).join('') : '';
    return JSON.parse(text);
  } catch (error) {
    console.error('[GrantBidService] Error reviewing application:', error);
    return { score: 0, feedback: 'Review unavailable', suggestions: [] };
  }
}

/**
 * Generate a formatted PDF-ready application document
 */
export async function generateApplicationDocument(
  application: any,
  formData: Record<string, any>,
  narrative: string,
  sections: any[],
): Promise<string> {
  let document = `# ${application.title}\n\n`;
  document += `**Application Number:** ${application.applicationNumber}\n`;
  document += `**Type:** ${application.type}\n`;
  if (application.grantingOrganization) document += `**Submitted To:** ${application.grantingOrganization}\n`;
  if (application.programName) document += `**Program:** ${application.programName}\n`;
  document += `**Date:** ${new Date().toLocaleDateString()}\n\n---\n\n`;

  // Add form sections
  for (const section of sections) {
    document += `## ${section.name}\n\n`;
    for (const field of section.fields) {
      const value = formData[field.key];
      if (value !== undefined && value !== null && value !== '') {
        if (field.type === 'currency') {
          document += `**${field.label}:** $${Number(value).toLocaleString()}\n\n`;
        } else {
          document += `**${field.label}:** ${value}\n\n`;
        }
      }
    }
  }

  // Add narrative
  if (narrative) {
    document += `---\n\n${narrative}\n`;
  }

  return document;
}

/**
 * Use AI to search for and discover relevant grant/bid opportunities
 * based on the company profile and specified search criteria
 */
export async function searchOpportunities(
  query: string,
  companyProfile: Record<string, any> | null,
  type?: string,
): Promise<Array<{
  title: string;
  type: string;
  organization: string;
  programName: string;
  description: string;
  eligibilityCriteria: string;
  fundingAmountMin: number | null;
  fundingAmountMax: number | null;
  matchingRequired: boolean;
  deadline: string | null;
  sourceUrl: string;
  matchScore: number;
  matchReason: string;
  categories: string[];
}>> {
  const companyContext = companyProfile
    ? `\nCompany Profile:\n- Name: ${companyProfile.name || companyProfile.legalName || 'Unknown'}\n- Industry: ${companyProfile.industry || 'Not specified'}\n- Location: ${[companyProfile.city, companyProfile.state, companyProfile.country].filter(Boolean).join(', ') || 'Not specified'}`
    : '';

  const typeFilter = type && type !== 'all' ? `\nFocus on ${type.replace(/_/g, ' ')} opportunities.` : '';

  const prompt = `You are an expert grant researcher and procurement opportunity finder. Based on the following search query and company profile, generate a list of realistic, relevant grant programs, procurement bids, RFPs, subsidies, or tax incentive opportunities that a company like this could apply for.

Search Query: "${query}"${companyContext}${typeFilter}

Generate 5-8 relevant opportunities. For each opportunity, provide realistic details based on actual types of programs that exist (federal, state, local, private foundation, industry-specific). Make the opportunities specific and actionable.

Respond in JSON format with an array of objects:
[{
  "title": "Specific program name",
  "type": "grant" | "procurement_bid" | "rfp_response" | "subsidy" | "tax_incentive",
  "organization": "Issuing organization name",
  "programName": "Specific program/solicitation name",
  "description": "2-3 sentence description of the opportunity",
  "eligibilityCriteria": "Key eligibility requirements",
  "fundingAmountMin": number or null,
  "fundingAmountMax": number or null,
  "matchingRequired": boolean,
  "deadline": "YYYY-MM-DD" or null,
  "sourceUrl": "Relevant website URL where one would find this type of program",
  "matchScore": 0-100 relevance score,
  "matchReason": "Why this is a good match for this company",
  "categories": ["category tags"]
}]`;

  try {
    const result = await invokeLLM({
      messages: [
        { role: "system", content: "You are an expert grant and procurement opportunity researcher. Return only valid JSON arrays." },
        { role: "user", content: prompt },
      ],
      maxTokens: 4000,
      responseFormat: { type: "json_object" },
    });

    const content = result.choices[0]?.message?.content;
    const text = typeof content === 'string' ? content : Array.isArray(content) ? content.filter(c => c.type === 'text').map(c => (c as { text: string }).text).join('') : '[]';

    const parsed = JSON.parse(text);
    // Handle both { opportunities: [...] } and [...] formats
    const opportunities = Array.isArray(parsed) ? parsed : (parsed.opportunities || parsed.results || []);
    return opportunities;
  } catch (error) {
    console.error('[GrantBidService] Error searching opportunities:', error);
    return [];
  }
}

/**
 * Use AI to evaluate how well a specific opportunity matches the company profile
 */
export async function evaluateOpportunityFit(
  opportunity: { title: string; description: string; eligibilityCriteria: string; type: string },
  companyData: Record<string, any>,
): Promise<{ fitScore: number; strengths: string[]; gaps: string[]; recommendation: string }> {
  const prompt = `Evaluate how well this company fits the following opportunity:

Opportunity: ${opportunity.title}
Type: ${opportunity.type}
Description: ${opportunity.description}
Eligibility: ${opportunity.eligibilityCriteria}

Company Data:
${JSON.stringify(companyData, null, 2)}

Provide an assessment in JSON format:
{
  "fitScore": 0-100,
  "strengths": ["What makes this company a strong candidate"],
  "gaps": ["Areas where the company may fall short"],
  "recommendation": "Brief recommendation on whether to pursue"
}`;

  try {
    const result = await invokeLLM({
      messages: [
        { role: "system", content: "You are an expert grant/bid eligibility assessor. Provide honest, actionable assessments." },
        { role: "user", content: prompt },
      ],
      maxTokens: 1500,
      responseFormat: { type: "json_object" },
    });

    const content = result.choices[0]?.message?.content;
    const text = typeof content === 'string' ? content : Array.isArray(content) ? content.filter(c => c.type === 'text').map(c => (c as { text: string }).text).join('') : '';
    return JSON.parse(text);
  } catch (error) {
    console.error('[GrantBidService] Error evaluating opportunity:', error);
    return { fitScore: 0, strengths: [], gaps: [], recommendation: 'Evaluation unavailable' };
  }
}

/**
 * Analyze a web form's structure and generate field mappings to application data.
 * User provides the portal URL and optionally describes the form fields.
 */
export async function analyzeWebFormFields(
  portalName: string,
  portalUrl: string,
  formDescription: string,
  applicationData: Record<string, any>,
): Promise<Array<{
  formFieldLabel: string;
  formFieldType: string;
  cssSelector: string;
  value: string;
  dataSourceKey: string;
  confidence: number;
}>> {
  const prompt = `You are a web form automation expert. Given a grant/bid portal form description and available application data, generate a mapping of form fields to data values.

Portal: ${portalName}
URL: ${portalUrl}

Form Description / Fields:
${formDescription}

Available Application Data:
${JSON.stringify(applicationData, null, 2)}

For each form field on the portal, generate a mapping with:
- formFieldLabel: The label shown on the web form
- formFieldType: "text" | "textarea" | "number" | "date" | "select" | "email" | "phone" | "url" | "file"
- cssSelector: A plausible CSS selector (input[name="..."], #fieldId, etc.) - use common patterns for government/grant portals
- value: The actual value to fill from the application data
- dataSourceKey: Which key from the application data this maps to
- confidence: 0-100 how confident the mapping is correct

Return a JSON array of these mappings. Include ALL form fields you can identify.

Respond as: {"mappings": [...]}`;

  try {
    const result = await invokeLLM({
      messages: [
        { role: "system", content: "You are a web form automation expert. Return valid JSON with field mappings." },
        { role: "user", content: prompt },
      ],
      maxTokens: 3000,
      responseFormat: { type: "json_object" },
    });

    const content = result.choices[0]?.message?.content;
    const text = typeof content === 'string' ? content : Array.isArray(content) ? content.filter(c => c.type === 'text').map(c => (c as { text: string }).text).join('') : '{}';
    const parsed = JSON.parse(text);
    return parsed.mappings || parsed.fields || [];
  } catch (error) {
    console.error('[GrantBidService] Error analyzing web form:', error);
    return [];
  }
}

/**
 * Generate a JavaScript auto-fill script that can be run in the browser console
 * to fill out a web form with application data.
 */
export function generateAutoFillScript(
  fieldMappings: Array<{ cssSelector: string; value: string; formFieldType: string; formFieldLabel: string }>,
  portalName: string,
): string {
  const lines: string[] = [
    `// Auto-Fill Script for: ${portalName}`,
    `// Generated by Grant & Bid Submitter`,
    `// Instructions: Open the application form in your browser, then paste this script into the browser console (F12 > Console)`,
    ``,
    `(function() {`,
    `  const fillField = (selector, value, type) => {`,
    `    const el = document.querySelector(selector);`,
    `    if (!el) { console.warn('Field not found:', selector); return false; }`,
    `    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set`,
    `      || Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;`,
    `    if (nativeInputValueSetter) {`,
    `      nativeInputValueSetter.call(el, value);`,
    `    } else {`,
    `      el.value = value;`,
    `    }`,
    `    el.dispatchEvent(new Event('input', { bubbles: true }));`,
    `    el.dispatchEvent(new Event('change', { bubbles: true }));`,
    `    el.dispatchEvent(new Event('blur', { bubbles: true }));`,
    `    console.log('Filled:', selector, '=', value.substring(0, 50) + (value.length > 50 ? '...' : ''));`,
    `    return true;`,
    `  };`,
    ``,
    `  let filled = 0, missed = 0;`,
  ];

  for (const mapping of fieldMappings) {
    if (!mapping.value) continue;
    const escapedValue = mapping.value.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n');
    lines.push(`  // ${mapping.formFieldLabel}`);
    lines.push(`  if (fillField('${mapping.cssSelector}', '${escapedValue}', '${mapping.formFieldType}')) filled++; else missed++;`);
  }

  lines.push(``, `  console.log('\\n=== Auto-Fill Complete ===');`);
  lines.push(`  console.log('Filled: ' + filled + ' fields, Missed: ' + missed + ' fields');`);
  lines.push(`  console.log('Please review all fields before submitting!');`);
  lines.push(`  alert('Auto-fill complete! ' + filled + ' fields filled, ' + missed + ' fields missed. Please review before submitting.');`);
  lines.push(`})();`);

  return lines.join('\n');
}

/**
 * Generate a structured clipboard-friendly export of all application data
 * that users can manually copy-paste into web forms field by field.
 */
export function generateCopyPasteGuide(
  applicationData: Record<string, any>,
  sections: Array<{ name: string; fields: Array<{ key: string; label: string; type: string }> }>,
  narrative?: string,
): string {
  let guide = '=== GRANT/BID APPLICATION - COPY & PASTE GUIDE ===\n\n';
  guide += 'Instructions: Use this guide to fill out the web form.\n';
  guide += 'Click on each value below to select it, then paste into the corresponding form field.\n\n';

  for (const section of sections) {
    guide += `--- ${section.name.toUpperCase()} ---\n\n`;
    for (const field of section.fields) {
      const value = applicationData[field.key];
      if (value !== undefined && value !== null && value !== '') {
        guide += `${field.label}:\n${value}\n\n`;
      }
    }
  }

  if (narrative) {
    guide += '--- NARRATIVE / DESCRIPTION ---\n\n';
    guide += narrative + '\n';
  }

  return guide;
}

/**
 * Generate a JSON export of all application data for API-based submissions
 */
export function generateApiPayload(
  applicationData: Record<string, any>,
  applicationMeta: { title: string; type: string; applicationNumber: string; organization?: string },
): Record<string, any> {
  return {
    meta: {
      applicationNumber: applicationMeta.applicationNumber,
      title: applicationMeta.title,
      type: applicationMeta.type,
      organization: applicationMeta.organization,
      generatedAt: new Date().toISOString(),
      source: 'AI ERP Grant & Bid Submitter',
    },
    data: applicationData,
  };
}
