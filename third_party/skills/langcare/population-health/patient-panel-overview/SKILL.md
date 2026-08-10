---
name: patient-panel-overview
description: |
  Queries patient cohorts by condition and generates panel-level analytics including aggregate metrics, risk stratification, and outreach priorities. Use when user asks to "show my panel", "list all diabetics", "how many patients have CHF", "panel overview", "cohort summary", "population metrics", "who needs outreach", or mentions "panel management", "risk stratification", "quality metrics". Do NOT use for individual patient chart review, single-patient lab interpretation, or quality measure calculation (use quality-measure-dashboard instead).
metadata:
  author: LangCare
  version: 1.0.0
  mcp-server: langcare-mcp-fhir
  category: population-health
---

# Patient Panel Overview

## Overview

Query patient populations by chronic condition, aggregate clinical metrics across the cohort, stratify patients by risk level, and identify those needing priority outreach. Supports common chronic disease panels: diabetes, hypertension, heart failure, COPD, asthma, CKD, and depression. Produces summary statistics with actionable outreach lists.

## FHIR Resources Used

| Resource | Purpose | Key Fields |
|----------|---------|------------|
| Condition | Identify patients with target condition | code, clinicalStatus, subject, onsetDateTime |
| Patient | Demographics, age calculation | birthDate, gender, name, identifier |
| Observation | Lab values for aggregate metrics | code, valueQuantity, effectiveDateTime, status |
| Encounter | Recent visit tracking | class, status, period, subject |
| MedicationRequest | Treatment pattern analysis | medicationCodeableConcept, status, subject |
| Goal | Patient goal tracking | lifecycleStatus, target, achievementStatus |

## Instructions

### Step 1: Identify Target Cohort

Query patients with the target condition using SNOMED CT or ICD-10 codes. See references/panel-management.md for condition-specific codes.

**For diabetes panel:**
```
Tool: fhir_search
resourceType: "Condition"
queryParams: "code=http://snomed.info/sct|44054006&clinical-status=active&_count=200"
```
SNOMED 44054006 = Type 2 diabetes mellitus. Use `_count=200` and paginate via `_offset` if needed.

**For hypertension panel:**
```
Tool: fhir_search
resourceType: "Condition"
queryParams: "code=http://snomed.info/sct|38341003&clinical-status=active&_count=200"
```
SNOMED 38341003 = Hypertensive disorder.

**For CHF panel:**
```
Tool: fhir_search
resourceType: "Condition"
queryParams: "code=http://snomed.info/sct|42343007&clinical-status=active&_count=200"
```
SNOMED 42343007 = Congestive heart failure.

If SNOMED search returns zero results, retry with ICD-10:
```
Tool: fhir_search
resourceType: "Condition"
queryParams: "code=http://hl7.org/fhir/sid/icd-10-cm|E11&clinical-status=active&_count=200"
```

Extract unique patient references from `Condition.subject`. Build a list of patient IDs.

### Step 2: Retrieve Patient Demographics for Cohort

For each patient ID in the cohort (batch where possible):
```
Tool: fhir_search
resourceType: "Patient"
queryParams: "_id=[id1],[id2],[id3],...&_count=50"
```

Extract: name, birthDate (calculate age), gender, address (for geographic analysis if requested).

### Step 3: Pull Aggregate Lab Values

Query condition-specific lab observations across the cohort. See references/panel-management.md for LOINC codes per condition.

**Diabetes -- HbA1c:**
```
Tool: fhir_search
resourceType: "Observation"
queryParams: "code=http://loinc.org|4548-4&date=ge[12-months-ago]&_sort=-date&_count=200"
```
LOINC 4548-4 = Hemoglobin A1c/Hemoglobin.total in Blood.

**Hypertension -- Blood Pressure:**
```
Tool: fhir_search
resourceType: "Observation"
queryParams: "code=http://loinc.org|85354-9&date=ge[12-months-ago]&_sort=-date&_count=200"
```
LOINC 85354-9 = Blood pressure panel.

**CKD -- eGFR:**
```
Tool: fhir_search
resourceType: "Observation"
queryParams: "code=http://loinc.org|33914-3&date=ge[12-months-ago]&_sort=-date&_count=200"
```
LOINC 33914-3 = Glomerular filtration rate/1.73 sq M.predicted.

Filter results to only patients in the cohort. Take most recent value per patient.

### Step 4: Check Recent Visit Status

```
Tool: fhir_search
resourceType: "Encounter"
queryParams: "date=ge[6-months-ago]&status=finished&class=AMB&_count=200"
```

