---
name: lab-result-interpreter
description: |
  Retrieves, organizes, and interprets laboratory Observation resources with clinical context.
  Use when user asks to "interpret labs", "review lab results", "what do these labs mean", "explain my bloodwork",
  "check labs", "lab trends", "abnormal labs", or needs clinical interpretation of laboratory values.
  Do NOT use for vital signs, imaging results, pathology reports, or non-laboratory Observations.
metadata:
  author: LangCare
  version: 1.0.0
  mcp-server: langcare-mcp-fhir
  category: lab-diagnostics
---

# Lab Result Interpreter

## Overview

Pull laboratory Observation resources for a patient. Organize by panel type (CBC, BMP, CMP, liver, lipids, thyroid, coagulation, urinalysis). Flag abnormal values using the `interpretation` field and `referenceRange`. Calculate delta checks against prior results to detect clinically significant changes. Identify critical values requiring immediate action. Correlate abnormal patterns with differential diagnoses. Present results in structured clinical format with trend analysis.

## FHIR Resources Used

| Resource | Purpose | Key Fields |
|----------|---------|------------|
| Observation | Lab results | code, valueQuantity, interpretation, referenceRange, effectiveDateTime, status, component |
| Condition | Clinical correlation | code, clinicalStatus, onsetDateTime |
| MedicationStatement | Drug-lab correlation | medicationCodeableConcept, status, effectivePeriod |
| Patient | Age/sex for reference ranges | birthDate, gender |

## Instructions

### Step 1: Retrieve Patient Demographics

```
Tool: fhir_read
resourceType: "Patient"
id: "[patient-id]"
```

Extract `birthDate` (calculate age) and `gender`. These determine reference range selection -- many analytes have age- and sex-specific ranges.

### Step 2: Pull Recent Laboratory Observations

```
Tool: fhir_search
resourceType: "Observation"
queryParams: "patient=[patient-id]&category=laboratory&date=ge[target-date]&_sort=-date&_count=200"
```

If user requests a specific panel, narrow with LOINC codes:
- CBC panel: `code=58410-2`
- BMP: `code=51990-0`
- CMP: `code=24323-8`
- Liver panel: `code=24325-3`
- Lipid panel: `code=57698-3`
- Thyroid panel: `code=3016-3,3026-2,3024-7`

Default date range: `ge[30-days-ago]` unless user specifies otherwise.

### Step 3: Organize Results by Panel Category

Group Observations by `code.coding` LOINC into:
- **CBC**: WBC (26464-8), RBC (789-8), Hemoglobin (718-7), Hematocrit (4544-3), MCV (787-2), MCH (785-6), MCHC (786-4), RDW (788-0), Platelets (777-3), MPV (32623-1), Differential (WBC subtypes)
- **BMP/CMP**: Sodium (2951-2), Potassium (2823-3), Chloride (2075-0), CO2 (1963-8), BUN (3094-0), Creatinine (2160-0), Glucose (2345-7), Calcium (17861-6), Albumin (1751-7), Total Protein (2885-2), ALP (6768-6), ALT (1742-6), AST (1920-8), Bilirubin Total (1975-2)
- **Liver**: ALT (1742-6), AST (1920-8), ALP (6768-6), GGT (2324-2), Bilirubin Total (1975-2), Bilirubin Direct (1968-7), Albumin (1751-7)
- **Lipids**: Total Cholesterol (2093-3), LDL (18262-6), HDL (2085-9), Triglycerides (2571-8), VLDL (13457-7)
- **Thyroid**: TSH (3016-3), Free T4 (3024-7), Free T3 (3026-2)
- **Coagulation**: PT (5902-2), INR (6301-6), aPTT (3173-2), Fibrinogen (3255-7), D-dimer (48066-5)
- **Urinalysis**: specific gravity (5811-5), pH (5803-2), protein (5804-0), glucose (5792-7), ketones (5797-6), blood (5794-3)

### Step 4: Flag Abnormal Values

For each Observation:
1. Check `interpretation.coding.code`:
   - `H` = High, `L` = Low, `HH` = Critical High, `LL` = Critical Low, `A` = Abnormal
2. If no interpretation present, compare `valueQuantity.value` against `referenceRange[0].low.value` and `referenceRange[0].high.value`
3. Classify severity:
   - **Normal**: within reference range
   - **Abnormal**: outside reference range but not critical
   - **Critical**: matches critical value thresholds (see references/critical-values.md)
4. For critical values, prepend `[CRITICAL]` tag and include recommended immediate action

### Step 5: Calculate Delta Checks

For each abnormal result, pull the prior value:

```
Tool: fhir_search
resourceType: "Observation"
queryParams: "patient=[patient-id]&code=[loinc-code]&_sort=-date&_count=5"
```

