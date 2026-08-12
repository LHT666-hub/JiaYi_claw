import { z } from "zod";

export const appRoleSchema = z.enum([
  "resident",
  "family",
  "doctor",
  "nurse",
  "pharmacist",
  "community",
  "admin",
]);
export type AppRoleContract = z.infer<typeof appRoleSchema>;

export const serviceTypeSchema = z.enum([
  "clinic_registration",
  "family_doctor_booking",
  "refill_request",
  "dispense_status_query",
  "followup_reminder",
  "report_explanation",
  "referral_assistance",
  "other",
]);
export type ServiceType = z.infer<typeof serviceTypeSchema>;

export const serviceStatusSchema = z.enum([
  "draft",
  "submitted",
  "needs_info",
  "accepted",
  "checking_availability",
  "awaiting_user_confirmation",
  "booked",
  "waitlisted",
  "failed",
  "completed",
  "cancelled",
]);
export type ServiceStatus = z.infer<typeof serviceStatusSchema>;

export const servicePrioritySchema = z.enum(["low", "medium", "high", "emergency"]);
export type ServicePriority = z.infer<typeof servicePrioritySchema>;

export const appointmentIntakeSchema = z.object({
  target: z.string().trim().min(1).max(120),
  department: z.string().trim().max(80).nullable().default(null),
  preferredDoctor: z.string().trim().max(80).nullable().default(null),
  preferredDates: z.array(z.string().trim().min(1).max(40)).max(5).default([]),
  preferredTime: z.string().trim().max(40).nullable().default(null),
  contactPhone: z.string().trim().regex(/^\+?\d{6,20}$/).nullable().default(null),
  acceptWaitlist: z.boolean().default(true),
  note: z.string().trim().max(600).nullable().default(null),
});
export type AppointmentIntake = z.infer<typeof appointmentIntakeSchema>;

export const serviceRequestCreateSchema = z.object({
  residentId: z.string().uuid().optional(),
  serviceType: serviceTypeSchema,
  title: z.string().trim().min(2).max(120),
  summary: z.string().trim().min(2).max(1200),
  priority: servicePrioritySchema.default("low"),
  appointment: appointmentIntakeSchema.optional(),
  sourceContext: z.object({ type: z.literal("content"), id: z.string().uuid() }).optional(),
  requestedRole: z.enum(["doctor", "nurse", "pharmacist", "community"]).optional(),
  confirmed: z.literal(true),
});
export type ServiceRequestCreateInput = z.infer<typeof serviceRequestCreateSchema>;

export const serviceActionSchema = z.enum([
  "submit",
  "request_info",
  "accept",
  "check_availability",
  "propose_slot",
  "confirm_booking",
  "update_booking",
  "request_reschedule",
  "waitlist",
  "fail",
  "complete",
  "cancel",
]);
export type ServiceAction = z.infer<typeof serviceActionSchema>;

export const serviceRequestActionSchema = z.object({
  action: serviceActionSchema,
  note: z.string().trim().max(1000).nullable().default(null),
  scheduledAt: z.string().datetime().nullable().default(null),
  institutionName: z.string().trim().max(120).nullable().default(null),
  departmentName: z.string().trim().max(120).nullable().default(null),
  clinicianName: z.string().trim().max(80).nullable().default(null),
  bookingReference: z.string().trim().max(120).nullable().default(null),
});
export type ServiceRequestActionInput = z.infer<typeof serviceRequestActionSchema>;

export const publicInfoEntrySchema = z.object({
  id: z.string(),
  communityId: z.string().nullable(),
  title: z.string(),
  category: z.string(),
  content: z.string(),
  keywords: z.array(z.string()),
  sourceName: z.string(),
  sourceUrl: z.string().url(),
  effectiveFrom: z.string().nullable(),
  expiresAt: z.string().nullable(),
  verifiedAt: z.string(),
  status: z.enum(["draft", "published", "expired"]),
});
export type PublicInfoEntry = z.infer<typeof publicInfoEntrySchema>;

export const institutionTypeSchema = z.enum(["community", "secondary", "tertiary", "public_service"]);
export const contentCategorySchema = z.enum(["notice", "activity", "health_classroom", "schedule_notice", "policy"]);

export const practitionerScheduleSchema = z.object({
  id: z.string().uuid(),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
  serviceMode: z.enum(["clinic", "phone", "home_visit", "online"]),
  location: z.string().nullable(),
  registrationUrl: z.string().url().nullable(),
  status: z.enum(["verified", "cancelled", "expired"]),
  practitioner: z.object({
    id: z.string().uuid(), name: z.string(), title: z.string().nullable(),
    specialties: z.array(z.string()), avatarUrl: z.string().url().nullable(),
  }).nullable(),
  department: z.object({ id: z.string().uuid(), name: z.string() }).nullable(),
  institution: z.object({ id: z.string().uuid(), name: z.string(), type: institutionTypeSchema }),
});
export type PractitionerSchedule = z.infer<typeof practitionerScheduleSchema>;

