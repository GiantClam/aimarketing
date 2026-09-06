import React, { type ButtonHTMLAttributes, type HTMLAttributes, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { CodeBlock, Image, OpenInChat } from "./source";

function cx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

type ArtifactProps = HTMLAttributes<HTMLDivElement> & {
  /** Legacy convenience props remain supported for non-chat surfaces. */
  title?: string;
  description?: string;
  actions?: ReactNode;
  onOpen?: () => void;
};

/** AI Elements artifact container with the documented compound structure. */
export function Artifact({ title, description, actions, onOpen, children, className, ...props }: ArtifactProps) {
  const hasLegacyHeader = title !== undefined || description !== undefined || actions !== undefined;
  const content = hasLegacyHeader || onOpen ? <ArtifactContent onClick={onOpen}>{children}</ArtifactContent> : children;
  return <div {...props} className={cx("ai-elements-artifact", className)} data-slot="artifact">
    {hasLegacyHeader ? <ArtifactHeader><div className="ai-elements-artifact-heading">{title !== undefined ? <ArtifactTitle>{title}</ArtifactTitle> : null}{description !== undefined ? <ArtifactDescription>{description}</ArtifactDescription> : null}</div>{actions ? <ArtifactActions>{actions}</ArtifactActions> : null}</ArtifactHeader> : null}
    {content}
  </div>;
}

export function ArtifactHeader({ children, className, ...props }: HTMLAttributes<HTMLDivElement> & { children?: ReactNode }) {
  return <div {...props} className={cx("ai-elements-artifact-header", className)} data-slot="artifact-header">{children}</div>;
}

export function ArtifactTitle({ children, className, ...props }: HTMLAttributes<HTMLParagraphElement> & { children?: ReactNode }) {
  return <p {...props} className={cx("ai-elements-artifact-title", className)} data-slot="artifact-title">{children}</p>;
}

export function ArtifactDescription({ children, className, ...props }: HTMLAttributes<HTMLParagraphElement> & { children?: ReactNode }) {
  return <p {...props} className={cx("ai-elements-artifact-description", className)} data-slot="artifact-description">{children}</p>;
}

export function ArtifactActions({ children, className, ...props }: HTMLAttributes<HTMLDivElement> & { children?: ReactNode }) {
  return <div {...props} className={cx("ai-elements-artifact-actions", className)} data-slot="artifact-actions">{children}</div>;
}

export function ArtifactAction({ children, label, tooltip, icon: Icon, className, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { label?: string; tooltip?: string; icon?: LucideIcon; children?: ReactNode }) {
  return <button {...props} type="button" aria-label={label ?? tooltip} title={tooltip} className={cx("ai-elements-artifact-action", className)} data-slot="artifact-action">{Icon ? <Icon size={16} aria-hidden="true" /> : children}<span className="sr-only">{label ?? tooltip}</span></button>;
}

export function ArtifactClose({ children = "×", className, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { children?: ReactNode }) {
  return <button {...props} type="button" aria-label={props["aria-label"] ?? "Close artifact"} className={cx("ai-elements-artifact-close", className)} data-slot="artifact-close">{children}</button>;
}

export function ArtifactContent({ children, className, ...props }: HTMLAttributes<HTMLDivElement> & { children?: ReactNode }) {
  return <div {...props} className={cx("ai-elements-artifact-content", className)} data-slot="artifact-content">{children}</div>;
}

export { CodeBlock, Image, OpenInChat };
