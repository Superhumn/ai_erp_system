import { invokeLLM } from "./_core/llm";
import type { Message } from "./_core/llm";
import { ENV } from "./_core/env";

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
 * `execute` runs arbitrary code on the app server's host and there is no true
 * sandbox in this stack (production is a plain node:alpine container on
 * Railway/Docker — no bwrap/nsjail/containers-per-run), so it is disabled
 * unless explicitly opted in. Resolution lives in `ENV.codeExecEnabled`:
 * `CODE_EXEC_ENABLED` wins when set; otherwise on only for an explicit
 * `NODE_ENV` of `development`/`test`, off everywhere else (staging, prod, or
 * unset) so an ambiguous environment never quietly allows host RCE.
 */
export function isCodeExecutionEnabled(): boolean {
  return ENV.codeExecEnabled;
}

/** Whether the operator asked us to drop the executed process into its own
 * (network-less) namespace via util-linux `unshare`. Best-effort and opt-in —
 * off by default because it depends on kernel/container privileges that aren't
 * guaranteed. When on and `unshare` is present, executed code cannot reach the
 * network (no exfiltration / SSRF / pivoting). */
function wantsNetworkIsolation(): boolean {
  return ENV.codeExecNetworkIsolation;
}

// Isolation args used both for the real capability probe and the actual run,
// so the probe tests exactly what execution will do.
const NET_ISOLATION_ARGS = ["--net", "--map-root-user"];

let _canNetworkIsolate: boolean | null = null;
/**
 * Whether this host can actually create the network-less namespace we use.
 * `unshare --version` succeeding is not enough — a container/kernel can allow
 * the binary while forbidding unprivileged `--net --map-root-user`. So probe
 * with the real flags (running `true` inside the namespace); the result is
 * cached since kernel capabilities don't change within a process.
 */
async function canNetworkIsolate(): Promise<boolean> {
  if (_canNetworkIsolate !== null) return _canNetworkIsolate;
  try {
    const { spawnSync } = await import("child_process");
    const res = spawnSync("unshare", [...NET_ISOLATION_ARGS, "--", "true"], { timeout: 2000 });
    _canNetworkIsolate = res.status === 0;
  } catch {
    _canNetworkIsolate = false;
  }
  return _canNetworkIsolate;
}

export type CodeExecutionStatus = "completed" | "failed" | "timeout";

export async function executeCodeSandboxed(code: string, language: string): Promise<{
  output: string;
  errorOutput: string;
  exitCode: number;
  executionTimeMs: number;
  status: CodeExecutionStatus;
}> {
  const { spawn } = await import("child_process");

  // Secure-by-default gate. Refuse to run unless this deployment has opted in.
  if (!isCodeExecutionEnabled()) {
    return {
      output: "",
      errorOutput:
        "Code execution is disabled on this deployment. An administrator must set CODE_EXEC_ENABLED=true to enable it (runs code on the server host).",
      exitCode: 1,
      executionTimeMs: 0,
      status: "failed",
    };
  }

  const fileExt: Record<string, string> = {
    javascript: "js",
    typescript: "ts",
    python: "py",
    bash: "sh",
    sh: "sh",
  };
  const lang = language.toLowerCase();
  const ext = fileExt[lang];
  if (!ext) {
    return {
      output: "",
      errorOutput: `Unsupported language for execution: ${language}. Supported: ${Object.keys(fileExt).join(", ")}`,
      exitCode: 1,
      executionTimeMs: 0,
      status: "failed",
    };
  }

  // Resolve the interpreter deterministically. Use absolute `node`
  // (process.execPath) and resolve the bundled `tsx` from our own
  // node_modules — never `npx`, which walks up from the run's temp cwd, can't
  // find the local install, and would try a network download each run.
  const buildInterpreter = async (scriptFile: string): Promise<{ cmd: string; args: string[] } | { error: string }> => {
    if (lang === "javascript") return { cmd: process.execPath, args: [scriptFile] };
    if (lang === "python") return { cmd: "python3", args: [scriptFile] };
    if (lang === "bash") return { cmd: "bash", args: [scriptFile] };
    if (lang === "sh") return { cmd: "sh", args: [scriptFile] };
    // typescript
    try {
      const { createRequire } = await import("module");
      const tsxEntry = createRequire(import.meta.url).resolve("tsx");
      return { cmd: process.execPath, args: ["--import", tsxEntry, scriptFile] };
    } catch {
      return { error: "TypeScript execution is unavailable on this deployment (the `tsx` runtime is not installed)." };
    }
  };

  const TIMEOUT_MS = 30000; // 30 second timeout

  const os = await import("os");
  const fs = await import("fs/promises");
  const path = await import("path");

  // Give each run its own throwaway working directory so code can't read or
  // clobber the app tree — or another run — via relative paths. Cleaned up in
  // `finally`.
  const cwd = await fs.mkdtemp(path.join(os.tmpdir(), "code-exec-"));

  try {
    // Write the code to a file inside the run dir rather than passing it in
    // argv: command-line args are visible via `ps`/procfs and are capped in
    // length, so large snippets would be exposed or truncated.
    const scriptFile = path.join(cwd, `main.${ext}`);
    await fs.writeFile(scriptFile, code, "utf8");

    const interpreter = await buildInterpreter(scriptFile);
    if ("error" in interpreter) {
      return {
        output: "",
        errorOutput: interpreter.error,
        exitCode: 1,
        executionTimeMs: 0,
        status: "failed",
      };
    }

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
    // code cannot reach the network. When the operator has opted in we FAIL
    // CLOSED: if the host can't actually provide the namespace we refuse to run
    // rather than silently execute with network access (which would defeat the
    // point of enabling isolation).
    let cmd = interpreter.cmd;
    let cmdArgs = interpreter.args;
    if (wantsNetworkIsolation()) {
      if (await canNetworkIsolate()) {
        // --map-root-user lets this work without host privileges (user
        // namespace); --net gives an isolated, network-less namespace.
        cmdArgs = [...NET_ISOLATION_ARGS, "--", cmd, ...cmdArgs];
        cmd = "unshare";
      } else {
        return {
          output: "",
          errorOutput:
            "Network isolation is enabled (CODE_EXEC_NETWORK_ISOLATION) but this host can't create an unprivileged network namespace (`unshare --net --map-root-user`). Refusing to run without the requested isolation — fix the host/container capabilities or unset the flag.",
          exitCode: 1,
          executionTimeMs: 0,
          status: "failed",
        };
      }
    }

    return await new Promise((resolve) => {
      const startTime = Date.now();
      let stdout = "";
      let stderr = "";
      let overflow = false;
      let timedOut = false;

      // detached:true makes the child a process-group leader so we can signal
      // the whole tree. The `unshare` wrapper (and any subprocess the run
      // spawns) creates grandchildren that a plain proc.kill() would orphan;
      // killing the group reaps them.
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
        // Report an explicit status so callers don't have to reverse-engineer
        // the kill reason from the exit code (timeout vs. output-overflow both
        // exit 137).
        const status: CodeExecutionStatus = timedOut
          ? "timeout"
          : (overflow || (exitCode ?? 1) !== 0)
            ? "failed"
            : "completed";
        resolve({
          output: stdout.slice(0, 100000),
          errorOutput,
          exitCode: (timedOut || overflow) ? 137 : (exitCode ?? 1),
          executionTimeMs,
          status,
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
          status: "failed",
        });
      });
    });
  } finally {
    // Always remove the throwaway working directory.
    await fs.rm(cwd, { recursive: true, force: true }).catch(() => {});
  }
}
