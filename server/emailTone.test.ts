import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the LLM module
vi.mock("./_core/llm", () => ({
  invokeLLM: vi.fn(),
}));

import { analyzeTone, analyzeMultipleEmails, generateToneMatchedReply } from "./emailToneService";
import { invokeLLM } from "./_core/llm";

const mockInvokeLLM = vi.mocked(invokeLLM);

const sampleToneResult = {
  formality: 65,
  friendliness: 70,
  assertiveness: 45,
  verbosity: 55,
  detectedTone: "professional-friendly",
  commonGreetings: ["Hi", "Hello"],
  commonClosings: ["Best regards", "Thanks"],
  vocabularyLevel: "moderate",
  sentenceStructure: "mixed",
  usesEmoji: false,
  usesBulletPoints: false,
  samplePhrases: ["Looking forward to", "Happy to help", "Let me know if"],
  signatureStyle: "Best regards,\nJane",
};

describe("Email Tone Service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("analyzeTone", () => {
    it("should analyze a single email and return tone metrics", async () => {
      mockInvokeLLM.mockResolvedValueOnce({
        id: "test",
        created: Date.now(),
        model: "test",
        choices: [{
          index: 0,
          message: { role: "assistant", content: JSON.stringify(sampleToneResult) },
          finish_reason: "stop",
        }],
      });

      const result = await analyzeTone("Hi John,\n\nThanks for the update. Looking forward to working together.\n\nBest regards,\nJane");

      expect(result.formality).toBe(65);
      expect(result.friendliness).toBe(70);
      expect(result.detectedTone).toBe("professional-friendly");
      expect(result.commonGreetings).toContain("Hi");
      expect(result.commonClosings).toContain("Best regards");
      expect(mockInvokeLLM).toHaveBeenCalledTimes(1);
    });

    it("should throw error when LLM returns no content", async () => {
      mockInvokeLLM.mockResolvedValueOnce({
        id: "test",
        created: Date.now(),
        model: "test",
        choices: [{
          index: 0,
          message: { role: "assistant", content: [] as any },
          finish_reason: "stop",
        }],
      });

      await expect(analyzeTone("Hello there")).rejects.toThrow("Failed to analyze email tone");
    });
  });

  describe("analyzeMultipleEmails", () => {
    it("should aggregate tone analysis from multiple emails", async () => {
      const result1 = { ...sampleToneResult, formality: 60, friendliness: 80 };
      const result2 = { ...sampleToneResult, formality: 70, friendliness: 60 };

      mockInvokeLLM
        .mockResolvedValueOnce({
          id: "1", created: Date.now(), model: "test",
          choices: [{ index: 0, message: { role: "assistant", content: JSON.stringify(result1) }, finish_reason: "stop" }],
        })
        .mockResolvedValueOnce({
          id: "2", created: Date.now(), model: "test",
          choices: [{ index: 0, message: { role: "assistant", content: JSON.stringify(result2) }, finish_reason: "stop" }],
        });

      const result = await analyzeMultipleEmails(["email 1 text", "email 2 text"]);

      expect(result.formality).toBe(65);
      expect(result.friendliness).toBe(70);
      expect(result.emailsScanned).toBe(2);
      expect(result.commonGreetings).toContain("Hi");
      expect(result.commonClosings).toContain("Best regards");
    });

    it("should deduplicate greetings and closings", async () => {
      const result1 = { ...sampleToneResult, commonGreetings: ["Hi", "Hello"], commonClosings: ["Thanks"] };
      const result2 = { ...sampleToneResult, commonGreetings: ["Hi", "Hey"], commonClosings: ["Thanks", "Best"] };

      mockInvokeLLM
        .mockResolvedValueOnce({
          id: "1", created: Date.now(), model: "test",
          choices: [{ index: 0, message: { role: "assistant", content: JSON.stringify(result1) }, finish_reason: "stop" }],
        })
        .mockResolvedValueOnce({
          id: "2", created: Date.now(), model: "test",
          choices: [{ index: 0, message: { role: "assistant", content: JSON.stringify(result2) }, finish_reason: "stop" }],
        });

      const result = await analyzeMultipleEmails(["email 1", "email 2"]);

      // Should have deduplicated "Hi"
      const hiCount = result.commonGreetings.filter(g => g === "Hi").length;
      expect(hiCount).toBe(1);

      // Should include all unique values
      expect(result.commonGreetings).toContain("Hi");
      expect(result.commonGreetings).toContain("Hello");
      expect(result.commonGreetings).toContain("Hey");
    });
  });

  describe("generateToneMatchedReply", () => {
    it("should generate a reply matching the tone profile", async () => {
      const mockReply = {
        subject: "Re: Project Update",
        body: "Hi John,\n\nThanks for the update! Looking forward to the next steps.\n\nBest regards,\nJane",
        tone: "professional-friendly",
        confidence: 85,
      };

      mockInvokeLLM.mockResolvedValueOnce({
        id: "test", created: Date.now(), model: "test",
        choices: [{ index: 0, message: { role: "assistant", content: JSON.stringify(mockReply) }, finish_reason: "stop" }],
      });

      const result = await generateToneMatchedReply({
        incomingEmail: {
          from: "john@example.com",
          subject: "Project Update",
          body: "Hi Jane, wanted to give you an update on the project...",
        },
        toneProfile: {
          formality: 65,
          friendliness: 70,
          assertiveness: 45,
          verbosity: 55,
          commonGreetings: ["Hi", "Hello"],
          commonClosings: ["Best regards", "Thanks"],
          vocabularyLevel: "moderate",
          sentenceStructure: "mixed",
          usesEmoji: false,
          usesBulletPoints: false,
          samplePhrases: ["Looking forward to", "Happy to help"],
          signatureStyle: "Best regards,\nJane",
        },
        senderName: "Jane Smith",
      });

      expect(result.subject).toBe("Re: Project Update");
      expect(result.body).toContain("Jane");
      expect(result.confidence).toBe(85);
      expect(mockInvokeLLM).toHaveBeenCalledTimes(1);

      // Verify the prompt includes tone profile details
      const callArgs = mockInvokeLLM.mock.calls[0][0];
      const systemMessage = callArgs.messages[0].content as string;
      expect(systemMessage).toContain("TONE PROFILE TO MATCH");
      expect(systemMessage).toContain("65/100");
      expect(systemMessage).toContain("Jane Smith");
    });

    it("should include additional instructions in the prompt", async () => {
      const mockReply = {
        subject: "Re: Quote Request",
        body: "Hi, here is a 10% discount...",
        tone: "professional",
        confidence: 90,
      };

      mockInvokeLLM.mockResolvedValueOnce({
        id: "test", created: Date.now(), model: "test",
        choices: [{ index: 0, message: { role: "assistant", content: JSON.stringify(mockReply) }, finish_reason: "stop" }],
      });

      await generateToneMatchedReply({
        incomingEmail: {
          from: "buyer@example.com",
          subject: "Quote Request",
          body: "Can you send a quote?",
        },
        toneProfile: {
          formality: 50, friendliness: 50, assertiveness: 50, verbosity: 50,
          commonGreetings: [], commonClosings: [], vocabularyLevel: "moderate",
          sentenceStructure: "mixed", usesEmoji: false, usesBulletPoints: false,
          samplePhrases: [], signatureStyle: "",
        },
        senderName: "Jane",
        additionalInstructions: "Mention 10% discount",
      });

      const callArgs = mockInvokeLLM.mock.calls[0][0];
      const systemMessage = callArgs.messages[0].content as string;
      expect(systemMessage).toContain("Mention 10% discount");
    });

    it("should throw error when LLM fails", async () => {
      mockInvokeLLM.mockResolvedValueOnce({
        id: "test", created: Date.now(), model: "test",
        choices: [{ index: 0, message: { role: "assistant", content: [] as any }, finish_reason: "stop" }],
      });

      await expect(
        generateToneMatchedReply({
          incomingEmail: { from: "a@b.com", subject: "Test", body: "Hello" },
          toneProfile: {
            formality: 50, friendliness: 50, assertiveness: 50, verbosity: 50,
            commonGreetings: [], commonClosings: [], vocabularyLevel: "moderate",
            sentenceStructure: "mixed", usesEmoji: false, usesBulletPoints: false,
            samplePhrases: [], signatureStyle: "",
          },
          senderName: "Test",
        })
      ).rejects.toThrow("Failed to generate tone-matched reply");
    });
  });
});
