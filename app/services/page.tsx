"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Activity,
  ChevronRight,
  ClipboardList,
  Pill,
  Sparkles,
  Stethoscope,
  UserRoundPlus,
} from "lucide-react";
import { BackHeader } from "@/components/BackHeader";
import { EmptyState } from "@/components/EmptyState";
import { PhoneShell } from "@/components/PhoneShell";
import { SectionCard } from "@/components/SectionCard";
import {
  getCurrentServiceOwnerLabel,
  getCurrentServiceStepTitle,
} from "@/lib/agentTaskPayload";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { fetchCurrentProfile } from "@/lib/supabase/mvp";
import { mapLocalTodoToProgress, serviceStatusLabelMap } from "@/lib/serviceProgress";
import {
  getFamilyBindingsForFamily,
  getTodoStatusEvents,
  readDoctorTodos,
} from "@/lib/storage";
import type { DemoUser, ProfileRow, ResidentTodoProgressItem } from "@/lib/types";
import { useDemoUser } from "@/lib/useDemoUser";

type AuthMode = "loading" | "supabase" | "demo" | "none";

type ServiceScenario = {
  title: string;
  description: string;
  href: string;
  icon: typeof ClipboardList;
  examples: string[];
};

const serviceScenarios: ServiceScenario[] = [
  {
    title: "今日坐班与挂号",
    description: "先查今天谁坐班、还有没有号，再一键发起预约。",
    href: "/ask?q=今天谁能看高血压？",
    icon: Stethoscope,
    examples: ["今天有哪些医生坐班", "今天谁能看高血压", "下午还有号吗"],
  },
  {
    title: "家庭医生预约",
    description: "家医面诊、电话回访、上门服务协调都从这里发起。",
    href: "/ask?q=帮我约一下家庭医生&serviceType=familyDoctor&serviceMode=either&preferredDate=明天&preferredTime=下午",
    icon: UserRoundPlus,
    examples: ["帮我约一下家庭医生", "我想约明天下午面诊", "能安排电话回访吗"],
  },
  {
    title: "续方与配药申请",
    description: "药快吃完、想续上次处方、确认是否能直接配药。",
    href: "/ask?q=我药快吃完了，帮我续方",
    icon: Pill,
    examples: ["我要配上次那个药", "我药快吃完了", "帮我开一下之前那个糖尿病药"],
  },
  {
    title: "配药进度",
    description: "查看现在卡在医生、药师还是药房，确认自取或邮寄。",
    href: "/ask?q=药配好了吗？&serviceType=dispenseStatus&progressFocus=any&deliveryMethod=either",
    icon: Activity,
    examples: ["药配好了吗", "可以取药了吗", "寄出了吗"],
  },
  {
    title: "随访与复诊提醒",
    description: "确认下一次随访、复诊、复查与提醒安排。",
    href: "/ask?q=提醒我复诊&serviceType=followup&followupType=clinic_review&preferredDate=本周",
    icon: Sparkles,
    examples: ["提醒我复诊", "下次随访是什么时候", "帮我安排复查提醒"],
  },
];

function buildLocalProgressItems(currentUser: DemoUser) {
  const todos = readDoctorTodos();
  const bindings = currentUser.role === "family" ? getFamilyBindingsForFamily(currentUser.id) : [];

  const filtered = todos.filter((todo) => {
    if (currentUser.role === "resident") {
      return todo.residentId === currentUser.id || todo.residentName === currentUser.name;
    }

    if (currentUser.role === "family") {
      return bindings.some(
        (binding) => todo.residentId === binding.residentId || todo.residentName === binding.residentName,
      );
    }

    return false;
  });

  return filtered.map((todo) =>
    mapLocalTodoToProgress({
      todo,
      statusEvents: getTodoStatusEvents(todo.id),
    }),
  );
}

