import { describe, it, expect } from "vitest";
import { useToast, toast } from "./use-toast";

describe("use-toast", () => {
  it("useToast returns an object with a toast function", () => {
    const result = useToast();
    expect(result).toHaveProperty("toast");
    expect(typeof result.toast).toBe("function");
  });

  it("exports toast directly as a named export", () => {
    expect(typeof toast).toBe("function");
  });

  it("toast and useToast().toast reference the same function", () => {
    const { toast: hookToast } = useToast();
    expect(hookToast).toBe(toast);
  });
});
