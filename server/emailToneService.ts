import { invokeLLM } from "./_core/llm";

/**
 * Result of analyzing a single email's tone and style
 */
export interface ToneAnalysisResult {
  formality: number; // 0-100
  friendliness: number; // 0-100
  assertiveness: number; // 0-100
  verbosity: number; // 0-100
  detectedTone: string; // e.g. "professional", "casual-friendly", "formal-authoritative"
  commonGreetings: string[];
  commonClosings: string[];
  vocabularyLevel: "simple" | "moderate" | "advanced" | "technical";
  sentenceStructure: "short" | "mixed" | "long";
  usesEmoji: boolean;
  usesBulletPoints: boolean;
  samplePhrases: string[];
  signatureStyle: string;
}

/**
 * Aggregated tone profile from multiple emails
 */
export interface AggregatedToneProfile {
  formality: number;
  friendliness: number;
  assertiveness: number;
  verbosity: number;
  commonGreetings: string[];
  commonClosings: string[];
  vocabularyLevel: "simple" | "moderate" | "advanced" | "technical";
  sentenceStructure: "short" | "mixed" | "long";
  usesEmoji: boolean;
  usesBulletPoints: boolean;
  samplePhrases: string[];
  signatureStyle: string;
  emailsScanned: number;
}

/**
 * Analyze a single email text to extract tone and style characteristics
 */
export async function analyzeTone(emailText: string): Promise<ToneAnalysisResult> {
  const response = await invokeLLM({
    messages: [
      {
        role: "system",
        content: `You are a writing style and tone analyst. Analyze the provided email text and extract detailed tone and style characteristics.

Score each dimension from 0-100:
- formality: 0 = very casual/slang, 100 = extremely formal/corporate
- friendliness: 0 = cold/distant, 100 = very warm/personal
- assertiveness: 0 = passive/apologetic, 100 = very direct/commanding
- verbosity: 0 = extremely terse/minimal, 100 = very detailed/wordy

Also extract:
- detectedTone: A 1-3 word label (e.g. "professional", "casual-friendly", "formal-authoritative")
- commonGreetings: Greeting phrases used (e.g. "Hi", "Dear", "Hey team")
- commonClosings: Closing phrases used (e.g. "Best", "Thanks", "Regards")
- vocabularyLevel: simple, moderate, advanced, or technical
- sentenceStructure: short (avg <10 words), mixed, or long (avg >20 words)
- usesEmoji: whether emojis are present
- usesBulletPoints: whether bullet points or numbered lists are used
- samplePhrases: 3-5 characteristic phrases that capture the writer's style
- signatureStyle: the sign-off pattern (e.g. "Best regards,\\nName" or just "- Name")

Respond in JSON format only.`,
      },
      {
        role: "user",
        content: `Analyze the tone and style of this email:\n\n${emailText}`,
      },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "tone_analysis",
        strict: true,
        schema: {
          type: "object",
          properties: {
            formality: { type: "number", description: "0-100 formality score" },
            friendliness: { type: "number", description: "0-100 friendliness score" },
            assertiveness: { type: "number", description: "0-100 assertiveness score" },
            verbosity: { type: "number", description: "0-100 verbosity score" },
            detectedTone: { type: "string", description: "1-3 word tone label" },
            commonGreetings: { type: "array", items: { type: "string" } },
            commonClosings: { type: "array", items: { type: "string" } },
            vocabularyLevel: { type: "string", enum: ["simple", "moderate", "advanced", "technical"] },
            sentenceStructure: { type: "string", enum: ["short", "mixed", "long"] },
            usesEmoji: { type: "boolean" },
            usesBulletPoints: { type: "boolean" },
            samplePhrases: { type: "array", items: { type: "string" } },
            signatureStyle: { type: "string" },
          },
          required: [
            "formality", "friendliness", "assertiveness", "verbosity",
            "detectedTone", "commonGreetings", "commonClosings",
            "vocabularyLevel", "sentenceStructure", "usesEmoji",
            "usesBulletPoints", "samplePhrases", "signatureStyle",
          ],
          additionalProperties: false,
        },
      },
    },
  });

  const content = response.choices[0]?.message?.content;
  if (typeof content === "string") {
    return JSON.parse(content);
  }
  throw new Error("Failed to analyze email tone");
}

