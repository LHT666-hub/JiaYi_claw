import type { ReactNode } from "react";

export function ResidentPageHeader({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <header className="resident-page-header flex min-h-16 items-center justify-between gap-4 pb-2">
      <h1 className="page-title">{title}</h1>
      {action}
    </header>
  );
}
