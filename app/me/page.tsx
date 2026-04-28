"use client";

import Image from "next/image";
import Link from "next/link";
import { ChevronRight, Settings, Users } from "lucide-react";
import { BackHeader } from "@/components/BackHeader";
import { EmptyState } from "@/components/EmptyState";
import { PhoneShell } from "@/components/PhoneShell";
import { PointsBadge } from "@/components/PointsBadge";
import { SectionCard } from "@/components/SectionCard";
import { contacts } from "@/data/contacts";
import { tasks } from "@/data/tasks";
import { useClawState } from "@/lib/useClawState";

export default function MePage() {
  const { state } = useClawState();
  const completedTasks = tasks.filter((task) => state.completedTaskIds.includes(task.id)).slice(0, 5);
  const doctorTeam = contacts.filter((contact) => contact.group === "doctorTeam");
  const familyMembers = contacts.filter((contact) => contact.group === "family");

  return (
    <PhoneShell>
      <div className="space-y-5 px-4 pb-8">
        <BackHeader title="我的" />

        <SectionCard>
          <div className="flex items-center gap-4">
            <div className="flex h-20 w-20 items-center justify-center rounded-full border border-line bg-cream text-3xl font-semibold text-navy shadow-soft">
              张
            </div>
            <div>
              <h2 className="text-[1.5rem] font-semibold text-navy">张阿姨</h2>
              <p className="mt-1 text-sm text-navy/62">72 岁</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <span className="rounded-full bg-[#EAF1EF] px-3 py-1 text-xs font-semibold text-sage">
                  高血压
                </span>
                <span className="rounded-full bg-[#FFF0DF] px-3 py-1 text-xs font-semibold text-amber">
                  糖尿病
                </span>
              </div>
            </div>
          </div>
        </SectionCard>

        <SectionCard title="我的积分" action={<PointsBadge points={state.points} />}>
          <p className="text-sm leading-6 text-navy/68">
            已记录任务完成、看课积分、小组打卡和兑换记录。
          </p>
        </SectionCard>

        <SectionCard title="我的家医团队">
          <div className="space-y-3">
            {doctorTeam.map((contact) => (
              <div
                key={contact.id}
                className="flex items-center justify-between rounded-[22px] bg-[#FFF8ED] px-4 py-3"
              >
                <div className="flex items-center gap-3">
                  <div className="relative h-12 w-12 overflow-hidden rounded-full border border-white/60 bg-[#F6E9D7] shadow-soft">
                    {contact.avatarPath ? (
                      <Image
                        src={contact.avatarPath}
                        alt={contact.name}
                        fill
                        sizes="48px"
                        className="object-cover"
                      />
                    ) : null}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-navy">{contact.name}</p>
                    <p className="mt-1 text-xs text-navy/56">{contact.role}</p>
                  </div>
                </div>
                <Users className="h-4 w-4 text-sage" />
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard title="我的家人联系人">
          <div className="space-y-3">
            {familyMembers.map((contact) => (
              <div key={contact.id} className="rounded-[22px] bg-[#FFF8ED] px-4 py-3">
                <div className="flex items-center gap-3">
                  <div className="relative h-12 w-12 overflow-hidden rounded-full border border-white/60 bg-[#F6E9D7] shadow-soft">
                    {contact.avatarPath ? (
                      <Image
                        src={contact.avatarPath}
                        alt={contact.name}
                        fill
                        sizes="48px"
                        className="object-cover"
                      />
                    ) : null}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-navy">{contact.name}</p>
                    <p className="mt-1 text-xs text-navy/56">{contact.role}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard title="我的健康小组">
          <div className="rounded-[22px] bg-[#FFF8ED] px-4 py-4">
            <p className="text-base font-semibold text-navy">高血压互助小组</p>
            <p className="mt-2 text-sm leading-6 text-navy/66">
              组长：王阿姨，今日 12 人已打卡
            </p>
          </div>
        </SectionCard>

        <SectionCard title="我的打卡记录">
          <div className="space-y-3">
            {completedTasks.length ? (
              completedTasks.map((task) => (
                <div key={task.id} className="rounded-[22px] bg-[#FFF8ED] px-4 py-3">
                  <p className="text-sm font-semibold text-navy">{task.title}</p>
                  <p className="mt-1 text-xs text-navy/56">{task.description}</p>
                </div>
              ))
            ) : (
              <EmptyState
                title="今天还没有新的打卡记录"
                description="可以先从服药、看小课或完成随访确认开始，系统会把记录整理到这里。"
              />
            )}
          </div>
        </SectionCard>

        <SectionCard title="我的兑换记录">
          <div className="space-y-3">
            {state.redeemedItems.length ? (
              state.redeemedItems.map((item) => (
                <div key={item.id} className="rounded-[22px] bg-[#FFF8ED] px-4 py-3">
                  <p className="text-sm font-semibold text-navy">{item.itemName}</p>
                  <p className="mt-1 text-xs text-navy/56">已扣除 {item.points} 分</p>
                </div>
              ))
            ) : (
              <EmptyState
                title="还没有兑换记录"
                description="坚持完成日常任务和小组打卡后，就可以来这里查看兑换过的大米、药盒和健康支持服务。"
              />
            )}
          </div>
        </SectionCard>

        <SectionCard title="设置">
          <div className="flex items-center justify-between rounded-[22px] bg-[#FFF8ED] px-4 py-4">
            <div className="flex items-center gap-3">
              <Settings className="h-4 w-4 text-sage" />
              <span className="text-sm font-semibold text-navy">提醒、隐私与展示设置</span>
            </div>
            <ChevronRight className="h-4 w-4 text-navy/45" />
          </div>
          <div className="mt-4 text-right">
            <Link href="/doctor" className="text-sm text-navy/48 underline underline-offset-4">
              家医团队工作台
            </Link>
          </div>
        </SectionCard>
      </div>
    </PhoneShell>
  );
}
