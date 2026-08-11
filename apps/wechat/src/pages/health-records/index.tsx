import { Button, Input, Picker, ScrollView, Text, Textarea, View } from "@tarojs/components";
import Taro, { useDidShow, usePullDownRefresh } from "@tarojs/taro";
import { useMemo, useState } from "react";
import {
  CalendarDays,
  Clock3,
  Droplets,
  Footprints,
  HeartPulse,
  Scale,
  Trash2,
} from "lucide-react-taro";
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
  can_delete: boolean;
};

type ObservationData = {
  careSubject: { displayName: string; relationship: string; isSelf: boolean };
  observations: Observation[];
};

const types: Array<{
  type: ObservationType;
  label: string;
  unit: string;
  placeholder: string;
}> = [
  { type: "blood_pressure", label: "血压", unit: "mmHg", placeholder: "收缩压" },
  { type: "blood_glucose", label: "血糖", unit: "mmol/L", placeholder: "血糖数值" },
  { type: "weight", label: "体重", unit: "kg", placeholder: "体重数值" },
  { type: "steps", label: "步数", unit: "步", placeholder: "当天步数" },
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

function localDateParts(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return { date: `${year}-${month}-${day}`, time: `${hours}:${minutes}` };
}

function ObservationIcon({ type, color = "#2F6C56", size = 21 }: {
  type: ObservationType;
  color?: string;
  size?: number;
}) {
  const props = { color, size, strokeWidth: 2.1 } as const;
  if (type === "blood_pressure") return <HeartPulse {...props} />;
  if (type === "blood_glucose") return <Droplets {...props} />;
  if (type === "weight") return <Scale {...props} />;
  return <Footprints {...props} />;
}

export default function HealthRecordsPage() {
  const initialTime = localDateParts();
  const [data, setData] = useState<ObservationData | null>(null);
  const [type, setType] = useState<ObservationType>("blood_pressure");
  const [value, setValue] = useState("");
  const [secondaryValue, setSecondaryValue] = useState("");
  const [note, setNote] = useState("");
  const [measuredDate, setMeasuredDate] = useState(initialTime.date);
  const [measuredTime, setMeasuredTime] = useState(initialTime.time);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState("");
  const [visibleCount, setVisibleCount] = useState(20);
  const [error, setError] = useState("");

  const selected = types.find((item) => item.type === type) ?? types[0];
  const latest = useMemo(() => {
    const byType = new Map<ObservationType, Observation>();
    for (const item of data?.observations ?? []) {
      if (!byType.has(item.observation_type)) byType.set(item.observation_type, item);
    }
    return types.map((item) => ({ ...item, observation: byType.get(item.type) }));
  }, [data]);
  const trend = useMemo(
    () => (data?.observations ?? [])
      .filter((item) => item.observation_type === type)
      .slice(0, 7)
      .reverse(),
    [data, type],
  );
  const trendRange = useMemo(() => {
    const values = trend.flatMap((item) => item.secondary_value == null
      ? [item.value]
      : [item.value, item.secondary_value]);
    if (!values.length) return { minimum: 0, maximum: 1 };
    const minimum = Math.min(...values);
    const maximum = Math.max(...values);
    return minimum === maximum
      ? { minimum: minimum - 1, maximum: maximum + 1 }
      : { minimum, maximum };
  }, [trend]);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const loaded = await apiRequest<ObservationData>(withCareSubject("/api/v1/health-observations"));
      setData(loaded);
      setVisibleCount(20);
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
    const measuredAt = new Date(`${measuredDate}T${measuredTime}:00`);
    if (Number.isNaN(measuredAt.getTime())) return "请选择正确的测量日期和时间。";
    if (measuredAt.getTime() > Date.now() + 5 * 60_000) return "测量时间不能晚于当前时间。";
    return null;
  }

  function resetMeasurementTime() {
    const current = localDateParts();
    setMeasuredDate(current.date);
    setMeasuredTime(current.time);
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
            measuredAt: new Date(`${measuredDate}T${measuredTime}:00`).toISOString(),
            note: note.trim() || null,
          },
        },
      });
      setValue("");
      setSecondaryValue("");
      setNote("");
      resetMeasurementTime();
      void Taro.showToast({ title: "健康记录已保存", icon: "success" });
      await load();
    } catch (caught) {
      void Taro.showToast({ title: caught instanceof Error ? caught.message : "记录保存失败", icon: "none" });
    } finally {
      setSaving(false);
    }
  }

  async function remove(item: Observation) {
    const confirmation = await Taro.showModal({
      title: "删除这条手工记录？",
      content: `${formatMeasuredAt(item.measured_at)} · ${item.value}${item.secondary_value != null ? `/${item.secondary_value}` : ""} ${item.unit}。删除操作会留下安全审计记录。`,
      confirmText: "确认删除",
      confirmColor: "#A44A3F",
    });
    if (!confirmation.confirm) return;
    setDeletingId(item.id);
    try {
      await apiRequest("/api/v1/health-observations", {
        method: "DELETE",
        data: { id: item.id },
      });
      void Taro.showToast({ title: "手工记录已删除", icon: "success" });
      await load();
    } catch (caught) {
      void Taro.showToast({ title: caught instanceof Error ? caught.message : "删除失败", icon: "none" });
    } finally {
      setDeletingId("");
    }
  }

  function chartPosition(reading: number) {
    const span = trendRange.maximum - trendRange.minimum;
    return 12 + ((reading - trendRange.minimum) / span) * 76;
  }

  function readingLabel(item: Observation) {
    return `${item.value}${item.secondary_value != null ? `/${item.secondary_value}` : ""}`;
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
            <View
              className={`health-latest-item pressable ${item.type} ${type === item.type ? "selected" : ""}`}
              key={item.type}
              onClick={() => { setType(item.type); setValue(""); setSecondaryValue(""); }}
              role="button"
              aria-label={`查看${item.label}趋势`}
            >
              <View className="health-latest-head">
                <View className="health-latest-icon"><ObservationIcon type={item.type} /></View>
                <Text className="health-latest-label">{item.label}</Text>
              </View>
              <Text className="health-latest-value">
                {item.observation ? `${item.observation.value}${item.observation.secondary_value != null ? `/${item.observation.secondary_value}` : ""}` : "--"}
              </Text>
              <Text className="health-latest-unit">{item.observation ? item.unit : "暂无记录"}</Text>
            </View>
          ))}
        </View>

        <View className="health-trend-surface">
          <View className="health-trend-head">
            <View>
              <Text className="health-entry-kicker">近期变化</Text>
              <Text className="health-entry-title">{selected.label} · 近 {trend.length} 次</Text>
            </View>
            <Text className="health-trend-unit">{selected.unit}</Text>
          </View>
          {trend.length >= 2 ? (
            <>
              {type === "blood_pressure" ? (
                <View className="health-trend-legend">
                  <View><View className="trend-legend-dot primary" /><Text>收缩压</Text></View>
                  <View><View className="trend-legend-dot secondary" /><Text>舒张压</Text></View>
                </View>
              ) : null}
              <View
                className="health-trend-chart"
                role="img"
                aria-label={`${selected.label}近 ${trend.length} 次记录，从 ${readingLabel(trend[0])} 到 ${readingLabel(trend[trend.length - 1])} ${selected.unit}`}
              >
                <View className="health-chart-scale">
                  <Text>{trendRange.maximum}</Text>
                  <Text>{trendRange.minimum}</Text>
                </View>
                <ScrollView className="health-chart-scroll" scrollX enhanced showScrollbar={false}>
                <View className="health-chart-columns">
                  {trend.map((item) => {
                    const measured = new Date(item.measured_at);
                    const primaryPosition = chartPosition(item.value);
                    const stepHeight = 12 + (item.value / Math.max(trendRange.maximum, 1)) * 76;
                    return (
                      <View
                        className="health-chart-column"
                        key={item.id}
                        aria-label={`${measured.getMonth() + 1}月${measured.getDate()}日，${readingLabel(item)} ${item.unit}`}
                      >
                        <View className="health-chart-plot">
                          {type === "steps" ? (
                            <View className="health-chart-bar" style={{ height: `${Math.min(stepHeight, 88)}%` }} />
                          ) : (
                            <View className="health-chart-point primary" style={{ bottom: `${primaryPosition}%` }} />
                          )}
                          {item.secondary_value != null ? (
                            <View className="health-chart-point secondary" style={{ bottom: `${chartPosition(item.secondary_value)}%` }} />
                          ) : null}
                        </View>
                        <Text className="health-chart-value">{readingLabel(item)}</Text>
                        <Text className="health-chart-date">{measured.getMonth() + 1}/{measured.getDate()}</Text>
                      </View>
                    );
                  })}
                </View>
                </ScrollView>
              </View>
              <Text className="health-trend-note">按实际记录展示变化，不判断正常或异常。</Text>
            </>
          ) : (
            <View className="health-trend-empty">
              <ObservationIcon type={type} color="#6A7B89" size={24} />
              <View className="grow">
                <Text className="health-trend-empty-title">再记录 {trend.length ? 1 : 2} 次即可查看变化</Text>
                <Text className="health-trend-empty-copy">趋势只比较已确认的实际数值。</Text>
              </View>
            </View>
          )}
        </View>

        <View className="health-entry-surface">
          <View className="health-entry-head">
            <View><Text className="health-entry-kicker">手工录入</Text><Text className="health-entry-title">新增一次测量</Text></View>
            <Text className="health-entry-time">记录当前时间</Text>
          </View>
          <View className="health-type-grid">
            {types.map((item) => (
              <View className={`health-type pressable ${type === item.type ? "selected" : ""}`} key={item.type} onClick={() => { setType(item.type); setValue(""); setSecondaryValue(""); }}>
                <View className="health-type-mark"><ObservationIcon type={item.type} color={type === item.type ? "#FFFFFF" : "#2F6C56"} size={19} /></View>
                <Text>{item.label}</Text>
              </View>
            ))}
          </View>
          <Text className="label">测量时间</Text>
          <View className="health-time-row">
            <Picker mode="date" value={measuredDate} end={localDateParts().date} onChange={(event) => setMeasuredDate(event.detail.value)}>
              <View className="health-time-picker pressable"><CalendarDays size={19} color="#365F8A" /><Text>{measuredDate}</Text></View>
            </Picker>
            <Picker mode="time" value={measuredTime} onChange={(event) => setMeasuredTime(event.detail.value)}>
              <View className="health-time-picker pressable"><Clock3 size={19} color="#365F8A" /><Text>{measuredTime}</Text></View>
            </Picker>
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
        {data.observations.length ? <><View className="health-history-surface">
          {data.observations.slice(0, visibleCount).map((item) => {
            const meta = types.find((candidate) => candidate.type === item.observation_type) ?? types[0];
            return <View className="health-history-row" key={item.id}><View className={`health-history-mark ${item.observation_type}`}><ObservationIcon type={item.observation_type} color={item.observation_type === "blood_pressure" ? "#365F8A" : item.observation_type === "blood_glucose" ? "#9A642C" : item.observation_type === "steps" ? "#65558A" : "#2F6C56"} /></View><View className="grow"><Text className="health-history-title">{meta.label}</Text><Text className="health-history-meta">{formatMeasuredAt(item.measured_at)} · {item.source === "manual" ? "手工录入" : "已确认来源"}</Text>{item.note ? <Text className="health-history-note">{item.note}</Text> : null}</View><View className="health-history-side"><View className="health-history-reading"><Text>{item.value}{item.secondary_value != null ? `/${item.secondary_value}` : ""}</Text><Text>{item.unit}</Text></View>{item.can_delete ? <Button className="health-delete pressable" loading={deletingId === item.id} disabled={Boolean(deletingId)} onClick={() => void remove(item)}><Trash2 size={17} color="#A44A3F" /><Text>删除</Text></Button> : null}</View></View>;
          })}
        </View>{data.observations.length > visibleCount ? <Button className="health-load-more pressable" onClick={() => setVisibleCount((count) => count + 20)}>继续查看更早记录</Button> : null}</> : <View className="service-empty spacious">还没有健康记录。完成一次测量后，可以在这里持续查看。</View>}
      </> : null}
    </View>
  );
}
