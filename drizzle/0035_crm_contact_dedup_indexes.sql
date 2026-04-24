-- Migration 0035: schema-level uniqueness for CRM contact identifiers.
--
-- Belt-and-suspenders alongside the app-level findOrCreateCrmContact helper:
-- once these indexes exist, two rows can never share a non-null email, phone,
-- WhatsApp number, or LinkedIn URL, regardless of which code path inserted
-- them.
--
-- PRE-FLIGHT (IMPORTANT):
-- Existing deployments must merge their duplicate contacts before this
-- migration runs. Otherwise `CREATE UNIQUE INDEX` fails with ER_DUP_ENTRY.
--   - Supported cleanup path: run the admin-only
--     `crm.contacts.autoMergeDuplicates` route/tool before deploying this
--     migration.
--   - The dedupe keeps the oldest row in each duplicate group; reparents
--     deals, interactions, tags, captures, WhatsApp messages and campaign
--     recipients onto the kept row; deletes the rest.
--
-- Notes:
--   - MySQL UNIQUE treats multiple NULLs as distinct, so contacts without
--     an email/phone/linkedin are still allowed.
--   - The default utf8mb4_*_ci collation on varchar columns is already
--     case-insensitive, so `jade@x.com` and `Jade@x.com` collide.

CREATE UNIQUE INDEX `crm_contacts_email_uniq`
  ON `crm_contacts` (`email`);

CREATE UNIQUE INDEX `crm_contacts_phone_uniq`
  ON `crm_contacts` (`phone`);

CREATE UNIQUE INDEX `crm_contacts_whatsapp_uniq`
  ON `crm_contacts` (`whatsappNumber`);

CREATE UNIQUE INDEX `crm_contacts_linkedin_uniq`
  ON `crm_contacts` (`linkedinUrl`);
