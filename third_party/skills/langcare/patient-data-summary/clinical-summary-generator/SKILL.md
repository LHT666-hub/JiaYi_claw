---
name: clinical-summary-generator
description: |
  Generates a comprehensive CCD-style clinical summary from multiple FHIR resources following US Core and C-CDA structure.
  Use when user asks to "generate a clinical summary", "create a CCD", "summarize the chart", "give me the full picture",
  "comprehensive summary", "patient overview", "transition of care summary", or needs a consolidated clinical view.
  Do NOT use for single-domain queries like "just allergies" or "just meds" -- use domain-specific skills instead.
metadata:
  author: LangCare
  version: 1.0.0
  mcp-server: langcare-mcp-fhir
  category: patient-data
---

# Clinical Summary Generator

## Overview

Generate a comprehensive Continuity of Care Document (CCD)-style summary by pulling data from multiple FHIR resource types. Organize output following US Core required sections and C-CDA document structure. This skill aggregates active problems, current medications, allergies, recent labs, recent procedures, immunizations, and vital signs into a single consolidated view suitable for care transitions, referrals, or chart review.

## FHIR Resources Used

| Resource | Purpose | Search Parameters |
|----------|---------|-------------------|
| Patient | Demographics header | Direct read by ID |
| Condition | Active problem list | patient, clinical-status=active |
| MedicationRequest | Current medications | patient, status=active |
| AllergyIntolerance | Allergy list | patient, clinical-status=active |
| Observation | Labs and vitals | patient, category, date |
| Procedure | Recent procedures | patient, date |
| Immunization | Vaccination history | patient, status=completed |
| Encounter | Recent visits | patient, date |
| CarePlan | Active care plans | patient, status=active |

## Instructions

### Step 1: Retrieve Patient Demographics

```
Tool: fhir_read
resourceType: "Patient"
id: "[patient-id]"
```

Extract: full name, DOB, age, gender, race/ethnicity (US Core extensions), preferred language, MRN.

### Step 2: Pull Active Conditions

```
Tool: fhir_search
resourceType: "Condition"
queryParams: "patient=[patient-id]&clinical-status=active"
```

For each Condition:
- Extract `code.coding` (prefer SNOMED CT display, fall back to ICD-10 `code.coding` where `system` = `http://hl7.org/fhir/sid/icd-10-cm`)
- Record `onsetDateTime` or `onsetPeriod.start`
- Note `verificationStatus` (confirmed, unconfirmed, provisional, differential)
- Group by category: chronic vs acute, problem-list-item vs encounter-diagnosis

### Step 3: Pull Current Medications

```
Tool: fhir_search
resourceType: "MedicationRequest"
queryParams: "patient=[patient-id]&status=active"
```

For each MedicationRequest:
- Medication name from `medicationCodeableConcept.coding` (RxNorm preferred) or resolve `medicationReference`
- Dosage from `dosageInstruction[0]`: `doseAndRate[0].doseQuantity`, `route`, `timing`
- Prescriber from `requester` reference
- Date written from `authoredOn`

If MedicationRequest returns sparse data, supplement with:
```
Tool: fhir_search
resourceType: "MedicationStatement"
queryParams: "patient=[patient-id]&status=active"
```

### Step 4: Pull Allergies

```
Tool: fhir_search
resourceType: "AllergyIntolerance"
queryParams: "patient=[patient-id]&clinical-status=active"
```

For each AllergyIntolerance:
- Substance from `code.coding` (RxNorm for drugs, SNOMED for non-drugs)
- Category: `category` (food, medication, environment, biologic)
- Criticality: `criticality` (low, high, unable-to-assess)
- Reactions from `reaction[].manifestation[].coding[].display`
- Severity from `reaction[].severity` (mild, moderate, severe)

### Step 5: Pull Recent Lab Results (Last 90 Days)

```
Tool: fhir_search
resourceType: "Observation"
queryParams: "patient=[patient-id]&category=laboratory&date=ge[90-days-ago]&_sort=-date&_count=50"
```

For each Observation:
- Test name from `code.coding` (LOINC preferred)
- Value from `valueQuantity` (numeric) or `valueCodeableConcept` (coded) or `valueString`
- Reference range from `referenceRange[0]` (low/high)
- Interpretation from `interpretation[0].coding[0].code` (N=normal, H=high, L=low, HH=critical high, LL=critical low)
- Date from `effectiveDateTime`

Group by panel: CBC, BMP/CMP, Liver, Lipids, Thyroid, HbA1c, Other.

### Step 6: Pull Recent Vital Signs (Last 30 Days)

```
Tool: fhir_search
resourceType: "Observation"
queryParams: "patient=[patient-id]&category=vital-signs&date=ge[30-days-ago]&_sort=-date"
```

