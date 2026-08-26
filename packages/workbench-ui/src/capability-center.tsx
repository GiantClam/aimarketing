import { AudioLines, ChevronRight, Video, X } from "lucide-react";
import React from "react";
import type { ReactNode } from "react";

export type WorkbenchCapabilityCenterFeature = {
  readonly id: string;
  readonly title: string;
  readonly summary: string;
  readonly kind: "audio" | "video";
  readonly disabled?: boolean;
  readonly disabledReason?: string;
};

export type WorkbenchCapabilityCenterGroup = {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly kind: "audio" | "video";
  readonly features: readonly WorkbenchCapabilityCenterFeature[];
};

function CapabilityIcon({ kind, size = 16 }: { kind: "audio" | "video"; size?: number }) {
  return kind === "audio" ? <AudioLines size={size} aria-hidden="true" /> : <Video size={size} aria-hidden="true" />;
}

export function WorkbenchCapabilityCenter({ eyebrow, title, description, groups, openFeatureIds, activeFeatureId, onFeatureOpen, onFeatureActivate, onFeatureClose, workspaceLabel, launchersLabel, openFirstLabel, openTabsLabel, allTasksLabel, onOpenTasks, showHero = true, children }: {
  eyebrow: string;
  title: string;
  description: string;
  groups: readonly WorkbenchCapabilityCenterGroup[];
  openFeatureIds: readonly string[];
  activeFeatureId: string | null;
  onFeatureOpen: (featureId: string) => void;
  onFeatureActivate: (featureId: string) => void;
  onFeatureClose: (featureId: string) => void;
  workspaceLabel: string;
  launchersLabel: string;
  openFirstLabel: string;
  openTabsLabel: (count: number) => string;
  allTasksLabel?: string;
  onOpenTasks?: () => void;
  showHero?: boolean;
  children?: ReactNode;
}) {
  const features = groups.flatMap((group) => group.features);
  const featureById = new Map(features.map((feature) => [feature.id, feature]));
  return <section className="capabilities-page wb-capability-center" data-cloud-surface="capability-center">
    <div className="wb-capability-center-inner">
      {showHero ? <header className="capabilities-header"><div className="capabilities-eyebrow">{eyebrow}</div><h1 className="capabilities-title">{title}</h1><div className="header-accent" /><p className="capabilities-subtitle">{description}</p></header> : null}
      <div className="capability-groups-grid">{groups.map((group) => <article key={group.id} className="capability-group-card"><div className="capability-group-heading"><div className="category-icon"><CapabilityIcon kind={group.kind} /></div><div><div className="category-title">{group.title}</div><p className="category-description">{group.description}</p></div></div><div className="capability-tile-grid">{group.features.map((feature) => <button key={feature.id} type="button" data-readiness={feature.disabled ? "needs-config" : "ready"} className={`capability-tile ${openFeatureIds.includes(feature.id) ? "active" : ""} ${feature.disabled ? "is-muted" : ""}`.trim()} onClick={() => onFeatureOpen(feature.id)}><div className="capability-tile-icon"><CapabilityIcon kind={feature.kind} /></div><div className="capability-tile-copy"><div className="capability-tile-title">{feature.title}</div><div className="capability-tile-description">{feature.summary}</div>{feature.disabledReason ? <div className="capability-tile-readiness">{feature.disabledReason}</div> : null}</div></button>)}</div></article>)}</div>
      <article className="launcher-workspace"><div className="launcher-bar"><div><div className="launcher-label">{workspaceLabel} / {launchersLabel}</div><div className="launcher-subtitle">{openFeatureIds.length ? openTabsLabel(openFeatureIds.length) : openFirstLabel}</div></div><div className="launcher-actions"><div className="launcher-tabs">{openFeatureIds.map((featureId) => { const feature = featureById.get(featureId); if (!feature) return null; return <div key={feature.id} className={`launcher-tab ${activeFeatureId === feature.id ? "active" : ""}`.trim()}><button type="button" onClick={() => onFeatureActivate(feature.id)}><CapabilityIcon kind={feature.kind} /><span>{feature.title}</span></button><button type="button" className="launcher-tab-close" aria-label={`close-${feature.id}`} onClick={(event) => { event.stopPropagation(); onFeatureClose(feature.id); }}><X size={14} aria-hidden="true" /></button></div>; })}</div>{onOpenTasks && allTasksLabel ? <button type="button" className="secondary-btn launcher-all-tasks" onClick={onOpenTasks}>{allTasksLabel}<ChevronRight size={16} aria-hidden="true" /></button> : null}</div></div>{children}</article>
    </div>
  </section>;
}
