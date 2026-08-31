-- Extend resident_fact_candidates.fact_type to include memory-related types.
-- The original CHECK constraint was created inline without an explicit name;
-- PostgreSQL auto-generated the name resident_fact_candidates_fact_type_check.

begin;

alter table public.resident_fact_candidates drop constraint if exists resident_fact_candidates_fact_type_check;
alter table public.resident_fact_candidates add constraint resident_fact_candidates_fact_type_check check (fact_type in (
  'appointment_intent','followup_intent','health_observation','medication','symptom',
  'public_question',
  'allergy_self_reported','medication_history','lifestyle','visit_preference',
  'chronic_condition_self_reported','daily_living','care_preference'
));

comment on constraint resident_fact_candidates_fact_type_check on public.resident_fact_candidates is
  'Extended fact types now include memory-relevant categories for the resident memory pipeline.';

commit;