Extract most recent values for:
- Blood Pressure (LOINC 85354-9): systolic component 8480-6, diastolic 8462-4
- Heart Rate (LOINC 8867-4)
- Respiratory Rate (LOINC 9279-1)
- Temperature (LOINC 8310-5)
- O2 Saturation (LOINC 2708-6)
- Weight (LOINC 29463-7)
- Height (LOINC 8302-2)
- BMI (LOINC 39156-5)

### Step 7: Pull Recent Procedures (Last 12 Months)

```
Tool: fhir_search
resourceType: "Procedure"
queryParams: "patient=[patient-id]&date=ge[12-months-ago]&_sort=-date"
```

For each Procedure:
- Name from `code.coding` (CPT or SNOMED)
- Date from `performedDateTime` or `performedPeriod.start`
- Status from `status`
- Performer from `performer[0].actor`

### Step 8: Pull Immunization History

```
Tool: fhir_search
resourceType: "Immunization"
queryParams: "patient=[patient-id]&status=completed&_sort=-date"
```

For each Immunization:
- Vaccine name from `vaccineCode.coding` (CVX code system)
- Date from `occurrenceDateTime`
- Dose number from `protocolApplied[0].doseNumber`
- Site and route if available

### Step 9: Pull Recent Encounters (Last 12 Months)

```
Tool: fhir_search
resourceType: "Encounter"
queryParams: "patient=[patient-id]&date=ge[12-months-ago]&_sort=-date"
```

For each Encounter:
- Type from `type[0].coding[0].display`
- Date from `period.start`
- Status from `status`
- Class from `class.code` (AMB=ambulatory, IMP=inpatient, EMER=emergency)
- Provider from `participant[0].individual`
- Reason from `reasonCode` or `reasonReference`

### Step 10: Assemble and Format the CCD Summary

Organize into sections following C-CDA order:

```
CLINICAL SUMMARY
Generated: [current timestamp]
=====================================

PATIENT
-------
Name: [name]
MRN: [identifier]
DOB: [birthDate] (Age: [age])
Gender: [gender]
Race/Ethnicity: [extensions]
Language: [preferred language]

ACTIVE PROBLEMS
---------------
1. [Condition display] (SNOMED: [code]) - Onset: [date] - [verification status]
2. ...

CURRENT MEDICATIONS
-------------------
1. [Drug name] [dose] [route] [frequency] - Prescribed: [date] - By: [prescriber]
2. ...

ALLERGIES & INTOLERANCES
-------------------------
1. [Substance] - Category: [category] - Reaction: [manifestation] - Severity: [severity] - Criticality: [criticality]
2. ...
(If none documented: "No Known Allergies" or "Allergy status not reviewed")

RECENT VITAL SIGNS (Most Recent)
---------------------------------
BP: [systolic]/[diastolic] mmHg
HR: [value] bpm
RR: [value] breaths/min
Temp: [value] F/C
O2 Sat: [value]%
Weight: [value] kg/lb
BMI: [value] kg/m2

RECENT LAB RESULTS (Last 90 Days)
----------------------------------
[Panel Name]
  [Test]: [value] [unit] [flag] (Ref: [low]-[high]) - [date]
  ...

RECENT PROCEDURES (Last 12 Months)
-----------------------------------
1. [Procedure] - [date] - [performer]
2. ...

IMMUNIZATIONS
-------------
1. [Vaccine] - [date] - Dose [number]
2. ...

RECENT ENCOUNTERS (Last 12 Months)
-----------------------------------
1. [Type] - [date] - [class] - [provider] - Reason: [reason]
2. ...
```

## Examples

### Example 1: Full Clinical Summary for Referral

**User says:** "Generate a comprehensive clinical summary for patient 55555, I need it for a cardiology referral."

**Actions:**
1. `fhir_read` Patient/55555
2. `fhir_search` Condition?patient=55555&clinical-status=active
3. `fhir_search` MedicationRequest?patient=55555&status=active
4. `fhir_search` AllergyIntolerance?patient=55555&clinical-status=active
5. `fhir_search` Observation?patient=55555&category=laboratory&date=ge2025-11-07&_sort=-date&_count=50
6. `fhir_search` Observation?patient=55555&category=vital-signs&date=ge2026-01-07&_sort=-date
7. `fhir_search` Procedure?patient=55555&date=ge2025-02-07&_sort=-date
8. `fhir_search` Immunization?patient=55555&status=completed&_sort=-date
9. `fhir_search` Encounter?patient=55555&date=ge2025-02-07&_sort=-date

