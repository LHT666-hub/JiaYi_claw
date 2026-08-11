# Third-Party Notices

家医 Claw only vendors the small attributed reference files listed below. FHIR resources, US clinical thresholds, HIPAA rules, and vendor-specific workflows are not treated as Chinese clinical or compliance rules.

## LangCare MCP FHIR

- Source: https://github.com/langcare/langcare-mcp-fhir
- Pinned commit: `430598bb5a76619ef55fa34fb1fd90c65f3d4783`
- License: MIT, retained at `third_party/skills/langcare/LICENSE`
- Files retained: `clinical-summary-generator`, `follow-up-task-generator`, `referral-generator`, `medication-reconciliation`, `lab-result-interpreter`, and `patient-panel-overview` Skill specifications.
- Use: attributed workflow reference for pre-visit summaries, follow-up tasks, referral preparation, medication-list reconciliation, report explanation, and staff panel design. Chinese rules and wording are implemented locally.

## OpenClaw Medical Skills

- Source: https://github.com/FreedomIntelligence/OpenClaw-Medical-Skills
- Pinned commit: `ca216c092121f0d68d8a1e6ab8d075a7c4a6d56d`
- License: MIT for the retained `medical-entity-extractor` Skill, as declared by its `_meta.json`.
- Use: attributed reference for extracting symptoms, medication names, measurements, time, and service actions from Chinese resident descriptions.

## Whisper-Wu

- Source: https://huggingface.co/kaiwang0574/whisper-wu
- Local adapter: `scripts/whisper-wu/model/whisper-wu-adapter`
- License: Apache-2.0, as declared in the retained model card.
- Base model: `openai/whisper-small`.
- Use: local ordinary-Mandarin and Wu-dialect speech transcription. Audio is processed as a temporary file, deleted after transcription, and the resulting text requires resident confirmation.
- Evaluation boundary: the runtime smoke test passes, but real Haiwan resident accent accuracy is not yet scored and is shown as pending in Skill management.

## Not Vendored or Enabled

- BioMCP (`241d02615af04788a7997c61d2978414222bc246`): future professional research candidate only.
- Open Wearables (`b804243495f96174b8501bbf83f685d278f272d2`): future wearable adapter direction only.
- Patiently AI and health-trend-analyzer: product ideas only; local behavior is a clean-room implementation because reusable licensing was unclear.
- clinical-note-summarization and care-coordination files that reserve all rights were not copied.
- Apple Health, Fitbit, Withings, OpenFoodFacts, ExerciseAPI, and Fitness Coach are not integrated in the first release.

## Design Research References (Not Vendored)

- Apple Human Interface Guidelines and Apple Health are product/design references only. No Apple design assets, private APIs, or proprietary UI resources are distributed with this project.
- `vermont42/iOS-Design-Agent-Skill` (MIT, inspected on 2026-08-11) informed the typography, color, spatial composition, motion, and depth review. Its SwiftUI implementation snippets were not copied into the Taro application.

This notice is an engineering provenance record, not legal advice. The exact machine-readable ledger is `third_party/skills/sources.json`.