Calculate:
- Absolute change: current - previous
- Percent change: ((current - previous) / previous) * 100
- Rate of change per unit time

Flag significant deltas:
- Hemoglobin drop > 2 g/dL
- Potassium change > 1.0 mEq/L
- Creatinine increase > 0.3 mg/dL or > 50% from baseline (AKI criteria)
- Platelet drop > 50% (consider HIT if on heparin)
- Sodium change > 8 mEq/L in 24 hours (osmotic demyelination risk)

### Step 6: Identify Abnormal Patterns and Differentials

Cross-reference abnormal values to detect clinical patterns:

- **Elevated AST + ALT, AST/ALT > 2**: alcoholic hepatitis pattern
- **Elevated AST + ALT, AST/ALT < 1**: non-alcoholic/viral hepatitis pattern
- **Elevated ALP + GGT, normal AST/ALT**: cholestatic pattern
- **Elevated BUN/Creatinine ratio > 20**: prerenal azotemia
- **Low MCV + low ferritin**: iron deficiency anemia
- **High MCV + low B12 or folate**: megaloblastic anemia
- **Pancytopenia (low WBC + Hgb + Plt)**: bone marrow failure workup
- **Elevated troponin + CK-MB**: myocardial injury
- **Elevated TSH + low Free T4**: primary hypothyroidism
- **Low TSH + high Free T4**: hyperthyroidism
- **Elevated anion gap**: MUDPILES (Methanol, Uremia, DKA, Propylene glycol, Isoniazid/Iron, Lactic acidosis, Ethylene glycol, Salicylates)

See references/lab-patterns.md for comprehensive pattern list.

### Step 7: Correlate with Medications and Conditions

```
Tool: fhir_search
resourceType: "Condition"
queryParams: "patient=[patient-id]&clinical-status=active"
```

```
Tool: fhir_search
resourceType: "MedicationStatement"
queryParams: "patient=[patient-id]&status=active"
```

Common drug-lab interactions to check:
- Metformin + elevated lactate: lactic acidosis risk
- Statins + elevated CK/ALT: myopathy or hepatotoxicity
- ACE inhibitors + elevated potassium/creatinine: expected pharmacologic effect vs toxicity
- Warfarin + INR: therapeutic monitoring
- Lithium + renal function + thyroid: toxicity screening
- Heparin + platelet drop: HIT screening

### Step 8: Format Output

```
LAB RESULTS INTERPRETATION -- [Patient Name] -- [Date Range]
=============================================================

CBC (collected [date])
  WBC:         8.2 x10^3/uL    [4.5-11.0]       NORMAL
  Hemoglobin:  9.1 g/dL        [12.0-16.0]       LOW [was 11.2 on MM/DD, delta -2.1]
  Hematocrit:  27.3%           [36.0-46.0]        LOW
  Platelets:   145 x10^3/uL   [150-400]          LOW (borderline)
  MCV:         72 fL           [80-100]           LOW

PATTERN: Microcytic anemia with dropping hemoglobin
  - Iron studies recommended to evaluate for iron deficiency
  - Delta check: Hgb dropped 2.1 g/dL -- clinically significant

BMP (collected [date])
  Potassium:   6.1 mEq/L      [3.5-5.0]         [CRITICAL] HIGH
    Immediate action: Verify specimen (check for hemolysis), obtain ECG,
    consider calcium gluconate if ECG changes present

[... additional panels ...]

CLINICAL CORRELATIONS
=====================
- Microcytic anemia: correlate with iron studies, consider GI evaluation
- Critical potassium: patient on lisinopril 20mg -- ACE inhibitor contributing factor
- Recommend: hold ACE inhibitor, repeat potassium stat, ECG

TRENDING SUMMARY
================
Hemoglobin: 12.1 -> 11.2 -> 9.1 (declining over 3 months)
Creatinine: 1.0 -> 1.1 -> 1.0 (stable)
```

## Examples

### Example 1: Routine Lab Review

**User says:** "Review labs for patient 55123 from the last month"

**Actions:**
1. `fhir_read` Patient/55123 -- returns 62-year-old male
2. `fhir_search` Observation?patient=55123&category=laboratory&date=ge[30-days-ago]&_sort=-date&_count=200 -- returns 18 Observations: CMP, CBC, lipid panel
3. `fhir_search` Observation?patient=55123&code=718-7&_sort=-date&_count=5 -- prior hemoglobin values for delta check
4. `fhir_search` Condition?patient=55123&clinical-status=active -- returns Type 2 DM, hypertension
5. `fhir_search` MedicationStatement?patient=55123&status=active -- returns metformin, lisinopril, atorvastatin

