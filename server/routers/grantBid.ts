// appRouter.grantBid — moved verbatim from server/routers.ts by scripts/split-legacy-router.mjs.
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import * as db from "../db";
import { collectERPData, autoPopulateFields, generateApplicationNarrative, reviewApplication, generateApplicationDocument, DEFAULT_SECTIONS, searchOpportunities, evaluateOpportunityFit, analyzeWebFormFields, generateAutoFillScript, generateCopyPasteGuide, generateApiPayload } from "../grantBidService";
import { runFormFillerAgent } from "../formFillerAgent";
import { createAuditLog, generateNumber } from "./_shared";

// ============================================
// GRANT & BID APPLICATION SUBMITTER
// ============================================
export const grantBidRouter = router({
    // Stats
    stats: protectedProcedure.query(() => db.getGrantBidApplicationStats()),

    // Templates
    templates: router({
      list: protectedProcedure.query(() => db.getGrantBidTemplates()),
      get: protectedProcedure
        .input(z.object({ id: z.number() }))
        .query(({ input }) => db.getGrantBidTemplateById(input.id)),
      create: protectedProcedure
        .input(z.object({
          name: z.string().min(1),
          type: z.enum(["grant", "procurement_bid", "rfp_response", "subsidy", "tax_incentive"]),
          description: z.string().optional(),
          sections: z.string().optional(),
        }))
        .mutation(async ({ input, ctx }) => {
          // If no sections, use default for the type
          const sections = input.sections || JSON.stringify(DEFAULT_SECTIONS[input.type] || DEFAULT_SECTIONS.grant);
          const result = await db.createGrantBidTemplate({ ...input, sections, createdBy: ctx.user.id });
          await createAuditLog(ctx.user.id, 'create', 'grant_bid_template', result.id, input.name);
          return result;
        }),
      update: protectedProcedure
        .input(z.object({
          id: z.number(),
          name: z.string().optional(),
          description: z.string().optional(),
          sections: z.string().optional(),
          isActive: z.boolean().optional(),
        }))
        .mutation(async ({ input, ctx }) => {
          const { id, ...data } = input;
          await db.updateGrantBidTemplate(id, data);
          await createAuditLog(ctx.user.id, 'update', 'grant_bid_template', id);
          return { success: true };
        }),
      delete: protectedProcedure
        .input(z.object({ id: z.number() }))
        .mutation(async ({ input, ctx }) => {
          await db.deleteGrantBidTemplate(input.id);
          await createAuditLog(ctx.user.id, 'delete', 'grant_bid_template', input.id);
          return { success: true };
        }),
      defaultSections: protectedProcedure
        .input(z.object({ type: z.string() }))
        .query(({ input }) => DEFAULT_SECTIONS[input.type] || DEFAULT_SECTIONS.grant),
    }),

    // Applications
    applications: router({
      list: protectedProcedure
        .input(z.object({ type: z.string().optional(), status: z.string().optional() }).optional())
        .query(({ input }) => db.getGrantBidApplications(input || undefined)),
      get: protectedProcedure
        .input(z.object({ id: z.number() }))
        .query(({ input }) => db.getGrantBidApplicationById(input.id)),
      create: protectedProcedure
        .input(z.object({
          title: z.string().min(1),
          type: z.enum(["grant", "procurement_bid", "rfp_response", "subsidy", "tax_incentive"]),
          templateId: z.number().optional(),
          projectId: z.number().optional(),
          grantingOrganization: z.string().optional(),
          programName: z.string().optional(),
          requestedAmount: z.string().optional(),
          matchingFunds: z.string().optional(),
          totalProjectCost: z.string().optional(),
          currency: z.string().optional(),
          submissionDeadline: z.string().optional(),
          projectStartDate: z.string().optional(),
          projectEndDate: z.string().optional(),
          submissionMethod: z.enum(["web_form", "email", "portal", "pdf_upload", "api"]).optional(),
          submissionUrl: z.string().optional(),
        }))
        .mutation(async ({ input, ctx }) => {
          const applicationNumber = generateNumber('GBA');
          const result = await db.createGrantBidApplication({
            ...input,
            applicationNumber,
            submissionDeadline: input.submissionDeadline ? new Date(input.submissionDeadline) : undefined,
            projectStartDate: input.projectStartDate ? new Date(input.projectStartDate) : undefined,
            projectEndDate: input.projectEndDate ? new Date(input.projectEndDate) : undefined,
            createdBy: ctx.user.id,
            status: 'draft',
          });
          await db.createGrantBidSubmissionLog({
            applicationId: result.id,
            action: 'created',
            details: `Application "${input.title}" created`,
            performedBy: ctx.user.id,
          });
          await createAuditLog(ctx.user.id, 'create', 'grant_bid_application', result.id, input.title);
          return { ...result, applicationNumber };
        }),
      update: protectedProcedure
        .input(z.object({
          id: z.number(),
          title: z.string().optional(),
          grantingOrganization: z.string().optional(),
          programName: z.string().optional(),
          requestedAmount: z.string().optional(),
          matchingFunds: z.string().optional(),
          totalProjectCost: z.string().optional(),
          status: z.enum(["draft", "data_collection", "ai_generating", "review", "approved", "submitted", "under_review", "awarded", "rejected", "withdrawn"]).optional(),
          formData: z.string().optional(),
          generatedNarrative: z.string().optional(),
          submissionDeadline: z.string().optional(),
          submissionUrl: z.string().optional(),
          submissionConfirmation: z.string().optional(),
          reviewNotes: z.string().optional(),
        }))
        .mutation(async ({ input, ctx }) => {
          const { id, submissionDeadline, ...data } = input;
          const updateData: any = { ...data };
          if (submissionDeadline) updateData.submissionDeadline = new Date(submissionDeadline);
          if (data.status === 'approved') {
            updateData.approvedBy = ctx.user.id;
            updateData.approvedAt = new Date();
          }
          if (data.status === 'review') {
            updateData.reviewedBy = ctx.user.id;
            updateData.reviewedAt = new Date();
          }
          if (data.status === 'submitted') {
            updateData.submittedAt = new Date();
          }
          await db.updateGrantBidApplication(id, updateData);
          if (data.status) {
            await db.createGrantBidSubmissionLog({
              applicationId: id,
              action: 'status_updated',
              details: `Status changed to ${data.status}`,
              performedBy: ctx.user.id,
            });
          }
          await createAuditLog(ctx.user.id, 'update', 'grant_bid_application', id);
          return { success: true };
        }),
      delete: protectedProcedure
        .input(z.object({ id: z.number() }))
        .mutation(async ({ input, ctx }) => {
          await db.deleteGrantBidApplication(input.id);
          await createAuditLog(ctx.user.id, 'delete', 'grant_bid_application', input.id);
          return { success: true };
        }),
    }),

    // Documents
    documents: router({
      list: protectedProcedure
        .input(z.object({ applicationId: z.number() }))
        .query(({ input }) => db.getGrantBidDocuments(input.applicationId)),
      create: protectedProcedure
        .input(z.object({
          applicationId: z.number(),
          name: z.string().min(1),
          documentType: z.enum([
            "cover_letter", "executive_summary", "budget_narrative", "financial_statement",
            "org_chart", "project_timeline", "letter_of_support", "tax_document",
            "certification", "capability_statement", "past_performance", "technical_proposal",
            "cost_proposal", "attachment", "generated_application"
          ]),
          source: z.enum(["auto_generated", "erp_export", "manual_upload"]).optional(),
          content: z.string().optional(),
          fileUrl: z.string().optional(),
          mimeType: z.string().optional(),
        }))
        .mutation(async ({ input, ctx }) => {
          const result = await db.createGrantBidDocument(input);
          await db.createGrantBidSubmissionLog({
            applicationId: input.applicationId,
            action: 'document_attached',
            details: `Document "${input.name}" attached (${input.documentType})`,
            performedBy: ctx.user.id,
          });
          return result;
        }),
      delete: protectedProcedure
        .input(z.object({ id: z.number(), applicationId: z.number() }))
        .mutation(async ({ input, ctx }) => {
          await db.deleteGrantBidDocument(input.id);
          return { success: true };
        }),
    }),

    // Submission Logs
    logs: protectedProcedure
      .input(z.object({ applicationId: z.number() }))
      .query(({ input }) => db.getGrantBidSubmissionLogs(input.applicationId)),

    // AI-powered data collection & auto-population
    collectData: protectedProcedure
      .input(z.object({
        applicationId: z.number(),
        templateId: z.number().optional(),
        applicationType: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        // Get the template sections
        let sections;
        if (input.templateId) {
          const template = await db.getGrantBidTemplateById(input.templateId);
          sections = template?.sections ? JSON.parse(template.sections) : DEFAULT_SECTIONS.grant;
        } else {
          sections = DEFAULT_SECTIONS[input.applicationType || 'grant'] || DEFAULT_SECTIONS.grant;
        }

        // Auto-populate from ERP data
        const populatedData = await autoPopulateFields(sections);

        // Update the application
        await db.updateGrantBidApplication(input.applicationId, {
          formData: JSON.stringify(populatedData),
          status: 'data_collection',
        });

        await db.createGrantBidSubmissionLog({
          applicationId: input.applicationId,
          action: 'data_collected',
          details: `Auto-populated ${Object.keys(populatedData).length} fields from ERP data`,
          performedBy: ctx.user.id,
        });

        return { populatedFields: Object.keys(populatedData).length, data: populatedData, sections };
      }),

    // AI narrative generation
    generateNarrative: protectedProcedure
      .input(z.object({
        applicationId: z.number(),
        customInstructions: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const application = await db.getGrantBidApplicationById(input.applicationId);
        if (!application) throw new TRPCError({ code: 'NOT_FOUND', message: 'Application not found' });

        const formData = application.formData ? JSON.parse(application.formData) : {};
        const narrative = await generateApplicationNarrative(
          application.type,
          application.title,
          formData,
          application.programName || undefined,
          input.customInstructions,
        );

        await db.updateGrantBidApplication(input.applicationId, {
          generatedNarrative: narrative,
          status: 'ai_generating',
        });

        await db.createGrantBidSubmissionLog({
          applicationId: input.applicationId,
          action: 'narrative_generated',
          details: 'AI-generated narrative created',
          performedBy: ctx.user.id,
        });

        return { narrative };
      }),

    // AI review
    reviewApplication: protectedProcedure
      .input(z.object({ applicationId: z.number() }))
      .mutation(async ({ input, ctx }) => {
        const application = await db.getGrantBidApplicationById(input.applicationId);
        if (!application) throw new TRPCError({ code: 'NOT_FOUND', message: 'Application not found' });

        const formData = application.formData ? JSON.parse(application.formData) : {};
        const review = await reviewApplication(formData, application.generatedNarrative || '', application.type);

        await db.createGrantBidSubmissionLog({
          applicationId: input.applicationId,
          action: 'review_completed',
          details: `AI review score: ${review.score}/100`,
          performedBy: ctx.user.id,
        });

        return review;
      }),

    // Generate document
    generateDocument: protectedProcedure
      .input(z.object({
        applicationId: z.number(),
        templateId: z.number().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const application = await db.getGrantBidApplicationById(input.applicationId);
        if (!application) throw new TRPCError({ code: 'NOT_FOUND', message: 'Application not found' });

        let sections;
        if (input.templateId) {
          const template = await db.getGrantBidTemplateById(input.templateId);
          sections = template?.sections ? JSON.parse(template.sections) : DEFAULT_SECTIONS.grant;
        } else {
          sections = DEFAULT_SECTIONS[application.type] || DEFAULT_SECTIONS.grant;
        }

        const formData = application.formData ? JSON.parse(application.formData) : {};
        const document = await generateApplicationDocument(application, formData, application.generatedNarrative || '', sections);

        // Save as a generated document
        const docResult = await db.createGrantBidDocument({
          applicationId: input.applicationId,
          name: `${application.title} - Complete Application`,
          documentType: 'generated_application',
          source: 'auto_generated',
          content: document,
          mimeType: 'text/markdown',
        });

        await db.createGrantBidSubmissionLog({
          applicationId: input.applicationId,
          action: 'document_attached',
          details: 'Complete application document generated',
          performedBy: ctx.user.id,
        });

        return { documentId: docResult.id, content: document };
      }),

    // Get ERP data sources (for UI to show available data)
    dataSources: protectedProcedure.query(async () => {
      const erpData = await collectERPData();
      return {
        available: {
          company: !!erpData.companies,
          employees: erpData.employees.totalCount > 0,
          financials: !!erpData.financials,
        },
        data: erpData,
      };
    }),

    // ============================================
    // OPPORTUNITY DISCOVERY & SEARCH
    // ============================================
    opportunities: router({
      list: protectedProcedure
        .input(z.object({ type: z.string().optional(), status: z.string().optional(), search: z.string().optional() }).optional())
        .query(({ input }) => db.getGrantBidOpportunities(input || undefined)),
      get: protectedProcedure
        .input(z.object({ id: z.number() }))
        .query(({ input }) => db.getGrantBidOpportunityById(input.id)),
      stats: protectedProcedure.query(() => db.getGrantBidOpportunityStats()),

      // AI-powered opportunity search
      search: protectedProcedure
        .input(z.object({
          query: z.string().min(1),
          type: z.string().optional(),
        }))
        .mutation(async ({ input, ctx }) => {
          // Get company profile for context
          const erpData = await collectERPData();
          const companyProfile = erpData.companies;

          // Search using AI
          const results = await searchOpportunities(input.query, companyProfile, input.type);

          // Save discovered opportunities to database
          const savedIds = [];
          for (const opp of results) {
            const result = await db.createGrantBidOpportunity({
              title: opp.title,
              type: opp.type as any,
              organization: opp.organization,
              programName: opp.programName,
              description: opp.description,
              eligibilityCriteria: opp.eligibilityCriteria,
              fundingAmountMin: opp.fundingAmountMin ? String(opp.fundingAmountMin) : undefined,
              fundingAmountMax: opp.fundingAmountMax ? String(opp.fundingAmountMax) : undefined,
              matchingRequired: opp.matchingRequired,
              deadline: opp.deadline ? new Date(opp.deadline) : undefined,
              sourceUrl: opp.sourceUrl,
              sourceType: 'ai_recommended',
              matchScore: opp.matchScore,
              matchReason: opp.matchReason,
              categories: JSON.stringify(opp.categories),
              status: 'discovered',
            });
            savedIds.push(result.id);
          }

          await createAuditLog(ctx.user.id, 'create', 'grant_bid_opportunity_search', 0, `Search: ${input.query}`);
          return { count: results.length, opportunities: results, savedIds };
        }),

      // Evaluate fit for a specific opportunity
      evaluate: protectedProcedure
        .input(z.object({ id: z.number() }))
        .mutation(async ({ input, ctx }) => {
          const opportunity = await db.getGrantBidOpportunityById(input.id);
          if (!opportunity) throw new TRPCError({ code: 'NOT_FOUND', message: 'Opportunity not found' });

          const erpData = await collectERPData();
          const evaluation = await evaluateOpportunityFit(
            {
              title: opportunity.title,
              description: opportunity.description || '',
              eligibilityCriteria: opportunity.eligibilityCriteria || '',
              type: opportunity.type,
            },
            {
              company: erpData.companies,
              employees: erpData.employees,
              financials: erpData.financials,
            },
          );

          // Update the opportunity with the fit score
          await db.updateGrantBidOpportunity(input.id, {
            matchScore: evaluation.fitScore,
            matchReason: evaluation.recommendation,
            status: 'evaluating',
          });

          return evaluation;
        }),

      // Save/bookmark an opportunity
      save: protectedProcedure
        .input(z.object({ id: z.number() }))
        .mutation(async ({ input, ctx }) => {
          await db.updateGrantBidOpportunity(input.id, { status: 'saved', savedBy: ctx.user.id });
          return { success: true };
        }),

      // Dismiss an opportunity
      dismiss: protectedProcedure
        .input(z.object({ id: z.number() }))
        .mutation(async ({ input }) => {
          await db.updateGrantBidOpportunity(input.id, { status: 'dismissed' });
          return { success: true };
        }),

      // Update opportunity status/notes
      update: protectedProcedure
        .input(z.object({
          id: z.number(),
          status: z.enum(["discovered", "saved", "evaluating", "applying", "applied", "not_eligible", "expired", "dismissed"]).optional(),
          notes: z.string().optional(),
          applicationId: z.number().optional(),
        }))
        .mutation(async ({ input, ctx }) => {
          const { id, ...data } = input;
          await db.updateGrantBidOpportunity(id, data);
          await createAuditLog(ctx.user.id, 'update', 'grant_bid_opportunity', id);
          return { success: true };
        }),

      // Delete an opportunity
      delete: protectedProcedure
        .input(z.object({ id: z.number() }))
        .mutation(async ({ input, ctx }) => {
          await db.deleteGrantBidOpportunity(input.id);
          return { success: true };
        }),

      // Start application from an opportunity
      startApplication: protectedProcedure
        .input(z.object({ opportunityId: z.number() }))
        .mutation(async ({ input, ctx }) => {
          const opp = await db.getGrantBidOpportunityById(input.opportunityId);
          if (!opp) throw new TRPCError({ code: 'NOT_FOUND', message: 'Opportunity not found' });

          const applicationNumber = generateNumber('GBA');
          const appResult = await db.createGrantBidApplication({
            applicationNumber,
            title: opp.title,
            type: opp.type as any,
            grantingOrganization: opp.organization,
            programName: opp.programName,
            requestedAmount: opp.fundingAmountMax || opp.fundingAmountMin || undefined,
            submissionDeadline: opp.deadline || undefined,
            createdBy: ctx.user.id,
            status: 'draft',
          });

          // Link the opportunity to the application
          await db.updateGrantBidOpportunity(input.opportunityId, {
            status: 'applying',
            applicationId: appResult.id,
          });

          await db.createGrantBidSubmissionLog({
            applicationId: appResult.id,
            action: 'created',
            details: `Application created from opportunity: ${opp.title}`,
            performedBy: ctx.user.id,
          });

          return { applicationId: appResult.id, applicationNumber };
        }),

      // Add a manual opportunity
      create: protectedProcedure
        .input(z.object({
          title: z.string().min(1),
          type: z.enum(["grant", "procurement_bid", "rfp_response", "subsidy", "tax_incentive"]),
          organization: z.string().optional(),
          programName: z.string().optional(),
          description: z.string().optional(),
          eligibilityCriteria: z.string().optional(),
          fundingAmountMin: z.string().optional(),
          fundingAmountMax: z.string().optional(),
          matchingRequired: z.boolean().optional(),
          deadline: z.string().optional(),
          sourceUrl: z.string().optional(),
          notes: z.string().optional(),
        }))
        .mutation(async ({ input, ctx }) => {
          const result = await db.createGrantBidOpportunity({
            ...input,
            deadline: input.deadline ? new Date(input.deadline) : undefined,
            sourceType: 'manual',
            status: 'saved',
            savedBy: ctx.user.id,
          });
          await createAuditLog(ctx.user.id, 'create', 'grant_bid_opportunity', result.id, input.title);
          return result;
        }),
    }),

    // ============================================
    // WEB FORM AUTO-FILLER
    // ============================================
    webForm: router({
      // Get all form mappings for an application
      list: protectedProcedure
        .input(z.object({ applicationId: z.number() }))
        .query(({ input }) => db.getGrantBidWebFormMappings(input.applicationId)),

      // Get a specific form mapping
      get: protectedProcedure
        .input(z.object({ id: z.number() }))
        .query(({ input }) => db.getGrantBidWebFormMappingById(input.id)),

      // Analyze a web form and generate field mappings using AI
      analyze: protectedProcedure
        .input(z.object({
          applicationId: z.number(),
          portalName: z.string().min(1),
          portalUrl: z.string().optional(),
          formDescription: z.string().min(1),
        }))
        .mutation(async ({ input, ctx }) => {
          const application = await db.getGrantBidApplicationById(input.applicationId);
          if (!application) throw new TRPCError({ code: 'NOT_FOUND', message: 'Application not found' });

          const formData = application.formData ? JSON.parse(application.formData) : {};
          // Merge in narrative and meta
          const fullData = {
            ...formData,
            _narrative: application.generatedNarrative || '',
            _title: application.title,
            _type: application.type,
            _organization: application.grantingOrganization || '',
            _programName: application.programName || '',
            _requestedAmount: application.requestedAmount || '',
          };

          const mappings = await analyzeWebFormFields(
            input.portalName,
            input.portalUrl || '',
            input.formDescription,
            fullData,
          );

          // Generate auto-fill script
          const script = generateAutoFillScript(mappings, input.portalName);

          // Save the mapping
          const result = await db.createGrantBidWebFormMapping({
            applicationId: input.applicationId,
            portalName: input.portalName,
            portalUrl: input.portalUrl,
            fieldMappings: JSON.stringify(mappings),
            autoFillScript: script,
            status: 'mapped',
            createdBy: ctx.user.id,
          });

          await db.createGrantBidSubmissionLog({
            applicationId: input.applicationId,
            action: 'data_collected',
            details: `Web form mapping created for ${input.portalName} (${mappings.length} fields)`,
            performedBy: ctx.user.id,
          });

          return { id: result.id, mappings, script, fieldCount: mappings.length };
        }),

      // Regenerate auto-fill script (after user edits mappings)
      regenerateScript: protectedProcedure
        .input(z.object({
          id: z.number(),
          fieldMappings: z.string(), // Updated JSON
        }))
        .mutation(async ({ input }) => {
          const mapping = await db.getGrantBidWebFormMappingById(input.id);
          if (!mapping) throw new TRPCError({ code: 'NOT_FOUND' });

          const parsedMappings = JSON.parse(input.fieldMappings);
          const script = generateAutoFillScript(parsedMappings, mapping.portalName);

          await db.updateGrantBidWebFormMapping(input.id, {
            fieldMappings: input.fieldMappings,
            autoFillScript: script,
          });

          return { script };
        }),

      // Update a form mapping
      update: protectedProcedure
        .input(z.object({
          id: z.number(),
          fieldMappings: z.string().optional(),
          autoFillScript: z.string().optional(),
          status: z.enum(["draft", "mapped", "tested", "submitted"]).optional(),
          notes: z.string().optional(),
        }))
        .mutation(async ({ input }) => {
          const { id, ...data } = input;
          if (data.status === 'submitted') {
            (data as any).lastFilledAt = new Date();
          }
          await db.updateGrantBidWebFormMapping(id, data);
          return { success: true };
        }),

      // Delete a form mapping
      delete: protectedProcedure
        .input(z.object({ id: z.number() }))
        .mutation(async ({ input }) => {
          await db.deleteGrantBidWebFormMapping(input.id);
          return { success: true };
        }),

      // Generate copy-paste guide for manual form filling
      copyPasteGuide: protectedProcedure
        .input(z.object({
          applicationId: z.number(),
          templateId: z.number().optional(),
        }))
        .query(async ({ input }) => {
          const application = await db.getGrantBidApplicationById(input.applicationId);
          if (!application) throw new TRPCError({ code: 'NOT_FOUND' });

          let sections;
          if (input.templateId) {
            const template = await db.getGrantBidTemplateById(input.templateId);
            sections = template?.sections ? JSON.parse(template.sections) : DEFAULT_SECTIONS.grant;
          } else {
            sections = DEFAULT_SECTIONS[application.type] || DEFAULT_SECTIONS.grant;
          }

          const formData = application.formData ? JSON.parse(application.formData) : {};
          const guide = generateCopyPasteGuide(formData, sections, application.generatedNarrative || undefined);
          return { guide };
        }),

      // Generate API payload for programmatic submissions
      apiPayload: protectedProcedure
        .input(z.object({ applicationId: z.number() }))
        .query(async ({ input }) => {
          const application = await db.getGrantBidApplicationById(input.applicationId);
          if (!application) throw new TRPCError({ code: 'NOT_FOUND' });

          const formData = application.formData ? JSON.parse(application.formData) : {};
          const payload = generateApiPayload(formData, {
            title: application.title,
            type: application.type,
            applicationNumber: application.applicationNumber,
            organization: application.grantingOrganization || undefined,
          });
          return { payload, json: JSON.stringify(payload, null, 2) };
        }),

      // Run the AI form filler agent to autonomously plan form filling
      runAgent: protectedProcedure
        .input(z.object({
          applicationId: z.number(),
          portalName: z.string().min(1),
          portalUrl: z.string().optional(),
          formDescription: z.string().optional(),
        }))
        .mutation(async ({ input, ctx }) => {
          const application = await db.getGrantBidApplicationById(input.applicationId);
          if (!application) throw new TRPCError({ code: 'NOT_FOUND', message: 'Application not found' });

          const plan = await runFormFillerAgent(
            {
              userId: ctx.user.id,
              applicationId: input.applicationId,
              portalName: input.portalName,
              portalUrl: input.portalUrl || '',
            },
            input.formDescription,
          );

          await db.createGrantBidSubmissionLog({
            applicationId: input.applicationId,
            action: 'status_updated' as any,
            details: `AI agent generated form filler plan for ${input.portalName} — ${plan.fieldActions.length} fields, ${plan.humanActions.length} manual actions, ${plan.steps.length} steps`,
            performedBy: ctx.user.id,
          });

          return plan;
        }),
    }),
  });
