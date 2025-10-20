import { pgTable, serial, integer, varchar, text, timestamp, boolean } from "drizzle-orm/pg-core"

// Users table
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  name: varchar("name", { length: 255 }).notNull(),
  password: varchar("password", { length: 255 }),
  isDemo: boolean("is_demo").default(false),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
})

// User files table for personal knowledge base
export const userFiles = pgTable("user_files", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id),
  fileName: text("file_name").notNull(),
  fileType: varchar("file_type", { length: 50 }).notNull(),
  fileSize: integer("file_size").notNull(), // in bytes
  storageKey: text("storage_key").notNull().unique(), // Key in R2/S3 bucket
  status: varchar("status", { length: 20 }).default("pending").notNull(), // pending, indexing, ready, failed
  createdAt: timestamp("created_at").defaultNow(),
})

// Conversations table for chat history
export const conversations = pgTable("conversations", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id),
  title: varchar("title", { length: 255 }).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
})

// Messages table for conversation history
export const messages = pgTable("messages", {
  id: serial("id").primaryKey(),
  conversationId: integer("conversation_id")
    .notNull()
    .references(() => conversations.id),
  role: varchar("role", { length: 20 }).notNull(), // 'user' or 'assistant'
  content: text("content").notNull(),
  knowledgeSource: varchar("knowledge_source", { length: 50 }), // 'industry_kb' or 'personal_kb'
  createdAt: timestamp("created_at").defaultNow(),
})

// Submitted URLs table for industry knowledge base
export const submittedUrls = pgTable("submitted_urls", {
  id: serial("id").primaryKey(),
  url: text("url").notNull(),
  title: varchar("title", { length: 255 }),
  status: varchar("status", { length: 20 }).default("pending").notNull(), // pending, processing, completed, failed
  submittedBy: integer("submitted_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
})

// Templates table for content generation workflows
export const templates = pgTable("templates", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  tags: text("tags"), // JSON array of tags
  category: varchar("category", { length: 100 }).notNull(), // 'social_media', 'email', 'article', 'ecommerce'
  industryKnowledgeBaseId: integer("industry_knowledge_base_id").references(() => industryKnowledgeBases.id),

  // Workflow configuration
  workflowUrl: text("workflow_url").notNull(), // n8n webhook URL or Dify API endpoint
  workflowId: varchar("workflow_id", { length: 255 }).notNull(), // workflow identifier
  workflowApiKey: varchar("workflow_api_key", { length: 500 }), // encrypted API key
  workflowType: varchar("workflow_type", { length: 20 }).notNull(), // 'n8n' or 'dify'

  // Template type and ownership
  templateType: varchar("template_type", { length: 20 }).notNull(), // 'public' or 'custom'
  customUserId: integer("custom_user_id").references(() => users.id), // null for public templates

  // Template configuration
  inputFields: text("input_fields"), // JSON string of required input fields
  outputFormat: varchar("output_format", { length: 50 }).default("text"), // 'text', 'html', 'markdown'

  isActive: boolean("is_active").default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
})

// Industry knowledge bases table for Milvus collections
export const industryKnowledgeBases = pgTable("industry_knowledge_bases", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  source: varchar("source", { length: 255 }), // URL or source description
  milvusCollectionName: varchar("milvus_collection_name", { length: 255 }).notNull().unique(),
  updatedAt: timestamp("updated_at").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
})

// Personal knowledge bases table for user-specific Milvus collections
export const personalKnowledgeBases = pgTable("personal_knowledge_bases", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  source: varchar("source", { length: 255 }), // File upload or source description
  milvusCollectionName: varchar("milvus_collection_name", { length: 255 }).notNull().unique(),
  updatedAt: timestamp("updated_at").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
})

// Template usage tracking
export const templateUsage = pgTable("template_usage", {
  id: serial("id").primaryKey(),
  templateId: integer("template_id")
    .notNull()
    .references(() => templates.id),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id),
  conversationId: integer("conversation_id").references(() => conversations.id),
  inputData: text("input_data"), // JSON string of input parameters
  outputData: text("output_data"), // Generated content
  status: varchar("status", { length: 20 }).default("pending"), // pending, success, failed
  executionTime: integer("execution_time"), // milliseconds
  createdAt: timestamp("created_at").defaultNow(),
})
