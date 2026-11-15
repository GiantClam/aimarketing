import type { ReactNode } from "react"
import type { Metadata } from "next"

import { DashboardLayout } from "@/components/dashboard-layout"

export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
  },
}

export default function DashboardRootLayout({ children }: { children: ReactNode }) {
  return <DashboardLayout>{children}</DashboardLayout>
}