Match encounters to cohort patients. Identify patients with no visit in the last 6 months.

### Step 5: Compute Panel Metrics

For each condition panel, calculate:

1. **Panel size**: Total patients with active condition
2. **At goal**: Percentage with most recent lab value at target (see references/panel-management.md for targets)
   - Diabetes: A1c < 7.0% (or < 8.0% for elderly/complex)
   - Hypertension: BP < 130/80 (or < 140/90 for elderly)
   - CKD: eGFR stable or improving
3. **Not at goal**: Percentage above target
4. **No recent lab**: Percentage with no relevant lab in past 12 months
5. **No recent visit**: Percentage with no ambulatory encounter in past 6 months
6. **Complication rate**: Percentage with documented complications (query additional Conditions)

### Step 6: Risk Stratify the Cohort

Assign risk tiers based on criteria in references/panel-management.md:

- **High risk**: Lab values severely out of range, multiple comorbidities, no recent visit, recent ED/inpatient encounter
- **Medium risk**: Lab values moderately out of range, 1-2 comorbidities, visit within 6 months
- **Low risk**: At goal, recent visit, stable

For high-risk identification, check for recent ED visits:
```
Tool: fhir_search
resourceType: "Encounter"
queryParams: "patient=[patient-id]&class=EMER&date=ge[12-months-ago]&_count=10"
```

### Step 7: Generate Outreach Priority List

Sort patients by risk tier (high first), then by days since last visit (longest first). Present top 20 patients needing outreach with:
- Name, MRN, age
- Most recent lab value and date
- Last visit date
- Risk tier and reason
- Recommended action (schedule visit, repeat labs, care management referral)

### Step 8: Present Panel Summary

```
PATIENT PANEL OVERVIEW: [Condition Name]
=========================================
Panel Size: [N] patients
Report Date: [today]

AGGREGATE METRICS
-----------------
At Goal:           [N] ([%])
Not at Goal:       [N] ([%])
No Recent Lab:     [N] ([%]) -- lab not done in 12 months
No Recent Visit:   [N] ([%]) -- no visit in 6 months

RISK STRATIFICATION
-------------------
High Risk:    [N] ([%])
Medium Risk:  [N] ([%])
Low Risk:     [N] ([%])

DISTRIBUTION (e.g., A1c ranges for diabetes)
---------------------------------------------
< 7.0%:   [N] ([%])
7.0-8.0%: [N] ([%])
8.0-9.0%: [N] ([%])
> 9.0%:   [N] ([%])

TOP OUTREACH PRIORITIES
-----------------------
1. [Name] (MRN: [mrn]) - A1c 11.2% (6 months ago) - No visit in 9 months - ACTION: Schedule urgent visit
2. [Name] (MRN: [mrn]) - A1c 9.8% (3 months ago) - ED visit last month - ACTION: Care management referral
...
```

## Examples

### Example 1: Diabetes Panel Overview

**User says**: "Show me my diabetes panel. How many patients are at goal?"

**Actions**:
1. Search Condition with code 44054006 (T2DM), clinical-status active. Returns 87 patients.
2. Batch-fetch Patient demographics for all 87.
3. Search Observation for LOINC 4548-4 (A1c) in past 12 months. Match to cohort.
4. Search Encounter for ambulatory visits in past 6 months. Match to cohort.
5. Compute: 52/87 (59.8%) at A1c < 7%, 23/87 (26.4%) between 7-9%, 7/87 (8.0%) above 9%, 5/87 (5.7%) no A1c in 12 months.
6. Risk stratify: 12 high risk, 28 medium, 47 low.

**Result**:
```
PATIENT PANEL OVERVIEW: Type 2 Diabetes Mellitus
=================================================
Panel Size: 87 patients
Report Date: 2024-11-15

AGGREGATE METRICS
-----------------
At Goal (A1c < 7%):   52 (59.8%)
Not at Goal:           30 (34.5%)
No Recent A1c:          5 (5.7%)
No Recent Visit:        9 (10.3%)

A1c DISTRIBUTION
----------------
< 7.0%:   52 (59.8%)
7.0-8.0%: 16 (18.4%)
8.0-9.0%:  7 (8.0%)
> 9.0%:    7 (8.0%)
No data:   5 (5.7%)

TOP OUTREACH PRIORITIES
-----------------------
1. James Carter (MRN: 44521) - A1c 12.1% (4mo ago) - No visit 8 months - Schedule urgent visit + endo referral
2. Lisa Tran (MRN: 33876) - A1c 10.4% (6mo ago) - ED visit for DKA last month - Care management referral
3. Robert Kim (MRN: 55903) - No A1c in 14 months - No visit 11 months - Schedule visit + labs
```

