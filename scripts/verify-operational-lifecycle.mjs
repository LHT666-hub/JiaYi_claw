import { randomBytes, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceRoleKey || !/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/?$/.test(url)) {
  throw new Error("verify:operations only runs against the local Supabase stack.");
}
if (!existsSync(resolve(".next/BUILD_ID"))) {
  throw new Error("Run npm run build:web before verify:operations.");
}

const admin = createClient(url, serviceRoleKey, { auth: { persistSession: false } });
const suffix = `${Date.now()}-${randomBytes(3).toString("hex")}`;
const secret = `verify-operations-${randomBytes(18).toString("hex")}`;
const port = 3217;
const baseUrl = `http://127.0.0.1:${port}`;
let userId = "";
let server;
let serverOutput = "";
const cleanup = { contentIds: [], outboxIds: [], notificationIds: [] };

function appendServerOutput(chunk) {
  serverOutput = `${serverOutput}${chunk.toString()}`.slice(-8000);
}

async function waitForServer() {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (server?.exitCode !== null) throw new Error(`Next server exited early.\n${serverOutput}`);
    try {
      const response = await fetch(`${baseUrl}/api/v1/health/live`);
      if (response.ok) return;
    } catch {
      // The production server is still starting.
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 500));
  }
  throw new Error(`Timed out waiting for the production server.\n${serverOutput}`);
}

async function callWorker(authorization = `Bearer ${secret}`) {
  const response = await fetch(`${baseUrl}/api/v1/internal/outbox/process`, {
    method: "POST",
    headers: { authorization },
  });
  const body = await response.json().catch(() => null);
  return { response, body };
}

async function deleteByIds(table, ids) {
  if (ids.length) await admin.from(table).delete().in("id", ids);
}

