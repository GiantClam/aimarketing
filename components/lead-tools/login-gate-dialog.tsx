"use client"

import Link from "next/link"
import { Lock, MoveRight, UserPlus } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

type LoginGateDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  actionLabel: string
  redirectTo: string
}

export function LoginGateDialog({ open, onOpenChange, actionLabel, redirectTo }: LoginGateDialogProps) {
  const loginHref = `/login?redirect=${encodeURIComponent(redirectTo)}`
  const registerHref = `/register?redirect=${encodeURIComponent(redirectTo)}`

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-white/10 bg-zinc-950 text-white sm:max-w-md">
        <DialogHeader className="space-y-3 text-left">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/15 text-primary">
            <Lock className="h-5 w-5" />
          </div>
          <DialogTitle className="text-2xl">登录后继续{actionLabel}</DialogTitle>
          <DialogDescription className="leading-6 text-zinc-400">
            当前预览会话会保留。登录完成后会自动回到这个工具页，继续执行下载或完整生成。
          </DialogDescription>
        </DialogHeader>
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm leading-6 text-zinc-300">
          这次 MVP 把登录门槛放在高价值动作上，用户可以先看到结果，再决定是否进入完整导出流程。
        </div>
        <DialogFooter className="sm:justify-start">
          <Button asChild>
            <Link href={loginHref}>
              去登录
              <MoveRight className="h-4 w-4" />
            </Link>
          </Button>
          <Button asChild variant="outline" className="border-white/10 bg-transparent text-white hover:bg-white/10">
            <Link href={registerHref}>
              去注册
              <UserPlus className="h-4 w-4" />
            </Link>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
