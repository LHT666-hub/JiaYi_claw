"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  ChevronRight,
  HeartPulse,
  House,
  Stethoscope,
  Users,
} from "lucide-react";
import { PhoneShell } from "@/components/PhoneShell";
import { useToast } from "@/components/ToastProvider";
import {
  createLocalUser,
  getOnboardingRoleLabel,
  getPostOnboardingPath,
  roleOptions,
  saveCurrentUser,
} from "@/lib/onboarding";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { AppRole } from "@/lib/types";

const PAGE_FONT_FAMILY = `-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Roboto", "Inter", "PingFang SC", "MiSans", "HarmonyOS Sans SC", "Noto Sans SC", "Microsoft YaHei", sans-serif`;

const ageOptions = ["60-69", "70-79", "80岁以上", "其他"];
const chronicOptions = ["高血压", "糖尿病", "高糖共患", "心脑血管风险", "其他"];
const phoneSkillOptions = [
  "会自己操作",
  "会看消息但不太会操作",
  "基本不会用",
  "需要家属或社区协助",
];
const livingOptions = ["与家人同住", "独居", "白天独自在家", "需要家属协助"];
const familyRelationOptions = ["女儿", "儿子", "配偶", "其他"];
const elderKnownOptions = ["是", "否"];

const primaryRoleCards: {
  role: AppRole;
  title: string;
  description: string;
  icon: typeof House;
}[] = [
  {
    role: "resident",
    title: "居民",
    description: "查看健康计划、提问和进度",
    icon: House,
  },
  {
    role: "family",
    title: "家属",
    description: "绑定家人，协助查看与代问",
    icon: Users,
  },
  {
    role: "doctor",
    title: "家庭医生",
    description: "处理居民问题与团队待办",
    icon: Stethoscope,
  },
  {
    role: "nurse",
    title: "护士",
    description: "协助随访、记录与提醒",
    icon: HeartPulse,
  },
];

type FormState = {
  name: string;
  phone: string;
  area: string;
  ageGroup: string;
  chronicTags: string[];
  phoneSkill: string;
  livingStatus: string;
  relation: string;
  elderKnown: string;
  elderName: string;
  organization: string;
  responsibility: string;
};

const initialForm: FormState = {
  name: "",
  phone: "",
  area: "",
  ageGroup: "",
  chronicTags: [],
  phoneSkill: "",
  livingStatus: "",
  relation: "",
  elderKnown: "",
  elderName: "",
  organization: "",
  responsibility: "",
};

function ChoiceButton({
  label,
  selected,
  onClick,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-[18px] border px-4 py-3 text-left text-sm font-semibold transition active:scale-[0.98]"
      style={{
        borderColor: selected ? "#12324A" : "#E3D0B8",
        backgroundColor: selected ? "#12324A" : "#FFF9F0",
        color: selected ? "#FFF8EE" : "#12324A",
        fontFamily: PAGE_FONT_FAMILY,
      }}
    >
      {label}
    </button>
  );
}

function FormInput({
  label,
  value,
  onChange,
  placeholder,
  required = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
}) {
  return (
    <label className="block" style={{ fontFamily: PAGE_FONT_FAMILY }}>
      <span className="mb-2 block text-sm font-semibold" style={{ color: "#12324A" }}>
        {label}
        {required ? <span style={{ color: "#B89157" }}> *</span> : null}
      </span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="h-[52px] w-full rounded-[18px] border px-4 text-base outline-none transition placeholder:text-[#8A9197]"
        style={{
          borderColor: "#E3D0B8",
          backgroundColor: "#FFF9F0",
          color: "#12324A",
          fontFamily: PAGE_FONT_FAMILY,
        }}
      />
    </label>
  );
}

function toggleValue(values: string[], value: string) {
  return values.includes(value) ? values.filter((item) => item !== value) : [...values, value];
}