/**
 * Analyze multiple emails and aggregate them into a single tone profile
 */
export async function analyzeMultipleEmails(emails: string[]): Promise<AggregatedToneProfile> {
  // Analyze each email individually
  const analyses = await Promise.all(emails.map((email) => analyzeTone(email)));

  // Aggregate the results
  const count = analyses.length;

  const avgFormality = analyses.reduce((sum, a) => sum + a.formality, 0) / count;
  const avgFriendliness = analyses.reduce((sum, a) => sum + a.friendliness, 0) / count;
  const avgAssertiveness = analyses.reduce((sum, a) => sum + a.assertiveness, 0) / count;
  const avgVerbosity = analyses.reduce((sum, a) => sum + a.verbosity, 0) / count;

  // Collect and deduplicate greetings and closings
  const allGreetings = analyses.flatMap((a) => a.commonGreetings);
  const allClosings = analyses.flatMap((a) => a.commonClosings);
  const commonGreetings = [...new Set(allGreetings)].slice(0, 5);
  const commonClosings = [...new Set(allClosings)].slice(0, 5);

  // Most common vocabulary level
  const vocabCounts = analyses.reduce(
    (acc, a) => {
      acc[a.vocabularyLevel] = (acc[a.vocabularyLevel] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );
  const vocabularyLevel = Object.entries(vocabCounts).sort((a, b) => b[1] - a[1])[0][0] as ToneAnalysisResult["vocabularyLevel"];

  // Most common sentence structure
  const structCounts = analyses.reduce(
    (acc, a) => {
      acc[a.sentenceStructure] = (acc[a.sentenceStructure] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );
  const sentenceStructure = Object.entries(structCounts).sort((a, b) => b[1] - a[1])[0][0] as ToneAnalysisResult["sentenceStructure"];

  // Majority vote for boolean flags
  const usesEmoji = analyses.filter((a) => a.usesEmoji).length > count / 2;
  const usesBulletPoints = analyses.filter((a) => a.usesBulletPoints).length > count / 2;

  // Collect sample phrases (take a few from each analysis)
  const allPhrases = analyses.flatMap((a) => a.samplePhrases);
  const samplePhrases = [...new Set(allPhrases)].slice(0, 10);

  // Use the most common signature style
  const sigCounts = analyses.reduce(
    (acc, a) => {
      acc[a.signatureStyle] = (acc[a.signatureStyle] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );
  const signatureStyle = Object.entries(sigCounts).sort((a, b) => b[1] - a[1])[0][0];

  return {
    formality: Math.round(avgFormality * 100) / 100,
    friendliness: Math.round(avgFriendliness * 100) / 100,
    assertiveness: Math.round(avgAssertiveness * 100) / 100,
    verbosity: Math.round(avgVerbosity * 100) / 100,
    commonGreetings,
    commonClosings,
    vocabularyLevel,
    sentenceStructure,
    usesEmoji,
    usesBulletPoints,
    samplePhrases,
    signatureStyle,
    emailsScanned: count,
  };
}

/**
 * Generate a reply to an email, matching a specific tone profile
 */
export async function generateToneMatchedReply(params: {
  incomingEmail: {
    from: string;
    subject: string;
    body: string;
  };
  toneProfile: {
    formality: number;
    friendliness: number;
    assertiveness: number;
    verbosity: number;
    commonGreetings: string[];
    commonClosings: string[];
    vocabularyLevel: string;
    sentenceStructure: string;
    usesEmoji: boolean;
    usesBulletPoints: boolean;
    samplePhrases: string[];
    signatureStyle: string;
  };
  senderName: string;
  senderTitle?: string;
  additionalInstructions?: string;
}): Promise<{
  subject: string;
  body: string;
  tone: string;
  confidence: number;
}> {
  const { incomingEmail, toneProfile, senderName, senderTitle, additionalInstructions } = params;

  const toneDescription = buildToneDescription(toneProfile);

  const response = await invokeLLM({
    messages: [
      {
        role: "system",
        content: `You are an email reply assistant. Generate a reply that precisely matches the writer's personal tone and style.

${toneDescription}

The reply should sound like it was naturally written by this person. Do NOT use generic corporate language unless the tone profile indicates formal/corporate style.

Sign the email as: ${senderName}${senderTitle ? `, ${senderTitle}` : ""}

${additionalInstructions ? `Additional instructions: ${additionalInstructions}` : ""}

Respond in JSON format with subject, body, tone (a brief label), and confidence (0-100).`,
      },
      {
        role: "user",
        content: `Write a reply to this email:

From: ${incomingEmail.from}
Subject: ${incomingEmail.subject}

${incomingEmail.body}`,
      },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "tone_matched_reply",
        strict: true,
        schema: {
          type: "object",
          properties: {
            subject: { type: "string", description: "Reply subject line" },
            body: { type: "string", description: "Full email reply body" },
            tone: { type: "string", description: "Brief tone label of the generated reply" },
            confidence: { type: "number", description: "0-100 confidence that the reply matches the target tone" },
          },
          required: ["subject", "body", "tone", "confidence"],
          additionalProperties: false,
        },
      },
    },
  });

  const content = response.choices[0]?.message?.content;
  if (typeof content === "string") {
    return JSON.parse(content);
  }
  throw new Error("Failed to generate tone-matched reply");
}

/**
 * Build a human-readable description of a tone profile for the LLM prompt
 */
function buildToneDescription(profile: {
  formality: number;
  friendliness: number;
  assertiveness: number;
  verbosity: number;
  commonGreetings: string[];
  commonClosings: string[];
  vocabularyLevel: string;
  sentenceStructure: string;
  usesEmoji: boolean;
  usesBulletPoints: boolean;
  samplePhrases: string[];
  signatureStyle: string;
}): string {
  const formalityLabel =
    profile.formality < 30 ? "casual" : profile.formality < 60 ? "moderately formal" : "very formal";
  const friendlinessLabel =
    profile.friendliness < 30 ? "reserved/distant" : profile.friendliness < 60 ? "moderately warm" : "very warm and friendly";
  const assertivenessLabel =
    profile.assertiveness < 30 ? "gentle and indirect" : profile.assertiveness < 60 ? "balanced" : "direct and assertive";
  const verbosityLabel =
    profile.verbosity < 30 ? "concise and brief" : profile.verbosity < 60 ? "moderate length" : "detailed and thorough";

  let description = `TONE PROFILE TO MATCH:
- Formality: ${formalityLabel} (${profile.formality}/100)
- Friendliness: ${friendlinessLabel} (${profile.friendliness}/100)
- Assertiveness: ${assertivenessLabel} (${profile.assertiveness}/100)
- Verbosity: ${verbosityLabel} (${profile.verbosity}/100)
- Vocabulary: ${profile.vocabularyLevel}
- Sentence length: ${profile.sentenceStructure}`;

  if (profile.commonGreetings.length > 0) {
    description += `\n- Typical greetings: ${profile.commonGreetings.join(", ")}`;
  }
  if (profile.commonClosings.length > 0) {
    description += `\n- Typical closings: ${profile.commonClosings.join(", ")}`;
  }
  if (profile.usesEmoji) {
    description += `\n- Uses emoji occasionally`;
  }
  if (profile.usesBulletPoints) {
    description += `\n- Tends to use bullet points or lists`;
  }
  if (profile.samplePhrases.length > 0) {
    description += `\n- Characteristic phrases: "${profile.samplePhrases.join('", "')}"`;
  }
  if (profile.signatureStyle) {
    description += `\n- Sign-off style: ${profile.signatureStyle}`;
  }

  return description;
}
