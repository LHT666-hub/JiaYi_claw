import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(process.cwd(), "supabase/migrations/202608260001_rag_knowledge_service.sql"),
  "utf8",
);

describe("RAG migration safety contract", () => {
  it("only retrieves the active current version inside its validity window", () => {
    expect(migration).toContain("v.version = d.current_version");
    expect(migration).toContain("d.status = 'active'");
    expect(migration).toContain("d.expires_at > now()");
  });

  it("does not expose staff knowledge to ordinary authenticated residents", () => {
    expect(migration).toContain("knowledge_documents.visibility = 'staff'");
    expect(migration).toContain("p.role in ('doctor','nurse','pharmacist','community','admin')");
  });

  it("claims queue jobs atomically for concurrent workers", () => {
    expect(migration).toContain("create or replace function public.claim_knowledge_index_jobs");
    expect(migration).toContain("for update skip locked");
    expect(migration).toContain("status = 'processing'");
  });
});
