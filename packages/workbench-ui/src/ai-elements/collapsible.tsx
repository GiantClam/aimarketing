import * as CollapsiblePrimitive from "@radix-ui/react-collapsible";

/**
 * AI Elements uses the shadcn Collapsible primitive. Keep the primitive local
 * to the shared package so the desktop bundle does not depend on the web app.
 */
export const Collapsible = CollapsiblePrimitive.Root;
export const CollapsibleTrigger = CollapsiblePrimitive.Trigger;
export const CollapsibleContent = CollapsiblePrimitive.Content;