function buildRegistrationPrompt(form: {
  symptom: string;
  department: string;
  preferredDate: string;
  preferredTime: string;
}) {
  const target = form.department || form.symptom || "相关门诊";
  const dateText = form.preferredDate || "明天";
  const timeText = form.preferredTime || "下午";
  return `帮我预约${dateText}${timeText}看${target}，请推荐合适的医生`;
}

function buildRefillPrompt(form: {
  medicineName: string;
  disease: string;
  deliveryMethod: string;
  stockLeft: string;
}) {
  const disease = form.disease || "慢病";
  const medicine = form.medicineName || "上次那个药";
  const delivery =
    form.deliveryMethod === "pickup"
      ? "我想自取"
      : form.deliveryMethod === "mail"
        ? "我想邮寄"
        : "自取或邮寄都可以";
  const stock = form.stockLeft || "药快吃完了";
  return `我要续方配药，${disease}用的${medicine}，${stock}，${delivery}，请帮我发起续方申请`;
}

function ActiveTaskCard({ item }: { item: ResidentTodoProgressItem }) {
  const currentStepTitle = getCurrentServiceStepTitle(item.serviceTask);
  const currentOwnerLabel = getCurrentServiceOwnerLabel(item.serviceTask);

  return (
    <div className="rounded-[22px] border border-line/60 bg-surface-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-navy">
            {item.serviceTask?.task.title ?? item.title}
          </p>
          <p className="mt-1 text-xs text-navy/50">{item.residentName}</p>
        </div>
        <span className="rounded-full border border-amber/20 bg-amber/15 px-2.5 py-0.5 text-[11px] font-semibold text-amber">
          {serviceStatusLabelMap[item.status]}
        </span>
      </div>
      <p className="mt-3 text-sm leading-6 text-navy/72">{item.summary}</p>
      <div className="mt-3 rounded-[16px] bg-cream px-3 py-3 text-xs leading-5 text-navy/62">
        <p>当前节点：{currentStepTitle ?? "等待团队回写"}</p>
        <p>当前处理人：{currentOwnerLabel ?? item.recommendedRoleLabel ?? "家庭医生"}</p>
      </div>
      <div className="mt-3 flex gap-2">
        <Link
          href="/service-progress"
          className="rounded-full bg-navy px-4 py-2 text-xs font-semibold text-white"
        >
          查看进度
        </Link>
        <Link
          href="/contacts"
          className="rounded-full border border-line bg-cream px-4 py-2 text-xs font-semibold text-navy"
        >
          联系团队
        </Link>
      </div>
    </div>
  );
}