export const careNetworkSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  description: z.string().nullable(),
  community: z.object({ id: z.string().uuid(), name: z.string(), servicePhone: z.string().nullable() }),
  institutions: z.array(z.object({
    id: z.string().uuid(), name: z.string(), shortName: z.string().nullable(), type: institutionTypeSchema,
    levelLabel: z.string().nullable(), address: z.string().nullable(), servicePhone: z.string().nullable(),
    officialUrl: z.string().url().nullable(), registrationUrl: z.string().url().nullable(), networkRole: z.string(),
  })),
});
export type CareNetwork = z.infer<typeof careNetworkSchema>;

export const contentFeedItemSchema = z.object({
  id: z.string().uuid(), category: contentCategorySchema, title: z.string(), summary: z.string(),
  coverUrl: z.string().url().nullable(), originalUrl: z.string().url(), sourceName: z.string(),
  publishedAt: z.string().nullable(), expiresAt: z.string().nullable(), reviewedAt: z.string().nullable(),
  institutionName: z.string().nullable(),
});
export type ContentFeedItem = z.infer<typeof contentFeedItemSchema>;

export const healthObservationSchema = z.object({
  type: z.enum(["blood_pressure", "blood_glucose", "weight", "steps"]),
  value: z.number().finite(),
  secondaryValue: z.number().finite().nullable().default(null),
  unit: z.string().trim().min(1).max(24),
  measuredAt: z.string().datetime(),
  note: z.string().trim().max(300).nullable().default(null),
}).superRefine((observation, context) => {
  if (Date.parse(observation.measuredAt) > Date.now() + 5 * 60 * 1000) {
    context.addIssue({ code: "custom", path: ["measuredAt"], message: "测量时间不能晚于当前时间" });
  }
  const ranges: Record<typeof observation.type, [number, number]> = {
    blood_pressure: [40, 300],
    blood_glucose: [0.5, 50],
    weight: [1, 500],
    steps: [0, 200000],
  };
  const units: Record<typeof observation.type, string> = {
    blood_pressure: "mmHg",
    blood_glucose: "mmol/L",
    weight: "kg",
    steps: "步",
  };
  const [minimum, maximum] = ranges[observation.type];
  if (observation.value < minimum || observation.value > maximum) {
    context.addIssue({ code: "custom", path: ["value"], message: "健康记录数值超出可录入范围" });
  }
  if (observation.unit !== units[observation.type]) {
    context.addIssue({ code: "custom", path: ["unit"], message: "健康记录单位与类型不匹配" });
  }
  if (observation.type === "blood_pressure") {
    if (observation.secondaryValue == null || observation.secondaryValue < 30 || observation.secondaryValue > 200) {
      context.addIssue({ code: "custom", path: ["secondaryValue"], message: "舒张压数值超出可录入范围" });
    } else if (observation.secondaryValue >= observation.value) {
      context.addIssue({ code: "custom", path: ["secondaryValue"], message: "请核对血压记录顺序" });
    }
  } else if (observation.secondaryValue != null) {
    context.addIssue({ code: "custom", path: ["secondaryValue"], message: "该记录不需要第二个数值" });
  }
});
export type HealthObservationInput = z.infer<typeof healthObservationSchema>;

export const medicalEntitySchema = z.object({
  symptoms: z.array(z.object({ name: z.string(), duration: z.string().nullable(), progression: z.string().nullable() })),
  medications: z.array(z.object({ name: z.string(), dosage: z.string().nullable(), frequency: z.string().nullable() })),
  measurements: z.array(z.object({ type: z.string(), value: z.string(), unit: z.string().nullable(), timestamp: z.string().nullable() })),
  mentionedConditions: z.array(z.string()),
  requestedActions: z.array(z.string()),
  missingInformation: z.array(z.string()),
});
export type MedicalEntityResult = z.infer<typeof medicalEntitySchema>;

export const assistantActivityTypeSchema = z.enum([
  "public_info_query",
  "schedule_query",
  "service_draft_prepared",
  "safety_guidance",
  "general_guidance",
]);
export type AssistantActivityType = z.infer<typeof assistantActivityTypeSchema>;

export const assistantActivityViewSchema = z.object({
  id: z.string().uuid(),
  type: assistantActivityTypeSchema,
  title: z.string(),
  detail: z.string(),
  badge: z.string(),
  riskLevel: z.enum(["low", "medium", "high", "emergency"]),
  occurredAt: z.string().datetime(),
  primaryAction: z
    .object({ label: z.string(), href: z.string() })
    .nullable(),
});
export type AssistantActivityView = z.infer<typeof assistantActivityViewSchema>;

export type SkillRisk = "low" | "medium" | "high";
export type SkillDefinition = {
  id: string;
  name: string;
  version: string;
  purpose: string;
  source: string;
  sourceCommit?: string;
  license: string;
  risk: SkillRisk;
  enabled: boolean;
  allowedTools: string[];
  solves: string;
  evalScore: number;
};

export type ApiSuccess<T> = { ok: true; data: T; traceId: string };
export type ApiFailure = { ok: false; error: { code: string; message: string }; traceId: string };
export type ApiResult<T> = ApiSuccess<T> | ApiFailure;
