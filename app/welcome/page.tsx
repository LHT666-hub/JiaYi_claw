"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, ArrowLeft, Check, ChevronRight } from "lucide-react";
import { PhoneShell } from "@/components/PhoneShell";
import { useToast } from "@/components/ToastProvider";
import {
  createLocalUser,
  getPostOnboardingPath,
  getOnboardingRoleLabel,
  roleOptions,
  saveCurrentUser,
} from "@/lib/onboarding";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { AppRole } from "@/lib/types";

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
      className={`rounded-[18px] border px-4 py-3 text-left text-sm font-semibold transition active:scale-[0.98] ${
        selected
          ? "border-navy bg-navy text-white shadow-soft"
          : "border-line bg-[#FFF8ED] text-navy"
      }`}
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
    <label className="block">
      <span className="mb-2 block text-sm font-semibold text-navy">
        {label}
        {required ? <span className="text-danger"> *</span> : null}
      </span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="h-[52px] w-full rounded-[18px] border border-line bg-[#FFF8ED] px-4 text-base text-navy outline-none transition placeholder:text-navy/36 focus:border-sage focus:ring-1 focus:ring-sage/30"
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
      <div className="min-h-full bg-[#F3DDC2] px-4 pb-8 pt-8">
        <div className="rounded-[30px] border border-line bg-[#FFF4E2] p-5 shadow-soft">
          <div className="text-center">
            <p className="font-brand text-[2rem] font-semibold leading-tight text-navy">
              欢迎使用家医 Claw
            </p>
            <p className="mt-3 text-sm leading-6 text-navy/66">
              请选择您的身份，家医 Claw 会根据您的角色显示合适的服务入口。
            </p>
          </div>

          <div className="mt-5 flex items-center justify-center gap-2 text-xs font-semibold text-navy/56">
            <span className={step === 1 ? "text-navy" : ""}>1 选择身份</span>
            <span className="h-px w-8 bg-line" />
            <span className={step === 2 ? "text-navy" : ""}>2 填写信息</span>
          </div>

          {step === 1 ? (
            <div className="mt-6 space-y-3">
              {roleOptions.map((item) => (
                <button
                  key={item.role}
                  type="button"
                  onClick={() => {
                    setRole(item.role);
                    setStep(2);
                  }}
                  className="flex w-full items-center justify-between gap-4 rounded-[24px] border border-line bg-[#FFF8ED] px-4 py-4 text-left transition active:scale-[0.98] active:bg-[#F7ECDA]"
                >
                  <span>
                    <span className="block text-base font-semibold text-navy">{item.label}</span>
                    <span className="mt-1 block text-sm leading-6 text-navy/62">
                      {item.description}
                    </span>
                  </span>
                  <ChevronRight className="h-5 w-5 shrink-0 text-sage" />
                </button>
              ))}

              <button
                type="button"
                onClick={() => router.push("/login")}
                className="mt-3 w-full rounded-full border border-line bg-[#FFF8ED] px-4 py-3.5 text-sm font-semibold text-navy"
              >
                已有账号或想先看演示
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="mt-6 space-y-5">
              <div className="rounded-[22px] bg-[#FAE9D4] px-4 py-3">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="mb-2 flex min-h-0 items-center gap-1 text-sm font-semibold text-sage"
                >
                  <ArrowLeft className="h-4 w-4" />
                  重新选身份
                </button>
                <p className="text-base font-semibold text-navy">当前选择：{roleLabel}</p>
                <p className="mt-1 text-sm leading-6 text-navy/62">
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
                <div className="space-y-4">
                  <div>
                    <p className="mb-2 text-sm font-semibold text-navy">年龄段</p>
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
                    <p className="mb-2 text-sm font-semibold text-navy">慢病标签，可多选</p>
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
                    <p className="mb-2 text-sm font-semibold text-navy">手机使用能力</p>
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
                    <p className="mb-2 text-sm font-semibold text-navy">居住情况</p>
                    <div className="grid grid-cols-2 gap-2">
                      {livingOptions.map((item) => (
                        <ChoiceButton
                          key={item}
                          label={item}
                          selected={form.livingStatus === item}
                          onClick={() =>
                            setForm((current) => ({ ...current, livingStatus: item }))
                          }
                        />
                      ))}
                    </div>
                  </div>
                </div>
              ) : null}

              {role === "family" ? (
                <div className="space-y-4">
                  <div>
                    <p className="mb-2 text-sm font-semibold text-navy">与老人关系</p>
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
                    <p className="mb-2 text-sm font-semibold text-navy">是否已知道老人姓名</p>
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
                  <label className="block">
                    <span className="mb-2 block text-sm font-semibold text-navy">
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
                      className="min-h-24 w-full rounded-[18px] border border-line bg-[#FFF8ED] px-4 py-3 text-base leading-6 text-navy outline-none transition placeholder:text-navy/36 focus:border-sage focus:ring-1 focus:ring-sage/30"
                    />
                  </label>
                </div>
              ) : null}

              <button
                type="submit"
                disabled={isSaving}
                className={`flex w-full items-center justify-center gap-2 rounded-full px-4 py-4 text-base font-semibold text-white shadow-soft active:scale-[0.98] ${
                  isSaving ? "bg-navy/60" : "bg-navy"
                }`}
              >
                <Check className="h-5 w-5" />
                {isSaving ? "正在保存..." : "进入家医 Claw"}
              </button>
            </form>
          )}

          <div className="mt-6 rounded-[22px] border border-line bg-[#FFF8ED] px-4 py-4">
            <div className="flex gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber" />
              <p className="text-xs leading-5 text-navy/64">
                家医 Claw 用于慢病服务导航、健康提醒和家医团队协同，不提供诊断、处方、停药、换药或剂量调整建议。紧急情况请及时就医。
              </p>
            </div>
          </div>
        </div>
      </div>
    </PhoneShell>
  );
}
