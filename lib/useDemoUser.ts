"use client";

import { useEffect, useState } from "react";
import { demoUsers } from "@/data/demoUsers";
import { clearDemoUser, readDemoUser, writeDemoUser } from "@/lib/storage";
import { AppRole, DemoUser } from "@/lib/types";

const staffRoles: AppRole[] = ["doctor", "nurse", "pharmacist", "community", "admin"];

function emitChange() {
  window.dispatchEvent(new Event("claw-demo-user-change"));
}

export function getCurrentUser() {
  return readDemoUser();
}

export function loginAs(user: DemoUser) {
  writeDemoUser(user);
  emitChange();
}

export function logout() {
  clearDemoUser();
  emitChange();
}

export function hasRole(role: AppRole) {
  return getCurrentUser()?.role === role;
}

export function isStaffRole(role?: AppRole | null) {
  return Boolean(role && staffRoles.includes(role));
}

export function useDemoUser() {
  const [currentUser, setCurrentUser] = useState<DemoUser | null>(() => readDemoUser());

  useEffect(() => {
    function syncUser() {
      setCurrentUser(readDemoUser());
    }

    syncUser();
    window.addEventListener("storage", syncUser);
    window.addEventListener("claw-demo-user-change", syncUser);

    return () => {
      window.removeEventListener("storage", syncUser);
      window.removeEventListener("claw-demo-user-change", syncUser);
    };
  }, []);

  return {
    currentUser,
    allUsers: demoUsers,
    hasRole: (role: AppRole) => currentUser?.role === role,
    isStaffRole: isStaffRole(currentUser?.role),
    loginAs,
    logout,
  };
}
