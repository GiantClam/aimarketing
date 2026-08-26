import type { WorkbenchMediaFeature, WorkbenchMediaFeatureId } from "@aimarketing/workbench-ui";
import type { DesktopImageSettings } from "./image-model-parameters";

export type DesktopMediaTabState = {
  id: WorkbenchMediaFeatureId;
  featureId: WorkbenchMediaFeatureId;
  values: Record<string, string>;
  prompt: string;
  imageSettings: DesktopImageSettings;
  uploadedFileName: string | null;
};

export function createDesktopMediaTab(feature: WorkbenchMediaFeature): DesktopMediaTabState {
  return {
    id: feature.id,
    featureId: feature.id,
    values: Object.fromEntries(feature.fields.map((field) => [field.id, field.defaultValue ?? ""])),
    prompt: "",
    imageSettings: {
      quality: "standard",
      size: "1024x1024",
      count: "1",
      referenceImages: "",
    },
    uploadedFileName: null,
  };
}

export function openDesktopMediaTab(
  tabs: readonly DesktopMediaTabState[],
  feature: WorkbenchMediaFeature,
): DesktopMediaTabState[] {
  return tabs.some((tab) => tab.id === feature.id) ? [...tabs] : [...tabs, createDesktopMediaTab(feature)];
}

export function closeDesktopMediaTab(
  tabs: readonly DesktopMediaTabState[],
  activeTabId: WorkbenchMediaFeatureId | null,
  featureId: WorkbenchMediaFeatureId,
): { tabs: DesktopMediaTabState[]; activeTabId: WorkbenchMediaFeatureId | null } {
  const nextTabs = tabs.filter((tab) => tab.id !== featureId);
  return {
    tabs: nextTabs,
    activeTabId: activeTabId === featureId ? nextTabs.at(-1)?.id ?? null : activeTabId,
  };
}
