import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../db", () => ({
  getGrantBidApplications: vi.fn(),
  createGrantBidApplication: vi.fn(),
  createGrantBidSubmissionLog: vi.fn(),
  getInvestors: vi.fn(),
  getInvestorById: vi.fn(),
  updateInvestor: vi.fn(),
  getFundraisingCampaigns: vi.fn(),
  getInvestorInvestments: vi.fn(),
  createInvestorUpdate: vi.fn(),
  listRecruitingCandidates: vi.fn(),
  updateRecruitingCandidate: vi.fn(),
  getDocuments: vi.fn(),
  createDocument: vi.fn(),
  getContracts: vi.fn(),
  getContractWithKeyDates: vi.fn(),
  createAuditLog: vi.fn(),
}));

import * as db from "../db";
import { executeGrowth, growthModule, growthTools } from "./growth";
import type { AIAgentContext } from "../aiAgentService";

const m = vi.mocked(db);
const ctx = (userRole: string, companyId: number | undefined = 1): AIAgentContext => ({ userId: 10, userName: "Jade", userRole, companyId });
const run = (tool: string, params: Record<string, unknown>, c: AIAgentContext) => executeGrowth(tool, params, c);
const days = (n: number) => new Date(Date.now() + n * 86_400_000);

beforeEach(() => {
  vi.clearAllMocks();
  m.createAuditLog.mockResolvedValue(undefined as never);
});

it("declares the five growth tools on one module", () => {
  expect(growthModule.tools).toBe(growthTools);
  expect(growthTools.map((t) => t.function.name)).toEqual(["manage_grants", "manage_fundraising", "manage_recruiting", "manage_sops", "manage_legal"]);
});

// ---------------------------------------------------------------- grants
describe("manage_grants", () => {
  const grant = (patch: Record<string, unknown> = {}) => ({
    id: 1, companyId: 1, applicationNumber: "GBA-1", title: "USDA VAPG", type: "grant", status: "draft", grantingOrganization: "USDA", programName: null,
    requestedAmount: "25000.00", submissionDeadline: days(10), submittedAt: null, ...patch,
  });

  it("list_grants filters by company and totals requested", async () => {
    m.getGrantBidApplications.mockResolvedValue([grant(), grant({ id: 2, companyId: 2 })] as never);
    const res = await run("manage_grants", { action: "list_grants", status: "draft" }, ctx("user")) as { total: number; totalRequested: number };
    expect(m.getGrantBidApplications).toHaveBeenCalledWith({ status: "draft", type: undefined });
    expect(res).toMatchObject({ total: 1, totalRequested: 25000 });
  });

  it("grant_deadlines splits upcoming vs overdue and skips submitted", async () => {
    m.getGrantBidApplications.mockResolvedValue([grant(), grant({ id: 2, submissionDeadline: days(-2) }), grant({ id: 3, status: "submitted" }), grant({ id: 4, submissionDeadline: days(60) })] as never);
    const res = await run("manage_grants", { action: "grant_deadlines", withinDays: 30 }, ctx("user")) as { upcoming: Array<{ id: number }>; overdue: Array<{ id: number }> };
    expect(res.upcoming.map((g) => g.id)).toEqual([1]);
    expect(res.overdue.map((g) => g.id)).toEqual([2]);
  });

  it("create_grant_application_draft creates a draft + submission log", async () => {
    m.createGrantBidApplication.mockResolvedValue({ id: 7 } as never);
    const res = await run("manage_grants", { action: "create_grant_application_draft", title: "SBIR Phase I", grantingOrganization: "NSF", requestedAmount: 275000, submissionDeadline: "2026-12-01" }, ctx("user")) as { applicationId: number; status: string };
    expect(res).toMatchObject({ created: true, applicationId: 7, status: "draft" });
    expect(m.createGrantBidApplication.mock.calls[0][0]).toMatchObject({ companyId: 1, title: "SBIR Phase I", type: "grant", status: "draft", requestedAmount: "275000.00", createdBy: 10 });
    expect(m.createGrantBidSubmissionLog).toHaveBeenCalledWith(expect.objectContaining({ applicationId: 7, action: "created", performedBy: 10 }));
    expect(m.createAuditLog).toHaveBeenCalledWith(expect.objectContaining({ entityType: "grant_bid_application", entityId: 7 }));
  });

  it("refuses external roles", async () => {
    await expect(run("manage_grants", { action: "create_grant_application_draft", title: "x" }, ctx("vendor"))).rejects.toThrow(/Not authorized/);
    await expect(run("manage_grants", { action: "list_grants" }, ctx("investor"))).rejects.toThrow(/Not authorized/);
  });
});

