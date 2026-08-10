---
name: follow-up-task-generator
description: |
  Analyzes recent encounters, condition updates, and lab results to generate prioritized FHIR Task resources for
  required follow-ups with urgency classification and responsible party assignment.
  Use when user asks to "generate follow-up tasks", "what needs follow-up", "create follow-up orders",
  "pending action items", "task list for patient", or mentions "results that need follow-up".
  Do NOT use for discharge planning, care gap screening, or referral generation.
metadata:
  author: LangCare
  version: 1.0.0
  mcp-server: langcare-mcp-fhir
  category: care-coordination
---

# Follow-Up Task Generator

## Overview

Analyze a patient's recent clinical data -- encounters, condition changes, lab results, procedures, and medication changes -- to identify required follow-up actions. Generate FHIR Task resources for each follow-up item with appropriate urgency classification (urgent, soon, routine), responsible party assignment, and due dates based on clinical standards.

## FHIR Resources Used

| Resource | Purpose | Key Fields |
|----------|---------|------------|
| Task | Generated follow-up tasks | status, priority, code, for, owner, requester, restriction.period, description, focus, reasonReference |
| Encounter | Recent visits triggering follow-up | type, period, reasonCode, class |
| Condition | Active/new conditions requiring monitoring | code, clinicalStatus, onsetDateTime, category |
| Observation | Lab results requiring follow-up | code, valueQuantity, interpretation, effectiveDateTime, referenceRange |
| Procedure | Recent procedures requiring post-procedure follow-up | code, performedDateTime, status |
| MedicationRequest | Medication changes requiring monitoring | medicationCodeableConcept, status, authoredOn, dosageInstruction |
| DiagnosticReport | Imaging/pathology requiring follow-up | code, conclusion, status |
| Practitioner | Provider assignment | name, identifier, specialty |
| ServiceRequest | Existing pending orders | status, code, intent |

## Instructions

### Step 1: Retrieve Recent Encounter

```
Tool: fhir_search
resourceType: "Encounter"
queryParams: "patient=[patient-id]&_sort=-date&_count=3"
```

Identify the encounter(s) triggering follow-up generation. Extract: encounter type, date, reason, provider.

### Step 2: Retrieve Abnormal Lab Results

```
Tool: fhir_search
resourceType: "Observation"
queryParams: "patient=[patient-id]&category=laboratory&date=ge=[30-days-ago]&_sort=-date"
```

Identify results requiring follow-up by checking:
- `interpretation` field: "H" (high), "L" (low), "HH" (critical high), "LL" (critical low), "A" (abnormal)
- Values outside `referenceRange`
- Critical values requiring immediate action (see `references/task-prioritization.md`)
- Results that are preliminary or need confirmation

Categorize each abnormal result:
- **Critical**: Requires same-day action (e.g., K+ > 6.0, Hgb < 7.0, troponin positive)
- **Significant**: Requires action within 1 week (e.g., new anemia, elevated creatinine trending up)
- **Mild**: Requires routine follow-up within 1 month (e.g., borderline lipids, mildly elevated TSH)

### Step 3: Check for New or Changed Conditions

```
Tool: fhir_search
resourceType: "Condition"
queryParams: "patient=[patient-id]&onset-date=ge=[30-days-ago]"
```

Also check for recently updated conditions:
```
Tool: fhir_search
resourceType: "Condition"
queryParams: "patient=[patient-id]&clinical-status=active"
```

New diagnoses requiring follow-up:
- New diabetes (SNOMED 44054006): HbA1c recheck in 3 months, diabetes education, ophthalmology referral within 1 year
- New hypertension (SNOMED 38341003): BP recheck in 1 month, BMP in 2-4 weeks if starting ACE/ARB
- New heart failure (SNOMED 42343007): Cardiology follow-up within 7-14 days, BMP + BNP recheck in 1-2 weeks
- New CKD diagnosis (SNOMED 709044004): Nephrology referral if stage 3b+, recheck creatinine in 3 months
- New malignancy: Oncology referral within 1-2 weeks, staging workup

### Step 4: Check Recent Medication Changes

```
Tool: fhir_search
resourceType: "MedicationRequest"
queryParams: "patient=[patient-id]&authoredon=ge=[30-days-ago]&status=active"
```

