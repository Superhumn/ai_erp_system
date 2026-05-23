import { describe, it, expect } from "vitest";
import { isAlibabaEmail } from "./alibabaEmail";

describe("isAlibabaEmail", () => {
  it("matches the main Alibaba sender domains", () => {
    expect(isAlibabaEmail("service@mail.alibaba.com")).toBe(true);
    expect(isAlibabaEmail("noreply@notice.alibaba.com")).toBe(true);
    expect(isAlibabaEmail("orders@alibaba.com")).toBe(true);
    expect(isAlibabaEmail("alerts@tradenotice.alibaba.com")).toBe(true);
    expect(isAlibabaEmail("ops@alibaba-inc.com")).toBe(true);
  });

  it("is case-insensitive and trims whitespace", () => {
    expect(isAlibabaEmail("  Service@Mail.Alibaba.COM  ")).toBe(true);
  });

  it("matches arbitrary alibaba.com subdomains via pattern", () => {
    expect(isAlibabaEmail("foo@bar.alibaba.com")).toBe(true);
  });

  it("does not match unrelated senders", () => {
    expect(isAlibabaEmail("supplier@example.com")).toBe(false);
    expect(isAlibabaEmail("billing@aliexpress.com")).toBe(false);
    expect(isAlibabaEmail("hi@alibaba-fake.com")).toBe(false);
  });

  it("handles null/undefined/empty without throwing", () => {
    expect(isAlibabaEmail(null)).toBe(false);
    expect(isAlibabaEmail(undefined)).toBe(false);
    expect(isAlibabaEmail("")).toBe(false);
    expect(isAlibabaEmail("not-an-email")).toBe(false);
  });
});
