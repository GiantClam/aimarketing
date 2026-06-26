import { z } from "zod";
export const previewRequestSchema = z.object({
    requestId: z.string().min(1),
    prompt: z.string().min(1),
    scenario: z.enum(["marketing-campaign", "product-launch", "sales-deck", "training"]),
    language: z.enum(["zh-CN", "en-US"]),
    templateMode: z.enum(["auto-4", "single-template"]),
    templateId: z.enum(["long-table", "playful", "broadside", "neo-grid-bold"]).optional(),
    pageCount: z.number().int().min(4).max(20).nullable().optional(),
    runtimeProfile: z.enum(["local-dev", "railway-linux"]),
});
export const exportRequestSchema = z.object({
    requestId: z.string().min(1),
    previewSessionId: z.string().min(1),
    selectedVariantKey: z.string().min(1),
});