// ---------------------------------------------------------------- fundraising
describe("manage_fundraising", () => {
  const investor = (patch: Record<string, unknown> = {}) => ({
    id: 1, companyId: 1, name: "Blue Capital", company: "Blue", type: "vc", status: "interested", priority: "high", email: "a@blue.vc", notes: null, followUpDate: null, investedAt: null, ...patch,
  });

  it("pipeline_summary aggregates investors, rounds and investments in the company", async () => {
    m.getInvestors.mockResolvedValue([investor(), investor({ id: 2, status: "invested", followUpDate: days(-1) }), investor({ id: 3, status: "lead", followUpDate: days(-1) })] as never);
    m.getFundraisingCampaigns.mockResolvedValue([{ id: 1, name: "Seed", roundType: "seed", status: "active", targetAmount: "1000000", raisedAmount: "250000", targetCloseDate: null }] as never);
    m.getInvestorInvestments.mockResolvedValue([{ investorId: 2, amount: "250000" }, { investorId: 99, amount: "5" }] as never);
    const res = await run("manage_fundraising", { action: "pipeline_summary" }, ctx("user")) as { investors: { byStatus: Record<string, number> }; followUpsDue: Array<{ id: number }>; committedFromInvestments: number };
    expect(m.getInvestors).toHaveBeenCalledWith(1);
    expect(m.getFundraisingCampaigns).toHaveBeenCalledWith(1);
    expect(res.investors.byStatus).toEqual({ interested: 1, invested: 1, lead: 1 });
    expect(res.followUpsDue.map((i) => i.id)).toEqual([3]);
    expect(res.committedFromInvestments).toBe(250000);
  });

  it("list_investors filters by status and query", async () => {
    m.getInvestors.mockResolvedValue([investor(), investor({ id: 2, name: "Red Angels", status: "lead" })] as never);
    const res = await run("manage_fundraising", { action: "list_investors", status: "lead", query: "red" }, ctx("user")) as { investors: Array<{ id: number }> };
    expect(res.investors.map((i) => i.id)).toEqual([2]);
  });

  it("log_investor_interaction appends a note, moves status and sets follow-up", async () => {
    m.getInvestorById.mockResolvedValue(investor({ notes: "Intro call" }) as never);
    const res = await run("manage_fundraising", { action: "log_investor_interaction", investorId: 1, summary: "Sent deck", newStatus: "committed", followUpDate: "2026-10-10" }, ctx("user")) as { status: string };
    expect(res).toMatchObject({ logged: true, investorId: 1, status: "committed" });
    const data = m.updateInvestor.mock.calls[0][1];
    expect(m.updateInvestor.mock.calls[0][0]).toBe(1);
    expect(data.notes).toMatch(/^Intro call\n\[\d{4}-\d{2}-\d{2}\] Jade: Sent deck$/);
    expect(data).toMatchObject({ status: "committed", followUpDate: new Date("2026-10-10") });
    expect(m.createAuditLog).toHaveBeenCalledWith(expect.objectContaining({ entityType: "investor", entityId: 1, companyId: 1 }));
  });

  it("log_investor_interaction hides investors from another company", async () => {
    m.getInvestorById.mockResolvedValue(investor({ companyId: 2 }) as never);
    await expect(run("manage_fundraising", { action: "log_investor_interaction", investorId: 1, summary: "x" }, ctx("admin"))).rejects.toThrow(/Investor not found/);
    expect(m.updateInvestor).not.toHaveBeenCalled();
  });

  it("create_investor_update_draft stays draft and stamps company/creator", async () => {
    m.createInvestorUpdate.mockResolvedValue({ id: 4 } as never);
    const res = await run("manage_fundraising", { action: "create_investor_update_draft", title: "Q3 update", period: "Q3 2026", type: "quarterly", content: "Body" }, ctx("exec")) as { updateId: number; status: string };
    expect(res).toMatchObject({ created: true, updateId: 4, status: "draft" });
    expect(m.createInvestorUpdate.mock.calls[0][0]).toMatchObject({ companyId: 1, title: "Q3 update", type: "quarterly", status: "draft", createdBy: 10 });
  });

  it("refuses the investor role for reads and writes", async () => {
    await expect(run("manage_fundraising", { action: "pipeline_summary" }, ctx("investor"))).rejects.toThrow(/Not authorized/);
    await expect(run("manage_fundraising", { action: "log_investor_interaction", investorId: 1, summary: "x" }, ctx("investor"))).rejects.toThrow(/Not authorized/);
    await expect(run("manage_fundraising", { action: "create_investor_update_draft", title: "x" }, ctx("copacker"))).rejects.toThrow(/Not authorized/);
  });
});

