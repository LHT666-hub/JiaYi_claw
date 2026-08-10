---
name: referral-generator
description: |
  Generates FHIR ServiceRequest resources for specialist referrals with auto-populated clinical context including
  reason for referral, relevant labs, imaging, medications, and specific clinical questions.
  Use when user asks to "refer patient to", "generate referral", "send to specialist", "consult request",
  "get a cardiology/GI/neuro/etc referral", or needs to "order a consult".
  Do NOT use for inpatient consult notes, transfer-of-care documents, or discharge planning.
metadata:
  author: LangCare
  version: 1.0.0
  mcp-server: langcare-mcp-fhir
  category: care-coordination
---

# Referral Generator

## Overview

Generate a complete specialist referral as a FHIR ServiceRequest resource. Automatically populate the referral with relevant clinical context: active conditions as the reason for referral, pertinent lab results, current medications, and imaging findings. Flag conditions commonly requiring prior authorization. Format the clinical question for the specialist based on referral indication.

## FHIR Resources Used

| Resource | Purpose | Key Fields |
|----------|---------|------------|
| ServiceRequest | The referral itself | status, intent, code, reasonReference, supportingInfo, note |
| Condition | Reason for referral | code, clinicalStatus, onsetDateTime |
| Observation | Supporting lab/vital data | code, valueQuantity, effectiveDateTime, interpretation |
| DiagnosticReport | Imaging and pathology findings | code, conclusion, presentedForm |
| MedicationRequest | Current medications relevant to specialty | medicationCodeableConcept, dosageInstruction, status |
| MedicationStatement | Patient-reported medications | medicationCodeableConcept, status |
| Patient | Demographics and insurance | name, birthDate, gender, identifier |
| Coverage | Insurance for prior auth determination | type, payor, class |
| Procedure | Prior relevant procedures | code, performedDateTime, status |

## Instructions

### Step 1: Identify Patient and Referral Target

Confirm patient identity:
```
Tool: fhir_read
resourceType: "Patient"
id: "[patient-id]"
```

Extract: name, DOB, gender, MRN (from `identifier` where `type.coding.code` = "MR").

### Step 2: Gather Active Conditions

```
Tool: fhir_search
resourceType: "Condition"
queryParams: "patient=[patient-id]&clinical-status=active"
```

Identify the primary reason for referral from the user's request. Match it to an active Condition. If no matching Condition exists, the referral can still proceed but note that the referring diagnosis should be documented.

### Step 3: Retrieve Relevant Lab Results

Based on the target specialty, search for pertinent labs. Use specialty-specific LOINC codes from `references/referral-indications.md`.

```
Tool: fhir_search
resourceType: "Observation"
queryParams: "patient=[patient-id]&category=laboratory&code=[relevant-loinc-codes]&_sort=-date&_count=5"
```

Common specialty-relevant labs:
- **Cardiology**: Troponin (6598-7), BNP (42637-9), lipid panel (57698-3), ECG (11524-6)
- **Endocrinology**: HbA1c (4548-4), TSH (3016-3), free T4 (3024-7), cortisol (2143-6)
- **Nephrology**: Creatinine (2160-0), eGFR (33914-3), urine albumin/creatinine (9318-7), BMP
- **GI**: ALT (1742-6), AST (1920-8), bilirubin (1975-2), lipase (3040-3), albumin (1751-7)
- **Hematology**: CBC (58410-2), reticulocytes (17849-1), ferritin (2276-4), B12 (2132-9)
- **Rheumatology**: ESR (30341-2), CRP (1988-5), ANA (8061-4), RF (11572-5), anti-CCP (53027-9)
- **Pulmonology**: ABG, PFTs, chest imaging
- **Neurology**: MRI brain, EEG, nerve conduction studies
- **Oncology**: tumor markers, pathology, imaging

### Step 4: Retrieve Current Medications

```
Tool: fhir_search
resourceType: "MedicationRequest"
queryParams: "patient=[patient-id]&status=active&_sort=-date"
```

Filter medications relevant to the referral specialty. Include all medications if the specialist needs a complete picture (e.g., oncology, rheumatology).

### Step 5: Retrieve Relevant Imaging/Procedures

```
Tool: fhir_search
resourceType: "DiagnosticReport"
queryParams: "patient=[patient-id]&category=http://terminology.hl7.org/CodeSystem/v2-0074|RAD&_sort=-date&_count=5"
```

Also check for prior procedures relevant to the specialty:
```
Tool: fhir_search
resourceType: "Procedure"
queryParams: "patient=[patient-id]&code=[relevant-procedure-codes]&_sort=-date&_count=5"
```

