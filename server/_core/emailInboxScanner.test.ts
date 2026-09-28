import { describe, it, expect, vi } from "vitest";

vi.mock("imapflow", () => ({ ImapFlow: vi.fn() }));
vi.mock("./env", () => ({ ENV: { imapHost: "", imapPort: "", imapUser: "", imapPassword: "" } }));
vi.mock("./emailParser", () => ({
  quickCategorize: vi.fn(),
  parseEmailContent: vi.fn(),
}));
vi.mock("./alibabaEmail", () => ({ isAlibabaEmail: vi.fn(() => false), ALIBABA_PARSE_HINT: "" }));

import { resolveAttachmentPartNumber } from "./emailInboxScanner";

describe("resolveAttachmentPartNumber", () => {
  it("prefers the part path ImapFlow parsed from BODYSTRUCTURE", () => {
    expect(resolveAttachmentPartNumber({ part: "2" }, 1)).toBe("2");
    expect(resolveAttachmentPartNumber({ part: "1.2" }, 3)).toBe("1.2");
  });

  it("falls back to the 1-based sibling index when no part path is present", () => {
    // Regression: the first child of a multipart root is part "1", not "2".
    expect(resolveAttachmentPartNumber({}, 1)).toBe("1");
    expect(resolveAttachmentPartNumber({ part: "" }, 2)).toBe("2");
    expect(resolveAttachmentPartNumber(undefined, 3)).toBe("3");
  });

  it("numbers a sequence of children without an off-by-one", () => {
    const children = [{ type: "text" }, { type: "application", disposition: "attachment" }, { type: "image" }];
    const numbers = children.map((c, i) => resolveAttachmentPartNumber(c, i + 1));
    expect(numbers).toEqual(["1", "2", "3"]);
  });
});
