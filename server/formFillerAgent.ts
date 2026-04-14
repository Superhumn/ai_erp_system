import { invokeLLM, Tool, Message } from "./_core/llm";
import * as db from "./db";

// ============================================
// FORM FILLER AGENT - Autonomous Web Form Automation
// ============================================

export interface FormFillerAgentContext {
  userId: number;
  applicationId: number;
  portalName: string;
  portalUrl: string;
}

export interface FormFillerStep {
  stepNumber: number;
  action: string;
  description: string;
  status: "pending" | "completed" | "failed" | "needs_human";
  details?: Record<string, any>;
  timestamp: string;
}

export interface FormFillerPlan {
  id: string;
  applicationId: number;
  portalName: string;
  portalUrl: string;
  status: "planning" | "ready" | "running" | "paused_for_approval" | "completed" | "failed";
  steps: FormFillerStep[];
  fieldActions: FormFieldAction[];
  navigationInstructions: string;
  autoFillScript: string;
  humanActions: string[];
  warnings: string[];
  createdAt: string;
}

export interface FormFieldAction {
  order: number;
  pageOrSection: string;
  fieldLabel: string;
  fieldType: string;
  selector: string;
  value: string;
  source: string; // which ERP data field this came from
  notes: string;
  requiresHuman: boolean;
  humanReason?: string;
}

