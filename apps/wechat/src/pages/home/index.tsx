import { Button, Picker, Text, View } from "@tarojs/components";
import Taro, { useDidShow } from "@tarojs/taro";
import { useState } from "react";
import {
  apiRequest,
  isLoggedIn,
  saveCareSubjectId,
  withCareSubject,
} from "../../lib/api";

type CareSubject = {
  residentId: string;
  displayName: string;
  relationship: string;
  isSelf: boolean;
};

type HomeData = {
  profile: { displayName: string };
  careSubject: CareSubject;
  careSubjects: CareSubject[];
  network: null | { name: string; community?: { name?: string } };
  serviceRequests: Array<{ id: string; title: string; status: string }>;
  schedules: Array<Record<string, unknown>>;
};

export default function HomePage() {
  const [data, setData] = useState<HomeData | null>(null);

  async function load() {
    try {
      const result = await apiRequest<HomeData>(
        withCareSubject("/api/v1/home"),
      );
      saveCareSubjectId(result.careSubject.residentId);
      setData(result);
    } catch (error) {
      Taro.showToast({
        title: error instanceof Error ? error.message : "首页加载失败",
        icon: "none",
      });
    }
  }

  useDidShow(() => {
    if (!isLoggedIn()) void Taro.navigateTo({ url: "/pages/login/index" });
    else void load();
  });

  async function switchSubject(index: number) {
    const subject = data?.careSubjects[index];
    if (!subject) return;
    await apiRequest("/api/v1/care-subject", {
      method: "PUT",
      data: { residentId: subject.residentId },
    });
    saveCareSubjectId(subject.residentId);
    await load();
  }

  const activeRequest = data?.serviceRequests.find(
    (item) => !["completed", "cancelled", "failed"].includes(item.status),
  );

  return (
    <View className="page">
      <View className="page-heading">
        <Text className="eyebrow">社区家庭医生服务</Text>
        <Text className="brand-title left">家医 Claw</Text>
        <View className="subtitle">
          {data ? `${data.profile.displayName}，您好` : "正在连接服务中台"}
        </View>
      </View>

      {data?.careSubject ? (
        <Picker
          mode="selector"
          range={data.careSubjects.map(
            (item) =>
              `${item.displayName} · ${item.isSelf ? "本人" : item.relationship}`,
          )}
          onChange={(event) => void switchSubject(Number(event.detail.value))}
        >
          <View className="subject-card">
            <View className="subject-avatar">
              {data.careSubject.displayName.slice(0, 1)}
            </View>
            <View className="grow">
              <Text className="subject-label">当前服务对象</Text>
              <Text className="subject-name">
                {data.careSubject.displayName} ·{" "}
                {data.careSubject.isSelf ? "本人" : "家属代办"}
              </Text>
            </View>
            {data.careSubjects.length > 1 ? (
              <Text className="subject-switch">切换</Text>
            ) : null}
          </View>
        </Picker>
      ) : null}

      <View className="voice-hero">
        <Text className="title">直接告诉 Claw 想办什么</Text>
        <View className="subtitle">
          查已核验信息、整理诉求，再由您确认下一步。
        </View>
        <Button
          className="claw-primary"
          onClick={() => Taro.navigateTo({ url: "/pages/ask/index?voice=1" })}
        >
          语音问 Claw
        </Button>
        <View className="claw-actions">
          <Button
            className="claw-secondary"
            onClick={() => Taro.navigateTo({ url: "/pages/ask/index" })}
          >
            打字咨询
          </Button>
          <Button
            className="claw-secondary"
            onClick={() =>
              Taro.navigateTo({ url: "/pages/appointments/index" })
            }
          >
            一键帮预约
          </Button>
        </View>
      </View>

      <View className="card">
        <Text className="label no-margin">正在办理</Text>
        {activeRequest ? (
          <View
            className="service-summary"
            onClick={() => Taro.navigateTo({ url: "/pages/progress/index" })}
          >
            <View className="grow">
              <Text className="consent-title">{activeRequest.title}</Text>
              <Text className="consent-note">
                团队正在处理，点击查看完整进度
              </Text>
            </View>
            <Text className="status">查看进度</Text>
          </View>
        ) : (
          <View className="empty-copy">
            当前没有处理中服务，可以直接向 Claw 描述需求。
          </View>
        )}
        <Button
          className="secondary"
          onClick={() => Taro.switchTab({ url: "/pages/services/index" })}
        >
          医生坐班与分级诊疗
        </Button>
      </View>

      <View className="safety-strip">
        <Text>
          胸痛、呼吸困难、意识不清或大出血请立即拨打 120。AI
          不诊断、不开方、不调药。
        </Text>
      </View>
    </View>
  );
}
