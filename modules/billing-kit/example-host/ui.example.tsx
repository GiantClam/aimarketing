import type { ComponentProps, PropsWithChildren } from "react"

export function Button(props: ComponentProps<"button">) {
  return <button {...props} />
}

export function Badge({ children, ...props }: PropsWithChildren<ComponentProps<"span">>) {
  return <span {...props}>{children}</span>
}

export function Card({ children, ...props }: PropsWithChildren<ComponentProps<"div">>) {
  return <div {...props}>{children}</div>
}

export function CardHeader({ children, ...props }: PropsWithChildren<ComponentProps<"div">>) {
  return <div {...props}>{children}</div>
}

export function CardContent({ children, ...props }: PropsWithChildren<ComponentProps<"div">>) {
  return <div {...props}>{children}</div>
}

export function CardTitle({ children, ...props }: PropsWithChildren<ComponentProps<"div">>) {
  return <div {...props}>{children}</div>
}