try {
  const { data: organization, error: organizationError } = await admin
    .from("organizations")
    .select("id")
    .eq("slug", "fengxian-primary-care")
    .single();
  if (organizationError) throw organizationError;
  const { data: community, error: communityError } = await admin
    .from("communities")
    .select("id")
    .eq("organization_id", organization.id)
    .eq("slug", "haiwan-town")
    .single();
  if (communityError) throw communityError;

  const password = `Local-${randomBytes(12).toString("hex")}!`;
  const { data: auth, error: userError } = await admin.auth.admin.createUser({
    email: `verify-operations-${suffix}@example.local`,
    password,
    email_confirm: true,
  });
  if (userError || !auth.user) throw userError ?? new Error("Unable to create operations verification user.");
  userId = auth.user.id;

  const now = Date.now();
  const contentRows = [
    {
      organization_id: organization.id,
      community_id: community.id,
      category: "notice",
      title: "RLS 已过期内容",
      summary: "This item must not reach residents.",
      original_url: `https://example.local/expired-${suffix}`,
      source_name: "operations verification",
      published_at: new Date(now - 86_400_000).toISOString(),
      expires_at: new Date(now - 60_000).toISOString(),
      status: "published",
      content_hash: `expired-${suffix}`,
      reviewed_at: new Date(now - 86_400_000).toISOString(),
    },
    {
      organization_id: organization.id,
      community_id: community.id,
      category: "notice",
      title: "RLS 有效内容",
      summary: "This item must remain visible.",
      original_url: `https://example.local/active-${suffix}`,
      source_name: "operations verification",
      published_at: new Date(now).toISOString(),
      expires_at: new Date(now + 86_400_000).toISOString(),
      status: "published",
      content_hash: `active-${suffix}`,
      reviewed_at: new Date(now).toISOString(),
    },
  ];
  const { data: content, error: contentError } = await admin.from("content_items").insert(contentRows).select("id,title");
  if (contentError || !content || content.length !== 2) throw contentError ?? new Error("Unable to seed content lifecycle rows.");
  cleanup.contentIds.push(...content.map((item) => item.id));
  const expiredContentId = content.find((item) => item.title === "RLS 已过期内容")?.id;
  const activeContentId = content.find((item) => item.title === "RLS 有效内容")?.id;

  const validRequestId = randomUUID();
  const outboxRows = [
    {
      event_type: "service_request.status_changed",
      aggregate_type: "service_request",
      aggregate_id: validRequestId,
      recipient_id: userId,
      payload: { requestId: validRequestId, status: "submitted", note: "运营链路验收" },
      attempts: 0,
    },
    {
      event_type: "service_request.status_changed",
      aggregate_type: "service_request",
      aggregate_id: randomUUID(),
      recipient_id: userId,
      payload: { malformed: true },
      attempts: 4,
    },
  ];
  const { data: outbox, error: outboxError } = await admin.from("outbox_events").insert(outboxRows).select("id,attempts");
  if (outboxError || !outbox || outbox.length !== 2) throw outboxError ?? new Error("Unable to seed outbox lifecycle rows.");
  cleanup.outboxIds.push(...outbox.map((event) => event.id));
  const validEventId = outbox.find((event) => event.attempts === 0)?.id;
  const invalidEventId = outbox.find((event) => event.attempts === 4)?.id;
  if (!validEventId || !invalidEventId || !activeContentId || !expiredContentId) throw new Error("Synthetic lifecycle identifiers are incomplete.");

  server = spawn(process.execPath, [resolve("node_modules/next/dist/bin/next"), "start", "-H", "127.0.0.1", "-p", String(port)], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      CRON_SECRET: secret,
      NEXT_PUBLIC_DEMO_MODE: "false",
      NEXT_PUBLIC_DEV_LOGIN: "false",
    },
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  server.stdout.on("data", appendServerOutput);
  server.stderr.on("data", appendServerOutput);
  await waitForServer();

  const feedResponse = await fetch(`${baseUrl}/api/v1/content/feed?communityId=${community.id}&limit=100`);
  const feed = await feedResponse.json();
  if (!feedResponse.ok || !feed?.data?.items?.some((item) => item.id === activeContentId)) {
    throw new Error("Active reviewed content was missing from the resident feed.");
  }
  if (feed.data.items.some((item) => item.id === expiredContentId)) {
    throw new Error("Expired content leaked into the resident feed.");
  }

  const unauthorized = await callWorker("Bearer wrong-secret");
  if (unauthorized.response.status !== 403 || unauthorized.body?.error?.code !== "WORKER_FORBIDDEN") {
    throw new Error("Outbox worker accepted an invalid cron credential.");
  }

  const firstRun = await callWorker();
  if (!firstRun.response.ok) throw new Error(`Outbox worker failed: ${JSON.stringify(firstRun.body)}`);
  const { data: processed, error: processedError } = await admin
    .from("outbox_events")
    .select("id,status,attempts,last_error,delivery_results")
    .in("id", [validEventId, invalidEventId]);
  if (processedError) throw processedError;
  const validProcessed = processed.find((event) => event.id === validEventId);
  const invalidProcessed = processed.find((event) => event.id === invalidEventId);
  if (validProcessed?.status !== "sent" || validProcessed.attempts !== 1 || validProcessed.delivery_results?.inApp !== "sent") {
    throw new Error(`Valid outbox delivery mismatch: ${JSON.stringify(validProcessed)}`);
  }
  if (invalidProcessed?.status !== "dead_letter" || invalidProcessed.attempts !== 5 || !invalidProcessed.last_error) {
    throw new Error(`Dead-letter transition mismatch: ${JSON.stringify(invalidProcessed)}`);
  }

  const { data: firstNotifications, error: firstNotificationError } = await admin
    .from("notifications")
    .select("id")
    .eq("user_id", userId)
    .eq("metadata->>outboxEventId", validEventId);
  if (firstNotificationError || firstNotifications.length !== 1) throw firstNotificationError ?? new Error("Expected one in-app notification.");
  cleanup.notificationIds.push(firstNotifications[0].id);

  const { error: replaySeedError } = await admin.from("outbox_events").update({
    status: "failed",
    next_attempt_at: new Date(Date.now() - 1000).toISOString(),
    sent_at: null,
  }).eq("id", validEventId);
  if (replaySeedError) throw replaySeedError;
  const replayRun = await callWorker();
  if (!replayRun.response.ok) throw new Error(`Outbox replay failed: ${JSON.stringify(replayRun.body)}`);
  const { data: replayed, error: replayedError } = await admin.from("outbox_events").select("status,attempts").eq("id", validEventId).single();
  const { count: notificationCount, error: countError } = await admin.from("notifications").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("metadata->>outboxEventId", validEventId);
  if (replayedError || countError || replayed.status !== "sent" || replayed.attempts !== 2 || notificationCount !== 1) {
    throw replayedError ?? countError ?? new Error(`Idempotent replay mismatch: ${JSON.stringify({ replayed, notificationCount })}`);
  }

  console.log("Verified: expired content stayed out of the resident feed; cron auth was enforced; valid delivery was idempotent; the fifth failed claim entered dead-letter with an error reason.");
} finally {
  if (server && server.exitCode === null) {
    server.kill();
    await Promise.race([
      new Promise((resolvePromise) => server.once("exit", resolvePromise)),
      new Promise((resolvePromise) => setTimeout(resolvePromise, 3000)),
    ]);
  }
  await deleteByIds("notifications", cleanup.notificationIds);
  await deleteByIds("outbox_events", cleanup.outboxIds);
  await deleteByIds("content_items", cleanup.contentIds);
  if (userId) await admin.auth.admin.deleteUser(userId).catch(() => undefined);
}
