import puppeteer, { type Browser, type Page } from "puppeteer";
import { invokeLLM, type Message, type Tool } from "./_core/llm";
import { nanoid } from "nanoid";

// ============================================
// OFFLINE PLATFORM AGENT
// Browser-based AI automation that interacts with any web platform
// without requiring API access - similar to twin.so
// ============================================

export interface PlatformProfile {
  id: string;
  name: string;
  url: string;
  description: string;
  category: "crm" | "ecommerce" | "accounting" | "social" | "email" | "hr" | "custom";
  icon?: string;
  loginSelectors?: {
    usernameField?: string;
    passwordField?: string;
    submitButton?: string;
    mfaField?: string;
  };
  defaultViewport?: { width: number; height: number };
}

export interface PlatformSession {
  id: string;
  platformId: string;
  platformName: string;
  status: "idle" | "running" | "waiting_input" | "completed" | "failed" | "paused";
  createdAt: Date;
  updatedAt: Date;
  currentUrl?: string;
  taskDescription?: string;
  steps: SessionStep[];
  credentials?: { username: string };
  error?: string;
}

export interface SessionStep {
  id: string;
  action: string;
  description: string;
  status: "pending" | "executing" | "completed" | "failed";
  screenshot?: string; // base64
  timestamp: Date;
  result?: string;
  error?: string;
}

export interface TaskRequest {
  sessionId: string;
  task: string;
  platformId: string;
  credentials?: {
    username: string;
    password: string;
  };
}

export interface TaskResult {
  success: boolean;
  message: string;
  steps: SessionStep[];
  data?: Record<string, unknown>;
  screenshot?: string;
}

// Built-in platform profiles
export const PLATFORM_PROFILES: PlatformProfile[] = [
  {
    id: "salesforce",
    name: "Salesforce",
    url: "https://login.salesforce.com",
    description: "CRM - manage leads, contacts, opportunities, and accounts",
    category: "crm",
    loginSelectors: {
      usernameField: "#username",
      passwordField: "#password",
      submitButton: "#Login",
    },
  },
  {
    id: "hubspot",
    name: "HubSpot",
    url: "https://app.hubspot.com",
    description: "CRM & Marketing - manage contacts, deals, and campaigns",
    category: "crm",
    loginSelectors: {
      usernameField: "#username",
      passwordField: "#password",
      submitButton: "#loginBtn",
    },
  },
  {
    id: "quickbooks-online",
    name: "QuickBooks Online",
    url: "https://app.qbo.intuit.com",
    description: "Accounting - invoices, expenses, reports, and reconciliation",
    category: "accounting",
  },
  {
    id: "xero",
    name: "Xero",
    url: "https://login.xero.com",
    description: "Accounting - invoicing, bank reconciliation, and reporting",
    category: "accounting",
  },
  {
    id: "shopify-admin",
    name: "Shopify Admin",
    url: "https://admin.shopify.com",
    description: "E-commerce - manage products, orders, inventory, and customers",
    category: "ecommerce",
  },
  {
    id: "amazon-seller",
    name: "Amazon Seller Central",
    url: "https://sellercentral.amazon.com",
    description: "E-commerce - manage Amazon listings, orders, and inventory",
    category: "ecommerce",
  },
  {
    id: "linkedin",
    name: "LinkedIn",
    url: "https://www.linkedin.com",
    description: "Social - outreach, messaging, and lead generation",
    category: "social",
  },
  {
    id: "gmail",
    name: "Gmail",
    url: "https://mail.google.com",
    description: "Email - read, compose, organize, and manage emails",
    category: "email",
  },
  {
    id: "gusto",
    name: "Gusto",
    url: "https://app.gusto.com",
    description: "HR & Payroll - manage employees, payroll, and benefits",
    category: "hr",
  },
  {
    id: "bamboohr",
    name: "BambooHR",
    url: "https://app.bamboohr.com",
    description: "HR - employee management, time tracking, and reporting",
    category: "hr",
  },
];