### Step 6: Check Insurance and Prior Authorization Flags

```
Tool: fhir_search
resourceType: "Coverage"
queryParams: "patient=[patient-id]&status=active"
```

Cross-reference the referral type against common prior authorization triggers (see `references/referral-requirements.md`). Flag if prior auth is likely required:
- Most specialist visits under HMO plans
- Advanced imaging (MRI, CT, PET)
- Procedures (endoscopy, biopsy, surgery)
- Infusion therapies (biologics, chemotherapy)
- Genetic testing

### Step 7: Formulate Clinical Question

Based on the referral indication, generate a specific clinical question for the specialist. Avoid vague referrals like "please evaluate."

Structure: "[Clinical context]. [Specific question]. [What has been tried]."

Examples:
- "65yo M with 3 months progressive dyspnea, BNP 890, EF unknown. Please evaluate for heart failure management. Currently on lisinopril 10mg, no diuretic therapy initiated."
- "52yo F with HbA1c 9.8% on metformin 2000mg + glipizide 10mg BID. Requesting assistance with insulin initiation and glucose management optimization."

### Step 8: Create ServiceRequest Resource

```
Tool: fhir_create
resourceType: "ServiceRequest"
resource: {
  "resourceType": "ServiceRequest",
  "status": "active",
  "intent": "order",
  "category": [{ "coding": [{ "system": "http://snomed.info/sct", "code": "3457005", "display": "Patient referral" }] }],
  "priority": "[routine|urgent|asap|stat]",
  "code": { "coding": [{ "system": "http://snomed.info/sct", "code": "[specialty-code]", "display": "[Specialty] referral" }] },
  "subject": { "reference": "Patient/[patient-id]" },
  "authoredOn": "[today-ISO-8601]",
  "reasonReference": [{ "reference": "Condition/[condition-id]" }],
  "supportingInfo": [
    { "reference": "Observation/[lab-id-1]" },
    { "reference": "Observation/[lab-id-2]" },
    { "reference": "DiagnosticReport/[imaging-id]" }
  ],
  "note": [
    { "text": "[Clinical question formulated in Step 7]" },
    { "text": "Current medications: [relevant medication list]" },
    { "text": "Prior authorization: [Required/Not required/Unknown - check with payer]" }
  ]
}
```

SNOMED codes for common specialties:
- Cardiology: 3795001
- Endocrinology: 394583002
- Nephrology: 394589003
- Neurology: 394591006
- Gastroenterology: 394584008
- Pulmonology: 418112009
- Rheumatology: 394810000
- Oncology: 394593009
- Psychiatry: 394587001
- Orthopedics: 394801008
- Dermatology: 394582007
- Ophthalmology: 394594003
- Urology: 394612005

### Step 9: Format Output

```
REFERRAL SUMMARY
================
Patient: [name] | DOB: [dob] | MRN: [mrn]
Insurance: [payor] - [plan type]

Referral To: [Specialty]
Priority: [Routine/Urgent/ASAP/STAT]
Referring Diagnosis: [condition display] ([SNOMED/ICD code])

Clinical Question:
[Formulated question from Step 7]

Pertinent Labs:
- [Lab name]: [value] [units] ([date]) [H/L flag if abnormal]
- [Lab name]: [value] [units] ([date]) [H/L flag if abnormal]

Current Relevant Medications:
- [medication] [dose] [frequency]
- [medication] [dose] [frequency]

Relevant Imaging/Procedures:
- [study]: [key finding] ([date])

Prior Authorization: [LIKELY REQUIRED / Not expected / Check with payer]
  Reason: [if required, explain why]

ServiceRequest Created: ServiceRequest/[id]
```

## Examples

### Example 1: Routine Cardiology Referral

**User says:** "Refer patient 12345 to cardiology for chest pain evaluation"

**Actions:**
1. `fhir_read` Patient/12345 -- returns John Davis, DOB 1960-04-22, Male
2. `fhir_search` Condition?patient=12345&clinical-status=active -- finds chest pain (SNOMED 29857009), hypertension, hyperlipidemia
3. `fhir_search` Observation?patient=12345&category=laboratory&code=6598-7,42637-9,57698-3 -- troponin negative, BNP 340, LDL 165
4. `fhir_search` MedicationRequest?patient=12345&status=active -- lisinopril 20mg, atorvastatin 40mg, aspirin 81mg
5. `fhir_search` DiagnosticReport?patient=12345&category=RAD -- chest X-ray normal, no prior echo
6. `fhir_search` Coverage?patient=12345&status=active -- Aetna PPO
7. `fhir_create` ServiceRequest with all gathered data