export default function WelcomePage() {
  const router = useRouter();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const { showToast } = useToast();
  const [step, setStep] = useState<1 | 2>(1);
  const [role, setRole] = useState<AppRole | null>(null);
  const [form, setForm] = useState<FormState>(initialForm);
  const [isSaving, setIsSaving] = useState(false);

  const roleLabel = role ? getOnboardingRoleLabel(role) : "";
  const featuredRoles = primaryRoleCards
    .map((card) => {
      const option = roleOptions.find((item) => item.role === card.role);
      return option ? { ...card, option } : null;
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item));

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!role) {
      setStep(1);
      return;
    }

    if (!form.name.trim()) {
      showToast("请先填写姓名。", "warning");
      return;
    }

    setIsSaving(true);

    const profile =
      role === "resident"
        ? {
            ageGroup: form.ageGroup,
            chronicTags: form.chronicTags,
            phoneSkill: form.phoneSkill,
            livingStatus: form.livingStatus,
          }
        : role === "family"
          ? {
              relation: form.relation,
              elderKnown: form.elderKnown,
              elderName: form.elderName.trim(),
            }
          : {
              organization: form.organization.trim(),
              responsibility: form.responsibility.trim(),
            };

    const user = createLocalUser({
      name: form.name,
      role,
      phone: form.phone,
      area: form.area,
      profile,
    });

    try {
      if (supabase) {
        const {
          data: { user: accountUser },
        } = await supabase.auth.getUser();

        if (accountUser) {
          await supabase
            .from("profiles")
            .update({
              display_name: form.name.trim(),
              phone: form.phone.trim() || null,
            })
            .eq("id", accountUser.id);
        }
      }

      saveCurrentUser(user);
      showToast(`已进入${roleLabel}身份。`, "success");
      router.replace(getPostOnboardingPath(role));
    } catch {
      try {
        saveCurrentUser(user);
        router.replace(getPostOnboardingPath(role));
      } catch {
        showToast("暂时保存失败，请稍后再试，也可以先使用演示身份。", "warning");
      }
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <PhoneShell>
      <div
        className="min-h-full px-5 pb-8 pt-6"
        style={{ backgroundColor: "#F6EFE4", fontFamily: PAGE_FONT_FAMILY }}
      >
        <div className="mx-auto w-full max-w-[430px]">
          <div className="flex items-center justify-center gap-2 px-1 text-[14px] font-semibold leading-none">
            <span style={{ color: step === 1 ? "#12324A" : "#8A9197", fontWeight: step === 1 ? 700 : 600 }}>
              1 选择身份
            </span>
            <span className="h-px w-8" style={{ backgroundColor: "#D8C6AD" }} />
            <span style={{ color: step === 2 ? "#12324A" : "#8A9197", fontWeight: step === 2 ? 700 : 600 }}>
              2 填写信息
            </span>
          </div>

          {step === 1 ? (
            <div className="mt-5">
              <section
                className="rounded-[28px] px-[22px] py-6"
                style={{
                  backgroundColor: "#12324A",
                  boxShadow: "0 14px 30px rgba(18, 50, 74, 0.16)",
                  minHeight: 168,
                  maxHeight: 188,
                }}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-[10px]">
                    <div
                      className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-[14px] border"
                      style={{
                        backgroundColor: "rgba(255, 248, 238, 0.10)",
                        borderColor: "rgba(255, 248, 238, 0.18)",
                      }}
                    >
                      <Stethoscope className="h-[22px] w-[22px]" color="#FFF8EE" strokeWidth={2.1} />
                    </div>
                    <p
                      className="truncate text-[20px] font-bold leading-[1.2]"
                      style={{ color: "#FFF8EE", letterSpacing: "-0.01em" }}
                    >
                      家医 Claw
                    </p>
                  </div>
                  <div
                    className="flex h-7 shrink-0 items-center rounded-full border px-2.5 text-[12px] font-semibold"
                    style={{
                      backgroundColor: "rgba(255, 248, 238, 0.10)",
                      borderColor: "rgba(255, 248, 238, 0.16)",
                      color: "#EBDCCA",
                    }}
                  >
                    服务入口
                  </div>
                </div>
                <h1
                  className="mt-[22px] text-[28px] font-bold leading-[1.18]"
                  style={{ color: "#FFF8EE", letterSpacing: "-0.02em" }}
                >
                  选择你的使用身份
                </h1>
                <p
                  className="mt-2 max-w-full text-[14px] leading-[1.55]"
                  style={{ color: "#EBDCCA" }}
                >
                  先选一个常用身份，进入对应服务入口。
                </p>
              </section>

              <section className="mt-5 flex flex-col gap-[14px]">
                {featuredRoles.map((item) => {
                  const Icon = item.icon;

                  return (
                    <button
                      key={item.role}
                      type="button"
                      onClick={() => {
                        setRole(item.option.role);
                        setStep(2);
                      }}
                      className="flex w-full items-center gap-[14px] border bg-[#FFF9F0] px-4 text-left transition duration-150 ease-out active:scale-[0.985] active:border-[#B89157] active:bg-[#FDF3E6] active:shadow-[0_4px_12px_rgba(18,50,74,0.03)]"
                      style={{
                        height: 94,
                        borderRadius: 24,
                        borderColor: "#E3D0B8",
                        boxShadow: "0 8px 20px rgba(18, 50, 74, 0.04)",
                        transformOrigin: "center",
                        padding: "15px 16px",
                      }}
                    >
                      <span
                        className="flex h-[54px] w-[54px] shrink-0 items-center justify-center"
                        style={{
                          borderRadius: 18,
                          backgroundColor: "#FAF0E2",
                          border: "1px solid #EBDCCA",
                        }}
                      >
                        <Icon className="h-6 w-6" color="#12324A" strokeWidth={2} />
                      </span>
                      <span className="min-w-0 flex-1 flex-col justify-center gap-[6px] flex">
                        <span
                          className="block text-[19px] font-bold leading-[1.22]"
                          style={{ color: "#12324A" }}
                        >
                          {item.title}
                        </span>
                        <span
                          className="block text-[15px] leading-[1.38]"
                          style={{ color: "#5F6B73" }}
                        >
                          {item.description}
                        </span>
                      </span>
                      <span
                        className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-full"
                        style={{
                          backgroundColor: "#FAF0E2",
                          border: "1px solid #E3D0B8",
                        }}
                      >
                        <ChevronRight className="h-5 w-5" color="#7F9A9A" strokeWidth={2} />
                      </span>
                    </button>
                  );
                })}
              </section>

              <button
                type="button"
                onClick={() => router.push("/login")}
                className="mt-5 h-12 w-full rounded-full border text-[15px] font-semibold"
                style={{
                  borderColor: "#E3D0B8",
                  backgroundColor: "transparent",
                  color: "#12324A",
                  fontFamily: PAGE_FONT_FAMILY,
                }}
              >
                已有账号或想先看演示
              </button>

              <p
                className="mt-3 text-center text-[13px] leading-5"
                style={{ color: "#8A9197" }}
              >
                选择后可在“我的”页面切换身份
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="mt-5 space-y-5">
              <div
                className="rounded-[24px] px-4 py-4"
                style={{
                  backgroundColor: "#FFF9F0",
                  border: "1px solid #E3D0B8",
                  boxShadow: "0 8px 20px rgba(18, 50, 74, 0.04)",
                }}
              >
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="mb-3 flex min-h-0 items-center gap-1 text-sm font-semibold"
                  style={{ color: "#7F9A9A", fontFamily: PAGE_FONT_FAMILY }}
                >
                  <ArrowLeft className="h-4 w-4" />
                  重新选择身份
                </button>
                <p className="text-base font-semibold" style={{ color: "#12324A" }}>
                  当前选择：{roleLabel}
                </p>
                <p className="mt-1 text-sm leading-6" style={{ color: "#5F6B73" }}>
                  先填写最基本的信息，其他内容可以以后再补。
                </p>
              </div>

              <div className="space-y-4">
                <FormInput
                  label="姓名"
                  required
                  value={form.name}
                  onChange={(value) => setForm((current) => ({ ...current, name: value }))}
                  placeholder="请输入您的姓名"
                />
                <FormInput
                  label="手机号，可选"
                  value={form.phone}
                  onChange={(value) => setForm((current) => ({ ...current, phone: value }))}
                  placeholder="方便联系时可填写"
                />
                <FormInput
                  label="所在社区/片区，可选"
                  value={form.area}
                  onChange={(value) => setForm((current) => ({ ...current, area: value }))}
                  placeholder="例如：海湾社区"
                />
              </div>

              {role === "resident" ? (
                <div className="space-y-4" style={{ fontFamily: PAGE_FONT_FAMILY }}>
                  <div>
                    <p className="mb-2 text-sm font-semibold" style={{ color: "#12324A" }}>
                      年龄段
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      {ageOptions.map((item) => (
                        <ChoiceButton
                          key={item}
                          label={item}
                          selected={form.ageGroup === item}
                          onClick={() => setForm((current) => ({ ...current, ageGroup: item }))}
                        />
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="mb-2 text-sm font-semibold" style={{ color: "#12324A" }}>
                      慢病标签，可多选
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      {chronicOptions.map((item) => (
                        <ChoiceButton
                          key={item}
                          label={item}
                          selected={form.chronicTags.includes(item)}
                          onClick={() =>
                            setForm((current) => ({
                              ...current,
                              chronicTags: toggleValue(current.chronicTags, item),
                            }))
                          }
                        />
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="mb-2 text-sm font-semibold" style={{ color: "#12324A" }}>
                      手机使用能力
                    </p>
                    <div className="space-y-2">
                      {phoneSkillOptions.map((item) => (
                        <ChoiceButton
                          key={item}
                          label={item}
                          selected={form.phoneSkill === item}
                          onClick={() => setForm((current) => ({ ...current, phoneSkill: item }))}
                        />
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="mb-2 text-sm font-semibold" style={{ color: "#12324A" }}>
                      居住情况
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      {livingOptions.map((item) => (
                        <ChoiceButton
                          key={item}
                          label={item}
                          selected={form.livingStatus === item}
                          onClick={() => setForm((current) => ({ ...current, livingStatus: item }))}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              ) : null}

              {role === "family" ? (
                <div className="space-y-4" style={{ fontFamily: PAGE_FONT_FAMILY }}>
                  <div>
                    <p className="mb-2 text-sm font-semibold" style={{ color: "#12324A" }}>
                      与老人关系
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      {familyRelationOptions.map((item) => (
                        <ChoiceButton
                          key={item}
                          label={item}
                          selected={form.relation === item}
                          onClick={() => setForm((current) => ({ ...current, relation: item }))}
                        />
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="mb-2 text-sm font-semibold" style={{ color: "#12324A" }}>
                      是否已知道老人姓名
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      {elderKnownOptions.map((item) => (
                        <ChoiceButton
                          key={item}
                          label={item}
                          selected={form.elderKnown === item}
                          onClick={() => setForm((current) => ({ ...current, elderKnown: item }))}
                        />
                      ))}
                    </div>
                  </div>
                  <FormInput
                    label="老人姓名，可选"
                    value={form.elderName}
                    onChange={(value) => setForm((current) => ({ ...current, elderName: value }))}
                    placeholder="知道的话可以填写"
                  />
                </div>
              ) : null}

              {role && !["resident", "family"].includes(role) ? (
                <div className="space-y-4">
                  <FormInput
                    label="所属机构，可选"
                    value={form.organization}
                    onChange={(value) =>
                      setForm((current) => ({ ...current, organization: value }))
                    }
                    placeholder="例如：海湾社区卫生服务中心"
                  />
                  <label className="block" style={{ fontFamily: PAGE_FONT_FAMILY }}>
                    <span className="mb-2 block text-sm font-semibold" style={{ color: "#12324A" }}>
                      职责说明，可选
                    </span>
                    <textarea
                      value={form.responsibility}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          responsibility: event.target.value,
                        }))
                      }
                      placeholder="可以简单写一下您负责的工作"
                      className="min-h-24 w-full rounded-[18px] border px-4 py-3 text-base leading-6 outline-none"
                      style={{
                        borderColor: "#E3D0B8",
                        backgroundColor: "#FFF9F0",
                        color: "#12324A",
                        fontFamily: PAGE_FONT_FAMILY,
                      }}
                    />
                  </label>
                </div>
              ) : null}

              <button
                type="submit"
                disabled={isSaving}
                className="flex w-full items-center justify-center gap-2 rounded-full px-4 py-4 text-base font-semibold transition active:scale-[0.985]"
                style={{
                  backgroundColor: isSaving ? "#7E8B93" : "#12324A",
                  color: "#FFF8EE",
                  boxShadow: "0 14px 28px rgba(18, 50, 74, 0.14)",
                  fontFamily: PAGE_FONT_FAMILY,
                }}
              >
                <Check className="h-5 w-5" />
                {isSaving ? "正在保存..." : "进入家医 Claw"}
              </button>
            </form>
          )}

          <div
            className="mt-6 rounded-[22px] px-4 py-4"
            style={{
              backgroundColor: "#FFF9F0",
              border: "1px solid #EBDCCA",
            }}
          >
            <div className="flex gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" color="#B89157" />
              <p
                className="text-xs leading-5"
                style={{ color: "#5F6B73", fontFamily: PAGE_FONT_FAMILY }}
              >
                家医 Claw 用于慢病服务导航、健康提醒和家医团队协同，不提供诊断、处方、停药、换药或剂量调整建议。紧急情况请及时就医。
              </p>
            </div>
          </div>
        </div>
      </div>
    </PhoneShell>
  );
}
