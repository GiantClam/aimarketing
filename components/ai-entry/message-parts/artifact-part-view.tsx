"use client"

import type { ComponentType } from "react"
import { Download, FileText, LibraryBig, LinkIcon } from "lucide-react"

import type { ArtifactPart } from "@/lib/ai-entry/message-parts/types"

type Row = { label: string; value: string; href: string | null; icon: ComponentType<{ className?: string }> }

function titleFor(part: ArtifactPart, isZh: boolean): string {
  if (part.artifactType === "html") return isZh ? "已生成 HTML 成品" : "HTML deliverable generated"
  if (part.artifactType === "pptx") return isZh ? "已生成 PPT 成品" : "PPT deliverable generated"
  return isZh ? "已生成可交付文件" : "Deliverable generated"
}

export function ArtifactPartView({ part, isZh }: { part: ArtifactPart; isZh: boolean }) {
  const rows: Row[] = []
  if (part.title) rows.push({ label: isZh ? "标题" : "Title", value: part.title, href: null, icon: FileText })
  if (part.fileName) rows.push({ label: isZh ? "文件名" : "File", value: part.fileName, href: null, icon: FileText })
  if (part.previewUrl) rows.push({ label: isZh ? "在线预览" : "Preview", value: part.previewUrl, href: part.previewUrl, icon: LinkIcon })
  if (part.downloadUrl) rows.push({ label: isZh ? "下载" : "Download", value: part.downloadUrl, href: part.downloadUrl, icon: Download })
  if (part.workHref) rows.push({ label: isZh ? "作品库" : "Work library", value: part.workHref, href: part.workHref, icon: LibraryBig })

  return (
    <div className="artifact-block">
      <div className="artifact-title">
        <FileText className="h-5 w-5" />
        {titleFor(part, isZh)}
      </div>
      <div>
        {rows.map((row) => {
          const Icon = row.icon
          const isWorkLibrary = row.label === (isZh ? "作品库" : "Work library")
          return (
            <div key={`${row.label}:${row.value}`} className="artifact-row">
              <div className="artifact-label">
                <Icon className="h-4 w-4" />
                {row.label}
              </div>
              <div className="artifact-value">
                {row.href ? (
                  <a className="artifact-link" href={row.href} target={isWorkLibrary ? undefined : "_blank"} rel="noreferrer">
                    {row.value}
                  </a>
                ) : (
                  <span>{row.value}</span>
                )}
              </div>
            </div>
          )
        })}
      </div>
      <div className="message-actions">
        {part.workHref ? (
          <a className="action-secondary" href={part.workHref}>
            <LibraryBig className="h-4 w-4" />
            {isZh ? "打开作品库" : "Open in Works"}
          </a>
        ) : null}
        {part.downloadUrl ? (
          <a className="action-secondary" href={part.downloadUrl} target="_blank" rel="noreferrer">
            <Download className="h-4 w-4" />
            {isZh ? "导出" : "Export"}
          </a>
        ) : null}
      </div>
    </div>
  )
}
