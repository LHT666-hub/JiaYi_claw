import { Button, Input, Text, Textarea, View } from "@tarojs/components";
import Taro, { useDidShow, usePullDownRefresh } from "@tarojs/taro";
import { useMemo, useState } from "react";
import { PageFeedback, PageSkeleton } from "../../components/PageState";
import {
  apiRequest,
  getCareSubjectId,
  withCareSubject,
} from "../../lib/api";

type ObservationType = "blood_pressure" | "blood_glucose" | "weight" | "steps";

type Observation = {
  id: string;
  observation_type: ObservationType;
  value: number;
  secondary_value: number | null;
  unit: string;
  measured_at: string;
  note: string | null;
  source: string;
};

type ObservationData = {
  careSubject: { displayName: string; relationship: string; isSelf: boolean };
  observations: Observation[];
};

const types: Array<{
  type: ObservationType;
  label: string;
  short: string;
  unit: string;
  placeholder: string;
}> = [
  { type: "blood_pressure", label: "血压", short: "压", unit: "mmHg", placeholder: "收缩压" },
  { type: "blood_glucose", label: "血糖", short: "糖", unit: "mmol/L", placeholder: "血糖数值" },
  { type: "weight", label: "体重", short: "重", unit: "kg", placeholder: "体重数值" },
  { type: "steps", label: "步数", short: "步", unit: "步", placeholder: "当天步数" },
];

const bounds: Record<ObservationType, [number, number]> = {
  blood_pressure: [40, 300],
  blood_glucose: [0.5, 50],
  weight: [1, 500],
  steps: [0, 200000],
};

