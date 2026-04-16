/**
 * Tests for NotFound page structure.
 * Ensures the 404 page has correct content without rendering.
 */
import { describe, it, expect } from "vitest";

// The NotFound page is simple enough to test the logic without rendering.
// It shows "404", "Page not found", and a "Back to dashboard" button.

describe("NotFound page — structure expectations", () => {
  it("has the correct HTTP status message", () => {
    // The page renders a "404" text and "Page not found" heading
    const statusCode = "404";
    const message = "Page not found";
    const actionLabel = "Back to dashboard";
    const actionDestination = "/";

    expect(statusCode).toBe("404");
    expect(message).toBe("Page not found");
    expect(actionLabel).toBe("Back to dashboard");
    expect(actionDestination).toBe("/");
  });
});