**Result:**
```
CLINICAL SUMMARY
Generated: 2026-02-07T14:30:00Z
=====================================

PATIENT
-------
Name: Robert Chen
MRN: MRN-55555
DOB: 1960-08-12 (Age: 65)
Gender: Male
Race/Ethnicity: Asian
Language: English

ACTIVE PROBLEMS
---------------
1. Essential hypertension (SNOMED: 59621000) - Onset: 2015-03-01 - Confirmed
2. Type 2 diabetes mellitus (SNOMED: 44054006) - Onset: 2018-06-15 - Confirmed
3. Hyperlipidemia (SNOMED: 55822004) - Onset: 2016-09-20 - Confirmed
4. Atrial fibrillation (SNOMED: 49436004) - Onset: 2025-12-01 - Confirmed

CURRENT MEDICATIONS
-------------------
1. Lisinopril 20mg PO daily - Prescribed: 2024-01-10
2. Metformin 1000mg PO BID - Prescribed: 2023-06-01
3. Atorvastatin 40mg PO daily - Prescribed: 2023-06-01
4. Apixaban 5mg PO BID - Prescribed: 2025-12-05
5. Metoprolol succinate 50mg PO daily - Prescribed: 2025-12-05

ALLERGIES & INTOLERANCES
-------------------------
1. Penicillin - Category: medication - Reaction: Hives - Severity: moderate - Criticality: low
2. Sulfa drugs - Category: medication - Reaction: Rash - Severity: mild - Criticality: low

[... remainder of sections with data ...]
```

### Example 2: Summary With Sparse Data

**User says:** "Summarize the chart for patient new-pt-001"

**Actions:** Same 9 searches as above.

**Result:** Most sections return empty or minimal data. Present what exists and clearly mark missing sections:

```
CLINICAL SUMMARY
Generated: 2026-02-07T14:35:00Z
=====================================

PATIENT
-------
Name: Sarah Johnson
MRN: MRN-NP001
DOB: 1995-04-20 (Age: 30)
Gender: Female

ACTIVE PROBLEMS
---------------
No active conditions documented.

CURRENT MEDICATIONS
-------------------
No active medications on file.

ALLERGIES & INTOLERANCES
-------------------------
** Allergy status has not been reviewed **

RECENT VITAL SIGNS
-------------------
BP: 118/76 mmHg (2026-02-05)
HR: 72 bpm
Weight: 65 kg
BMI: 23.1 kg/m2

RECENT LAB RESULTS
-------------------
No laboratory results in the last 90 days.

RECENT PROCEDURES
------------------
No procedures in the last 12 months.

IMMUNIZATIONS
-------------
1. Influenza vaccine - 2025-10-15
2. COVID-19 mRNA vaccine - 2025-09-01

RECENT ENCOUNTERS
-----------------
1. New Patient Visit - 2026-02-05 - Ambulatory - Dr. Martinez

NOTE: This patient has minimal data on file. This may be a new patient or
records may not have been transferred. Verify allergy status and medication
history with the patient directly.
```

### Example 3: Transition of Care Summary

**User says:** "Create a transition of care summary for patient 88888 being discharged."

**Actions:** Same resource pulls, but also include:
```
Tool: fhir_search
resourceType: "CarePlan"
queryParams: "patient=88888&status=active"
```

Add a "DISCHARGE PLAN / ACTIVE CARE PLANS" section after encounters. Include follow-up instructions, pending labs, and care plan activities from CarePlan resources.

## Troubleshooting

### Search Returns Too Many Results / Times Out
- Add `_count=50` to limit result sets
- Narrow date ranges: use `date=ge[30-days-ago]` instead of unbounded searches
- For labs, search by specific LOINC code panels instead of all laboratory observations

### Medications Appear Duplicated
- MedicationRequest and MedicationStatement may overlap. Prefer MedicationRequest for prescribed medications. Use MedicationStatement only if MedicationRequest returns no results.
- Deduplicate by RxNorm code (`medicationCodeableConcept.coding` where `system` = `http://www.nlm.nih.gov/research/umls/rxnorm`).
- Check `status` field -- stopped or cancelled medications should not appear in active list.

### Missing Sections Despite Known Data
- Different FHIR servers use different category codes. If `category=laboratory` returns nothing, try `category=http://terminology.hl7.org/CodeSystem/observation-category|laboratory`.
- Some systems store vital signs under `category=exam` instead of `category=vital-signs`.
- Immunization records may require `status=completed` to filter out entered-in-error records.

## Related Skills

- `patient-demographics-summary` -- for detailed demographic and insurance data
- `problem-list-review` -- for clinical analysis of the active problem list
- `allergy-adverse-reaction-summary` -- for detailed allergy analysis with cross-reactivity
