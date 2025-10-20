import { type NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { templates } from "@/lib/db/schema"
import { eq } from "drizzle-orm"

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const templateId = params.id

    const [template] = await db.select().from(templates).where(eq(templates.id, templateId)).limit(1)

    if (!template) {
      return NextResponse.json({ error: "Template not found" }, { status: 404 })
    }

    return NextResponse.json({ template })
  } catch (error) {
    console.error("Error fetching template:", error)
    return NextResponse.json({ error: "Failed to fetch template" }, { status: 500 })
  }
}

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const templateId = params.id
    const body = await request.json()
    const { userId, ...updateData } = body

    // Check if user owns this template (or if it's an admin operation)
    const [existingTemplate] = await db.select().from(templates).where(eq(templates.id, templateId)).limit(1)

    if (!existingTemplate) {
      return NextResponse.json({ error: "Template not found" }, { status: 404 })
    }

    // Only allow updates if user owns the template or it's an official template update
    if (existingTemplate.userId && existingTemplate.userId !== userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 })
    }

    const [updatedTemplate] = await db
      .update(templates)
      .set({
        ...updateData,
        updatedAt: new Date(),
      })
      .where(eq(templates.id, templateId))
      .returning()

    return NextResponse.json({ template: updatedTemplate })
  } catch (error) {
    console.error("Error updating template:", error)
    return NextResponse.json({ error: "Failed to update template" }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const templateId = params.id
    const { searchParams } = new URL(request.url)
    const userId = searchParams.get("userId")

    // Check if user owns this template
    const [existingTemplate] = await db.select().from(templates).where(eq(templates.id, templateId)).limit(1)

    if (!existingTemplate) {
      return NextResponse.json({ error: "Template not found" }, { status: 404 })
    }

    if (existingTemplate.userId !== userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 })
    }

    // Soft delete by setting isActive to false
    await db
      .update(templates)
      .set({
        isActive: false,
        updatedAt: new Date(),
      })
      .where(eq(templates.id, templateId))

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error deleting template:", error)
    return NextResponse.json({ error: "Failed to delete template" }, { status: 500 })
  }
}
