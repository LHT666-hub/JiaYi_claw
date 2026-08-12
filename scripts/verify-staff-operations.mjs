import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const appUrl = process.env.APP_URL ?? "http://127.0.0.1:3000";
if (!url || !anonKey || !serviceKey) throw new Error("Local Supabase environment is incomplete.");
if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/?$/.test(url)) throw new Error("This verification only runs against local Supabase.");

const service = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
const adminAuth = createClient(url, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });
const invitedAuth = createClient(url, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });
const suffix = String(Date.now()).slice(-8);
const phone = `139${suffix}`;
const email = `staff-flow-${suffix}@example.com`;
const password = "LocalOnly123!";
let inviteId = null;
let invitedUserId = null;

async function api(path, init = {}, token) {
  const response = await fetch(`${appUrl}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(init.headers ?? {}) },
  });
  const payload = await response.json();
  return { response, payload };
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

try {
  const { data: adminSession, error: adminError } = await adminAuth.auth.signInWithPassword({ email: "admin@example.com", password });
  if (adminError || !adminSession.session) throw adminError ?? new Error("Admin session missing.");
  const adminToken = adminSession.session.access_token;
  const { data: community, error: communityError } = await service.from("communities").select("id").eq("slug", "haiwan-town").single();
  if (communityError) throw communityError;

  const createResult = await api("/api/v1/admin/staff", { method: "POST", body: JSON.stringify({ phone, displayName: "入职流程测试", role: "nurse", communityId: community.id, expiresInHours: 24 }) }, adminToken);
  assert(createResult.response.status === 201, `Invite create failed: ${JSON.stringify(createResult.payload)}`);
  inviteId = createResult.payload.data.invite.id;
  const inviteToken = createResult.payload.data.token;

  const duplicateResult = await api("/api/v1/admin/staff", { method: "POST", body: JSON.stringify({ phone, displayName: "重复邀请", role: "doctor", communityId: community.id, expiresInHours: 24 }) }, adminToken);
  assert(duplicateResult.response.status === 409 && duplicateResult.payload.error?.code === "ACTIVE_INVITE_EXISTS", "Active duplicate invite was not rejected.");

  const { data: createdUser, error: createUserError } = await service.auth.admin.createUser({ email, phone: `+86${phone}`, password, email_confirm: true, phone_confirm: true, user_metadata: { display_name: "入职流程测试" } });
  if (createUserError || !createdUser.user) throw createUserError ?? new Error("Invited user creation failed.");
  invitedUserId = createdUser.user.id;
  const { data: invitedSession, error: invitedError } = await invitedAuth.auth.signInWithPassword({ email, password });
  if (invitedError || !invitedSession.session) throw invitedError ?? new Error("Invited user session missing.");

  const acceptResult = await api("/api/v1/staff-invites/accept", { method: "POST", body: JSON.stringify({ token: inviteToken }) }, invitedSession.session.access_token);
  if (!acceptResult.response.ok) {
    const diagnostic = await invitedAuth.rpc("accept_staff_invite", { p_token: inviteToken });
    throw new Error(`Invite acceptance failed: ${JSON.stringify(acceptResult.payload)}; database=${diagnostic.error?.message ?? "unknown"}`);
  }
  assert(acceptResult.payload.data.profile.role === "nurse", "Accepted invite did not grant the invited role.");
  const secondAccept = await api("/api/v1/staff-invites/accept", { method: "POST", body: JSON.stringify({ token: inviteToken }) }, invitedSession.session.access_token);
  assert(secondAccept.response.status === 400, "Consumed invite could be reused.");

  const selfDisable = await api("/api/v1/admin/staff", { method: "PATCH", body: JSON.stringify({ profileId: adminSession.user.id, status: "disabled" }) }, adminToken);
  assert(selfDisable.response.status === 400, "Administrator could disable their own account.");
  const disableResult = await api("/api/v1/admin/staff", { method: "PATCH", body: JSON.stringify({ profileId: invitedUserId, status: "disabled" }) }, adminToken);
  assert(disableResult.response.ok, `Staff disable failed: ${JSON.stringify(disableResult.payload)}`);
  const disabledAccess = await api("/api/v1/staff/work-queue", {}, invitedSession.session.access_token);
  assert([401, 403].includes(disabledAccess.response.status), "Disabled staff retained API access through an existing token.");
  const enableResult = await api("/api/v1/admin/staff", { method: "PATCH", body: JSON.stringify({ profileId: invitedUserId, status: "active" }) }, adminToken);
  assert(enableResult.response.ok, `Staff restore failed: ${JSON.stringify(enableResult.payload)}`);

  const auditResult = await api("/api/v1/admin/audit?action=staff_&limit=20", {}, adminToken);
  const actions = new Set(auditResult.payload.data?.logs?.filter((log) => log.target_id === invitedUserId || log.target_id === inviteId).map((log) => log.action));
  for (const action of ["staff_invite.created", "staff_invite.accepted", "staff_account.suspended", "staff_account.activated"]) {
    assert(actions.has(action), `Missing audit action: ${action}`);
  }

  console.log("Staff onboarding verified: invite, duplicate rejection, phone-bound acceptance, one-time token, account controls, and audit evidence.");
} finally {
  if (inviteId) await service.from("audit_logs").delete().eq("target_id", inviteId);
  if (invitedUserId) {
    await service.from("audit_logs").delete().eq("target_id", invitedUserId);
    await service.from("staff_invites").update({ accepted_by: null }).eq("accepted_by", invitedUserId);
    await service.auth.admin.deleteUser(invitedUserId);
  }
  if (inviteId) await service.from("staff_invites").delete().eq("id", inviteId);
}
