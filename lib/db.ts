import { drizzle } from "drizzle-orm/neon-serverless"
import { neon } from "@neondatabase/serverless"

// Database connection configuration
const connectionString = process.env.DATABASE_URL || "postgresql://localhost:5432/aimarketing"

// Create neon serverless client
const client = neon(connectionString)

// Create drizzle database instance
export const db = drizzle(client)
