export type WorkflowOutputKind = "text" | "image" | "video" | "audio" | "ppt" | "asset";

export type WorkflowOutputItem = {
  id: string;
  kind: WorkflowOutputKind;
  label: string;
  mimeType: string;
  text?: string;
  url?: string;
  localPath?: string;
  relativePath?: string;
  fileName?: string;
  byteLength?: number;
};

const OUTPUT_KINDS: readonly WorkflowOutputKind[] = ["text", "image", "video", "audio", "ppt", "asset"];
const OUTPUT_FIELDS: Record<WorkflowOutputKind, readonly string[]> = {
  text: ["text", "texts"],
  image: ["image", "images"],
  video: ["video", "videos"],
  audio: ["audio", "audios"],
  ppt: ["ppt", "ppts", "presentations"],
  asset: ["asset", "assets", "files"],
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function fileNameFromPath(value: string) {
  return value.split(/[\\/]/u).pop() || value;
}

function mimeTypeFor(kind: WorkflowOutputKind, value: Record<string, unknown>) {
  if (typeof value.mimeType === "string" && value.mimeType.trim()) return value.mimeType.trim();
  if (kind === "image") return "image/*";
  if (kind === "video") return "video/*";
  if (kind === "audio") return "audio/*";
  if (kind === "ppt") return "application/vnd.openxmlformats-officedocument.presentationml.presentation";
  if (kind === "text") return "text/plain";
  return "application/octet-stream";
}

function normalizeItem(kind: WorkflowOutputKind, value: unknown, index: number): WorkflowOutputItem | null {
  if (kind === "text" && typeof value === "string") {
    return { id: `text-${index}`, kind, label: "文本输出", mimeType: "text/plain", text: value };
  }
  const record = asRecord(value);
  if (!record && typeof value !== "string") return null;
  if (typeof value === "string") {
    const fileName = fileNameFromPath(value);
    return { id: `${kind}-${index}`, kind, label: fileName, mimeType: mimeTypeFor(kind, {}), ...(kind === "text" ? { text: value } : { url: value, fileName }) };
  }
  const url = [record?.url, record?.uri, record?.sourceUrl].find((item): item is string => Boolean(typeof item === "string" && item.trim()))?.trim();
  const localPath = [record?.localPath, record?.path, record?.filePath].find((item): item is string => Boolean(typeof item === "string" && item.trim()))?.trim();
  const relativePath = typeof record?.relativePath === "string" && record.relativePath.trim() ? record.relativePath.trim() : undefined;
  const fileName = [record?.fileName, record?.name, record?.title, localPath ? fileNameFromPath(localPath) : undefined, relativePath ? fileNameFromPath(relativePath) : undefined].find((item): item is string => Boolean(typeof item === "string" && item.trim()))?.trim();
  const text = typeof record?.text === "string" ? record.text : kind === "text" ? JSON.stringify(record, null, 2) : undefined;
  if (!url && !localPath && !relativePath && !text) return null;
  return {
    id: `${kind}-${index}`,
    kind,
    label: fileName || (kind === "text" ? "文本输出" : `${kind} output ${index + 1}`),
    mimeType: mimeTypeFor(kind, record ?? {}),
    ...(text ? { text } : {}),
    ...(url ? { url } : {}),
    ...(localPath ? { localPath } : {}),
    ...(relativePath ? { relativePath } : {}),
    ...(fileName ? { fileName } : {}),
    ...(typeof record?.byteLength === "number" ? { byteLength: record.byteLength } : {}),
  };
}

export function normalizeWorkflowOutput(payload: Record<string, unknown> | null | undefined): WorkflowOutputItem[] {
  if (!payload) return [];
  return OUTPUT_KINDS.flatMap((kind) => {
    let index = 0;
    return OUTPUT_FIELDS[kind].flatMap((field) => {
      const value = payload[field];
      if (value === undefined || value === null) return [];
      const values = Array.isArray(value) ? value : [value];
      return values.map((item) => normalizeItem(kind, item, index++)).filter((item): item is WorkflowOutputItem => Boolean(item));
    });
  });
}
