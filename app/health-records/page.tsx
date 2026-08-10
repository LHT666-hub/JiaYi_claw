"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { Activity, Plus, Scale, Footprints } from "lucide-react";
import { BackHeader } from "@/components/BackHeader";
import { CareSubjectSwitcher } from "@/components/CareSubjectSwitcher";
import { PhoneShell } from "@/components/PhoneShell";
import { useToast } from "@/components/ToastProvider";

type ObservationType = "blood_pressure" | "blood_glucose" | "weight" | "steps";
type Observation = {
  id: string;
  observation_type: ObservationType;
  value: number;
  secondary_value: number | null;
  unit: string;
  measured_at: string;
  note: string | null;
};

const labels: Record<ObservationType, string> = {
  blood_pressure: "血压",
  blood_glucose: "血糖",
  weight: "体重",
  steps: "步数",
};
const units: Record<ObservationType, string> = {
  blood_pressure: "mmHg",
  blood_glucose: "mmol/L",
  weight: "kg",
  steps: "步",
};

export default function HealthRecordsPage() {
  const { showToast } = useToast();
  const [items, setItems] = useState<Observation[]>([]);
  const [type, setType] = useState<ObservationType>("blood_pressure");
  const [value, setValue] = useState("");
  const [secondary, setSecondary] = useState("");
  const [note, setNote] = useState("");

  const load = useCallback(async () => {
    const response = await fetch("/api/v1/health-observations", {
      cache: "no-store",
    });
    const payload = await response.json();
    if (response.ok) setItems(payload.data.observations ?? []);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const response = await fetch("/api/v1/health-observations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type,
        value: Number(value),
        secondaryValue: secondary ? Number(secondary) : null,
        unit: units[type],
        measuredAt: new Date().toISOString(),
        note: note || null,
      }),
    });
    const payload = await response.json();
    if (!response.ok)
      return showToast(payload.error?.message ?? "记录保存失败。", "warning");
    showToast("健康记录已保存。", "success");
    setValue("");
    setSecondary("");
    setNote("");
    await load();
  }

  return (
    <PhoneShell showBottomNav>
      <main className="space-y-5 px-4 pb-8">
      <BackHeader
        title="健康记录"
        subtitle="先支持手工记录，所有数据都标明来源。"
      />
      <CareSubjectSwitcher compact />
      <form
          onSubmit={submit}
          className="rounded-lg border border-line bg-surface-card p-4"
        >
          <h1 className="flex items-center gap-2 font-semibold text-navy">
            <Plus className="h-4 w-4 text-sage" />
            新增记录
          </h1>
          <div className="mt-4 grid grid-cols-4 gap-2">
            {(Object.keys(labels) as ObservationType[]).map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setType(item)}
                className={`rounded-md border px-2 py-2 text-xs font-semibold ${type === item ? "border-navy bg-navy text-white" : "border-line bg-cream text-navy"}`}
              >
                {labels[item]}
              </button>
            ))}
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <input
              required
              type="number"
              step="any"
              value={value}
              onChange={(event) => setValue(event.target.value)}
              placeholder={type === "blood_pressure" ? "收缩压" : labels[type]}
              className="h-12 rounded-md border border-line bg-cream px-3"
            />
            {type === "blood_pressure" ? (
              <input
                required
                type="number"
                step="any"
                value={secondary}
                onChange={(event) => setSecondary(event.target.value)}
                placeholder="舒张压"
                className="h-12 rounded-md border border-line bg-cream px-3"
              />
            ) : (
              <div className="flex h-12 items-center rounded-md border border-line bg-health-soft px-3 text-sm text-navy/60">
                单位：{units[type]}
              </div>
            )}
          </div>
          <input
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="备注（可选）"
            className="mt-3 h-12 w-full rounded-md border border-line bg-cream px-3"
          />
          <button className="mt-3 w-full rounded-md bg-navy px-4 py-3 text-sm font-semibold text-white">
            保存记录
          </button>
        </form>
        <section>
          <h2 className="mb-3 font-semibold text-navy">最近记录</h2>
          <div className="space-y-2">
            {items.map((item) => (
              <article
                key={item.id}
                className="flex items-center gap-3 rounded-lg border border-line bg-surface-card p-4"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-health-soft text-sage">
                  {item.observation_type === "weight" ? (
                    <Scale className="h-5 w-5" />
                  ) : item.observation_type === "steps" ? (
                    <Footprints className="h-5 w-5" />
                  ) : (
                    <Activity className="h-5 w-5" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-navy">
                    {labels[item.observation_type]}
                  </p>
                  <p className="mt-1 text-xs text-navy/45">
                    {new Date(item.measured_at).toLocaleString("zh-CN")} ·
                    手工录入
                  </p>
                </div>
                <p className="text-lg font-semibold text-navy">
                  {item.value}
                  {item.secondary_value != null
                    ? `/${item.secondary_value}`
                    : ""}
                  <span className="ml-1 text-xs font-normal text-navy/45">
                    {item.unit}
                  </span>
                </p>
              </article>
            ))}
            {!items.length ? (
              <div className="rounded-lg border border-dashed border-line p-6 text-center text-sm text-navy/50">
                还没有健康记录。
              </div>
            ) : null}
          </div>
        </section>
      </main>
    </PhoneShell>
  );
}
