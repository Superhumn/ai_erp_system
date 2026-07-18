import { invokeLLM } from "./_core/llm";
import type { Message } from "./_core/llm";

export type CodeAction = "generate" | "explain" | "debug" | "refactor" | "review" | "test" | "document" | "optimize";

const ACTION_PROMPTS: Record<CodeAction, string> = {
  generate: `You are an expert code generator. Generate clean, well-structured, production-ready code based on the user's request. Include proper error handling and follow best practices for the specified language. Return ONLY the code without markdown code fences unless the user asks for an explanation.`,

  explain: `You are an expert code teacher. Explain the provided code clearly and thoroughly. Cover:
- What the code does at a high level
- How each section works
- Key patterns and techniques used
- Potential edge cases or gotchas
Format your response with clear sections and bullet points.`,

  debug: `You are an expert debugger. Analyze the provided code for bugs, errors, and potential issues. For each issue found:
1. Identify the bug and its location
2. Explain why it's a problem
3. Provide the corrected code
If no bugs are found, suggest potential improvements for robustness.`,

  refactor: `You are an expert code refactoring specialist. Refactor the provided code to improve:
- Code readability and clarity
- Performance where applicable
- Adherence to SOLID principles and best practices
- Reducing duplication
Provide the refactored code and briefly explain the key changes made.`,

  review: `You are an expert code reviewer. Review the provided code and provide feedback on:
- Code quality and readability
- Potential bugs or security vulnerabilities
- Performance considerations
- Best practice adherence
- Suggestions for improvement
Rate the code quality from 1-10 and format as a structured code review.`,

  test: `You are an expert test engineer. Generate comprehensive unit tests for the provided code. Include:
- Happy path tests
- Edge case tests
- Error handling tests
Use the most appropriate testing framework for the language (Jest for TypeScript/JavaScript, pytest for Python, etc.).`,

  document: `You are an expert technical writer. Generate comprehensive documentation for the provided code including:
- JSDoc/docstring comments for all functions and classes
- Parameter descriptions and return types
- Usage examples
- Any important notes or caveats
Return the code with documentation added inline.`,

  optimize: `You are a performance optimization expert. Analyze and optimize the provided code for:
- Time complexity improvements
- Memory usage reduction
- Algorithmic improvements
- Language-specific optimizations
Provide the optimized code and explain what changed and why, with Big-O analysis where relevant.`,
};

export interface CodeAIRequest {
  action: CodeAction;
  prompt: string;
  code?: string;
  language: string;
  context?: string;
}

export interface CodeAIResponse {
  outputCode: string | null;
  explanation: string;
  model: string;
  tokensUsed: number;
}

export async function processCodeAIRequest(request: CodeAIRequest): Promise<CodeAIResponse> {
  const { action, prompt, code, language, context } = request;

  const systemPrompt = ACTION_PROMPTS[action];

  let userMessage = prompt;
  if (code) {
    userMessage += `\n\nLanguage: ${language}\n\nCode:\n\`\`\`${language}\n${code}\n\`\`\``;
  } else {
    userMessage += `\n\nLanguage: ${language}`;
  }

  if (context) {
    userMessage += `\n\nAdditional context: ${context}`;
  }

  const messages: Message[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userMessage },
  ];

  const result = await invokeLLM({
    messages,
    maxTokens: 8192,
  });

  const responseContent = result.choices[0]?.message?.content;
  const responseText = typeof responseContent === "string"
    ? responseContent
    : Array.isArray(responseContent)
      ? responseContent.map(p => ("text" in p ? p.text : "")).join("")
      : "";

  // Parse out code blocks if present
  let outputCode: string | null = null;
  let explanation = responseText;

  const codeBlockMatch = responseText.match(/```[\w]*\n([\s\S]*?)```/);
  if (codeBlockMatch && ["generate", "debug", "refactor", "test", "document", "optimize"].includes(action)) {
    outputCode = codeBlockMatch[1].trim();
    explanation = responseText.replace(/```[\w]*\n[\s\S]*?```/, "").trim();
    if (!explanation) {
      explanation = `${action.charAt(0).toUpperCase() + action.slice(1)} completed successfully.`;
    }
  } else if (action === "generate" && !codeBlockMatch) {
    // If generate action returned code without fences, treat entire response as code
    outputCode = responseText.trim();
    explanation = "Code generated successfully.";
  }

  return {
    outputCode,
    explanation,
    model: result.model,
    tokensUsed: result.usage?.total_tokens ?? 0,
  };
}

export async function executeCodeSandboxed(code: string, language: string): Promise<{
  output: string;
  errorOutput: string;
  exitCode: number;
  executionTimeMs: number;
}> {
  const { spawn } = await import("child_process");

  const langConfig: Record<string, { cmd: string; args: string[]; fileExt: string }> = {
    javascript: { cmd: "node", args: ["-e"], fileExt: "js" },
    typescript: { cmd: "npx", args: ["tsx", "-e"], fileExt: "ts" },
    python: { cmd: "python3", args: ["-c"], fileExt: "py" },
    bash: { cmd: "bash", args: ["-c"], fileExt: "sh" },
    sh: { cmd: "sh", args: ["-c"], fileExt: "sh" },
  };

  const config = langConfig[language.toLowerCase()];
  if (!config) {
    return {
      output: "",
      errorOutput: `Unsupported language for execution: ${language}. Supported: ${Object.keys(langConfig).join(", ")}`,
      exitCode: 1,
      executionTimeMs: 0,
    };
  }

  const TIMEOUT_MS = 30000; // 30 second timeout

  // Run in an isolated temp directory so executed code can't read or clobber
  // the app's working tree via relative paths.
  const os = await import("os");
  const cwd = os.tmpdir();

  // Do NOT inherit the server's full environment — it holds DB credentials,
  // API keys, OAuth secrets, etc. Executed code runs on the host, so it must
  // only see the minimum needed to locate the interpreter. This is not a real
  // sandbox (no container/jail); it's least-privilege damage limitation.
  const minimalEnv: NodeJS.ProcessEnv = {
    PATH: process.env.PATH,
    HOME: os.homedir(),
    TMPDIR: cwd,
    LANG: process.env.LANG,
    NODE_NO_WARNINGS: "1",
  };

  return new Promise((resolve) => {
    const startTime = Date.now();
    let stdout = "";
    let stderr = "";
    let killed = false;

    const proc = spawn(config.cmd, [...config.args, code], {
      timeout: TIMEOUT_MS,
      killSignal: "SIGKILL", // ensure runaway/timed-out processes are actually killed
      cwd,
      env: minimalEnv,
    });

    proc.stdout.on("data", (data: Buffer) => {
      stdout += data.toString();
      if (stdout.length > 100000) {
        proc.kill();
        killed = true;
      }
    });

    proc.stderr.on("data", (data: Buffer) => {
      stderr += data.toString();
      if (stderr.length > 100000) {
        proc.kill();
        killed = true;
      }
    });

    proc.on("close", (exitCode: number | null) => {
      const executionTimeMs = Date.now() - startTime;
      resolve({
        output: stdout.slice(0, 100000),
        errorOutput: killed ? stderr.slice(0, 100000) + "\n[Output truncated]" : stderr.slice(0, 100000),
        exitCode: killed ? 137 : (exitCode ?? 1),
        executionTimeMs,
      });
    });

    proc.on("error", (err: Error) => {
      const executionTimeMs = Date.now() - startTime;
      resolve({
        output: "",
        errorOutput: `Failed to execute: ${err.message}`,
        exitCode: 1,
        executionTimeMs,
      });
    });
  });
}