Medications requiring monitoring labs:
- **ACE inhibitor/ARB started**: BMP in 1-2 weeks (creatinine, potassium)
- **Statin started**: Lipid panel in 6-8 weeks, hepatic panel at baseline
- **Warfarin started**: INR in 3-5 days, then weekly until stable
- **Metformin started**: Renal function in 3 months
- **Thyroid medication started/changed**: TSH in 6-8 weeks
- **Lithium started/changed**: Lithium level in 5-7 days, renal/thyroid panel in 3 months
- **Diuretic started/changed**: BMP in 1-2 weeks
- **Antibiotic course**: Follow-up if symptoms not resolved (typically 48-72 hours for reassessment)
- **New insulin**: Glucose log review in 1 week, HbA1c in 3 months
- **Anticoagulant (DOAC) started**: CBC in 1 month, renal function in 3 months

### Step 5: Check Post-Procedure Follow-up Needs

```
Tool: fhir_search
resourceType: "Procedure"
queryParams: "patient=[patient-id]&date=ge=[30-days-ago]&status=completed"
```

Common post-procedure follow-up intervals:
- **Colonoscopy with polypectomy**: Follow-up per pathology results (see `references/follow-up-intervals.md`)
- **Surgical procedure**: Wound check 7-14 days, suture/staple removal 10-14 days
- **Biopsy**: Results follow-up in 5-7 business days
- **Joint injection**: Reassessment in 4-6 weeks
- **Cardiac catheterization**: Follow-up in 2-4 weeks, access site check in 1 week

### Step 6: Check Pending Imaging/Pathology Results

```
Tool: fhir_search
resourceType: "DiagnosticReport"
queryParams: "patient=[patient-id]&status=preliminary,registered&_sort=-date"
```

Any preliminary or pending diagnostic reports require a follow-up task to review results when finalized.

### Step 7: Determine Responsible Party

Assignment logic based on task type:
- **Critical lab result**: Ordering provider or covering provider
- **Medication monitoring lab**: Prescribing provider
- **Post-procedure follow-up**: Performing provider/surgeon
- **New diagnosis follow-up**: PCP (or specialist if specialist-managed condition)
- **Pending results**: Ordering provider
- **Referral follow-up**: Referring provider (to ensure referral was completed)

If provider information is available in the Encounter or ServiceRequest:
```
Tool: fhir_read
resourceType: "Practitioner"
id: "[practitioner-id-from-encounter]"
```

### Step 8: Create Task Resources

For each identified follow-up item:

```
Tool: fhir_create
resourceType: "Task"
resource: {
  "resourceType": "Task",
  "status": "requested",
  "intent": "order",
  "priority": "[routine|urgent|asap|stat]",
  "code": { "coding": [{ "system": "http://hl7.org/fhir/CodeSystem/task-code", "code": "fulfill", "display": "Fulfill the focal request" }] },
  "description": "[Specific follow-up action required]",
  "for": { "reference": "Patient/[patient-id]" },
  "requester": { "reference": "Practitioner/[requesting-provider-id]" },
  "owner": { "reference": "Practitioner/[responsible-provider-id]" },
  "reasonReference": { "reference": "[Condition|Observation|Procedure]/[id]" },
  "restriction": {
    "period": { "end": "[due-date-ISO-8601]" }
  },
  "input": [
    {
      "type": { "text": "follow-up-type" },
      "valueString": "[lab-recheck|appointment|imaging|referral|medication-review|result-review]"
    }
  ],
  "note": [{ "text": "[Clinical context and specific instructions]" }]
}
```

Priority mapping:
- `stat`: Critical results, same-day action required
- `asap`: Within 48 hours
- `urgent`: Within 1 week
- `routine`: Within 1 month

### Step 9: Format Output

```
FOLLOW-UP TASK SUMMARY
========================
Patient: [name] | MRN: [mrn]
Generated: [timestamp]
Based on: [Encounter type] on [encounter date]
Total Tasks: [count] (Critical: [n], Urgent: [n], Routine: [n])

CRITICAL (same-day action required)
-------------------------------------
1. [Task description]
   Trigger: [what prompted this task]
   Owner: [responsible provider]
   Due: [date]
   Task ID: Task/[id]

URGENT (within 1 week)
-----------------------
1. [Task description]
   Trigger: [what prompted this task]
   Owner: [responsible provider]
   Due: [date]
   Task ID: Task/[id]

ROUTINE (within 1 month)
-------------------------
1. [Task description]
   Trigger: [what prompted this task]
   Owner: [responsible provider]
   Due: [date]
   Task ID: Task/[id]

TASKS CREATED: [total count]
```

