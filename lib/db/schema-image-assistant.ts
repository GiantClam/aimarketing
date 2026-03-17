import { boolean, index, integer, jsonb, pgTable, serial, text, timestamp, uniqueIndex, varchar } from "drizzle-orm/pg-core"

import { enterprises, users } from "@/lib/db/schema"

const withPrefix = (name: string) => `AI_MARKETING_${name}`

export const imageDesignSessions = pgTable(
  withPrefix("image_design_sessions"),
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    enterpriseId: integer("enterprise_id").references(() => enterprises.id, { onDelete: "set null" }),
    title: varchar("title", { length: 255 }).notNull(),
    status: varchar("status", { length: 32 }).default("active").notNull(),
    currentMode: varchar("current_mode", { length: 16 }).default("chat").notNull(),
    currentVersionId: integer("current_version_id"),
    currentCanvasDocumentId: integer("current_canvas_document_id"),
    coverAssetId: integer("cover_asset_id"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
    archivedAt: timestamp("archived_at"),
  },
  (table) => ({
    userUpdatedIdx: index(withPrefix("image_design_sessions_user_updated_idx")).on(table.userId, table.updatedAt, table.id),
  }),
)

export const imageDesignMessages = pgTable(
  withPrefix("image_design_messages"),
  {
    id: serial("id").primaryKey(),
    sessionId: integer("session_id")
      .notNull()
      .references(() => imageDesignSessions.id, { onDelete: "cascade" }),
    role: varchar("role", { length: 20 }).notNull(),
    messageType: varchar("message_type", { length: 32 }).default("prompt").notNull(),
    content: text("content").notNull(),
    taskType: varchar("task_type", { length: 32 }),
    requestPayload: jsonb("request_payload"),
    responsePayload: jsonb("response_payload"),
    createdVersionId: integer("created_version_id"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    sessionCreatedIdx: index(withPrefix("image_design_messages_session_created_idx")).on(table.sessionId, table.createdAt, table.id),
  }),
)

export const imageDesignAssets = pgTable(
  withPrefix("image_design_assets"),
  {
    id: serial("id").primaryKey(),
    sessionId: integer("session_id").references(() => imageDesignSessions.id, { onDelete: "set null" }),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    assetType: varchar("asset_type", { length: 32 }).notNull(),
    referenceRole: varchar("reference_role", { length: 32 }),
    storageProvider: varchar("storage_provider", { length: 32 }).default("r2").notNull(),
    storageKey: text("storage_key").notNull().unique(),
    publicUrl: text("public_url"),
    mimeType: varchar("mime_type", { length: 100 }).notNull(),
    fileSize: integer("file_size").default(0).notNull(),
    width: integer("width"),
    height: integer("height"),
    sha256: varchar("sha256", { length: 64 }),
    status: varchar("status", { length: 20 }).default("pending").notNull(),
    meta: jsonb("meta"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    sessionCreatedIdx: index(withPrefix("image_design_assets_session_created_idx")).on(table.sessionId, table.createdAt, table.id),
  }),
)

export const imageDesignCanvasDocuments = pgTable(
  withPrefix("image_design_canvas_documents"),
  {
    id: serial("id").primaryKey(),
    sessionId: integer("session_id")
      .notNull()
      .references(() => imageDesignSessions.id, { onDelete: "cascade" }),
    baseVersionId: integer("base_version_id"),
    width: integer("width").default(1080).notNull(),
    height: integer("height").default(1080).notNull(),
    backgroundAssetId: integer("background_asset_id"),
    revision: integer("revision").default(1).notNull(),
    status: varchar("status", { length: 20 }).default("draft").notNull(),
    lastSavedAt: timestamp("last_saved_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    sessionUpdatedIdx: index(withPrefix("image_design_canvas_documents_session_updated_idx")).on(
      table.sessionId,
      table.updatedAt,
      table.id,
    ),
  }),
)