// AI tools available to the browser agent
const BROWSER_TOOLS: Tool[] = [
  {
    type: "function",
    function: {
      name: "navigate",
      description: "Navigate to a URL",
      parameters: {
        type: "object",
        properties: {
          url: { type: "string", description: "The URL to navigate to" },
        },
        required: ["url"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "click",
      description: "Click on an element identified by CSS selector or text content",
      parameters: {
        type: "object",
        properties: {
          selector: { type: "string", description: "CSS selector of the element to click" },
          text: { type: "string", description: "Visible text content to find and click on" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "type_text",
      description: "Type text into an input field",
      parameters: {
        type: "object",
        properties: {
          selector: { type: "string", description: "CSS selector of the input field" },
          text: { type: "string", description: "Text to type" },
          clearFirst: { type: "boolean", description: "Whether to clear the field first" },
        },
        required: ["selector", "text"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "select_option",
      description: "Select an option from a dropdown/select element",
      parameters: {
        type: "object",
        properties: {
          selector: { type: "string", description: "CSS selector of the select element" },
          value: { type: "string", description: "Value or visible text of the option" },
        },
        required: ["selector", "value"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "scroll",
      description: "Scroll the page or an element",
      parameters: {
        type: "object",
        properties: {
          direction: { type: "string", enum: ["up", "down"], description: "Scroll direction" },
          amount: { type: "number", description: "Pixels to scroll (default 500)" },
          selector: { type: "string", description: "Optional CSS selector to scroll within" },
        },
        required: ["direction"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "read_page",
      description: "Extract the text content and structure of the current page",
      parameters: {
        type: "object",
        properties: {
          selector: { type: "string", description: "Optional CSS selector to read a specific section" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "take_screenshot",
      description: "Take a screenshot of the current page state",
      parameters: {
        type: "object",
        properties: {},
      },
    },
  },
  {
    type: "function",
    function: {
      name: "wait",
      description: "Wait for an element to appear or for a specified time",
      parameters: {
        type: "object",
        properties: {
          selector: { type: "string", description: "CSS selector to wait for" },
          timeout: { type: "number", description: "Max time to wait in ms (default 5000)" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "extract_data",
      description: "Extract structured data from the page (tables, lists, forms)",
      parameters: {
        type: "object",
        properties: {
          selector: { type: "string", description: "CSS selector of the container" },
          format: { type: "string", enum: ["table", "list", "form", "text"], description: "Expected data format" },
        },
        required: ["format"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "fill_form",
      description: "Fill multiple form fields at once",
      parameters: {
        type: "object",
        properties: {
          fields: {
            type: "array",
            items: {
              type: "object",
              properties: {
                selector: { type: "string" },
                value: { type: "string" },
                type: { type: "string", enum: ["text", "select", "checkbox", "radio"] },
              },
              required: ["selector", "value"],
            },
            description: "Array of form fields to fill",
          },
        },
        required: ["fields"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "task_complete",
      description: "Signal that the task has been completed successfully",
      parameters: {
        type: "object",
        properties: {
          summary: { type: "string", description: "Summary of what was accomplished" },
          data: { type: "object", description: "Any data extracted during the task" },
        },
        required: ["summary"],
      },
    },
  },
];

// Session store (in-memory, could be moved to DB)
const activeSessions = new Map<string, {
  session: PlatformSession;
  browser?: Browser;
  page?: Page;
}>();

async function getPageContent(page: Page, selector?: string): Promise<string> {
  return page.evaluate((sel) => {
    const root = sel ? document.querySelector(sel) : document.body;
    if (!root) return "Element not found";

    function extractText(node: Element, depth: number = 0): string {
      const lines: string[] = [];
      const tag = node.tagName.toLowerCase();
      const indent = "  ".repeat(depth);

      // Skip hidden elements
      const style = window.getComputedStyle(node);
      if (style.display === "none" || style.visibility === "hidden") return "";

      // Get role and aria-label for interactive elements
      const role = node.getAttribute("role") || "";
      const ariaLabel = node.getAttribute("aria-label") || "";
      const placeholder = node.getAttribute("placeholder") || "";
      const href = node.getAttribute("href") || "";
      const type = node.getAttribute("type") || "";
      const name = node.getAttribute("name") || "";
      const id = node.id ? `#${node.id}` : "";
      const classes = node.className && typeof node.className === "string"
        ? `.${node.className.split(" ").filter(Boolean).slice(0, 2).join(".")}`
        : "";

      const identifier = id || classes;

      if (["input", "textarea", "select"].includes(tag)) {
        const value = (node as HTMLInputElement).value || "";
        lines.push(`${indent}[${tag}${identifier} type=${type} name=${name} placeholder="${placeholder}" value="${value}"]`);
      } else if (tag === "button" || role === "button") {
        lines.push(`${indent}[button${identifier}] ${node.textContent?.trim().substring(0, 100)}`);
      } else if (tag === "a") {
        lines.push(`${indent}[link${identifier} href="${href}"] ${node.textContent?.trim().substring(0, 100)}`);
      } else if (["h1", "h2", "h3", "h4", "h5", "h6"].includes(tag)) {
        lines.push(`${indent}[${tag}] ${node.textContent?.trim().substring(0, 200)}`);
      } else if (tag === "img") {
        const alt = node.getAttribute("alt") || "";
        lines.push(`${indent}[img alt="${alt}"]`);
      } else if (["table", "tr", "td", "th"].includes(tag)) {
        lines.push(`${indent}[${tag}${identifier}] ${node.textContent?.trim().substring(0, 200)}`);
      } else {
        const directText = Array.from(node.childNodes)
          .filter((n) => n.nodeType === Node.TEXT_NODE)
          .map((n) => n.textContent?.trim())
          .filter(Boolean)
          .join(" ");
        if (directText) {
          lines.push(`${indent}${directText.substring(0, 200)}`);
        }
        for (const child of Array.from(node.children)) {
          const childText = extractText(child, depth + 1);
          if (childText) lines.push(childText);
        }
      }

      return lines.filter(Boolean).join("\n");
    }

    return extractText(root).substring(0, 8000);
  }, selector);
}

async function executeToolCall(
  page: Page,
  toolName: string,
  args: Record<string, unknown>
): Promise<{ result: string; screenshot?: string }> {
  try {
    switch (toolName) {
      case "navigate": {
        await page.goto(args.url as string, { waitUntil: "networkidle2", timeout: 30000 });
        return { result: `Navigated to ${page.url()}` };
      }
      case "click": {
        if (args.text) {
          // Find element by visible text
          const clicked = await page.evaluate((text) => {
            const elements = document.querySelectorAll("a, button, [role='button'], input[type='submit'], [onclick]");
            for (const el of Array.from(elements)) {
              if (el.textContent?.trim().toLowerCase().includes((text as string).toLowerCase())) {
                (el as HTMLElement).click();
                return true;
              }
            }
            return false;
          }, args.text);
          if (!clicked) return { result: `Could not find element with text: ${args.text}` };
          await page.waitForNetworkIdle({ timeout: 5000 }).catch(() => {});
          return { result: `Clicked element with text: ${args.text}` };
        }
        if (args.selector) {
          await page.click(args.selector as string);
          await page.waitForNetworkIdle({ timeout: 5000 }).catch(() => {});
          return { result: `Clicked: ${args.selector}` };
        }
        return { result: "No selector or text provided" };
      }
      case "type_text": {
        const selector = args.selector as string;
        if (args.clearFirst) {
          await page.click(selector, { count: 3 });
        }
        await page.type(selector, args.text as string, { delay: 30 });
        return { result: `Typed text into ${selector}` };
      }
      case "select_option": {
        await page.select(args.selector as string, args.value as string);
        return { result: `Selected "${args.value}" in ${args.selector}` };
      }
      case "scroll": {
        const dir = args.direction as string;
        const amount = (args.amount as number) || 500;
        const scrollSelector = args.selector as string | undefined;
        await page.evaluate(
          (s, d, a) => {
            const el = s ? document.querySelector(s) : window;
            const scrollAmount = d === "down" ? a : -a;
            if (el === window) {
              window.scrollBy(0, scrollAmount);
            } else if (el) {
              (el as Element).scrollTop += scrollAmount;
            }
          },
          scrollSelector,
          dir,
          amount
        );
        return { result: `Scrolled ${dir} by ${amount}px` };
      }
      case "read_page": {
        const content = await getPageContent(page, args.selector as string);
        return { result: content };
      }
      case "take_screenshot": {
        const screenshotBuffer = await page.screenshot({ encoding: "base64", fullPage: false });
        return { result: "Screenshot taken", screenshot: screenshotBuffer as string };
      }
      case "wait": {
        const timeout = (args.timeout as number) || 5000;
        if (args.selector) {
          await page.waitForSelector(args.selector as string, { timeout });
          return { result: `Element ${args.selector} appeared` };
        }
        await new Promise((r) => setTimeout(r, timeout));
        return { result: `Waited ${timeout}ms` };
      }
      case "extract_data": {
        const format = args.format as string;
        const sel = args.selector as string | undefined;
        const data = await page.evaluate(
          (s, f) => {
            const container = s ? document.querySelector(s) : document.body;
            if (!container) return "Container not found";

            if (f === "table") {
              const tables = container.querySelectorAll("table");
              const results: string[][] = [];
              tables.forEach((table) => {
                const rows = table.querySelectorAll("tr");
                rows.forEach((row) => {
                  const cells = Array.from(row.querySelectorAll("td, th")).map(
                    (cell) => cell.textContent?.trim() || ""
                  );
                  results.push(cells);
                });
              });
              return JSON.stringify(results);
            }
            if (f === "list") {
              const items = container.querySelectorAll("li, [role='listitem']");
              return JSON.stringify(Array.from(items).map((li) => li.textContent?.trim()));
            }
            if (f === "form") {
              const inputs = container.querySelectorAll("input, select, textarea");
              const formData: Record<string, string> = {};
              inputs.forEach((input) => {
                const name = input.getAttribute("name") || input.id || "";
                formData[name] = (input as HTMLInputElement).value || "";
              });
              return JSON.stringify(formData);
            }
            return container.textContent?.trim().substring(0, 5000) || "";
          },
          sel,
          format
        );
        return { result: data };
      }
      case "fill_form": {
        const fields = args.fields as Array<{ selector: string; value: string; type?: string }>;
        for (const field of fields) {
          if (field.type === "select") {
            await page.select(field.selector, field.value);
          } else if (field.type === "checkbox" || field.type === "radio") {
            const isChecked = await page.$eval(field.selector, (el) => (el as HTMLInputElement).checked);
            if ((field.value === "true") !== isChecked) {
              await page.click(field.selector);
            }
          } else {
            await page.click(field.selector, { count: 3 });
            await page.type(field.selector, field.value, { delay: 20 });
          }
        }
        return { result: `Filled ${fields.length} form fields` };
      }
      case "task_complete": {
        return { result: `Task completed: ${args.summary}` };
      }
      default:
        return { result: `Unknown tool: ${toolName}` };
    }
  } catch (error) {
    return { result: `Error executing ${toolName}: ${(error as Error).message}` };
  }
}

export async function createSession(
  platformId: string,
  customUrl?: string
): Promise<PlatformSession> {
  const profile = PLATFORM_PROFILES.find((p) => p.id === platformId);
  const session: PlatformSession = {
    id: nanoid(),
    platformId,
    platformName: profile?.name || customUrl || "Custom Platform",
    status: "idle",
    createdAt: new Date(),
    updatedAt: new Date(),
    currentUrl: customUrl || profile?.url || "",
    steps: [],
  };
  activeSessions.set(session.id, { session });
  return session;
}

export async function startBrowser(sessionId: string): Promise<void> {
  const entry = activeSessions.get(sessionId);
  if (!entry) throw new Error("Session not found");

  const browser = await puppeteer.launch({
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--window-size=1280,900",
    ],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });
  await page.setUserAgent(
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
  );

  entry.browser = browser;
  entry.page = page;
  entry.session.status = "idle";
  entry.session.updatedAt = new Date();
}

export async function executeTask(request: TaskRequest): Promise<TaskResult> {
  const entry = activeSessions.get(request.sessionId);
  if (!entry) throw new Error("Session not found");

  if (!entry.browser || !entry.page) {
    await startBrowser(request.sessionId);
  }

  const page = entry.page!;
  const session = entry.session;
  session.status = "running";
  session.taskDescription = request.task;
  session.updatedAt = new Date();

  const profile = PLATFORM_PROFILES.find((p) => p.id === request.platformId);
  const platformUrl = session.currentUrl || profile?.url || "";

  // Navigate to the platform if we're not there already
  const currentUrl = page.url();
  if (!currentUrl || currentUrl === "about:blank") {
    await page.goto(platformUrl, { waitUntil: "networkidle2", timeout: 30000 });
    session.currentUrl = page.url();
  }

  // Get initial page content for context
  const initialContent = await getPageContent(page);
  const initialScreenshot = await page.screenshot({ encoding: "base64", fullPage: false }) as string;

  const steps: SessionStep[] = [];
  const maxIterations = 20;
  let taskCompleted = false;
  let finalData: Record<string, unknown> = {};
  let finalMessage = "";
  let lastScreenshot = initialScreenshot;

  const messages: Message[] = [
    {
      role: "system",
      content: `You are an AI browser agent operating on ${session.platformName} (${platformUrl}).
Your job is to complete the user's task by interacting with the web page through the available tools.

Guidelines:
- Read the page content first to understand the current state
- Use precise CSS selectors when possible
- If you can't find an element by selector, try finding it by text content
- Take screenshots at key moments to verify your actions
- Handle login if needed (the user may provide credentials)
- Be careful with destructive actions - verify before submitting
- If you encounter CAPTCHAs, MFA, or other blocks, report them clearly
- Call task_complete when the task is finished

${request.credentials ? `Login credentials available: username=${request.credentials.username}` : "No login credentials provided - the platform should already be logged in or public."}

Current page content:
${initialContent}`,
    },
    {
      role: "user",
      content: `Task: ${request.task}`,
    },
  ];

  for (let i = 0; i < maxIterations && !taskCompleted; i++) {
    try {
      const response = await invokeLLM({
        messages,
        tools: BROWSER_TOOLS,
        toolChoice: "auto",
      });

      const choice = response.choices[0];
      if (!choice) break;

      // Add assistant message to conversation
      messages.push({
        role: "assistant",
        content: choice.message.content || "",
        tool_calls: choice.message.tool_calls,
      });

      if (!choice.message.tool_calls || choice.message.tool_calls.length === 0) {
        // Model didn't call any tools, task might be done
        if (choice.message.content) {
          finalMessage = typeof choice.message.content === "string"
            ? choice.message.content
            : JSON.stringify(choice.message.content);
        }
        break;
      }

      // Execute each tool call
      for (const toolCall of choice.message.tool_calls) {
        const args = JSON.parse(toolCall.function.arguments);
        const step: SessionStep = {
          id: nanoid(),
          action: toolCall.function.name,
          description: `${toolCall.function.name}(${JSON.stringify(args).substring(0, 200)})`,
          status: "executing",
          timestamp: new Date(),
        };
        steps.push(step);

        if (toolCall.function.name === "task_complete") {
          taskCompleted = true;
          finalMessage = args.summary || "Task completed";
          finalData = args.data || {};
          step.status = "completed";
          step.result = finalMessage;

          messages.push({
            role: "tool",
            tool_call_id: toolCall.id,
            content: `Task completed: ${finalMessage}`,
          });
          break;
        }

        // Handle login credential injection
        if (
          toolCall.function.name === "type_text" &&
          request.credentials &&
          args.text === request.credentials.username
        ) {
          // Allow username
        }

        const { result, screenshot } = await executeToolCall(page, toolCall.function.name, args);
        step.status = result.startsWith("Error") ? "failed" : "completed";
        step.result = result;
        if (screenshot) {
          step.screenshot = screenshot;
          lastScreenshot = screenshot;
        }

        messages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: result,
        });
      }

      session.currentUrl = page.url();
      session.steps = steps;
      session.updatedAt = new Date();
    } catch (error) {
      const errorStep: SessionStep = {
        id: nanoid(),
        action: "error",
        description: `Iteration ${i + 1} failed`,
        status: "failed",
        timestamp: new Date(),
        error: (error as Error).message,
      };
      steps.push(errorStep);

      if ((error as Error).message.includes("LLM invoke failed")) {
        break;
      }
    }
  }

  session.steps = steps;
  session.status = taskCompleted ? "completed" : "failed";
  session.updatedAt = new Date();
  if (!taskCompleted) {
    session.error = finalMessage || "Task did not complete within the iteration limit";
  }

  return {
    success: taskCompleted,
    message: finalMessage || (taskCompleted ? "Task completed" : "Task did not complete"),
    steps,
    data: finalData,
    screenshot: lastScreenshot,
  };
}

export function getSession(sessionId: string): PlatformSession | null {
  return activeSessions.get(sessionId)?.session || null;
}

export function listSessions(): PlatformSession[] {
  return Array.from(activeSessions.values()).map((e) => e.session);
}

export async function closeSession(sessionId: string): Promise<void> {
  const entry = activeSessions.get(sessionId);
  if (!entry) return;

  try {
    if (entry.page) await entry.page.close().catch(() => {});
    if (entry.browser) await entry.browser.close().catch(() => {});
  } finally {
    activeSessions.delete(sessionId);
  }
}

export async function pauseSession(sessionId: string): Promise<void> {
  const entry = activeSessions.get(sessionId);
  if (entry) {
    entry.session.status = "paused";
    entry.session.updatedAt = new Date();
  }
}

export async function getSessionScreenshot(sessionId: string): Promise<string | null> {
  const entry = activeSessions.get(sessionId);
  if (!entry?.page) return null;

  try {
    const screenshot = await entry.page.screenshot({ encoding: "base64", fullPage: false });
    return screenshot as string;
  } catch {
    return null;
  }
}

export function getAvailablePlatforms(): PlatformProfile[] {
  return PLATFORM_PROFILES;
}

export function addCustomPlatform(platform: Omit<PlatformProfile, "id">): PlatformProfile {
  const newPlatform: PlatformProfile = {
    ...platform,
    id: `custom-${nanoid(8)}`,
  };
  PLATFORM_PROFILES.push(newPlatform);
  return newPlatform;
}
