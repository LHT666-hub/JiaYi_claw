-- Curated FAQs contain public service guidance only. Anonymous residents may
-- read active entries, while all management remains admin-only.

grant select on table public.faqs to anon;

drop policy if exists "faqs_public_read_active" on public.faqs;
create policy "faqs_public_read_active"
on public.faqs
for select
to anon
using (is_active = true);
