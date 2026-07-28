-- Resume page visual editor. Safe to re-run — idempotent, purely additive:
-- one nullable-default jsonb column, no existing data touched.
--
-- Design intent: per-version formatting (template, font, size, alignment,
-- fit-to-one-page, section order) lives on resume_versions itself, not a
-- single global setting, so switching versions in the Resume editor
-- switches formatting with it — matches the resume_versions one-row-per-
-- variant model already established in Phase 5.

alter table resume_versions add column if not exists format_prefs jsonb not null default '{}';