## Examples

### Example 1: Post-Visit Follow-up for New Diagnoses and Medication Changes

**User says:** "Generate follow-up tasks for patient 33333 after today's visit"

**Actions:**
1. `fhir_search` Encounter?patient=33333&_sort=-date&_count=1 -- office visit today with Dr. Patel for annual physical
2. `fhir_search` Observation?patient=33333&category=laboratory&date=ge=2024-01-01 -- HbA1c 7.8% (H), LDL 168 (H), TSH 8.2 (H), Cr 0.9 (normal), CBC normal
3. `fhir_search` Condition?patient=33333&onset-date=ge=2024-01-01 -- new T2DM, new hypothyroidism diagnosed today
4. `fhir_search` MedicationRequest?patient=33333&authoredon=ge=2024-01-08 -- metformin 500mg BID started, levothyroxine 50mcg started, atorvastatin 20mg started
5. `fhir_search` Procedure?patient=33333&date=ge=2023-12-01 -- none recent
6. `fhir_search` DiagnosticReport?patient=33333&status=preliminary -- none pending
7. `fhir_create` Task x6

**Result:**
```
FOLLOW-UP TASK SUMMARY
========================
Patient: David Kim | MRN: 33333
Generated: 2024-01-08T16:30:00Z
Based on: Office visit on 2024-01-08
Total Tasks: 6 (Critical: 0, Urgent: 1, Routine: 5)

URGENT (within 1 week)
-----------------------
1. Diabetes education referral
   Trigger: New T2DM diagnosis (HbA1c 7.8%)
   Owner: Dr. Patel (PCP)
   Due: 2024-01-15
   Task ID: Task/t-001

ROUTINE (within 1 month)
-------------------------
1. Recheck BMP (creatinine, potassium) -- metformin monitoring
   Trigger: Metformin 500mg BID started 2024-01-08
   Owner: Dr. Patel (PCP)
   Due: 2024-02-08
   Task ID: Task/t-002

2. Recheck TSH -- levothyroxine monitoring
   Trigger: Levothyroxine 50mcg started 2024-01-08, TSH 8.2
   Owner: Dr. Patel (PCP)
   Due: 2024-03-05 (6-8 weeks)
   Task ID: Task/t-003

3. Recheck lipid panel -- statin monitoring
   Trigger: Atorvastatin 20mg started 2024-01-08, LDL 168
   Owner: Dr. Patel (PCP)
   Due: 2024-03-05 (6-8 weeks)
   Task ID: Task/t-004

4. Recheck HbA1c -- diabetes monitoring
   Trigger: New T2DM, HbA1c 7.8%, metformin started
   Owner: Dr. Patel (PCP)
   Due: 2024-04-08 (3 months)
   Task ID: Task/t-005

5. Ophthalmology referral -- diabetic eye screening
   Trigger: New T2DM diagnosis
   Owner: Dr. Patel (PCP)
   Due: 2025-01-08 (within 1 year of diagnosis)
   Task ID: Task/t-006

TASKS CREATED: 6
```

### Example 2: Post-Discharge Follow-up With Critical Results

**User says:** "What follow-up tasks are needed for patient abc-444 who was just discharged?"

**Actions:**
1. `fhir_search` Encounter?patient=abc-444&_sort=-date&_count=1 -- discharge today from 5-day CHF admission
2. `fhir_search` Observation?patient=abc-444&category=laboratory&date=ge=2024-01-03 -- K+ 5.6 (H, last day), Cr 1.8 (H, up from 1.2), BNP 450 (H, down from 1200), Hgb 10.2 (L)
3. `fhir_search` Condition?patient=abc-444&clinical-status=active -- CHF, CKD3, T2DM, AF
4. `fhir_search` MedicationRequest?patient=abc-444&authoredon=ge=2024-01-03 -- carvedilol 12.5mg BID (NEW), furosemide 40mg BID (increased from 20mg), spironolactone 25mg (NEW)
5. `fhir_search` Procedure?patient=abc-444&date=ge=2024-01-03 -- none
6. `fhir_search` DiagnosticReport?patient=abc-444&status=preliminary -- echocardiogram report pending
7. `fhir_create` Task x7

