export type HealthSummaryType =
  | "blood_pressure"
  | "blood_glucose"
  | "weight"
  | "steps";

export type HealthObservationSummaryRow = {
  id: string;
  observation_type: HealthSummaryType;
  value: number | string;
  secondary_value: number | string | null;
  unit: string;
  measured_at: string;
};

export type HealthSummaryItem = {
  id: string;
  type: HealthSummaryType;
  value: number;
  secondaryValue: number | null;
  unit: string;
  measuredAt: string;
  delta: number | null;
  secondaryDelta: number | null;
};

function finiteNumber(value: number | string | null) {
  if (value === null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function difference(current: number, previous: number | null) {
  if (previous === null) return null;
  return Number((current - previous).toFixed(3));
}

export function buildHealthSummary(
  rows: HealthObservationSummaryRow[],
): HealthSummaryItem[] {
  const grouped = new Map<HealthSummaryType, HealthObservationSummaryRow[]>();
  for (const row of rows) {
    const group = grouped.get(row.observation_type) ?? [];
    if (group.length < 2) group.push(row);
    grouped.set(row.observation_type, group);
  }

  return [...grouped.entries()]
    .map(([type, observations]) => {
      const [latest, previous] = observations;
      const value = finiteNumber(latest.value);
      if (value === null) return null;
      const secondaryValue = finiteNumber(latest.secondary_value);
      const previousValue = previous ? finiteNumber(previous.value) : null;
      const previousSecondary = previous
        ? finiteNumber(previous.secondary_value)
        : null;
      return {
        id: latest.id,
        type,
        value,
        secondaryValue,
        unit: latest.unit,
        measuredAt: latest.measured_at,
        delta: difference(value, previousValue),
        secondaryDelta:
          secondaryValue === null || previousSecondary === null
            ? null
            : difference(secondaryValue, previousSecondary),
      } satisfies HealthSummaryItem;
    })
    .filter((item): item is HealthSummaryItem => Boolean(item))
    .sort(
      (left, right) =>
        new Date(right.measuredAt).getTime() -
        new Date(left.measuredAt).getTime(),
    );
}