// Agent tools for form analysis and filling
const FORM_FILLER_TOOLS: Tool[] = [
  {
    type: "function",
    function: {
      name: "analyze_portal_structure",
      description: "Analyze the structure of a grant/bid portal to understand its pages, form sections, and submission flow. Call this first to plan the form-filling approach.",
      parameters: {
        type: "object",
        properties: {
          portalName: { type: "string", description: "Name of the portal (e.g., Grants.gov, SAM.gov)" },
          portalUrl: { type: "string", description: "URL of the portal" },
          portalType: { type: "string", enum: ["grant", "procurement_bid", "rfp_response", "subsidy", "tax_incentive"], description: "Type of submission portal" },
        },
        required: ["portalName"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "map_form_fields",
      description: "Map the form fields of a specific page or section to application data. Identifies each field, its type, expected input, and maps it to available ERP data.",
      parameters: {
        type: "object",
        properties: {
          pageOrSection: { type: "string", description: "Name of the form page or section being mapped" },
          fieldDescriptions: { type: "string", description: "Description of the fields on this page/section" },
          availableData: { type: "object", description: "Available application data to map from" },
        },
        required: ["pageOrSection"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "generate_fill_actions",
      description: "Generate the specific actions needed to fill a form field, including CSS selectors, values, and any special handling (dropdowns, date pickers, file uploads).",
      parameters: {
        type: "object",
        properties: {
          fields: {
            type: "array",
            items: {
              type: "object",
              properties: {
                fieldLabel: { type: "string" },
                fieldType: { type: "string" },
                value: { type: "string" },
                specialHandling: { type: "string" },
              },
            },
            description: "Fields to generate fill actions for",
          },
        },
        required: ["fields"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "handle_multi_step_form",
      description: "Plan navigation through a multi-step/multi-page form, including next/continue buttons, save-and-continue, and tab navigation.",
      parameters: {
        type: "object",
        properties: {
          totalPages: { type: "number", description: "Total number of form pages/steps" },
          currentPage: { type: "number", description: "Current page number" },
          navigationMethod: { type: "string", enum: ["next_button", "tabs", "sidebar", "accordion", "save_continue"], description: "How the form navigates between sections" },
        },
        required: ["totalPages", "currentPage"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "handle_special_fields",
      description: "Handle special form fields that require specific interaction: file uploads, captchas, signature fields, rich text editors, or dynamic dropdowns.",
      parameters: {
        type: "object",
        properties: {
          fieldType: { type: "string", enum: ["file_upload", "captcha", "signature", "rich_text_editor", "dynamic_dropdown", "date_picker", "address_autocomplete", "multi_select", "conditional_field"], description: "Type of special field" },
          fieldLabel: { type: "string", description: "Label of the field" },
          context: { type: "string", description: "Additional context about the field" },
        },
        required: ["fieldType", "fieldLabel"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "validate_and_review",
      description: "Validate the filled form before submission, check for missing required fields, format issues, or potential errors.",
      parameters: {
        type: "object",
        properties: {
          filledFields: { type: "number", description: "Number of fields filled" },
          totalFields: { type: "number", description: "Total number of fields" },
          issues: {
            type: "array",
            items: { type: "string" },
            description: "Any issues found during filling",
          },
        },
        required: ["filledFields", "totalFields"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "flag_for_human",
      description: "Flag an action that requires human intervention - like solving a CAPTCHA, signing a document, uploading a physical document, or making a judgment call.",
      parameters: {
        type: "object",
        properties: {
          reason: { type: "string", description: "Why human intervention is needed" },
          fieldLabel: { type: "string", description: "Which field needs human action" },
          instructions: { type: "string", description: "What the human needs to do" },
        },
        required: ["reason", "instructions"],
      },
    },
  },
];

// Tool execution handlers
async function executeFormFillerTool(
  toolName: string,
  args: any,
  context: FormFillerAgentContext,
  applicationData: Record<string, any>,
): Promise<any> {
  switch (toolName) {
    case "analyze_portal_structure": {
      // AI provides structured portal knowledge based on portal name
      return {
        portalName: args.portalName,
        knownStructure: getKnownPortalStructure(args.portalName),
        recommendedApproach: "multi_page_sequential",
        note: "Structure analyzed. Use map_form_fields for each section.",
      };
    }

    case "map_form_fields": {
      return {
        pageOrSection: args.pageOrSection,
        mappedFields: Object.entries(applicationData).map(([key, value]) => ({
          dataKey: key,
          value: String(value || ''),
          available: value !== null && value !== undefined && value !== '',
        })),
        unmappedCount: 0,
      };
    }

    case "generate_fill_actions": {
      const actions = (args.fields || []).map((field: any, idx: number) => ({
        order: idx + 1,
        fieldLabel: field.fieldLabel,
        fieldType: field.fieldType || 'text',
        value: field.value || '',
        selector: generateSelector(field.fieldLabel, field.fieldType),
        script: generateFieldScript(field.fieldLabel, field.fieldType, field.value || ''),
      }));
      return { actions, count: actions.length };
    }

    case "handle_multi_step_form": {
      return {
        totalPages: args.totalPages,
        currentPage: args.currentPage,
        navigationScript: generateNavigationScript(args.navigationMethod || 'next_button', args.currentPage, args.totalPages),
        instruction: `Navigate from page ${args.currentPage} to ${args.currentPage + 1} using ${args.navigationMethod || 'next button'}`,
      };
    }

    case "handle_special_fields": {
      const requiresHuman = ['captcha', 'signature', 'file_upload'].includes(args.fieldType);
      return {
        fieldType: args.fieldType,
        fieldLabel: args.fieldLabel,
        requiresHuman,
        instruction: requiresHuman
          ? `Human action required: ${getSpecialFieldInstruction(args.fieldType, args.fieldLabel)}`
          : `Automated: ${getSpecialFieldInstruction(args.fieldType, args.fieldLabel)}`,
        script: requiresHuman ? null : generateSpecialFieldScript(args.fieldType, args.fieldLabel, args.context),
      };
    }

    case "validate_and_review": {
      const completionRate = args.totalFields > 0 ? (args.filledFields / args.totalFields) * 100 : 0;
      return {
        completionRate: Math.round(completionRate),
        status: completionRate >= 90 ? 'ready_to_submit' : completionRate >= 70 ? 'mostly_complete' : 'needs_attention',
        issues: args.issues || [],
        recommendation: completionRate >= 90
          ? 'Form is ready for review and submission.'
          : `${args.totalFields - args.filledFields} fields still need to be filled.`,
      };
    }

    case "flag_for_human": {
      return {
        flagged: true,
        reason: args.reason,
        fieldLabel: args.fieldLabel || 'N/A',
        instructions: args.instructions,
        priority: args.reason.toLowerCase().includes('captcha') ? 'high' : 'medium',
      };
    }

    default:
      return { error: `Unknown tool: ${toolName}` };
  }
}

/**
 * Run the form filler agent - plans and generates everything needed to fill a web form
 */
export async function runFormFillerAgent(
  context: FormFillerAgentContext,
  formDescription?: string,
): Promise<FormFillerPlan> {
  const application = await db.getGrantBidApplicationById(context.applicationId);
  if (!application) throw new Error("Application not found");

  const formData = application.formData ? JSON.parse(application.formData) : {};
  const fullData = {
    ...formData,
    _title: application.title,
    _type: application.type,
    _organization: application.grantingOrganization || '',
    _programName: application.programName || '',
    _requestedAmount: application.requestedAmount || '',
    _narrative: application.generatedNarrative || '',
    _applicationNumber: application.applicationNumber,
  };

  const systemPrompt = `You are an autonomous AI agent specialized in filling out grant applications and procurement bid forms on web portals. Your job is to:

1. Analyze the target portal's form structure
2. Map each form field to the available application data
3. Generate specific fill actions for each field
4. Handle multi-step/multi-page forms
5. Identify fields that need human intervention (CAPTCHAs, signatures, file uploads)
6. Generate a complete auto-fill script
7. Validate the completed form

You have tools to accomplish each of these tasks. Work through them systematically:
- First, analyze the portal structure
- Then map fields for each page/section
- Generate fill actions for automated fields
- Flag special fields requiring human action
- Handle navigation for multi-page forms
- Finally, validate the completed form

Be thorough and methodical. The goal is a complete, ready-to-execute plan that can fill the entire form with minimal human intervention.

Available Application Data:
${JSON.stringify(fullData, null, 2)}`;

  const userPrompt = `Fill out the application form on the "${context.portalName}" portal${context.portalUrl ? ` (${context.portalUrl})` : ''}.

Application: "${application.title}" (${application.type})
${application.grantingOrganization ? `Organization: ${application.grantingOrganization}` : ''}
${application.programName ? `Program: ${application.programName}` : ''}

${formDescription ? `Form Description:\n${formDescription}` : 'Analyze the typical form structure for this type of portal and map all fields.'}

Steps:
1. First call analyze_portal_structure to understand the portal
2. Then call map_form_fields for each section of the form
3. Call generate_fill_actions to create the fill scripts
4. Call handle_special_fields for any uploads, captchas, etc.
5. If multi-page, call handle_multi_step_form for navigation
6. Call flag_for_human for anything requiring manual action
7. Finally call validate_and_review to check completeness

Generate a complete, executable plan.`;

  const messages: Message[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt },
  ];

  const steps: FormFillerStep[] = [];
  const fieldActions: FormFieldAction[] = [];
  const humanActions: string[] = [];
  const warnings: string[] = [];
  let iterations = 0;
  const maxIterations = 8;
  let finalSummary = "";

  // Iterative tool-calling loop (same pattern as aiAgentService)
  while (iterations < maxIterations) {
    iterations++;

    const response = await invokeLLM({
      messages,
      tools: FORM_FILLER_TOOLS,
      toolChoice: "auto",
      maxTokens: 4000,
    });

    const choice = response.choices[0];
    const responseMessage = choice.message;

    if (responseMessage.tool_calls && responseMessage.tool_calls.length > 0) {
      messages.push({
        role: "assistant",
        content: typeof responseMessage.content === "string" ? responseMessage.content : "",
        tool_calls: responseMessage.tool_calls,
      });

      for (const toolCall of responseMessage.tool_calls) {
        const toolName = toolCall.function.name;
        let toolArgs: any;
        try {
          toolArgs = JSON.parse(toolCall.function.arguments);
        } catch {
          messages.push({ role: "tool", tool_call_id: toolCall.id, content: '{"error":"Invalid arguments"}' });
          continue;
        }

        const step: FormFillerStep = {
          stepNumber: steps.length + 1,
          action: toolName,
          description: getToolDescription(toolName, toolArgs),
          status: "pending",
          timestamp: new Date().toISOString(),
        };

        try {
          const result = await executeFormFillerTool(toolName, toolArgs, context, fullData);
          step.status = "completed";
          step.details = result;

          // Collect field actions from generate_fill_actions
          if (toolName === 'generate_fill_actions' && result.actions) {
            for (const action of result.actions) {
              fieldActions.push({
                order: fieldActions.length + 1,
                pageOrSection: toolArgs.pageOrSection || 'Main Form',
                fieldLabel: action.fieldLabel,
                fieldType: action.fieldType,
                selector: action.selector,
                value: action.value,
                source: 'application_data',
                notes: '',
                requiresHuman: false,
              });
            }
          }

          // Collect human actions
          if (toolName === 'flag_for_human') {
            humanActions.push(result.instructions);
            if (result.fieldLabel !== 'N/A') {
              fieldActions.push({
                order: fieldActions.length + 1,
                pageOrSection: 'Manual',
                fieldLabel: result.fieldLabel,
                fieldType: 'special',
                selector: '',
                value: '',
                source: 'human_required',
                notes: result.instructions,
                requiresHuman: true,
                humanReason: result.reason,
              });
            }
          }

          // Collect special field handlers
          if (toolName === 'handle_special_fields' && result.requiresHuman) {
            humanActions.push(result.instruction);
            step.status = "needs_human";
          }

          // Collect warnings from validation
          if (toolName === 'validate_and_review' && result.issues) {
            warnings.push(...result.issues);
          }

          messages.push({ role: "tool", tool_call_id: toolCall.id, content: JSON.stringify(result) });
        } catch (error: any) {
          step.status = "failed";
          step.details = { error: error.message };
          messages.push({ role: "tool", tool_call_id: toolCall.id, content: JSON.stringify({ error: error.message }) });
        }

        steps.push(step);
      }
    } else {
      const content = responseMessage.content;
      finalSummary = typeof content === "string" ? content : "Form filling plan generated.";
      break;
    }
  }

  // Generate the consolidated auto-fill script
  const autoFillScript = generateConsolidatedScript(fieldActions.filter(f => !f.requiresHuman), context.portalName);

  // Generate navigation instructions
  const navigationInstructions = generateNavigationInstructions(context, steps, humanActions, finalSummary);

  const plan: FormFillerPlan = {
    id: `ffp_${Date.now()}`,
    applicationId: context.applicationId,
    portalName: context.portalName,
    portalUrl: context.portalUrl,
    status: humanActions.length > 0 ? "paused_for_approval" : "ready",
    steps,
    fieldActions,
    navigationInstructions,
    autoFillScript,
    humanActions,
    warnings,
    createdAt: new Date().toISOString(),
  };

  // Save to database
  await db.createGrantBidWebFormMapping({
    applicationId: context.applicationId,
    portalName: context.portalName,
    portalUrl: context.portalUrl,
    fieldMappings: JSON.stringify(fieldActions),
    autoFillScript,
    status: 'mapped',
    notes: JSON.stringify({ plan: plan.id, steps: steps.length, humanActions: humanActions.length, warnings, navigationInstructions }),
    createdBy: context.userId,
  });

  await db.createGrantBidSubmissionLog({
    applicationId: context.applicationId,
    action: 'submission_attempted',
    details: `AI Agent generated form-filling plan for ${context.portalName}: ${fieldActions.length} fields mapped, ${humanActions.length} require human action`,
    performedBy: context.userId,
  });

  return plan;
}

// ============================================
// HELPER FUNCTIONS
// ============================================

function getKnownPortalStructure(portalName: string): Record<string, any> {
  const portalLower = portalName.toLowerCase();
  const structures: Record<string, any> = {
    'grants.gov': {
      type: 'multi_page',
      pages: ['Applicant Information', 'Project/Performance Site', 'Budget Information', 'Project Narrative', 'Attachments', 'Review & Submit'],
      navigationMethod: 'tabs',
      hasFileUploads: true,
      hasAttachmentSection: true,
      requiresRegistration: true,
      knownIssues: ['Session timeouts after 30 minutes', 'PDF attachments must be specific format'],
    },
    'sam.gov': {
      type: 'multi_page',
      pages: ['Opportunity Search', 'Registration Verification', 'Application Form', 'Documents', 'Review'],
      navigationMethod: 'next_button',
      hasFileUploads: true,
      requiresUEI: true,
      knownIssues: ['Requires active SAM registration', 'UEI number validation'],
    },
  };

  for (const [key, structure] of Object.entries(structures)) {
    if (portalLower.includes(key)) return structure;
  }

  return {
    type: 'standard',
    pages: ['Organization Info', 'Project Details', 'Budget', 'Narrative', 'Attachments', 'Submit'],
    navigationMethod: 'next_button',
    hasFileUploads: true,
    note: 'Generic portal structure - agent will adapt based on actual form fields',
  };
}

function generateSelector(fieldLabel: string, fieldType: string): string {
  const slug = fieldLabel.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
  const nameSlug = fieldLabel.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

  if (fieldType === 'textarea') {
    return `textarea[name*="${slug}"], textarea[id*="${slug}"], textarea[aria-label*="${fieldLabel}"]`;
  }
  if (fieldType === 'select') {
    return `select[name*="${slug}"], select[id*="${slug}"], select[aria-label*="${fieldLabel}"]`;
  }
  return `input[name*="${slug}"], input[id*="${slug}"], input[aria-label*="${fieldLabel}"], [data-field="${nameSlug}"]`;
}

function generateFieldScript(fieldLabel: string, fieldType: string, value: string): string {
  const selector = generateSelector(fieldLabel, fieldType);
  const escapedValue = value.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n');
  return `fillField('${selector}', '${escapedValue}', '${fieldType}');`;
}

function generateNavigationScript(method: string, currentPage: number, totalPages: number): string {
  switch (method) {
    case 'next_button':
      return `document.querySelector('button[type="submit"], button:contains("Next"), button:contains("Continue"), .next-btn, .btn-next')?.click();`;
    case 'tabs':
      return `document.querySelectorAll('.nav-tab, .tab-link, [role="tab"]')[${currentPage}]?.click();`;
    case 'save_continue':
      return `document.querySelector('button:contains("Save"), button:contains("Save and Continue"), .save-continue-btn')?.click();`;
    default:
      return `// Navigate to page ${currentPage + 1} of ${totalPages}`;
  }
}

function getSpecialFieldInstruction(fieldType: string, fieldLabel: string): string {
  switch (fieldType) {
    case 'file_upload': return `Upload the required file for "${fieldLabel}". Prepare the document beforehand and use the file picker.`;
    case 'captcha': return `Solve the CAPTCHA verification manually.`;
    case 'signature': return `Provide an electronic signature for "${fieldLabel}".`;
    case 'rich_text_editor': return `The "${fieldLabel}" field uses a rich text editor. Content will be pasted as plain text - review formatting.`;
    case 'date_picker': return `Select the date in the "${fieldLabel}" date picker widget.`;
    case 'dynamic_dropdown': return `The "${fieldLabel}" dropdown loads options dynamically. Wait for options to load, then select.`;
    case 'address_autocomplete': return `The "${fieldLabel}" field has address autocomplete. Start typing and select from suggestions.`;
    case 'multi_select': return `Select multiple values in the "${fieldLabel}" field.`;
    case 'conditional_field': return `The "${fieldLabel}" field appears conditionally based on other selections.`;
    default: return `Handle the "${fieldLabel}" ${fieldType} field manually.`;
  }
}

function generateSpecialFieldScript(fieldType: string, fieldLabel: string, context?: string): string {
  const selector = generateSelector(fieldLabel, fieldType);
  switch (fieldType) {
    case 'rich_text_editor':
      return `// Rich text editor - try multiple approaches\nconst editor = document.querySelector('${selector}, .ql-editor, .tox-edit-area iframe, [contenteditable="true"]');\nif (editor) { if (editor.contentEditable) editor.innerHTML = '${context || ''}'; else editor.value = '${context || ''}'; }`;
    case 'date_picker':
      return `fillField('${selector}', '${context || ''}', 'date');`;
    default:
      return `// Handle ${fieldType} for "${fieldLabel}" manually`;
  }
}

function generateConsolidatedScript(fieldActions: FormFieldAction[], portalName: string): string {
  const lines: string[] = [
    `// ===================================================`,
    `// AI AGENT AUTO-FILL SCRIPT: ${portalName}`,
    `// Generated by Grant & Bid Form Filler Agent`,
    `// ===================================================`,
    `//`,
    `// INSTRUCTIONS:`,
    `// 1. Navigate to the application form in your browser`,
    `// 2. Open Developer Tools (F12)`,
    `// 3. Go to the Console tab`,
    `// 4. Paste this entire script and press Enter`,
    `// 5. Review all filled fields before submitting`,
    `//`,
    ``,
    `(function() {`,
    `  'use strict';`,
    ``,
    `  const delay = (ms) => new Promise(r => setTimeout(r, ms));`,
    ``,
    `  const fillField = (selectorStr, value, type) => {`,
    `    const selectors = selectorStr.split(', ');`,
    `    let el = null;`,
    `    for (const sel of selectors) {`,
    `      try { el = document.querySelector(sel); } catch(e) {}`,
    `      if (el) break;`,
    `    }`,
    `    if (!el) {`,
    `      // Fallback: search by label text`,
    `      const labels = document.querySelectorAll('label');`,
    `      for (const label of labels) {`,
    `        if (label.textContent.trim().toLowerCase().includes(selectorStr.split("*=\\"")[1]?.split("\\"")[0]?.replace(/_/g, ' ') || '')) {`,
    `          const forId = label.getAttribute('for');`,
    `          if (forId) el = document.getElementById(forId);`,
    `          if (!el) el = label.querySelector('input, textarea, select');`,
    `          if (!el) el = label.nextElementSibling?.querySelector?.('input, textarea, select') || label.nextElementSibling;`,
    `          if (el) break;`,
    `        }`,
    `      }`,
    `    }`,
    `    if (!el) { console.warn('[MISSED]', selectorStr); return false; }`,
    ``,
    `    if (type === 'select') {`,
    `      const options = el.querySelectorAll('option');`,
    `      for (const opt of options) {`,
    `        if (opt.textContent.trim().toLowerCase().includes(value.toLowerCase())) {`,
    `          el.value = opt.value; break;`,
    `        }`,
    `      }`,
    `    } else {`,
    `      const setter = Object.getOwnPropertyDescriptor(`,
    `        el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype, 'value'`,
    `      )?.set;`,
    `      if (setter) setter.call(el, value); else el.value = value;`,
    `    }`,
    `    el.dispatchEvent(new Event('input', { bubbles: true }));`,
    `    el.dispatchEvent(new Event('change', { bubbles: true }));`,
    `    el.dispatchEvent(new Event('blur', { bubbles: true }));`,
    `    console.log('[FILLED]', el.name || el.id || selectorStr.substring(0, 40), '=', value.substring(0, 50));`,
    `    return true;`,
    `  };`,
    ``,
    `  async function runAutoFill() {`,
    `    let filled = 0, missed = 0;`,
    `    console.log('\\n=== AI Agent Auto-Fill Starting ===\\n');`,
    ``,
  ];

  // Group by page/section
  const sections = new Map<string, FormFieldAction[]>();
  for (const action of fieldActions) {
    const section = action.pageOrSection || 'Main Form';
    if (!sections.has(section)) sections.set(section, []);
    sections.get(section)!.push(action);
  }

  for (const [section, actions] of sections) {
    lines.push(`    // --- ${section} ---`);
    lines.push(`    console.log('\\nFilling: ${section}');`);
    for (const action of actions) {
      if (!action.value) continue;
      const escapedValue = action.value.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n');
      lines.push(`    // ${action.fieldLabel}`);
      lines.push(`    if (fillField('${action.selector}', '${escapedValue}', '${action.fieldType}')) filled++; else missed++;`);
      lines.push(`    await delay(100);`);
    }
    lines.push(``);
  }

  lines.push(`    console.log('\\n=== Auto-Fill Complete ===');`);
  lines.push(`    console.log('Filled:', filled, '| Missed:', missed);`);
  lines.push(`    alert('AI Agent filled ' + filled + ' fields (' + missed + ' missed). Please review all fields before submitting!');`);
  lines.push(`  }`);
  lines.push(``);
  lines.push(`  runAutoFill();`);
  lines.push(`})();`);

  return lines.join('\n');
}

function generateNavigationInstructions(
  context: FormFillerAgentContext,
  steps: FormFillerStep[],
  humanActions: string[],
  summary: string,
): string {
  let instructions = `# Form Filling Instructions: ${context.portalName}\n\n`;
  instructions += `## Overview\n${summary || 'AI Agent has analyzed the portal and generated a complete form-filling plan.'}\n\n`;

  instructions += `## Steps Completed by Agent\n`;
  for (const step of steps) {
    const icon = step.status === 'completed' ? '[OK]' : step.status === 'needs_human' ? '[HUMAN]' : '[!!]';
    instructions += `${icon} Step ${step.stepNumber}: ${step.description}\n`;
  }

  if (humanActions.length > 0) {
    instructions += `\n## Actions Requiring Your Attention\n`;
    for (let i = 0; i < humanActions.length; i++) {
      instructions += `${i + 1}. ${humanActions[i]}\n`;
    }
  }

  instructions += `\n## How to Use the Auto-Fill Script\n`;
  instructions += `1. Navigate to ${context.portalUrl || context.portalName} in your browser\n`;
  instructions += `2. Log in and open the application form\n`;
  instructions += `3. Open Developer Tools (F12) > Console tab\n`;
  instructions += `4. Copy and paste the auto-fill script\n`;
  instructions += `5. Press Enter to run - the script will fill all mapped fields\n`;
  instructions += `6. Review each field carefully before submitting\n`;
  instructions += `7. Complete any flagged manual actions (file uploads, signatures, etc.)\n`;
  instructions += `8. Submit the application\n`;

  return instructions;
}

function getToolDescription(toolName: string, args: any): string {
  switch (toolName) {
    case 'analyze_portal_structure': return `Analyzing ${args.portalName} portal structure`;
    case 'map_form_fields': return `Mapping fields for: ${args.pageOrSection || 'form section'}`;
    case 'generate_fill_actions': return `Generating fill actions for ${args.fields?.length || 0} fields`;
    case 'handle_multi_step_form': return `Planning navigation for page ${args.currentPage} of ${args.totalPages}`;
    case 'handle_special_fields': return `Handling special field: ${args.fieldLabel} (${args.fieldType})`;
    case 'validate_and_review': return `Validating form: ${args.filledFields}/${args.totalFields} fields filled`;
    case 'flag_for_human': return `Flagged for human: ${args.reason}`;
    default: return toolName;
  }
}