**Result:** Structured lab report showing CMP within normal limits, CBC with mild normocytic anemia (Hgb 11.8, stable from prior 11.9), lipid panel at goal on statin (LDL 68). Note: HbA1c 7.8% -- above ADA target for most adults. Recommend diabetes medication optimization. Correlate metformin with normal lactate. Atorvastatin with normal ALT/AST.

### Example 2: Critical Value Detection

**User says:** "What do the latest labs show for patient emr-9981?"

**Actions:**
1. `fhir_read` Patient/emr-9981 -- returns 45-year-old female
2. `fhir_search` Observation?patient=emr-9981&category=laboratory&_sort=-date&_count=200 -- returns recent labs with potassium 2.4 mEq/L (interpretation: LL), sodium 118 mEq/L (interpretation: LL)
3. `fhir_search` Observation?patient=emr-9981&code=2823-3&_sort=-date&_count=5 -- prior potassium values
4. `fhir_search` Observation?patient=emr-9981&code=2951-2&_sort=-date&_count=5 -- prior sodium values
5. `fhir_search` MedicationStatement?patient=emr-9981&status=active -- returns furosemide, SSRI

**Result:**
```
[CRITICAL] Potassium: 2.4 mEq/L (ref 3.5-5.0) -- Critical low
  Prior: 3.8 mEq/L (2 weeks ago) -- delta -1.4 mEq/L
  Action: Obtain ECG stat, IV potassium replacement, hold furosemide
  Correlation: furosemide 40mg daily -- likely causative

[CRITICAL] Sodium: 118 mEq/L (ref 136-145) -- Critical low
  Prior: 134 mEq/L (2 weeks ago) -- delta -16 mEq/L
  Action: Assess volume status, check serum osmolality, urine sodium/osmolality
  Correlation: SSRI (sertraline) -- SIADH risk factor. Furosemide -- additional contributor
  Caution: Correct sodium no faster than 8 mEq/L per 24 hours (osmotic demyelination risk)
```

### Example 3: Trend Analysis Request

**User says:** "Show me the creatinine trend for patient 7742 over the past year"

**Actions:**
1. `fhir_read` Patient/7742 -- returns 71-year-old male
2. `fhir_search` Observation?patient=7742&code=2160-0&date=ge[1-year-ago]&_sort=date -- returns 6 creatinine values over 12 months
3. `fhir_search` Condition?patient=7742&clinical-status=active -- returns CKD stage 3, hypertension, diabetes

**Result:**
```
CREATININE TREND -- Patient 7742 (71M, CKD Stage 3)
====================================================
2024-02: 1.4 mg/dL  (eGFR ~49)
2024-04: 1.5 mg/dL  (eGFR ~45)
2024-06: 1.6 mg/dL  (eGFR ~42)
2024-08: 1.5 mg/dL  (eGFR ~45)
2024-10: 1.8 mg/dL  (eGFR ~36)
2025-01: 2.1 mg/dL  (eGFR ~30)

Trajectory: declining eGFR, accelerating in last 3 months
Rate of decline: ~13 mL/min/1.73m2 per year (rapid, threshold >5)
Pattern: Progression from CKD Stage 3a to Stage 3b
Action: Nephrology referral, review nephrotoxic medications, check urine albumin
```

## Troubleshooting

### No Laboratory Observations Returned

- Confirm `category=laboratory` is supported by the FHIR server. Some servers use `category=http://terminology.hl7.org/CodeSystem/observation-category|laboratory` as the full system URL.
- Widen the date range. Default `ge[30-days-ago]` may miss infrequent labs.
- Search without category filter and inspect returned Observation categories to determine what values the server uses.

### Observation Has No referenceRange

- Not all FHIR servers populate `referenceRange`. Fall back to standard reference ranges by age and sex from references/reference-ranges.md.
- Check if the Observation uses `interpretation` coding instead -- this may be the only abnormal flag available.

### Panel Observations vs Individual Observations

- Some servers return panels as a single Observation with `component` array (e.g., CBC panel LOINC 58410-2 with WBC, RBC, etc. as components). Others return each analyte as a separate Observation.
- Check for `hasMember` references on panel-level Observations that point to individual result Observations.
- Always check both `valueQuantity` on the parent and `component[].valueQuantity` to capture all results.

### Delta Check Returns Only One Value

- Patient may be new to the system. Note "no prior value available for comparison" and skip delta calculation.
- Try extending `_count` parameter or removing date filter to find historical values.

## Related Skills

- `critical-value-alert-generator` -- for structured critical value alerting and notification workflows
- `diabetes-panel-review` -- for focused diabetes lab interpretation with ADA guideline application
- `renal-function-dashboard` -- for comprehensive renal function assessment and CKD staging
- `preoperative-lab-checklist` -- for evaluating lab readiness before surgical procedures
