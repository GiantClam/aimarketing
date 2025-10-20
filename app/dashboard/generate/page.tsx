import { DashboardLayout } from "@/components/dashboard-layout"
import { ContentGenerator } from "@/components/content-generator"

export default function GeneratePage() {
  return (
    <DashboardLayout>
      <ContentGenerator />
    </DashboardLayout>
  )
}
