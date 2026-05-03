-- Migration 0037: investor-role users + link stakeholder rows to the portal.
--
-- The "Investor Portal" lets existing investors log in to see their own
-- equity position alongside a wider live-financials view. Two schema
-- shifts support it:
--
-- 1. A new `investor` role on every surface that carries user roles
--    (`users`, `teamInvitations`, `team_invites`). Adding an enum value
--    is forward-compatible — existing rows are untouched.
--
-- 2. `team_invites.linkedStakeholderId` so the admin-side "Invite to
--    portal" flow can remember which `stakeholders` row to attach the
--    new user to once the invite is accepted. Nullable: existing
--    non-investor invites leave it empty.

ALTER TABLE `users`
  MODIFY COLUMN `role` ENUM(
    'user','admin','finance','ops','legal','exec','sales',
    'copacker','vendor','contractor','investor'
  ) NOT NULL DEFAULT 'user';

ALTER TABLE `teamInvitations`
  MODIFY COLUMN `role` ENUM(
    'user','admin','finance','ops','legal','exec','sales',
    'copacker','vendor','contractor','investor'
  ) NOT NULL DEFAULT 'user';

ALTER TABLE `team_invites`
  MODIFY COLUMN `role` ENUM(
    'user','admin','finance','ops','legal','exec','sales',
    'copacker','vendor','contractor','investor'
  ) NOT NULL DEFAULT 'user';

ALTER TABLE `team_invites`
  ADD COLUMN `linkedStakeholderId` int DEFAULT NULL;
