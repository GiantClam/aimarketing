"use client"
import { DashboardLayout } from "@/components/dashboard-layout"
import { ContentTemplates } from "@/components/content-templates"

export default function TemplatesPage() {
  const handleTemplateSelect = (template: any) => {
    // Navigate to chat with template prompt
    console.log("Selected template:", template)
  }

  return (
    <DashboardLayout>
      <ContentTemplates onTemplateSelect={handleTemplateSelect} />
    </DashboardLayout>
  )
}
