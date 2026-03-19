import { invokeLLM } from "./_core/llm";

export async function screenCandidate(resumeText: string, jobRequirements: string): Promise<{
  score: number;
  summary: string;
  strengths: string[];
  weaknesses: string[];
  recommendation: string;
}> {
  const prompt = `You are an AI recruiting assistant. Analyze the following candidate resume against the job requirements and provide a structured evaluation.

Job Requirements:
${jobRequirements}

Resume:
${resumeText}

Respond in JSON format with these fields:
- score: number 0-100 representing overall fit
- summary: brief 2-3 sentence assessment
- strengths: array of key strengths relevant to the role
- weaknesses: array of gaps or concerns
- recommendation: one of "strong_yes", "yes", "maybe", "no"`;

  const response = await invokeLLM(prompt);
  try {
    return JSON.parse(response);
  } catch {
    return {
      score: 50,
      summary: response.slice(0, 500),
      strengths: [],
      weaknesses: [],
      recommendation: "maybe"
    };
  }
}

export async function generateInterviewQuestions(jobTitle: string, jobRequirements: string, candidateSummary?: string): Promise<{
  questions: Array<{ question: string; category: string; evaluationCriteria: string }>;
}> {
  const prompt = `You are an AI recruiting assistant. Generate 8 targeted interview questions for the following role.

Job Title: ${jobTitle}
Requirements: ${jobRequirements}
${candidateSummary ? `Candidate Background: ${candidateSummary}` : ''}

Respond in JSON format with a "questions" array, each item having:
- question: the interview question
- category: one of "technical", "behavioral", "situational", "culture_fit"
- evaluationCriteria: what a good answer should demonstrate`;

  const response = await invokeLLM(prompt);
  try {
    return JSON.parse(response);
  } catch {
    return { questions: [] };
  }
}

export async function evaluateInterview(
  questions: Array<{ question: string; answer: string }>,
  jobRequirements: string
): Promise<{
  overallScore: number;
  evaluation: string;
  questionScores: Array<{ questionIndex: number; score: number; feedback: string }>;
}> {
  const prompt = `You are an AI recruiting evaluator. Evaluate the following interview responses.

Job Requirements: ${jobRequirements}

Interview Q&A:
${questions.map((q, i) => `Q${i + 1}: ${q.question}\nA${i + 1}: ${q.answer}`).join('\n\n')}

Respond in JSON format with:
- overallScore: number 0-100
- evaluation: overall assessment paragraph
- questionScores: array with questionIndex, score (0-100), and feedback for each`;

  const response = await invokeLLM(prompt);
  try {
    return JSON.parse(response);
  } catch {
    return { overallScore: 50, evaluation: response.slice(0, 500), questionScores: [] };
  }
}

export async function generateOnboardingPlan(
  role: string,
  department: string,
  startDate: string
): Promise<{
  tasks: Array<{ name: string; description: string; category: string; dueDay: number; assignTo: string }>;
}> {
  const prompt = `You are an AI onboarding specialist. Generate a comprehensive 30-day onboarding plan.

Role: ${role}
Department: ${department}
Start Date: ${startDate}

Respond in JSON format with a "tasks" array, each item having:
- name: task title
- description: what needs to be done
- category: one of "paperwork", "it_setup", "training", "introductions", "compliance", "equipment"
- dueDay: number of days from start (0-30)
- assignTo: "hr", "it", "manager", "new_hire"`;

  const response = await invokeLLM(prompt);
  try {
    return JSON.parse(response);
  } catch {
    return { tasks: [] };
  }
}
