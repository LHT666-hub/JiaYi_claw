---
name: medication-reconciliation
description: |
  Performs comprehensive medication reconciliation across care transitions by comparing inpatient, outpatient, and patient-reported medication lists. Use when user asks to "reconcile medications", "compare medication lists", "check for medication discrepancies", mentions "care transition", "admission meds", "discharge meds", or needs a unified medication list. Do NOT use for single medication lookups, drug interaction checks, or adherence assessments.
metadata:
  author: LangCare
  version: 1.0.0
  mcp-server: langcare-mcp-fhir
  category: medication-management
---

# Medication Reconciliation

## Overview

Perform medication reconciliation per Joint Commission NPSG.03.06.01 requirements. Pull all medication sources (MedicationRequest, MedicationStatement, MedicationAdministration), normalize into a unified list, and identify discrepancies including duplicates, therapeutic duplications, discontinued medications still listed as active, and dose discrepancies across care settings.

## FHIR Resources Used

| Resource | Purpose | Key Fields |
|----------|---------|------------|
| MedicationRequest | Prescribed medications (orders) | status, intent, medicationCodeableConcept, dosageInstruction, authoredOn |
| MedicationStatement | Patient-reported and reconciled meds | status, medicationCodeableConcept, dosage, effectivePeriod, informationSource |
| MedicationAdministration | Administered medications (inpatient) | status, medicationCodeableConcept, dosage, effectiveDateTime, context |
| Patient | Patient demographics for identity verification | name, birthDate, identifier |
| AllergyIntolerance | Cross-check for contraindicated meds | code, clinicalStatus, reaction |
| Condition | Validate indication for each medication | code, clinicalStatus |

## Instructions

### Step 1: Verify Patient Identity

```
Tool: fhir_search
resourceType: "Patient"
queryParams: "family=[lastname]&given=[firstname]&birthdate=[YYYY-MM-DD]"
```

Confirm at least 2 identifiers match. If multiple patients returned, present options and halt until user confirms.

### Step 2: Pull All Medication Sources in Parallel

**2a: Prescribed medications (orders)**
```
Tool: fhir_search
resourceType: "MedicationRequest"
queryParams: "patient=[patient-id]&status=active,on-hold&_include=MedicationRequest:medication&_count=100"
```

**2b: Patient-reported medications**
```
Tool: fhir_search
resourceType: "MedicationStatement"
queryParams: "patient=[patient-id]&status=active,intended,on-hold&_count=100"
```

**2c: Administered medications (inpatient context)**
```
Tool: fhir_search
resourceType: "MedicationAdministration"
queryParams: "patient=[patient-id]&effective-time=ge[admission-date]&_count=100"
```

### Step 3: Pull Allergies and Active Conditions

**3a: Allergies**
```
Tool: fhir_search
resourceType: "AllergyIntolerance"
queryParams: "patient=[patient-id]&clinical-status=active"
```

**3b: Active conditions**
```
Tool: fhir_search
resourceType: "Condition"
queryParams: "patient=[patient-id]&clinical-status=active"
```

### Step 4: Normalize and Compare

For each medication entry, extract:
- Generic name (prefer RxNorm coding, system `http://www.nlm.nih.gov/research/umls/rxnorm`)
- Dose quantity and unit
- Frequency (from dosageInstruction.timing)
- Route (from dosageInstruction.route)
- Source (MedicationRequest vs MedicationStatement vs MedicationAdministration)
- Status and last updated date

Build a unified table with columns: Medication | Dose | Frequency | Route | Source | Status | Last Updated.

### Step 5: Identify Discrepancies

Flag the following categories:

**Duplicates**: Same RxNorm code appearing in multiple sources with identical dose/frequency. Mark for deduplication.

**Therapeutic Duplications**: Different medications in the same therapeutic class (e.g., two SSRIs, two ACE inhibitors, two statins). Use drug class grouping by RxNorm ingredient.

**Discontinued Medications Still Active**: MedicationRequest with status `stopped` or `cancelled` but a corresponding MedicationStatement with status `active`. Flag with the discontinuation date.

**Dose Discrepancies**: Same medication across sources with different dose or frequency. Present both values side by side.

**Missing Indications**: Active medications with no matching active Condition. Flag for clinician review.

**Allergy Conflicts**: Active medication matching a documented AllergyIntolerance substance code.

### Step 6: Flag High-Alert Medications

Cross-reference active medications against the ISMP high-alert medication list (see references/high-alert-medications.md). Apply extra scrutiny to:
- Anticoagulants (warfarin, heparin, DOACs)
- Insulin (all formulations)
- Opioids (all formulations)
- Antiarrhythmics (amiodarone, sotalol)
- Chemotherapy agents
- Concentrated electrolytes (KCl, NaCl >0.9%)

### Step 7: Present Reconciliation Report

Structure output as:

1. **Verified Medication List** - Unified, deduplicated list with source attribution
2. **Discrepancies Found** - Categorized by type with recommended resolution
3. **High-Alert Medications** - Highlighted with safety notes
4. **Allergy Conflicts** - Any medication-allergy matches
5. **Recommendations** - Specific actions (discontinue, adjust dose, clarify with prescriber)