export const imageDesignVersions = pgTable(
  withPrefix("image_design_versions"),
  {
    id: serial("id").primaryKey(),
    sessionId: integer("session_id")
      .notNull()
      .references(() => imageDesignSessions.id, { onDelete: "cascade" }),
    parentVersionId: integer("parent_version_id"),
    sourceMessageId: integer("source_message_id"),
    versionKind: varchar("version_kind", { length: 32 }).notNull(),
    branchKey: varchar("branch_key", { length: 64 }),
    provider: varchar("provider", { length: 32 }),
    model: varchar("model", { length: 128 }),
    promptText: text("prompt_text"),
    snapshotAssetId: integer("snapshot_asset_id"),
    maskAssetId: integer("mask_asset_id"),
    selectedCandidateId: integer("selected_candidate_id"),
    canvasDocumentId: integer("canvas_document_id"),
    status: varchar("status", { length: 20 }).default("ready").notNull(),
    meta: jsonb("meta"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    sessionCreatedIdx: index(withPrefix("image_design_versions_session_created_idx")).on(table.sessionId, table.createdAt, table.id),
  }),
)

export const imageDesignVersionCandidates = pgTable(
  withPrefix("image_design_version_candidates"),
  {
    id: serial("id").primaryKey(),
    versionId: integer("version_id")
      .notNull()
      .references(() => imageDesignVersions.id, { onDelete: "cascade" }),
    assetId: integer("asset_id")
      .notNull()
      .references(() => imageDesignAssets.id, { onDelete: "cascade" }),
    candidateIndex: integer("candidate_index").notNull(),
    isSelected: boolean("is_selected").default(false).notNull(),
    score: integer("score"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    versionCandidateUnique: uniqueIndex(withPrefix("image_design_version_candidate_unique_idx")).on(
      table.versionId,
      table.candidateIndex,
    ),
  }),
)

export const imageDesignCanvasLayers = pgTable(
  withPrefix("image_design_canvas_layers"),
  {
    id: serial("id").primaryKey(),
    canvasDocumentId: integer("canvas_document_id")
      .notNull()
      .references(() => imageDesignCanvasDocuments.id, { onDelete: "cascade" }),
    layerType: varchar("layer_type", { length: 32 }).notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    zIndex: integer("z_index").default(0).notNull(),
    visible: boolean("visible").default(true).notNull(),
    locked: boolean("locked").default(false).notNull(),
    transform: jsonb("transform").notNull(),
    style: jsonb("style"),
    content: jsonb("content"),
    assetId: integer("asset_id").references(() => imageDesignAssets.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    documentZIdx: index(withPrefix("image_design_canvas_layers_document_z_idx")).on(table.canvasDocumentId, table.zIndex, table.id),
  }),
)

export const imageDesignMasks = pgTable(
  withPrefix("image_design_masks"),
  {
    id: serial("id").primaryKey(),
    sessionId: integer("session_id")
      .notNull()
      .references(() => imageDesignSessions.id, { onDelete: "cascade" }),
    canvasDocumentId: integer("canvas_document_id").references(() => imageDesignCanvasDocuments.id, { onDelete: "set null" }),
    versionId: integer("version_id").references(() => imageDesignVersions.id, { onDelete: "set null" }),
    maskType: varchar("mask_type", { length: 32 }).notNull(),
    bounds: jsonb("bounds").notNull(),
    geometry: jsonb("geometry"),
    maskAssetId: integer("mask_asset_id").references(() => imageDesignAssets.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    sessionCreatedIdx: index(withPrefix("image_design_masks_session_created_idx")).on(table.sessionId, table.createdAt, table.id),
  }),
)

export const imageDesignExports = pgTable(
  withPrefix("image_design_exports"),
  {
    id: serial("id").primaryKey(),
    sessionId: integer("session_id")
      .notNull()
      .references(() => imageDesignSessions.id, { onDelete: "cascade" }),
    versionId: integer("version_id").references(() => imageDesignVersions.id, { onDelete: "set null" }),
    canvasDocumentId: integer("canvas_document_id").references(() => imageDesignCanvasDocuments.id, { onDelete: "set null" }),
    assetId: integer("asset_id")
      .notNull()
      .references(() => imageDesignAssets.id, { onDelete: "cascade" }),
    format: varchar("format", { length: 16 }).notNull(),
    sizePreset: varchar("size_preset", { length: 16 }).notNull(),
    transparentBackground: boolean("transparent_background").default(false).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    sessionCreatedIdx: index(withPrefix("image_design_exports_session_created_idx")).on(table.sessionId, table.createdAt, table.id),
  }),
)
