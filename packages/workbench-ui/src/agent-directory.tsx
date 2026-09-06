"use client";

import React, { useMemo, useState } from "react";
import { Agent, AgentContent, AgentHeader, AgentInstructions, AgentOutput, AgentTool, AgentTools } from "./ai-elements/index";

export type WorkbenchAgentDirectoryAction = {
  readonly id: string;
  readonly label: string;
  readonly disabled?: boolean;
  readonly tone?: "primary" | "secondary";
};

export type WorkbenchAgentDirectoryCard = {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly instructions?: string;
  readonly tools?: readonly { readonly name: string; readonly description?: string }[];
  readonly output?: string;
  readonly meta?: string;
  readonly status?: string;
  readonly availability?: "ready" | "needs-config" | "unavailable";
  readonly unavailableReason?: string;
  readonly primaryAction?: WorkbenchAgentDirectoryAction;
  readonly secondaryAction?: WorkbenchAgentDirectoryAction;
};

export type WorkbenchAgentDirectoryGroup = {
  readonly id: string;
  readonly label: string;
  readonly cards: readonly WorkbenchAgentDirectoryCard[];
};

export function WorkbenchAgentDirectory({ locale, title, description, groups, onAction, eyebrow = "Agent Platform" }: {
  locale: "zh" | "en";
  title: string;
  description: string;
  groups: readonly WorkbenchAgentDirectoryGroup[];
  eyebrow?: string;
  onAction: (card: WorkbenchAgentDirectoryCard, action: WorkbenchAgentDirectoryAction) => void | Promise<void>;
}) {
  const [query, setQuery] = useState("");
  const [activeGroup, setActiveGroup] = useState("all");
  const copy = locale === "zh" ? { search: "搜索智能体或 Skill", all: "全部", empty: "没有匹配的智能体", count: "个智能体", ready: "已就绪", needsConfig: "需要配置", unavailable: "不可用" } : { search: "Search agents or Skills", all: "All", empty: "No matching agents", count: "agents", ready: "Ready", needsConfig: "Needs configuration", unavailable: "Unavailable" };
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const visibleGroups = useMemo(() => groups.map((group) => ({
    ...group,
    cards: group.cards.filter((card) => {
      if (activeGroup !== "all" && activeGroup !== group.id) return false;
      if (!normalizedQuery) return true;
      return `${card.title} ${card.description} ${card.meta ?? ""}`.toLocaleLowerCase().includes(normalizedQuery);
    }),
  })).filter((group) => group.cards.length), [activeGroup, groups, normalizedQuery]);
  const total = groups.reduce((count, group) => count + group.cards.length, 0);

  return <section className="public-grid-bg workspace-page-shell-bottom wb-agent-directory" data-cloud-surface="agent-directory">
    <div className="workspace-stack">
      <div className="public-panel workspace-hero-panel wb-agent-directory-hero">
        <div className="public-kicker text-muted-foreground">{eyebrow}</div>
        <h2>{title}</h2>
        <p>{description}</p>
        <div className="wb-agent-directory-controls">
          <label className="wb-agent-directory-search"><span aria-hidden="true">⌕</span><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={copy.search} aria-label={copy.search} /></label>
          <span className="agent-count-pill">{total} {copy.count}</span>
        </div>
        <div className="wb-agent-directory-filters" role="tablist" aria-label={locale === "zh" ? "智能体分类" : "Agent categories"}>
          <button type="button" role="tab" aria-selected={activeGroup === "all"} onClick={() => setActiveGroup("all")}>{copy.all}</button>
          {groups.map((group) => <button key={group.id} type="button" role="tab" aria-selected={activeGroup === group.id} onClick={() => setActiveGroup(group.id)}>{group.label}</button>)}
        </div>
      </div>

      {visibleGroups.length ? <div className="wb-agent-directory-groups">{visibleGroups.map((group) => <article key={group.id} className="agent-market-section wb-agent-directory-group">
        <header className="market-section-header"><div><div className="dashboard-kicker">{group.label}</div></div><span className="agent-count-pill">{group.cards.length}</span></header>
        <div className="agent-grid">{group.cards.map((card) => {
          const availability = card.availability ?? "ready";
          const availabilityLabel = availability === "ready" ? copy.ready : availability === "needs-config" ? copy.needsConfig : copy.unavailable;
          return <Agent key={card.id} className="agent-card" data-agent-id={card.id} data-availability={availability}>
            <AgentHeader name={card.title} model={card.meta || group.label}><div className="wb-agent-card-heading"><div className="agent-icon-block" aria-hidden="true">AI</div><div className="wb-agent-card-copy"><div className="agent-category">{card.meta || group.label}</div><h3 className="agent-title">{card.title}</h3></div></div></AgentHeader>
            <AgentContent>
              <AgentInstructions><p className="agent-description">{card.instructions || card.description}</p></AgentInstructions>
              {card.tools?.length ? <AgentTools>{card.tools.map((tool) => <AgentTool key={tool.name} name={tool.name} description={tool.description} />)}</AgentTools> : null}
              {card.output ? <AgentOutput><p>{card.output}</p></AgentOutput> : null}
              <div className="wb-agent-card-meta"><span className={`agent-chip wb-agent-availability wb-agent-availability-${availability}`}>{availabilityLabel}</span>{card.status ? <span className="agent-chip">{card.status}</span> : null}</div>
              {card.unavailableReason ? <p className="wb-agent-unavailable-reason" role="status">{card.unavailableReason}</p> : null}
              {card.primaryAction || card.secondaryAction ? <div className={`agent-card-actions ${card.primaryAction && card.secondaryAction ? "agent-card-actions-paired" : ""}`.trim()}>{card.primaryAction ? <button type="button" className="agent-card-primary-action" disabled={card.primaryAction.disabled} onClick={() => void onAction(card, card.primaryAction!)}>{card.primaryAction.label}</button> : null}{card.secondaryAction ? <button type="button" className="agent-card-secondary-action" disabled={card.secondaryAction.disabled} onClick={() => void onAction(card, card.secondaryAction!)}>{card.secondaryAction.label}</button> : null}</div> : null}
            </AgentContent>
          </Agent>;
        })}</div>
      </article>)}</div> : <div className="dashboard-panel wb-agent-directory-empty">{copy.empty}</div>}
    </div>
  </section>;
}