// ---------------------------------------------------------------- recruiting
describe("manage_recruiting", () => {
  const cand = (patch: Record<string, unknown> = {}) => ({
    id: 1, companyId: 1, name: "Ana Ruiz", email: "ana@x.co", position: "Plant Manager", stage: "screening", score: 80, source: "linkedin", resume: "Long resume", notes: null, appliedAt: new Date(), interviewDate: null, ...patch,
  });

  beforeEach(() => {
    m.listRecruitingCandidates.mockResolvedValue([cand(), cand({ id: 2, name: "Bo Chen", email: "bo@x.co", stage: "interview" }), cand({ id: 3, companyId: 2, name: "Other Co" })] as never);
  });

  it("list_candidates scopes to the company and filters by stage", async () => {
    const res = await run("manage_recruiting", { action: "list_candidates", stage: "interview" }, ctx("user")) as { candidates: Array<{ id: number }>; byStage: Record<string, number> };
    expect(res.candidates.map((c) => c.id)).toEqual([2]);
  });

  it("candidate_summary resolves by name within the company", async () => {
    const res = await run("manage_recruiting", { action: "candidate_summary", candidateName: "ana" }, ctx("user")) as { candidate: { id: number }; resumeExcerpt: string };
    expect(res.candidate.id).toBe(1);
    expect(res.resumeExcerpt).toBe("Long resume");
    await expect(run("manage_recruiting", { action: "candidate_summary", candidateId: 3 }, ctx("user"))).rejects.toThrow(/Candidate not found/);
  });

  it("move_candidate_stage updates the stage and appends a note", async () => {
    const res = await run("manage_recruiting", { action: "move_candidate_stage", candidateId: 1, stage: "offer", note: "Strong panel" }, ctx("user")) as { fromStage: string; toStage: string };
    expect(res).toMatchObject({ fromStage: "screening", toStage: "offer" });
    expect(m.updateRecruitingCandidate).toHaveBeenCalledWith(1, expect.objectContaining({ stage: "offer", notes: expect.stringContaining("Jade: Strong panel") }));
    expect(m.createAuditLog).toHaveBeenCalledWith(expect.objectContaining({ entityType: "recruiting_candidate", entityId: 1, companyId: 1 }));
  });

  it("schedule_interview records the date and moves to interview", async () => {
    const res = await run("manage_recruiting", { action: "schedule_interview", candidateId: 1, interviewDate: "2026-10-03T15:00:00Z" }, ctx("user")) as { stage: string };
    expect(res.stage).toBe("interview");
    expect(m.updateRecruitingCandidate).toHaveBeenCalledWith(1, expect.objectContaining({ interviewDate: new Date("2026-10-03T15:00:00Z"), stage: "interview" }));
  });

  it("refuses external roles", async () => {
    await expect(run("manage_recruiting", { action: "move_candidate_stage", candidateId: 1, stage: "hired" }, ctx("contractor"))).rejects.toThrow(/Not authorized/);
    expect(m.updateRecruitingCandidate).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------- sops
describe("manage_sops", () => {
  const doc = (patch: Record<string, unknown> = {}) => ({
    id: 1, companyId: 1, name: "Receiving SOP", type: "other", category: "sop", description: "How to receive inbound freight", tags: ["sop", "warehouse"],
    fileUrl: `data:text/markdown;charset=utf-8,${encodeURIComponent("# Receiving\n\nSteps")}`, fileKey: "sop-drafts/1.md", mimeType: "text/markdown", updatedAt: new Date(), ...patch,
  });

  beforeEach(() => {
    m.getDocuments.mockResolvedValue([doc(), doc({ id: 2, name: "Invoice", category: null, tags: [], type: "invoice" }), doc({ id: 3, name: "Packing SOP", category: null, tags: ["SOP"], description: "How to pack outbound orders" })] as never);
  });

  it("search_sops only returns sop-category/tagged documents in the company", async () => {
    const res = await run("manage_sops", { action: "search_sops", query: "receiv" }, ctx("user")) as { sops: Array<{ id: number }>; total: number };
    expect(m.getDocuments).toHaveBeenCalledWith({ companyId: 1 });
    expect(res.sops.map((s) => s.id)).toEqual([1]);
    const all = await run("manage_sops", { action: "search_sops" }, ctx("user")) as { total: number };
    expect(all.total).toBe(2);
  });

  it("get_sop decodes inline markdown", async () => {
    const res = await run("manage_sops", { action: "get_sop", sopId: 1 }, ctx("user")) as { content: string; storedInline: boolean };
    expect(res.storedInline).toBe(true);
    expect(res.content).toBe("# Receiving\n\nSteps");
    await expect(run("manage_sops", { action: "get_sop", sopId: 2 }, ctx("user"))).rejects.toThrow(/SOP not found/);
  });

  it("create_sop_draft stores a markdown document tagged sop + draft", async () => {
    m.createDocument.mockResolvedValue({ id: 9 } as never);
    const res = await run("manage_sops", { action: "create_sop_draft", title: "Lot coding", content: "# Lot coding\n\n1. Print", tags: ["quality"] }, ctx("ops")) as { sopId: number; status: string };
    expect(res).toMatchObject({ created: true, sopId: 9, status: "draft" });
    const data = m.createDocument.mock.calls[0][0];
    expect(data).toMatchObject({ companyId: 1, name: "Lot coding", type: "other", category: "sop", mimeType: "text/markdown", uploadedBy: 10, tags: ["sop", "draft", "quality"] });
    expect(data.fileUrl).toBe(`data:text/markdown;charset=utf-8,${encodeURIComponent("# Lot coding\n\n1. Print")}`);
    expect(data.fileKey).toMatch(/^sop-drafts\/\d+-lot-coding\.md$/);
  });

  it("refuses external roles", async () => {
    await expect(run("manage_sops", { action: "create_sop_draft", title: "x", content: "y" }, ctx("vendor"))).rejects.toThrow(/Not authorized/);
    expect(m.createDocument).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------- legal
describe("manage_legal", () => {
  const contract = (patch: Record<string, unknown> = {}) => ({
    id: 1, companyId: 1, contractNumber: "CT-1", title: "Copacker MSA", type: "vendor", status: "active", partyName: "PackCo", partyType: "vendor", value: "50000", currency: "USD",
    startDate: new Date("2025-01-01"), endDate: days(30), renewalDate: null, autoRenewal: false, description: "Master services", terms: "Net 30", signedDocumentUrl: "s3://x", ...patch,
  });

  beforeEach(() => {
    m.getContracts.mockResolvedValue([contract(), contract({ id: 2, title: "Office lease", type: "lease", endDate: days(400), renewalDate: days(20), autoRenewal: true }), contract({ id: 3, status: "expired", endDate: days(-5) })] as never);
  });

  it("list_contracts passes company + filters and totals value", async () => {
    const res = await run("manage_legal", { action: "list_contracts", type: "vendor" }, ctx("legal")) as { total: number; totalValue: number };
    expect(m.getContracts).toHaveBeenCalledWith({ companyId: 1, status: undefined, type: "vendor" });
    expect(res).toMatchObject({ total: 3, totalValue: 150000 });
  });

  it("contract_expiries uses the earliest of renewal/end within the window", async () => {
    const res = await run("manage_legal", { action: "contract_expiries", withinDays: 90 }, ctx("admin")) as { expiring: Array<{ id: number; daysLeft: number }>; autoRenewing: number };
    expect(res.expiring.map((c) => c.id)).toEqual([2, 1]);
    expect(res.autoRenewing).toBe(1);
  });

  it("contract_summary returns key dates", async () => {
    m.getContractWithKeyDates.mockResolvedValue({ ...contract(), keyDates: [{ id: 1, dateType: "renewal", date: days(5), description: "Notice" }] } as never);
    const res = await run("manage_legal", { action: "contract_summary", contractId: 1 }, ctx("exec")) as { contract: { id: number }; keyDates: Array<{ upcoming: boolean }>; hasSignedDocument: boolean };
    expect(res.contract.id).toBe(1);
    expect(res.keyDates[0].upcoming).toBe(true);
    expect(res.hasSignedDocument).toBe(true);
  });

  it("hides a contract of another company", async () => {
    m.getContractWithKeyDates.mockResolvedValue({ ...contract({ companyId: 2 }), keyDates: [] } as never);
    await expect(run("manage_legal", { action: "contract_summary", contractId: 1 }, ctx("legal"))).rejects.toThrow(/Contract not found/);
  });

  it("is limited to legal/admin/exec, even for reads", async () => {
    await expect(run("manage_legal", { action: "list_contracts" }, ctx("ops"))).rejects.toThrow(/requires one of these roles/);
    await expect(run("manage_legal", { action: "list_contracts" }, ctx("finance"))).rejects.toThrow(/Not authorized/);
    await expect(run("manage_legal", { action: "list_contracts" }, ctx("investor"))).rejects.toThrow(/Not authorized/);
    expect(m.getContracts).not.toHaveBeenCalled();
  });
});

it("rejects unknown tools", async () => {
  await expect(run("manage_nothing", { action: "x" }, ctx("admin"))).rejects.toThrow(/Unknown tool/);
});
