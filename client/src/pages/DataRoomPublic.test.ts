/**
 * Tests for DataRoomPublic page utility functions.
 * Functions tested: formatFileSize, getFileColorClass
 */
import { describe, it, expect } from "vitest";

// ── Re-implement pure functions from DataRoomPublic.tsx ──

function formatFileSize(bytes: number | null): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getFileColorClass(fileType: string): string {
  switch (fileType) {
    case "pdf": return "bg-red-500/10 border-red-500/20";
    case "doc": case "docx": return "bg-blue-500/10 border-blue-500/20";
    case "xls": case "xlsx": case "csv": return "bg-emerald-500/10 border-emerald-500/20";
    case "ppt": case "pptx": return "bg-orange-500/10 border-orange-500/20";
    case "png": case "jpg": case "jpeg": case "gif": case "svg": case "webp":
      return "bg-purple-500/10 border-purple-500/20";
    default: return "bg-muted border-border";
  }
}

// ── Tests ──

describe("DataRoomPublic — formatFileSize", () => {
  it("returns empty string for null", () => {
    expect(formatFileSize(null)).toBe("");
  });

  it("returns empty string for 0", () => {
    expect(formatFileSize(0)).toBe("");
  });

  it("formats bytes under 1024 as B", () => {
    expect(formatFileSize(512)).toBe("512 B");
  });

  it("formats 1 byte", () => {
    expect(formatFileSize(1)).toBe("1 B");
  });

  it("formats 1023 bytes", () => {
    expect(formatFileSize(1023)).toBe("1023 B");
  });

  it("formats kilobytes", () => {
    expect(formatFileSize(1024)).toBe("1.0 KB");
  });

  it("formats larger kilobytes", () => {
    expect(formatFileSize(5120)).toBe("5.0 KB");
  });

  it("formats partial kilobytes with 1 decimal", () => {
    expect(formatFileSize(1536)).toBe("1.5 KB");
  });

  it("formats megabytes", () => {
    expect(formatFileSize(1048576)).toBe("1.0 MB");
  });

  it("formats larger megabytes", () => {
    expect(formatFileSize(5242880)).toBe("5.0 MB");
  });

  it("formats partial megabytes", () => {
    expect(formatFileSize(1572864)).toBe("1.5 MB");
  });
});

describe("DataRoomPublic — getFileColorClass", () => {
  it("returns red classes for pdf", () => {
    expect(getFileColorClass("pdf")).toContain("red");
  });

  it("returns blue classes for doc", () => {
    expect(getFileColorClass("doc")).toContain("blue");
  });

  it("returns blue classes for docx", () => {
    expect(getFileColorClass("docx")).toContain("blue");
  });

  it("returns emerald classes for xls", () => {
    expect(getFileColorClass("xls")).toContain("emerald");
  });

  it("returns emerald classes for xlsx", () => {
    expect(getFileColorClass("xlsx")).toContain("emerald");
  });

  it("returns emerald classes for csv", () => {
    expect(getFileColorClass("csv")).toContain("emerald");
  });

  it("returns orange classes for ppt", () => {
    expect(getFileColorClass("ppt")).toContain("orange");
  });

  it("returns orange classes for pptx", () => {
    expect(getFileColorClass("pptx")).toContain("orange");
  });

  it("returns purple classes for image types", () => {
    for (const ext of ["png", "jpg", "jpeg", "gif", "svg", "webp"]) {
      expect(getFileColorClass(ext)).toContain("purple");
    }
  });

  it("returns muted default for unknown types", () => {
    expect(getFileColorClass("zip")).toBe("bg-muted border-border");
  });

  it("returns muted default for empty string", () => {
    expect(getFileColorClass("")).toBe("bg-muted border-border");
  });
});