### Example 2: Hypertension Panel for Outreach

**User says**: "Which of my hypertension patients haven't been seen recently and are uncontrolled?"

**Actions**:
1. Search Condition with code 38341003 (hypertension), active. Returns 142 patients.
2. Search Observation LOINC 85354-9 (BP panel) in past 12 months.
3. Search Encounter ambulatory in past 6 months.
4. Filter to patients with most recent systolic >= 140 AND no visit in 6+ months.

**Result**:
```
UNCONTROLLED HYPERTENSION - NO RECENT VISIT
============================================
Found 18 of 142 hypertension patients with BP >= 140/90 and no visit in 6+ months

1. Dorothy Williams (MRN: 22814) - Last BP: 168/94 (5mo ago) - Last visit: 8 months ago
2. Frank Nguyen (MRN: 31005) - Last BP: 158/92 (7mo ago) - Last visit: 10 months ago
3. Patricia Jones (MRN: 45221) - Last BP: 152/88 (4mo ago) - Last visit: 7 months ago
...

RECOMMENDED ACTIONS:
- All 18 patients: Schedule follow-up visit within 2 weeks
- Patients with BP > 160 systolic (2): Consider same-week appointment
- Patients with no visit > 9 months (4): Flag for care management outreach call
```

### Example 3: Multi-Condition Panel Summary

**User says**: "Give me a summary of all my chronic disease panels."

**Actions**:
1. Query Conditions for each supported disease (diabetes, HTN, CHF, COPD, CKD, depression) in parallel.
2. For each, pull aggregate labs and visit data.
3. Present combined summary table.

**Result**:
```
PRACTICE PANEL SUMMARY
======================
Condition           | Patients | At Goal | Not at Goal | No Recent Lab | No Recent Visit
--------------------|----------|---------|-------------|---------------|----------------
Type 2 Diabetes     |       87 |  59.8%  |     34.5%   |     5.7%      |     10.3%
Hypertension        |      142 |  68.3%  |     24.6%   |     7.0%      |     12.7%
Heart Failure       |       31 |  71.0%  |     19.4%   |     9.7%      |      6.5%
COPD                |       23 |  60.9%  |     26.1%   |    13.0%      |     17.4%
CKD                 |       19 |  52.6%  |     36.8%   |    10.5%      |     15.8%
Depression (PHQ-9)  |       54 |  44.4%  |     37.0%   |    18.5%      |     14.8%

TOTAL UNIQUE PATIENTS: 289 (some patients appear in multiple panels)
HIGHEST PRIORITY: Depression panel has lowest at-goal rate and highest no-recent-lab rate
```

## Troubleshooting

### Condition search returns zero patients despite known panel

- The FHIR server may use ICD-10 codes instead of SNOMED. Retry with ICD-10: `code=http://hl7.org/fhir/sid/icd-10-cm|E11` for diabetes, `I10` for hypertension, `I50` for CHF.
- Some systems store conditions with `clinical-status=recurrence` or `clinical-status=relapse` instead of `active`. Broaden: `clinical-status=active,recurrence,relapse`.
- Check if the server requires the full SNOMED URL or accepts short codes.

### Lab searches return too many results or timeout

- Add patient filter if querying for a small cohort: `patient=[id1],[id2]&code=...`.
- For large panels, use `_summary=count` first to estimate volume, then paginate with `_count=50&_offset=0`.
- Reduce date range from 12 months to 6 months if volume is excessive.
- Some servers do not support batch patient IDs in a single query. Fall back to individual queries for the top-priority patients only.

### Encounter class codes vary between FHIR servers

- EPIC uses `class=AMB` for ambulatory. Cerner may use `class=outpatient`. Generic servers may use `class=http://terminology.hl7.org/CodeSystem/v3-ActCode|AMB`.
- If encounter search returns zero results, try without the class filter and inspect returned encounter classes to determine the correct code.

## Related Skills

- `quality-measure-dashboard` -- calculate formal HEDIS/CMS quality measures for the panel
- `chronic-disease-registry-query` -- deeper registry-level queries with severity stratification
- `care-gap-identifier` -- identify specific care gaps for individual patients in the panel
- `preventive-care-compliance-report` -- preventive care audit across the panel
