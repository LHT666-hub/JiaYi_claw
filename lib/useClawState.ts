"use client";

import { useEffect, useRef, useState } from "react";
import {
  adjustPoints,
  appendTaskRecord,
  createMessage,
  defaultState,
  getTodayKey,
  readDemoUser,
  readState,
  writeState,
} from "@/lib/storage";
import { AskFallbackReason, AskSource, ClawState, RiskLevel } from "@/lib/types";

function appendUnique(list: string[], value: string) {
  return list.includes(value) ? list : [...list, value];
}

export function useClawState() {
  const [state, setState] = useState<ClawState>(defaultState);
  const stateRef = useRef<ClawState>(defaultState);

  useEffect(() => {
    const nextState = readState();
    stateRef.current = nextState;
    setState(nextState);
  }, []);

  function commit(updater: (current: ClawState) => ClawState) {
    const next = updater(stateRef.current);
    stateRef.current = next;
    writeState(next);
    setState(next);
  }

  function completeTask(taskId: string, points: number, title = taskId) {
    let changed = false;
    const completedOn = getTodayKey();

    commit((current) => {
      if (current.completedTaskIds.includes(taskId)) {
        return current;
      }

      changed = true;

      return {
        ...current,
        points: current.points + points,
        completedTaskIds: [...current.completedTaskIds, taskId],
      };
    });

    if (changed) {
      adjustPoints(points, "award");
      appendTaskRecord({
        id: `task-record-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        taskId,
        title,
        points,
        completedOn,
        completedAt: new Date().toISOString(),
      });
    }

    return changed;
  }

  function completeCourse(courseId: string, points: number) {
    let changed = false;

    commit((current) => {
      if (current.viewedCourseIds.includes(courseId)) {
        return current;
      }

      changed = true;

      return {
        ...current,
        points: current.points + points,
        viewedCourseIds: [...current.viewedCourseIds, courseId],
      };
    });

    if (changed) {
      adjustPoints(points, "award");
    }

    return changed;
  }

  function redeemReward(itemName: string, points: number) {
    let success = false;

    commit((current) => {
      if (current.points < points) {
        return current;
      }

      success = true;

      return {
        ...current,
        points: current.points - points,
        redeemedItems: [
          {
            id: `reward-${Date.now()}`,
            itemName,
            points,
            createdAt: new Date().toISOString(),
          },
          ...current.redeemedItems,
        ],
      };
    });

    if (success) {
      adjustPoints(-points, "redeem");
    }

    return success;
  }

  function addAskExchange(
    question: string,
    answer: string,
    riskLevel: RiskLevel,
    source?: AskSource,
  ) {
    commit((current) => ({
      ...current,
      askMessages: [
        ...current.askMessages,
        createMessage({
          author: readDemoUser()?.name ?? "当前用户",
          role: "user",
          content: question,
          context: "ask",
        }),
        createMessage({
          author: "家医 Claw",
          role: "assistant",
          content: answer,
          context: "ask",
          riskLevel,
          source,
        }),
      ],
    }));
  }

  function pushAskMessage(
    author: string,
    role: "user" | "assistant",
    content: string,
    riskLevel?: RiskLevel,
    source?: AskSource,
    reason?: AskFallbackReason,
  ) {
    commit((current) => ({
      ...current,
      askMessages: [
        ...current.askMessages,
        createMessage({
          author,
          role,
          content,
          context: "ask",
          riskLevel,
          source,
          reason,
        }),
      ],
    }));
  }

  function addAskAssistantMessage(
    content: string,
    riskLevel?: RiskLevel,
    source?: AskSource,
    reason?: AskFallbackReason,
  ) {
    commit((current) => ({
      ...current,
      askMessages: [
        ...current.askMessages,
        createMessage({
          author: "家医 Claw",
          role: "assistant",
          content,
          context: "ask",
          riskLevel,
          source,
          reason,
        }),
      ],
    }));
  }

  function addGroupExchange(
    author: string,
    role: "user" | "assistant" | "doctor" | "nurse" | "leader" | "family",
    content: string,
    response?: {
      content: string;
      riskLevel?: RiskLevel;
      author?: string;
    },
  ) {
    commit((current) => {
      const nextMessages = [
        ...current.groupMessages,
        createMessage({
          author,
          role,
          content,
          context: "group",
        }),
      ];

      if (response) {
        nextMessages.push(
          createMessage({
            author: response.author ?? "Claw 群助手",
            role: "assistant",
            content: response.content,
            context: "group",
            riskLevel: response.riskLevel,
          }),
        );
      }

      return {
        ...current,
        groupMessages: nextMessages,
      };
    });
  }

  function pushGroupMessage(
    author: string,
    role: "user" | "assistant" | "doctor" | "nurse" | "leader" | "family",
    content: string,
    riskLevel?: RiskLevel,
  ) {
    commit((current) => ({
      ...current,
      groupMessages: [
        ...current.groupMessages,
        createMessage({
          author,
          role,
          content,
          context: "group",
          riskLevel,
        }),
      ],
    }));
  }

  function completeGroupCheckIn(points = 5) {
    const today = getTodayKey();
    let changed = false;

    commit((current) => {
      if (current.groupCheckInDates.includes(today)) {
        return current;
      }

      changed = true;

      return {
        ...current,
        points: current.points + points,
        groupCheckInDates: [...current.groupCheckInDates, today],
        completedTaskIds: appendUnique(current.completedTaskIds, "task-group-reply"),
      };
    });

    if (changed) {
      adjustPoints(points, "award");
      appendTaskRecord({
        id: `group-checkin-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        taskId: "task-group-reply",
        title: "进群回复一句",
        points,
        completedOn: today,
        completedAt: new Date().toISOString(),
      });
    }

    return changed;
  }

  function requestContact(contactId: string) {
    commit((current) => ({
      ...current,
      contactRequestIds: appendUnique(current.contactRequestIds, contactId),
    }));
  }

  function pushDirectMessage(
    threadId: string,
    author: string,
    role: "user" | "assistant" | "doctor" | "nurse" | "leader" | "family",
    content: string,
    riskLevel?: RiskLevel,
  ) {
    commit((current) => ({
      ...current,
      directMessages: {
        ...current.directMessages,
        [threadId]: [
          ...(current.directMessages[threadId] ?? []),
          createMessage({
            author,
            role,
            content,
            context: "direct",
            threadId,
            riskLevel,
          }),
        ],
      },
    }));
  }

  function markNotificationsRead(notificationIds: string[]) {
    commit((current) => {
      const merged = [...new Set([...current.readNotificationIds, ...notificationIds])];

      if (merged.length === current.readNotificationIds.length) {
        return current;
      }

      return {
        ...current,
        readNotificationIds: merged,
      };
    });
  }

  function confirmFollowup(response: string, points = 10) {
    let changed = false;

    commit((current) => {
      if (current.followupConfirmed) {
        return {
          ...current,
          followupResponse: response,
          followupLastConfirmedAt: new Date().toISOString(),
        };
      }

      changed = true;

      return {
        ...current,
        points: current.points + points,
        followupConfirmed: true,
        followupResponse: response,
        followupLastConfirmedAt: new Date().toISOString(),
        readNotificationIds: current.readNotificationIds.includes("notification-followup")
          ? current.readNotificationIds
          : [...current.readNotificationIds, "notification-followup"],
        completedTaskIds: appendUnique(current.completedTaskIds, "task-followup-confirm"),
      };
    });

    if (changed) {
      adjustPoints(points, "award");
      appendTaskRecord({
        id: `followup-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        taskId: "task-followup-confirm",
        title: "完成随访确认",
        points,
        completedOn: getTodayKey(),
        completedAt: new Date().toISOString(),
      });
    }

    return changed;
  }

  return {
    state,
    completeTask,
    completeCourse,
    redeemReward,
    addAskExchange,
    addAskAssistantMessage,
    pushAskMessage,
    addGroupExchange,
    pushGroupMessage,
    completeGroupCheckIn,
    requestContact,
    pushDirectMessage,
    markNotificationsRead,
    confirmFollowup,
  };
}
