import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceRoleKey) {
  throw new Error(
    "Run with .env.local and provide the local Supabase URL and service role key.",
  );
}
if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/?$/.test(url)) {
  throw new Error("bootstrap:local only accepts a localhost Supabase URL.");
}

const supabase = createClient(url, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const password = "LocalOnly123!";
const accounts = [
  { email: "zhangayi@example.com", displayName: "张阿姨", role: "resident" },
  { email: "daughter@example.com", displayName: "张阿姨女儿", role: "family" },
  { email: "li-doctor@example.com", displayName: "李医生", role: "doctor" },
  { email: "wang-nurse@example.com", displayName: "王护士", role: "nurse" },
  {
    email: "chen-pharmacist@example.com",
    displayName: "陈药师",
    role: "pharmacist",
  },
  {
    email: "community@example.com",
    displayName: "居委张老师",
    role: "community",
  },
  { email: "admin@example.com", displayName: "管理员", role: "admin" },
];

const { data: community, error: communityError } = await supabase
  .from("communities")
  .select("id,organization_id")
  .eq("slug", "haiwan-town")
  .single();
if (communityError) throw communityError;

const { data: listed, error: listError } = await supabase.auth.admin.listUsers({
  perPage: 1000,
});
if (listError) throw listError;
const usersByEmail = new Map(listed.users.map((user) => [user.email, user]));
const ids = new Map();

for (const account of accounts) {
  let user = usersByEmail.get(account.email);
  if (!user) {
    const { data, error } = await supabase.auth.admin.createUser({
      email: account.email,
      password,
      email_confirm: true,
      user_metadata: { display_name: account.displayName },
    });
    if (error || !data.user)
      throw error ?? new Error(`Failed to create ${account.email}`);
    user = data.user;
  } else {
    const { error } = await supabase.auth.admin.updateUserById(user.id, {
      password,
      email_confirm: true,
    });
    if (error) throw error;
  }

  ids.set(account.role, user.id);
  const { error: profileError } = await supabase.from("profiles").upsert({
    id: user.id,
    display_name: account.displayName,
    role: account.role,
    organization_id: community.organization_id,
    community_id: community.id,
    account_status: "active",
    onboarding_completed_at: new Date().toISOString(),
  });
  if (profileError) throw profileError;
}

const { error: bindingError } = await supabase.from("family_bindings").upsert(
  {
    resident_id: ids.get("resident"),
    family_id: ids.get("family"),
    relationship: "女儿",
    note: "本地开发账号的主要家属联系人",
    is_primary: true,
    status: "active",
  },
  { onConflict: "resident_id,family_id" },
);
if (bindingError) throw bindingError;

const consentRows = [
  { userId: ids.get("resident"), residentId: ids.get("resident") },
  { userId: ids.get("family"), residentId: ids.get("resident") },
].flatMap(({ userId, residentId }) =>
  ["privacy", "sensitive_health", "ai_processing", "notification"].map(
    (scope) => ({
      user_id: userId,
      resident_id: residentId,
      scope,
      policy_version: "2026-07-18",
      granted: true,
      granted_at: new Date().toISOString(),
      revoked_at: null,
      metadata: { source: "local_bootstrap" },
    }),
  ),
);
const { error: consentError } = await supabase
  .from("consents")
  .upsert(consentRows, {
    onConflict: "user_id,resident_id,scope,policy_version",
  });
if (consentError) throw consentError;

console.log(
  `Local accounts ready: ${accounts.length}; family binding ready: 1; consent records ready: ${consentRows.length}.`,
);