export default function ServicesPage() {
  const router = useRouter();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const { currentUser, isReady } = useDemoUser();
  const [authMode, setAuthMode] = useState<AuthMode>("loading");
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [items, setItems] = useState<ResidentTodoProgressItem[]>([]);
  const [registrationForm, setRegistrationForm] = useState({
    symptom: "",
    department: "",
    preferredDate: "明天",
    preferredTime: "下午",
  });
  const [refillForm, setRefillForm] = useState({
    medicineName: "",
    disease: "",
    deliveryMethod: "mail",
    stockLeft: "药快吃完了",
  });

  useEffect(() => {
    let active = true;

    async function bootstrap() {
      if (supabase) {
        try {
          const currentProfile = await fetchCurrentProfile(supabase);
          if (!active) {
            return;
          }

          if (currentProfile) {
            setProfile(currentProfile);
            setAuthMode("supabase");

            if (
              currentProfile.role === "resident" ||
              currentProfile.role === "family" ||
              currentProfile.role === "admin"
            ) {
              const response = await fetch("/api/resident/todos", {
                method: "GET",
                cache: "no-store",
              });
              const payload = (await response.json().catch(() => ({}))) as {
                todos?: ResidentTodoProgressItem[];
              };
              setItems(payload.todos ?? []);
            } else {
              setItems([]);
            }
            return;
          }
        } catch {
          // fall through to demo mode
        }
      }

      if (!isReady) {
        return;
      }

      if (currentUser) {
        setAuthMode("demo");
        setItems(buildLocalProgressItems(currentUser));
        return;
      }

      setAuthMode("none");
    }

    void bootstrap();

    return () => {
      active = false;
    };
  }, [currentUser, isReady, supabase]);

  const title =
    profile?.role === "family" || currentUser?.role === "family" ? "家属服务中心" : "服务中心";

  const subtitle =
    profile?.role === "family" || currentUser?.role === "family"
      ? "帮老人查坐班、约家医、续方和看进度，都集中在这里。"
      : "把自然语言需求变成服务任务，从这里统一发起和跟进。";

  const activeItems = items.filter((item) => item.status !== "ignored").slice(0, 4);
  const registrationPrompt = buildRegistrationPrompt(registrationForm);
  const refillPrompt = buildRefillPrompt(refillForm);
  const registrationHref = `/ask?q=${encodeURIComponent(registrationPrompt)}&serviceType=registration&symptom=${encodeURIComponent(
    registrationForm.symptom,
  )}&department=${encodeURIComponent(registrationForm.department)}&preferredDate=${encodeURIComponent(
    registrationForm.preferredDate,
  )}&preferredTime=${encodeURIComponent(registrationForm.preferredTime)}`;
  const refillHref = `/ask?q=${encodeURIComponent(refillPrompt)}&serviceType=refill&medicineName=${encodeURIComponent(
    refillForm.medicineName,
  )}&disease=${encodeURIComponent(refillForm.disease)}&stockLeft=${encodeURIComponent(
    refillForm.stockLeft,
  )}&deliveryMethod=${encodeURIComponent(refillForm.deliveryMethod)}`;
  const registrationValid = Boolean(registrationForm.symptom.trim() || registrationForm.department.trim());
  const refillValid = Boolean(refillForm.medicineName.trim() && refillForm.disease.trim());

  return (
    <PhoneShell showBottomNav>
      <div className="space-y-5 px-4 pb-8">
        <BackHeader title={title} subtitle={subtitle} />

        <SectionCard>
          <div className="rounded-[26px] border border-sage/20 bg-[linear-gradient(145deg,#EEF5EF_0%,#F8FBF6_100%)] p-5">
            <p className="text-lg font-semibold text-navy">Agent 驱动的家医服务流</p>
            <p className="mt-2 text-sm leading-6 text-navy/66">
              文字或语音需求会先被识别为服务意图，再转成结构化任务，继续流转到医生、药师、药房等人工节点。
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link
                href="/ask"
                className="rounded-full bg-navy px-4 py-2 text-xs font-semibold text-white"
              >
                直接问 Claw
              </Link>
              <Link
                href="/service-progress"
                className="rounded-full border border-line bg-cream px-4 py-2 text-xs font-semibold text-navy"
              >
                查看服务进度
              </Link>
            </div>
          </div>
        </SectionCard>

        <SectionCard title="快捷发起">
          <div className="space-y-4">
            <div className="rounded-[24px] border border-line/60 bg-surface-card p-4">
              <div className="flex items-center gap-3">
                <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-health-muted text-sage">
                  <Stethoscope className="h-5 w-5" />
                </span>
                <div>
                  <p className="text-sm font-semibold text-navy">挂号/门诊预约申请</p>
                  <p className="mt-1 text-xs leading-5 text-navy/60">
                    先补充症状、目标科室和想看的时间，Claw 会继续匹配合适医生并发起挂号协助。
                  </p>
                </div>
              </div>
              <div className="mt-4 grid grid-cols-1 gap-3">
                <input
                  value={registrationForm.symptom}
                  onChange={(event) =>
                    setRegistrationForm((current) => ({ ...current, symptom: event.target.value }))
                  }
                  placeholder="想看什么问题，例如心脏不舒服、膝盖关节痛"
                  className="rounded-[16px] border border-line bg-cream px-4 py-3 text-sm text-navy outline-none placeholder:text-navy/35"
                />
                <input
                  value={registrationForm.department}
                  onChange={(event) =>
                    setRegistrationForm((current) => ({ ...current, department: event.target.value }))
                  }
                  placeholder="目标门诊或疾病方向，例如高血压门诊、心内科"
                  className="rounded-[16px] border border-line bg-cream px-4 py-3 text-sm text-navy outline-none placeholder:text-navy/35"
                />
                <div className="grid grid-cols-2 gap-3">
                  <select
                    value={registrationForm.preferredDate}
                    onChange={(event) =>
                      setRegistrationForm((current) => ({ ...current, preferredDate: event.target.value }))
                    }
                    className="rounded-[16px] border border-line bg-cream px-4 py-3 text-sm text-navy outline-none"
                  >
                    <option value="今天">今天</option>
                    <option value="明天">明天</option>
                    <option value="后天">后天</option>
                    <option value="本周">本周</option>
                  </select>
                  <select
                    value={registrationForm.preferredTime}
                    onChange={(event) =>
                      setRegistrationForm((current) => ({ ...current, preferredTime: event.target.value }))
                    }
                    className="rounded-[16px] border border-line bg-cream px-4 py-3 text-sm text-navy outline-none"
                  >
                    <option value="上午">上午</option>
                    <option value="下午">下午</option>
                    <option value="晚上">晚上</option>
                    <option value="全天">全天</option>
                  </select>
                </div>
              </div>
              <div className="mt-4 rounded-[16px] bg-cream px-3 py-3 text-xs leading-5 text-navy/62">
                将向 Agent 发送：{registrationPrompt}
              </div>
              {!registrationValid ? (
                <p className="mt-2 text-xs leading-5 text-danger/85">
                  请至少补充症状或目标门诊，再发起挂号申请。
                </p>
              ) : null}
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => {
                    if (!registrationValid) return;
                    router.push(registrationHref);
                  }}
                  disabled={!registrationValid}
                  className={`rounded-full px-4 py-2 text-xs font-semibold text-white ${
                    registrationValid ? "bg-navy active:scale-95" : "bg-navy/35"
                  }`}
                >
                  发起挂号申请
                </button>
                <Link
                  href="/ask?q=今天谁能看高血压？"
                  className="rounded-full border border-line bg-cream px-4 py-2 text-xs font-semibold text-navy"
                >
                  先看今天坐班
                </Link>
              </div>
            </div>

            <div className="rounded-[24px] border border-line/60 bg-surface-card p-4">
              <div className="flex items-center gap-3">
                <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-health-muted text-sage">
                  <Pill className="h-5 w-5" />
                </span>
                <div>
                  <p className="text-sm font-semibold text-navy">续方/配药申请</p>
                  <p className="mt-1 text-xs leading-5 text-navy/60">
                    先补充药名、慢病类型和交付方式，系统会按续方流程推进到医生、药师和药房。
                  </p>
                </div>
              </div>
              <div className="mt-4 grid grid-cols-1 gap-3">
                <input
                  value={refillForm.medicineName}
                  onChange={(event) =>
                    setRefillForm((current) => ({ ...current, medicineName: event.target.value }))
                  }
                  placeholder="药名，例如厄贝沙坦、二甲双胍"
                  className="rounded-[16px] border border-line bg-cream px-4 py-3 text-sm text-navy outline-none placeholder:text-navy/35"
                />
                <input
                  value={refillForm.disease}
                  onChange={(event) =>
                    setRefillForm((current) => ({ ...current, disease: event.target.value }))
                  }
                  placeholder="慢病类型，例如高血压、糖尿病"
                  className="rounded-[16px] border border-line bg-cream px-4 py-3 text-sm text-navy outline-none placeholder:text-navy/35"
                />
                <div className="grid grid-cols-2 gap-3">
                  <select
                    value={refillForm.stockLeft}
                    onChange={(event) =>
                      setRefillForm((current) => ({ ...current, stockLeft: event.target.value }))
                    }
                    className="rounded-[16px] border border-line bg-cream px-4 py-3 text-sm text-navy outline-none"
                  >
                    <option value="药快吃完了">药快吃完了</option>
                    <option value="还剩 3 天药量">还剩 3 天药量</option>
                    <option value="还剩 1 周药量">还剩 1 周药量</option>
                  </select>
                  <select
                    value={refillForm.deliveryMethod}
                    onChange={(event) =>
                      setRefillForm((current) => ({ ...current, deliveryMethod: event.target.value }))
                    }
                    className="rounded-[16px] border border-line bg-cream px-4 py-3 text-sm text-navy outline-none"
                  >
                    <option value="mail">邮寄到家</option>
                    <option value="pickup">到店自取</option>
                    <option value="either">都可以</option>
                  </select>
                </div>
              </div>
              <div className="mt-4 rounded-[16px] bg-cream px-3 py-3 text-xs leading-5 text-navy/62">
                将向 Agent 发送：{refillPrompt}
              </div>
              {!refillValid ? (
                <p className="mt-2 text-xs leading-5 text-danger/85">
                  请补充药品名称和慢病类型，再发起续方申请。
                </p>
              ) : null}
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => {
                    if (!refillValid) return;
                    router.push(refillHref);
                  }}
                  disabled={!refillValid}
                  className={`rounded-full px-4 py-2 text-xs font-semibold text-white ${
                    refillValid ? "bg-navy active:scale-95" : "bg-navy/35"
                  }`}
                >
                  发起续方申请
                </button>
                <Link
                  href="/ask?q=药配好了吗？"
                  className="rounded-full border border-line bg-cream px-4 py-2 text-xs font-semibold text-navy"
                >
                  查看配药进度
                </Link>
              </div>
            </div>
          </div>
        </SectionCard>

        <SectionCard title="常见服务场景">
          <div className="space-y-3">
            {serviceScenarios.map((scenario) => {
              const Icon = scenario.icon;
              return (
                <Link
                  key={scenario.title}
                  href={scenario.href}
                  className="block rounded-[24px] border border-line/60 bg-surface-card p-4 active:scale-[0.98]"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex gap-3">
                      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-health-muted text-sage">
                        <Icon className="h-5 w-5" />
                      </span>
                      <div>
                        <p className="text-sm font-semibold text-navy">{scenario.title}</p>
                        <p className="mt-1 text-xs leading-5 text-navy/60">{scenario.description}</p>
                      </div>
                    </div>
                    <ChevronRight className="mt-1 h-4 w-4 text-navy/35" />
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {scenario.examples.map((example) => (
                      <span
                        key={example}
                        className="rounded-full border border-line/70 bg-cream px-3 py-1 text-[11px] font-semibold text-navy/68"
                      >
                        {example}
                      </span>
                    ))}
                  </div>
                </Link>
              );
            })}
          </div>
        </SectionCard>

        <SectionCard
          title="正在推进的服务任务"
          action={
            <Link href="/service-progress" className="text-sm font-semibold text-sage">
              全部进度
            </Link>
          }
        >
          {authMode === "loading" ? (
            <p className="text-sm text-navy/60">正在读取当前服务任务...</p>
          ) : activeItems.length ? (
            <div className="space-y-3">
              {activeItems.map((item) => (
                <ActiveTaskCard key={item.id} item={item} />
              ))}
            </div>
          ) : (
            <EmptyState
              title="还没有正在推进的服务任务"
              description="先从上面的场景入口发起服务，生成任务后这里会显示当前节点。"
            />
          )}
        </SectionCard>
      </div>
    </PhoneShell>
  );
}