function formatMeasuredAt(value: string) {
  const date = new Date(value);
  return date.toLocaleString("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function HealthRecordsPage() {
  const [data, setData] = useState<ObservationData | null>(null);
  const [type, setType] = useState<ObservationType>("blood_pressure");
  const [value, setValue] = useState("");
  const [secondaryValue, setSecondaryValue] = useState("");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const selected = types.find((item) => item.type === type) ?? types[0];
  const latest = useMemo(() => {
    const byType = new Map<ObservationType, Observation>();
    for (const item of data?.observations ?? []) {
      if (!byType.has(item.observation_type)) byType.set(item.observation_type, item);
    }
    return types.map((item) => ({ ...item, observation: byType.get(item.type) }));
  }, [data]);

  async function load() {
    setLoading(true);
    setError("");
    try {
      setData(await apiRequest<ObservationData>(withCareSubject("/api/v1/health-observations")));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "健康记录暂时无法加载。");
    } finally {
      setLoading(false);
      Taro.stopPullDownRefresh();
    }
  }

  useDidShow(() => { void load(); });
  usePullDownRefresh(() => { void load(); });

  function validate() {
    const numericValue = Number(value);
    const [minimum, maximum] = bounds[type];
    if (!value || !Number.isFinite(numericValue) || numericValue < minimum || numericValue > maximum)
      return `请输入 ${minimum} 到 ${maximum} 之间的${selected.label}记录。`;
    if (type === "blood_pressure") {
      const numericSecondary = Number(secondaryValue);
      if (!secondaryValue || !Number.isFinite(numericSecondary) || numericSecondary < 30 || numericSecondary > 200)
        return "请输入 30 到 200 之间的舒张压记录。";
      if (numericSecondary >= numericValue) return "请核对收缩压和舒张压的填写顺序。";
    }
    return null;
  }

  async function save() {
    const validation = validate();
    if (validation) {
      void Taro.showToast({ title: validation, icon: "none" });
      return;
    }
    setSaving(true);
    try {
      await apiRequest("/api/v1/health-observations", {
        method: "POST",
        data: {
          residentId: getCareSubjectId() || undefined,
          observation: {
            type,
            value: Number(value),
            secondaryValue: type === "blood_pressure" ? Number(secondaryValue) : null,
            unit: selected.unit,
            measuredAt: new Date().toISOString(),
            note: note.trim() || null,
          },
        },
      });
      setValue("");
      setSecondaryValue("");
      setNote("");
      void Taro.showToast({ title: "健康记录已保存", icon: "success" });
      await load();
    } catch (caught) {
      void Taro.showToast({ title: caught instanceof Error ? caught.message : "记录保存失败", icon: "none" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <View className="page health-records-page">
      <View className="health-records-heading">
        <Text className="eyebrow">本人及授权家属</Text>
        <Text className="health-records-title">健康记录</Text>
        <Text className="health-records-copy">记录测量事实，方便家医了解近期变化。</Text>
      </View>

      {loading && !data ? <PageSkeleton rows={3} /> : null}
      {!loading && error && !data ? <PageFeedback title="记录暂时没连上" message={error} onRetry={() => void load()} /> : null}

      {data ? <>
        <View className="health-subject">
          <View className="health-subject-avatar">{data.careSubject.displayName.slice(0, 1)}</View>
          <View className="grow">
            <Text className="health-subject-kicker">当前记录对象</Text>
            <Text className="health-subject-name">{data.careSubject.displayName} · {data.careSubject.isSelf ? "本人" : data.careSubject.relationship}</Text>
          </View>
          <Text className="health-subject-state">已授权</Text>
        </View>

        <View className="health-latest-grid">
          {latest.map((item) => (
            <View className={`health-latest-item ${item.type}`} key={item.type}>
              <Text className="health-latest-label">{item.label}</Text>
              <Text className="health-latest-value">
                {item.observation ? `${item.observation.value}${item.observation.secondary_value != null ? `/${item.observation.secondary_value}` : ""}` : "--"}
              </Text>
              <Text className="health-latest-unit">{item.observation ? item.unit : "暂无记录"}</Text>
            </View>
          ))}
        </View>

        <View className="health-entry-surface">
          <View className="health-entry-head">
            <View><Text className="health-entry-kicker">手工录入</Text><Text className="health-entry-title">新增一次测量</Text></View>
            <Text className="health-entry-time">记录当前时间</Text>
          </View>
          <View className="health-type-grid">
            {types.map((item) => (
              <View className={`health-type pressable ${type === item.type ? "selected" : ""}`} key={item.type} onClick={() => { setType(item.type); setValue(""); setSecondaryValue(""); }}>
                <View className="health-type-mark">{item.short}</View>
                <Text>{item.label}</Text>
              </View>
            ))}
          </View>
          <View className="health-value-row">
            <View className="grow">
              <Text className="label">{selected.placeholder}</Text>
              <View className="health-value-input"><Input type="digit" value={value} onInput={(event) => setValue(event.detail.value)} placeholder="请输入" /><Text>{selected.unit}</Text></View>
            </View>
            {type === "blood_pressure" ? <View className="grow"><Text className="label">舒张压</Text><View className="health-value-input"><Input type="digit" value={secondaryValue} onInput={(event) => setSecondaryValue(event.detail.value)} placeholder="请输入" /><Text>mmHg</Text></View></View> : null}
          </View>
          <Text className="label">备注（选填）</Text>
          <Textarea className="health-note" maxlength={300} value={note} onInput={(event) => setNote(event.detail.value)} placeholder="例如：晨起、饭后两小时或刚运动完" />
          <Button className="health-save pressable" loading={saving} disabled={saving} onClick={() => void save()}>保存这次记录</Button>
          <Text className="health-data-note">手工记录仅供资料整理，不表示医学判断；不适请及时联系医生。</Text>
        </View>

        <View className="health-history-head"><Text>最近记录</Text><Text>{data.observations.length} 条</Text></View>
        {data.observations.length ? <View className="health-history-surface">
          {data.observations.map((item) => {
            const meta = types.find((candidate) => candidate.type === item.observation_type) ?? types[0];
            return <View className="health-history-row" key={item.id}><View className={`health-history-mark ${item.observation_type}`}>{meta.short}</View><View className="grow"><Text className="health-history-title">{meta.label}</Text><Text className="health-history-meta">{formatMeasuredAt(item.measured_at)} · {item.source === "manual" ? "手工录入" : "已确认来源"}</Text>{item.note ? <Text className="health-history-note">{item.note}</Text> : null}</View><View className="health-history-reading"><Text>{item.value}{item.secondary_value != null ? `/${item.secondary_value}` : ""}</Text><Text>{item.unit}</Text></View></View>;
          })}
        </View> : <View className="service-empty spacious">还没有健康记录。完成一次测量后，可以在这里持续查看。</View>}
      </> : null}
    </View>
  );
}
