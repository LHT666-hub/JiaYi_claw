import { notFound } from "next/navigation";
import type { ReactNode } from "react";

export default function DemoCenterLayout({ children }: { children: ReactNode }) {
  if (process.env.NEXT_PUBLIC_DEMO_MODE !== "true") {
    notFound();
  }

  return children;
}