**Result:**
```
FOLLOW-UP TASK SUMMARY
========================
Patient: Helen Martinez | MRN: abc-444
Generated: 2024-01-08T14:00:00Z
Based on: Inpatient discharge on 2024-01-08 (CHF exacerbation)
Total Tasks: 7 (Critical: 1, Urgent: 3, Routine: 3)

CRITICAL (same-day action required)
-------------------------------------
1. Review echocardiogram results when finalized
   Trigger: Echo performed 2024-01-07, report status: preliminary
   Owner: Dr. Chen (Cardiology)
   Due: 2024-01-08
   Task ID: Task/t-101

URGENT (within 1 week)
-----------------------
1. Recheck BMP (potassium, creatinine) -- diuretic and spironolactone monitoring
   Trigger: K+ 5.6 on discharge, Cr 1.8 (elevated), spironolactone + furosemide started/changed
   Owner: Dr. Rivera (PCP)
   Due: 2024-01-11 (3 days post-discharge)
   Task ID: Task/t-102

2. PCP follow-up visit -- post-discharge CHF management
   Trigger: High-risk CHF discharge, LACE score 12
   Owner: Dr. Rivera (PCP)
   Due: 2024-01-12 (within 7 days)
   Task ID: Task/t-103

3. Cardiology follow-up visit
   Trigger: CHF exacerbation, new medications, pending echo results
   Owner: Dr. Chen (Cardiology)
   Due: 2024-01-15 (within 7-14 days)
   Task ID: Task/t-104

ROUTINE (within 1 month)
-------------------------
1. Recheck CBC -- monitor anemia
   Trigger: Hgb 10.2 at discharge
   Owner: Dr. Rivera (PCP)
   Due: 2024-02-08 (1 month)
   Task ID: Task/t-105

2. Recheck BNP -- trending response to therapy
   Trigger: BNP 450 at discharge (down from 1200)
   Owner: Dr. Chen (Cardiology)
   Due: 2024-02-08 (1 month)
   Task ID: Task/t-106

3. Recheck renal function and electrolytes -- carvedilol and spironolactone monitoring
   Trigger: Cr 1.8, K+ 5.6, new spironolactone
   Owner: Dr. Rivera (PCP)
   Due: 2024-02-08 (1 month)
   Task ID: Task/t-107

TASKS CREATED: 7
```

## Troubleshooting

### No Abnormal Results Found but User Expects Follow-up Tasks
- Not all follow-up is triggered by abnormal results. Check for new medications (Step 4), new diagnoses (Step 3), and recent procedures (Step 5) which all generate monitoring tasks regardless of lab abnormalities.
- Some conditions have standing follow-up intervals. Check `references/follow-up-intervals.md` for chronic disease management intervals even without recent changes.

### Practitioner Reference Not Available for Task Owner Assignment
- If the ordering or performing provider is not identifiable from FHIR resources, set `owner` to the patient's PCP (if known from `Patient.generalPractitioner`) or leave unassigned and note "Responsible provider to be determined -- assign to ordering provider or PCP."
- Some systems store provider assignment in the Encounter `participant` array. Check for `type.coding.code` = "ATND" (attending) or "PPRF" (primary performer).

### Task Resources Not Supported by FHIR Server
- If the server does not support Task resources, output the follow-up list in the formatted text output without creating FHIR resources. Note "Task FHIR resources not created -- server does not support Task resource type."
- Consider creating ServiceRequest resources as an alternative for lab recheck orders, or CarePlan activities for appointment-based follow-ups.

## Related Skills

- `discharge-planning-checklist` -- generates the discharge checklist that feeds into follow-up task generation
- `care-gap-identifier` -- identifies preventive care gaps that may generate additional routine tasks
- `transition-of-care-summary` -- the TOC document references follow-up tasks in the action list section
- `lab-result-interpreter` -- provides detailed interpretation of lab results that trigger follow-up
