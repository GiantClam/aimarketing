import Link from "next/link"
import { ArrowLeft } from "lucide-react"

import { ToolCardGrid } from "@/components/lead-tools/tool-card-grid"
import { leadToolsCatalog } from "@/lib/lead-tools/catalog"

export default function ToolsHubPage() {
  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(188,35,35,0.14),transparent_28%),linear-gradient(180deg,#090909_0%,#0f0f0f_100%)] px-4 py-10 text-white sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <Link href="/" className="inline-flex items-center gap-2 text-sm text-zinc-400 transition hover:text-white">
          <ArrowLeft className="h-4 w-4" />
          返回首页
        </Link>

        <div className="mt-8 max-w-3xl space-y-4">
          <div className="inline-flex rounded-full border border-primary/20 bg-primary/10 px-4 py-2 text-sm font-medium text-primary">
            SEO Lead Gen Tools
          </div>
          <h1 className="text-4xl font-semibold tracking-tight">一个首页，承接品牌、搜索流量和登录转化</h1>
          <p className="text-base leading-8 text-zinc-400">
            这里汇总了面向 SEO 的在线工具。已上线工具优先验证“匿名预览 {"->"} 登录转化 {"->"} 主产品激活”这条漏斗，后续会继续扩展更多营销类工具。
          </p>
        </div>

        <div className="mt-10">
          <ToolCardGrid
            tools={leadToolsCatalog}
            title="工具目录"
            description="PPT 预览已经接入共享底座，未来新增工具时只需要补 catalog 和 adapter。"
          />
        </div>
      </div>
    </div>
  )
}