**Result:**
```
REFERRAL SUMMARY
================
Patient: John Davis | DOB: 1960-04-22 | MRN: MRN-12345
Insurance: Aetna - PPO

Referral To: Cardiology
Priority: Urgent
Referring Diagnosis: Chest pain (SNOMED 29857009)

Clinical Question:
64yo M with recurrent exertional chest pain x 2 weeks, history of HTN and
hyperlipidemia. Troponin negative, BNP mildly elevated at 340. No prior
cardiac workup. Please evaluate for ischemic etiology and recommend workup.

Pertinent Labs:
- Troponin I: <0.01 ng/mL (2024-01-10) [Normal]
- BNP: 340 pg/mL (2024-01-10) [H]
- LDL: 165 mg/dL (2023-11-15) [H]

Current Relevant Medications:
- Lisinopril 20mg daily
- Atorvastatin 40mg daily
- Aspirin 81mg daily

Relevant Imaging/Procedures:
- Chest X-ray: No acute cardiopulmonary process (2024-01-10)

Prior Authorization: Not expected (PPO plan, initial consult)

ServiceRequest Created: ServiceRequest/sr-88901
```

### Example 2: Urgent GI Referral With Prior Auth Flag

**User says:** "Patient abc-555 needs a GI referral for persistent GI bleeding, please generate"

**Actions:**
1. `fhir_read` Patient/abc-555 -- returns Susan Park, DOB 1975-08-30, Female
2. `fhir_search` Condition?patient=abc-555&clinical-status=active -- GI hemorrhage (SNOMED 74474003), iron deficiency anemia
3. `fhir_search` Observation?patient=abc-555&category=laboratory&code=718-7,2276-4,1751-7 -- Hgb 8.2, ferritin 8, albumin 3.1
4. `fhir_search` MedicationRequest?patient=abc-555&status=active -- omeprazole 40mg BID, ferrous sulfate 325mg TID
5. `fhir_search` Coverage?patient=abc-555&status=active -- United Healthcare HMO
6. `fhir_create` ServiceRequest with urgent priority

**Result:**
```
REFERRAL SUMMARY
================
Patient: Susan Park | DOB: 1975-08-30 | MRN: MRN-abc-555
Insurance: United Healthcare - HMO

Referral To: Gastroenterology
Priority: Urgent
Referring Diagnosis: Gastrointestinal hemorrhage (SNOMED 74474003)

Clinical Question:
48yo F with iron deficiency anemia (Hgb 8.2, ferritin 8) and melena x 3 weeks.
On PPI BID without improvement. Requesting EGD/colonoscopy for source evaluation.
No prior endoscopic evaluation.

Pertinent Labs:
- Hemoglobin: 8.2 g/dL (2024-01-12) [L - critical]
- Ferritin: 8 ng/mL (2024-01-12) [L]
- Albumin: 3.1 g/dL (2024-01-12) [L]

Current Relevant Medications:
- Omeprazole 40mg BID
- Ferrous sulfate 325mg TID

Relevant Imaging/Procedures:
- None on file

Prior Authorization: LIKELY REQUIRED
  Reason: HMO plan requires prior auth for specialist visits and endoscopy procedures.
  Recommend submitting auth request before scheduling.

ServiceRequest Created: ServiceRequest/sr-99102
```

## Troubleshooting

### No Active Condition Matches the Referral Reason
- Search with broader terms: `Condition?patient=[id]&code:text=[keyword]` if the SNOMED code is unknown.
- If the condition is not yet documented, create it first with `fhir_create` on Condition, then reference it in the ServiceRequest.
- User may describe a symptom rather than a diagnosis. Map common symptoms to SNOMED: chest pain (29857009), abdominal pain (21522001), headache (25064002), dyspnea (267036007).

### Lab Results Not Found for Expected Tests
- The patient may not have had the relevant labs drawn yet. Note "recommended but not yet obtained" in the referral and suggest ordering them.
- Search with `_sort=-date&_count=1` to get the most recent result even if older than expected.
- Some labs may be stored as DiagnosticReport rather than individual Observations. Search DiagnosticReport with the relevant LOINC panel code.

### Insurance Coverage Resource Missing or Incomplete
- Not all FHIR servers store Coverage resources. If unavailable, note "Insurance information not available in FHIR -- verify prior authorization requirements with front desk."
- Self-pay patients: note "Self-pay -- no prior authorization required, discuss cost with specialist office."

## Related Skills

- `care-gap-identifier` -- may surface conditions that trigger specialist referrals
- `discharge-planning-checklist` -- referrals may be part of discharge requirements
- `transition-of-care-summary` -- include referral context in transfer documentation
