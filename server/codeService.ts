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

/**
 * Whether server-side code execution is permitted on this deployment.
 *
 * `execute` runs arbitrary code on the app server's host. There is no true
 * sandbox available in this stack (production is a plain node:alpine
 * container on Railway/Docker — no bwrap/nsjail/containers-per-run), so the
 * only safe default is to keep it OFF in production and require an operator to
 * consciously opt in.
 *
 * - `CODE_EXEC_ENABLED=true` (or `1`) force-enables it anywhere.
 * - `CODE_EXEC_ENABLED=false` (or `0`) force-disables it anywhere.
 * - Unset: enabled outside production (dev/test DX), disabled in production.
 */
export function isCodeExecutionEnabled(): boolean {
  const flag = process.env.CODE_EXEC_ENABLED;
  if (flag !== undefined) return flag === "true" || flag === "1";
  return process.env.NODE_ENV !== "production";
}

/** Whether the operator asked us to drop the executed process into its own
 * (network-less) namespace via util-linux `unshare`. Best-effort and opt-in —
 * off by default because it depends on kernel/container privileges that aren't
 * guaranteed. When on and `unshare` is present, executed code cannot reach the
 * network (no exfiltration / SSRF / pivoting). */
function wantsNetworkIsolation(): boolean {
  const flag = process.env.CODE_EXEC_NETWORK_ISOLATION;
  return flag === "true" || flag === "1";
}

let _unshareAvailable: boolean | null = null;
async function unshareAvailable(): Promise<boolean> {
  if (_unshareAvailable !== null) return _unshareAvailable;
  try {
    const { spawnSync } = await import("child_process");
    const res = spawnSync("unshare", ["--version"], { timeout: 2000 });
    _unshareAvailable = res.status === 0;
  } catch {
    _unshareAvailable = false;
  }
  return _unshareAvailable;
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

  // Secure-by-default gate. Refuse to run unless this deployment has opted in.
  if (!isCodeExecutionEnabled()) {
    return {
      output: "",
      errorOutput:
        "Code execution is disabled on this deployment. An administrator must set CODE_EXEC_ENABLED=true to enable it (runs code on the server host).",
      exitCode: 1,
      executionTimeMs: 0,
    };
  }

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

  const os = await import("os");
  const fs = await import("fs/promises");
  const path = await import("path");

  // Give each run its own throwaway working directory so code can't read or
  // clobber the app tree — or another run — via relative paths. Cleaned up in
  // `finally`.
  const cwd = await fs.mkdtemp(path.join(os.tmpdir(), "code-exec-"));

  // Do NOT inherit the server's full environment — it holds DB credentials,
  // API keys, OAuth secrets, etc. Executed code runs on the host, so it must
  // only see the minimum needed to locate the interpreter. This is
  // least-privilege damage limitation, not a real jail.
  const minimalEnv: NodeJS.ProcessEnv = {
    // Fall back to a conservative default so interpreters resolve even on
    // minimal images where the server process has no PATH set.
    PATH: process.env.PATH || "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin",
    HOME: cwd,
    TMPDIR: cwd,
    LANG: process.env.LANG,
    NODE_NO_WARNINGS: "1",
    // Cap heap for node/tsx runs so a run can't OOM the server host.
    NODE_OPTIONS: "--max-old-space-size=256",
  };

  // Optionally drop the process into its own network namespace so executed
  // code cannot reach the network. Best-effort: only if the operator opted in
  // AND `unshare` is present; otherwise run without it.
  let cmd = config.cmd;
  let cmdArgs = [...config.args, code];
  if (wantsNetworkIsolation() && (await unshareAvailable())) {
    // --map-root-user lets this work without host privileges (user namespace);
    // --net gives an isolated, network-less namespace.
    cmdArgs = ["--net", "--map-root-user", "--", cmd, ...cmdArgs];
    cmd = "unshare";
  }

  try {
    return await new Promise((resolve) => {
      const startTime = Date.now();
      let stdout = "";
      let stderr = "";
      let overflow = false;
      let timedOut = false;

      // detached:true makes the child a process-group leader so we can signal
      // the whole tree. `npx tsx` and the `unshare` wrapper spawn grandchildren
      // that a plain proc.kill() would orphan; killing the group reaps them.
      const proc = spawn(cmd, cmdArgs, {
        cwd,
        env: minimalEnv,
        detached: true,
      });

      const killTree = (signal: NodeJS.Signals) => {
        try {
          if (proc.pid !== undefined) process.kill(-proc.pid, signal);
          else proc.kill(signal);
        } catch {
          try { proc.kill(signal); } catch { /* already exited */ }
        }
      };

      // Enforce the wall-clock limit ourselves so we can kill the whole group
      // (spawn's own `timeout` only signals the direct child).
      const timer = setTimeout(() => {
        timedOut = true;
        killTree("SIGKILL");
      }, TIMEOUT_MS);

      proc.stdout.on("data", (data: Buffer) => {
        stdout += data.toString();
        if (stdout.length > 100000) { overflow = true; killTree("SIGKILL"); }
      });

      proc.stderr.on("data", (data: Buffer) => {
        stderr += data.toString();
        if (stderr.length > 100000) { overflow = true; killTree("SIGKILL"); }
      });

      proc.on("close", (exitCode: number | null) => {
        clearTimeout(timer);
        const executionTimeMs = Date.now() - startTime;
        let errorOutput = stderr.slice(0, 100000);
        if (timedOut) errorOutput += `\n[Killed: exceeded ${TIMEOUT_MS / 1000}s time limit]`;
        else if (overflow) errorOutput += "\n[Output truncated]";
        resolve({
          output: stdout.slice(0, 100000),
          errorOutput,
          exitCode: (timedOut || overflow) ? 137 : (exitCode ?? 1),
          executionTimeMs,
        });
      });

      proc.on("error", (err: Error) => {
        clearTimeout(timer);
        const executionTimeMs = Date.now() - startTime;
        resolve({
          output: "",
          errorOutput: `Failed to execute: ${err.message}`,
          exitCode: 1,
          executionTimeMs,
        });
      });
    });
  } finally {
    // Always remove the throwaway working directory.
    await fs.rm(cwd, { recursive: true, force: true }).catch(() => {});
  }
}
