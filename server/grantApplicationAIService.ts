import { invokeLLM, type Message, type Tool } from "./_core/llm";
import * as db from "./db";

export interface GrantAIContext {
  userId: number;
  userName: string;
  companyId?: number;
}

// ============================================
// AI TOOLS FOR GRANT APPLICATION AGENT
// ============================================

const GRANT_AI_TOOLS: Tool[] = [
  {
    type: "function",
    function: {
      name: "check_eligibility",
      description: "Analyze grant program requirements against company profile and project to determine eligibility",
      parameters: {
        type: "object",
        properties: {
          grantProgramName: { type: "string", description: "Name of the grant program" },
          fundingBody: { type: "string", description: "Organization offering the grant" },
          eligibilityCriteria: { type: "string", description: "Grant eligibility requirements" },
          companyProfile: { type: "string", description: "Company details and capabilities" },
          projectDescription: { type: "string", description: "Project to be funded" },
        },
        required: ["grantProgramName", "projectDescription"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "draft_narrative",
      description: "Generate a grant application narrative section based on project details and grant requirements",
      parameters: {
        type: "object",
        properties: {
          section: {
            type: "string",
            enum: ["executive_summary", "project_description", "needs_statement", "goals_objectives", "methodology", "evaluation_plan", "sustainability_plan", "organizational_capacity"],
          },
          projectDescription: { type: "string" },
          grantRequirements: { type: "string" },
          organizationBackground: { type: "string" },
          additionalContext: { type: "string" },
        },
        required: ["section", "projectDescription"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "analyze_budget",
      description: "Analyze and suggest a grant budget breakdown based on project scope and funder requirements",
      parameters: {
        type: "object",
        properties: {
          totalAmount: { type: "number" },
          projectDescription: { type: "string" },
          grantRequirements: { type: "string" },
          categories: {
            type: "array",
            items: { type: "string" },
            description: "Budget categories required by the funder",
          },
        },
        required: ["totalAmount", "projectDescription"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "review_compliance",
      description: "Review application for compliance with grant program rules and common mistakes",
      parameters: {
        type: "object",
        properties: {
          applicationContent: { type: "string" },
          grantRequirements: { type: "string" },
          checklistItems: {
            type: "array",
            items: { type: "string" },
          },
        },
        required: ["applicationContent"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "analyze_strengths_weaknesses",
      description: "Perform SWOT-style analysis on the grant application from a reviewer's perspective",
      parameters: {
        type: "object",
        properties: {
          applicationContent: { type: "string" },
          grantCriteria: { type: "string" },
          competitiveContext: { type: "string" },
        },
        required: ["applicationContent"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "generate_timeline",
      description: "Generate a project timeline with milestones for the grant-funded project",
      parameters: {
        type: "object",
        properties: {
          projectDescription: { type: "string" },
          durationMonths: { type: "number" },
          keyActivities: {
            type: "array",
            items: { type: "string" },
          },
        },
        required: ["projectDescription", "durationMonths"],
      },
    },
  },
];

// ============================================
// CORE AI FUNCTIONS
// ============================================

export async function checkGrantEligibility(
  ctx: GrantAIContext,
  applicationId: number,
  grantProgramInfo: string,
  projectDescription: string,
  companyProfile?: string,
): Promise<{ score: number; notes: string; recommendations: string[] }> {
  const systemPrompt = `You are an expert grant application advisor. Analyze the eligibility of the applicant for the grant program.
Provide a structured assessment with:
1. An eligibility score from 0-100
2. Detailed notes on why the applicant qualifies or doesn't
3. Specific recommendations to improve eligibility

Be thorough but practical. Consider both hard requirements (must-haves) and soft factors (nice-to-haves).
Return your response as JSON: { "score": number, "notes": "string", "recommendations": ["string"] }`;

  const messages: Message[] = [
    { role: "system", content: systemPrompt },
    {
      role: "user",
      content: `Grant Program: ${grantProgramInfo}\n\nProject Description: ${projectDescription}\n\nCompany Profile: ${companyProfile || "Not provided"}\n\nPlease assess eligibility.`,
    },
  ];

  const response = await invokeLLM({ messages, maxTokens: 2000 });
  const content = typeof response.content === "string" ? response.content : "";

  let result = { score: 50, notes: content, recommendations: [] as string[] };
  try {
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      result = JSON.parse(jsonMatch[0]);
    }
  } catch {
    // Use raw content as notes
  }

  // Log AI activity
  await db.createGrantAIActivityLog({
    applicationId,
    action: "eligibility_check",
    input: `Program: ${grantProgramInfo}\nProject: ${projectDescription}`,
    output: JSON.stringify(result),
    userId: ctx.userId,
  });

  // Update application with AI results
  await db.updateGrantApplication(applicationId, {
    aiEligibilityScore: result.score,
    aiEligibilityNotes: result.notes,
  });

  return result;
}

export async function draftGrantNarrative(
  ctx: GrantAIContext,
  applicationId: number,
  section: string,
  projectDescription: string,
  grantRequirements?: string,
  organizationBackground?: string,
): Promise<{ narrative: string; tips: string[] }> {
  const sectionNames: Record<string, string> = {
    executive_summary: "Executive Summary",
    project_description: "Project Description",
    needs_statement: "Statement of Need",
    goals_objectives: "Goals and Objectives",
    methodology: "Methodology / Approach",
    evaluation_plan: "Evaluation Plan",
    sustainability_plan: "Sustainability Plan",
    organizational_capacity: "Organizational Capacity",
  };

  const systemPrompt = `You are a professional grant writer with extensive experience securing funding from government and private foundations.
Write a compelling "${sectionNames[section] || section}" section for a grant application.

Guidelines:
- Use clear, persuasive language appropriate for grant reviewers
- Include specific, measurable outcomes where possible
- Align the narrative with the funder's stated priorities
- Use evidence-based language and data references
- Keep the tone professional but passionate about the mission
- Structure with clear paragraphs and logical flow

Return your response as JSON: { "narrative": "the full section text", "tips": ["improvement suggestions"] }`;

  const messages: Message[] = [
    { role: "system", content: systemPrompt },
    {
      role: "user",
      content: `Section: ${sectionNames[section] || section}\n\nProject: ${projectDescription}\n\nGrant Requirements: ${grantRequirements || "General"}\n\nOrganization: ${organizationBackground || "Not provided"}\n\nPlease draft this section.`,
    },
  ];

  const response = await invokeLLM({ messages, maxTokens: 4000 });
  const content = typeof response.content === "string" ? response.content : "";

  let result = { narrative: content, tips: [] as string[] };
  try {
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      result = JSON.parse(jsonMatch[0]);
    }
  } catch {
    // Use raw content
  }

  await db.createGrantAIActivityLog({
    applicationId,
    action: "narrative_draft",
    input: `Section: ${section}\nProject: ${projectDescription}`,
    output: JSON.stringify(result),
    userId: ctx.userId,
  });

  // Update application with draft narrative
  await db.updateGrantApplication(applicationId, {
    aiDraftNarrative: result.narrative,
  });

  return result;
}

export async function analyzeGrantBudget(
  ctx: GrantAIContext,
  applicationId: number,
  totalAmount: number,
  projectDescription: string,
  grantRequirements?: string,
): Promise<{ budgetItems: Array<{ category: string; amount: number; justification: string }>; notes: string }> {
  const systemPrompt = `You are a grant budget specialist. Create a detailed, realistic budget breakdown for the proposed project.

Guidelines:
- Ensure all costs are reasonable and justifiable
- Include both direct and indirect costs
- Follow standard grant budget categories
- Ensure the total matches the requested amount
- Provide clear justification for each line item
- Consider common funder restrictions (e.g., admin cost caps)

Return JSON: { "budgetItems": [{ "category": "string", "amount": number, "justification": "string" }], "notes": "overall budget notes" }`;

  const messages: Message[] = [
    { role: "system", content: systemPrompt },
    {
      role: "user",
      content: `Total Budget: $${totalAmount.toLocaleString()}\n\nProject: ${projectDescription}\n\nFunder Requirements: ${grantRequirements || "Standard"}\n\nCreate a detailed budget.`,
    },
  ];

  const response = await invokeLLM({ messages, maxTokens: 3000 });
  const content = typeof response.content === "string" ? response.content : "";

  let result = { budgetItems: [] as Array<{ category: string; amount: number; justification: string }>, notes: content };
  try {
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      result = JSON.parse(jsonMatch[0]);
    }
  } catch {
    // Use raw content
  }

  await db.createGrantAIActivityLog({
    applicationId,
    action: "budget_analysis",
    input: `Amount: ${totalAmount}\nProject: ${projectDescription}`,
    output: JSON.stringify(result),
    userId: ctx.userId,
  });

  await db.updateGrantApplication(applicationId, {
    aiBudgetSuggestions: JSON.stringify(result.budgetItems),
  });

  return result;
}

export async function reviewGrantCompliance(
  ctx: GrantAIContext,
  applicationId: number,
  applicationContent: string,
  grantRequirements?: string,
): Promise<{ compliant: boolean; score: number; issues: Array<{ item: string; status: string; note: string }>; summary: string }> {
  const systemPrompt = `You are a grant compliance reviewer. Check the application for completeness and compliance with requirements.

Review for:
- All required sections present and adequately addressed
- Budget aligns with narrative
- Measurable objectives and outcomes
- Proper formatting and page limits
- Common disqualifying mistakes
- Required attachments referenced
- Deadlines and timeline feasibility

Return JSON: { "compliant": boolean, "score": number (0-100), "issues": [{ "item": "string", "status": "pass|warning|fail", "note": "string" }], "summary": "string" }`;

  const messages: Message[] = [
    { role: "system", content: systemPrompt },
    {
      role: "user",
      content: `Application Content:\n${applicationContent}\n\nGrant Requirements:\n${grantRequirements || "Standard grant application requirements"}\n\nReview this application for compliance.`,
    },
  ];

  const response = await invokeLLM({ messages, maxTokens: 3000 });
  const content = typeof response.content === "string" ? response.content : "";

  let result = { compliant: false, score: 50, issues: [] as Array<{ item: string; status: string; note: string }>, summary: content };
  try {
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      result = JSON.parse(jsonMatch[0]);
    }
  } catch {
    // Use raw content
  }

  await db.createGrantAIActivityLog({
    applicationId,
    action: "compliance_review",
    input: applicationContent.substring(0, 500),
    output: JSON.stringify(result),
    userId: ctx.userId,
  });

  await db.updateGrantApplication(applicationId, {
    aiComplianceChecklist: JSON.stringify(result.issues),
  });

  return result;
}

export async function analyzeStrengthsWeaknesses(
  ctx: GrantAIContext,
  applicationId: number,
  applicationContent: string,
  grantCriteria?: string,
): Promise<{ strengths: string[]; weaknesses: string[]; opportunities: string[]; threats: string[]; overallAssessment: string; improvementSuggestions: string[] }> {
  const systemPrompt = `You are a seasoned grant reviewer who has evaluated thousands of applications.
Perform a critical SWOT analysis of this grant application from a reviewer's perspective.

Be honest and constructive:
- Identify genuine strengths that would impress reviewers
- Point out real weaknesses that could cost points
- Suggest specific improvements, not generic advice
- Consider competitive positioning

Return JSON: { "strengths": ["string"], "weaknesses": ["string"], "opportunities": ["string"], "threats": ["string"], "overallAssessment": "string", "improvementSuggestions": ["string"] }`;

  const messages: Message[] = [
    { role: "system", content: systemPrompt },
    {
      role: "user",
      content: `Application:\n${applicationContent}\n\nGrant Scoring Criteria:\n${grantCriteria || "Standard review criteria"}\n\nPlease analyze strengths and weaknesses.`,
    },
  ];

  const response = await invokeLLM({ messages, maxTokens: 3000 });
  const content = typeof response.content === "string" ? response.content : "";

  let result = { strengths: [] as string[], weaknesses: [] as string[], opportunities: [] as string[], threats: [] as string[], overallAssessment: content, improvementSuggestions: [] as string[] };
  try {
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      result = JSON.parse(jsonMatch[0]);
    }
  } catch {
    // Use raw content
  }

  await db.createGrantAIActivityLog({
    applicationId,
    action: "strength_analysis",
    input: applicationContent.substring(0, 500),
    output: JSON.stringify(result),
    userId: ctx.userId,
  });

  await db.updateGrantApplication(applicationId, {
    aiStrengthsWeaknesses: JSON.stringify(result),
  });

  return result;
}

export async function generateApplicationSteps(
  ctx: GrantAIContext,
  applicationId: number,
  grantProgramName: string,
  projectDescription: string,
): Promise<Array<{ stepNumber: number; stepName: string; category: string; description: string }>> {
  const systemPrompt = `You are a grant application process expert. Generate a comprehensive step-by-step workflow for completing a grant application.

Include steps for:
1. Eligibility verification
2. Research and data gathering
3. Narrative sections writing
4. Budget preparation
5. Document collection (letters of support, financial statements, etc.)
6. Internal review and approval
7. Submission preparation
8. Post-submission follow-up

Return JSON array: [{ "stepNumber": number, "stepName": "string", "category": "eligibility_check|research|narrative_writing|budget_preparation|document_collection|compliance_review|internal_review|submission|post_submission|reporting", "description": "string" }]`;

  const messages: Message[] = [
    { role: "system", content: systemPrompt },
    {
      role: "user",
      content: `Grant Program: ${grantProgramName}\nProject: ${projectDescription}\n\nGenerate the complete application workflow steps.`,
    },
  ];

  const response = await invokeLLM({ messages, maxTokens: 3000 });
  const content = typeof response.content === "string" ? response.content : "";

  let steps: Array<{ stepNumber: number; stepName: string; category: string; description: string }> = [];
  try {
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      steps = JSON.parse(jsonMatch[0]);
    }
  } catch {
    // Return default steps
    steps = getDefaultApplicationSteps();
  }

  if (steps.length === 0) {
    steps = getDefaultApplicationSteps();
  }

  // Save steps to database
  for (const step of steps) {
    await db.createGrantApplicationStep({
      applicationId,
      stepNumber: step.stepNumber,
      stepName: step.stepName,
      category: step.category as any,
      description: step.description,
      aiGenerated: true,
      sortOrder: step.stepNumber,
    });
  }

  await db.createGrantAIActivityLog({
    applicationId,
    action: "recommendation",
    input: `Generate workflow for: ${grantProgramName}`,
    output: JSON.stringify(steps),
    userId: ctx.userId,
  });

  return steps;
}

function getDefaultApplicationSteps() {
  return [
    { stepNumber: 1, stepName: "Verify Grant Eligibility", category: "eligibility_check", description: "Confirm your organization and project meet all eligibility requirements for this grant program." },
    { stepNumber: 2, stepName: "Research Funder Priorities", category: "research", description: "Research the funding organization's mission, past awards, and strategic priorities to align your application." },
    { stepNumber: 3, stepName: "Gather Organizational Data", category: "research", description: "Collect organizational data: mission statement, history, achievements, financial records, and staff qualifications." },
    { stepNumber: 4, stepName: "Write Statement of Need", category: "narrative_writing", description: "Draft a compelling needs statement with data and evidence supporting why this project is necessary." },
    { stepNumber: 5, stepName: "Write Project Description", category: "narrative_writing", description: "Detail your project approach, methodology, activities, and expected outcomes with measurable objectives." },
    { stepNumber: 6, stepName: "Write Goals & Objectives", category: "narrative_writing", description: "Define SMART goals and objectives that align with the funder's priorities and your project scope." },
    { stepNumber: 7, stepName: "Write Evaluation Plan", category: "narrative_writing", description: "Describe how you will measure success, collect data, and report on outcomes." },
    { stepNumber: 8, stepName: "Prepare Budget & Justification", category: "budget_preparation", description: "Create a detailed, line-item budget with narrative justification for each expense category." },
    { stepNumber: 9, stepName: "Write Sustainability Plan", category: "narrative_writing", description: "Explain how the project and its benefits will continue beyond the grant period." },
    { stepNumber: 10, stepName: "Collect Letters of Support", category: "document_collection", description: "Request and collect letters of support from partners, stakeholders, and community members." },
    { stepNumber: 11, stepName: "Gather Required Documents", category: "document_collection", description: "Collect required attachments: financial statements, tax-exempt letter, organizational chart, resumes, etc." },
    { stepNumber: 12, stepName: "Write Executive Summary", category: "narrative_writing", description: "Summarize the entire proposal concisely - write this last to ensure accuracy." },
    { stepNumber: 13, stepName: "Compliance Review", category: "compliance_review", description: "Review the complete application against the RFP/FOA checklist for completeness and compliance." },
    { stepNumber: 14, stepName: "Internal Review & Approval", category: "internal_review", description: "Route the application for internal review by leadership, finance, and legal teams." },
    { stepNumber: 15, stepName: "Final Edits & Formatting", category: "submission", description: "Make final edits, ensure proper formatting, page limits, and file naming conventions." },
    { stepNumber: 16, stepName: "Submit Application", category: "submission", description: "Submit the complete application package through the required portal before the deadline." },
    { stepNumber: 17, stepName: "Submission Confirmation", category: "post_submission", description: "Verify receipt of submission and save confirmation for records." },
    { stepNumber: 18, stepName: "Post-Award Setup", category: "reporting", description: "If awarded, set up reporting schedule, financial tracking, and project implementation plan." },
  ];
}

// AI Chat for Grant Applications - handles freeform questions
export async function processGrantAIChat(
  ctx: GrantAIContext,
  applicationId: number,
  userMessage: string,
  applicationContext?: string,
): Promise<{ response: string; suggestions: string[] }> {
  const systemPrompt = `You are an expert grant application AI assistant. You help users with all aspects of grant applications including:
- Finding and evaluating grant opportunities
- Writing compelling narratives and proposals
- Budget preparation and justification
- Compliance checks and common pitfalls
- Reviewing and strengthening applications
- Understanding funder requirements
- Timeline and deadline management

Be specific, actionable, and encouraging. Reference best practices from successful grant applications.
Provide your response, then suggest 2-3 follow-up actions the user might want to take.

Return JSON: { "response": "your detailed response", "suggestions": ["suggested next action 1", "suggested next action 2"] }`;

  const messages: Message[] = [
    { role: "system", content: systemPrompt },
  ];

  if (applicationContext) {
    messages.push({
      role: "user",
      content: `Current application context:\n${applicationContext}`,
    });
    messages.push({
      role: "assistant",
      content: "I have the context of your current grant application. How can I help?",
    });
  }

  messages.push({ role: "user", content: userMessage });

  const response = await invokeLLM({ messages, maxTokens: 2000 });
  const content = typeof response.content === "string" ? response.content : "";

  let result = { response: content, suggestions: [] as string[] };
  try {
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      result = JSON.parse(jsonMatch[0]);
    }
  } catch {
    // Use raw content
  }

  await db.createGrantAIActivityLog({
    applicationId,
    action: "recommendation",
    input: userMessage,
    output: result.response,
    userId: ctx.userId,
  });

  return result;
}
