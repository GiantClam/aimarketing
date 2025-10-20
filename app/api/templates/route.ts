import { type NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { templates } from "@/lib/db/schema"
import { eq, and, desc } from "drizzle-orm"
import { sql } from "drizzle-orm/sql"

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const userId = searchParams.get("userId")
    const category = searchParams.get("category")

    const whereConditions = [eq(templates.isActive, true)]

    if (category) {
      whereConditions.push(eq(templates.category, category))
    }

    if (userId) {
      // For logged-in users: show public templates + their own custom templates
      const result = await db
        .select()
        .from(templates)
        .where(
          and(...whereConditions, sql`(${templates.customUserId} IS NULL OR ${templates.customUserId} = ${userId})`),
        )
        .orderBy(desc(templates.createdAt))

      return NextResponse.json({ templates: result })
    } else {
      // For anonymous users: only show public templates
      whereConditions.push(sql`${templates.customUserId} IS NULL`)

      const result = await db
        .select()
        .from(templates)
        .where(and(...whereConditions))
        .orderBy(desc(templates.createdAt))

      return NextResponse.json({ templates: result })
    }
  } catch (error) {
    console.error("Error fetching templates:", error)
    return NextResponse.json({ error: "Failed to fetch templates" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { name, description, category, prompt, workflowType, workflowConfig, userId, tags = [] } = body

    // Validate required fields
    if (!name || !description || !category || !prompt || !workflowType || !workflowConfig) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
    }

    // Create new template
    const [newTemplate] = await db
      .insert(templates)
      .values({
        name,
        description,
        category,
        tags,
        industryKnowledgeBaseId: null, // Set based on requirements
        workflowUrl: workflowConfig.url || "",
        workflowId: workflowConfig.id || "",
        workflowApiKey: workflowConfig.apiKey || "",
        workflowType,
        templateType: userId ? "custom" : "public",
        customUserId: userId || null,
        inputFields: JSON.stringify(workflowConfig.inputFields || []),
        outputFormat: workflowConfig.outputFormat || "text",
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning()

    return NextResponse.json({ template: newTemplate }, { status: 201 })
  } catch (error) {
    console.error("Error creating template:", error)
    return NextResponse.json({ error: "Failed to create template" }, { status: 500 })
  }
}
