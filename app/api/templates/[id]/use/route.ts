import { type NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { templates, templateUsage } from "@/lib/db/schema"
import { eq } from "drizzle-orm"

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const templateId = params.id
    const body = await request.json()
    const { userId, userInput } = body

    // Get template details
    const [template] = await db.select().from(templates).where(eq(templates.id, templateId)).limit(1)

    if (!template) {
      return NextResponse.json({ error: "Template not found" }, { status: 404 })
    }

    // Record template usage
    await db.insert(templateUsage).values({
      templateId,
      userId: userId || null,
      userInput,
      usedAt: new Date(),
    })

    // Execute workflow based on template configuration
    let result
    if (template.workflowType === "n8n") {
      // Execute n8n workflow
      const n8nConfig = template.workflowConfig as any
      const response = await fetch(n8nConfig.webhookUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${n8nConfig.apiKey}`,
        },
        body: JSON.stringify({
          prompt: template.prompt,
          userInput,
          templateId,
        }),
      })
      result = await response.json()
    } else if (template.workflowType === "dify") {
      // Execute Dify workflow
      const difyConfig = template.workflowConfig as any
      const response = await fetch(`${difyConfig.baseUrl}/v1/chat-messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${difyConfig.apiKey}`,
        },
        body: JSON.stringify({
          inputs: {
            prompt: template.prompt,
            user_input: userInput,
          },
          query: userInput,
          user: userId || "anonymous",
          conversation_id: "",
          response_mode: "blocking",
        }),
      })
      result = await response.json()
    }

    return NextResponse.json({
      template,
      result,
      success: true,
    })
  } catch (error) {
    console.error("Error using template:", error)
    return NextResponse.json({ error: "Failed to execute template workflow" }, { status: 500 })
  }
}
