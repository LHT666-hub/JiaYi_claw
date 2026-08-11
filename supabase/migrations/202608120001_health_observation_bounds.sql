-- Keep obviously impossible manual values out of resident summaries even when
-- a client bypasses the API schema. These are data-quality bounds, not medical
-- normal/abnormal thresholds.
alter table public.health_observations
  drop constraint if exists health_observations_plausible_values;

alter table public.health_observations
  add constraint health_observations_plausible_values check (
    (
      observation_type = 'blood_pressure'
      and value between 40 and 300
      and secondary_value between 30 and 200
      and secondary_value < value
      and unit = 'mmHg'
    )
    or (
      observation_type = 'blood_glucose'
      and value between 0.5 and 50
      and secondary_value is null
      and unit = 'mmol/L'
    )
    or (
      observation_type = 'weight'
      and value between 1 and 500
      and secondary_value is null
      and unit = 'kg'
    )
    or (
      observation_type = 'steps'
      and value between 0 and 200000
      and secondary_value is null
      and unit = '步'
    )
  ) not valid;

alter table public.health_observations
  validate constraint health_observations_plausible_values;