### Step 8: Update Reconciled Medications (if authorized)

For each reconciled medication, update the MedicationStatement:
```
Tool: fhir_update
resourceType: "MedicationStatement"
id: "[medication-statement-id]"
resource: {
  "resourceType": "MedicationStatement",
  "status": "active",
  "statusReason": [{"text": "Reconciled on [date]"}],
  "dateAsserted": "[current-date]"
}
```

For medications to discontinue:
```
Tool: fhir_update
resourceType: "MedicationRequest"
id: "[medication-request-id]"
resource: {
  "resourceType": "MedicationRequest",
  "status": "stopped",
  "statusReason": {"text": "Discontinued during medication reconciliation [date]"}
}
```

## Examples

### Example 1: Admission Medication Reconciliation

**User says**: "Reconcile medications for patient John Smith, DOB 1955-03-15, being admitted to the hospital."

**Actions**:
1. Search Patient with `family=Smith&given=John&birthdate=1955-03-15`. Confirm identity.
2. Pull MedicationRequest (active orders), MedicationStatement (home meds), and MedicationAdministration (if transfer from another facility).
3. Pull AllergyIntolerance and active Conditions.
4. Normalize all entries. Discover:
   - MedicationStatement: lisinopril 10mg daily (home med)
   - MedicationRequest: lisinopril 20mg daily (new order)
   - MedicationStatement: metformin 500mg BID (home med)
   - No corresponding MedicationRequest for metformin
5. Flag: Dose discrepancy on lisinopril (10mg home vs 20mg ordered). Missing order for metformin.
6. Check high-alert list: no high-alert meds active.

**Result**:
```
MEDICATION RECONCILIATION - John Smith (DOB: 1955-03-15)
Reconciled: [date]

VERIFIED MEDICATIONS:
1. Lisinopril - HOME: 10mg daily | ORDERED: 20mg daily [DOSE DISCREPANCY]
2. Metformin 500mg BID - HOME only [NO INPATIENT ORDER]
3. Atorvastatin 40mg daily - HOME and ORDERED [MATCHED]

DISCREPANCIES:
- Lisinopril: Dose differs between home (10mg) and inpatient (20mg). Clarify with prescriber.
- Metformin: On home list but no inpatient order. Intentional hold or omission?

RECOMMENDATIONS:
- Confirm lisinopril dose change is intentional
- Confirm metformin hold (common for inpatient with contrast risk) or add order
```

### Example 2: Discharge Medication Reconciliation

**User says**: "Prepare discharge med rec for patient ID 12345."

**Actions**:
1. Read Patient 12345 via `fhir_read`. Confirm identity.
2. Pull all medication sources. Compare inpatient orders vs pre-admission home meds.
3. Identify new medications started during admission, medications discontinued, dose changes.
4. Flag any high-alert medications being sent home (insulin started during admission, new anticoagulant).

**Result**:
```
DISCHARGE MEDICATION RECONCILIATION - Patient 12345
Reconciled: [date]

CONTINUE FROM HOME:
1. Amlodipine 5mg daily [UNCHANGED]
2. Omeprazole 20mg daily [UNCHANGED]

NEW MEDICATIONS (started during admission):
3. Apixaban 5mg BID [HIGH-ALERT: anticoagulant] - Indication: new atrial fibrillation
4. Metoprolol succinate 25mg daily - Indication: rate control for atrial fibrillation

DISCONTINUED:
5. Ibuprofen 400mg TID - Reason: interaction with apixaban (bleeding risk)

DOSE CHANGES:
6. Lisinopril: Changed 10mg -> 20mg daily - Reason: BP not at goal

PATIENT EDUCATION REQUIRED:
- Apixaban: bleeding precautions, no NSAIDs, consistent dosing
- Metoprolol: check heart rate before taking, do not stop abruptly
```

## Troubleshooting

### MedicationRequest returns 0 results but patient has known medications
- Try searching MedicationStatement instead; some systems store home medications only as statements.
- Check if the EMR uses contained Medication resources: add `_include=MedicationRequest:medication` to resolve inline references.
- Verify the patient ID is correct. Some systems use different ID formats across modules.

### Medication codes are missing or use local codes instead of RxNorm
- Fall back to `medicationCodeableConcept.text` for display name matching.
- Search by medication text: `fhir_search` with `resourceType: "MedicationRequest"` and `queryParams: "patient=[id]&code:text=[medication-name]"`.
- Note in the reconciliation report that code-based matching was unavailable and manual review is required.

### MedicationAdministration not supported by the FHIR server
- This resource is optional in many implementations. Proceed with MedicationRequest and MedicationStatement only.
- Document that administered medications could not be verified and recommend manual chart review for inpatient administrations.

## Related Skills

- `drug-interaction-checker` - Run after reconciliation to check the unified list for interactions
- `prescription-appropriateness-review` - Validate reconciled list against Beers/STOPP-START criteria for elderly patients
- `medication-adherence-assessment` - Assess fill history for reconciled home medications
- `clinical-summary-generator` - Include reconciliation results in clinical summary
