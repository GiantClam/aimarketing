import assert from "node:assert/strict"
import test from "node:test"

import { buildWriterRoutingDecision } from "./routing"

function assertRoute(
  query: string,
  expected: Partial<ReturnType<typeof buildWriterRoutingDecision>>,
) {
  const route = buildWriterRoutingDecision({ query })

  for (const [key, value] of Object.entries(expected)) {
    assert.equal(route[key as keyof typeof route], value)
  }
}

test("wechat article routing works for Chinese article request", () => {
  assertRoute("帮我写一篇公众号文章，主题是 AI 销售自动化，目标是吸引制造业老板咨询", {
    contentType: "social_cn",
    targetPlatform: "WeChat Official Account",
    renderPlatform: "wechat",
    renderMode: "article",
  })
})

test("xiaohongshu note routing works for Chinese note request", () => {
  assertRoute("写一篇小红书种草笔记，介绍 AI 获客工作流，要轻松一点", {
    contentType: "social_cn",
    targetPlatform: "Xiaohongshu",
    outputForm: "Xiaohongshu native post",
    renderPlatform: "xiaohongshu",
  })
})

test("weibo routing works for Chinese short post request", () => {
  assertRoute("帮我写一条微博，预热下周的 AI 线下活动", {
    contentType: "social_cn",
    targetPlatform: "Weibo",
    renderPlatform: "weibo",
  })
})

test("douyin script routing works for spoken short video request", () => {
  assertRoute("给我一个抖音口播脚本，30 秒，讲 AI 外贸获客", {
    contentType: "social_cn",
    targetPlatform: "Douyin",
    outputForm: "Douyin script",
    lengthTarget: "30-second script",
    renderPlatform: "douyin",
  })
})

test("x thread routing works for English social request", () => {
  assertRoute("Write an X thread about AI sales automation lessons", {
    contentType: "social_global",
    targetPlatform: "X",
    renderPlatform: "x",
    renderMode: "thread",
  })
})

test("linkedin routing works for professional post request", () => {
  assertRoute("Draft a LinkedIn post about how manufacturers adopt AI agents", {
    contentType: "social_global",
    targetPlatform: "LinkedIn",
    renderPlatform: "linkedin",
  })
})

test("email routing works for Chinese business email request", () => {
  assertRoute("写一封商务邮件，跟进上周沟通过的自动化方案", {
    contentType: "email",
    targetPlatform: "Email",
    outputForm: "follow-up email",
    renderPlatform: "generic",
  })
})

test("newsletter routing works for lifecycle email request", () => {
  assertRoute("帮我写一封 onboarding lifecycle email，欢迎新注册用户开始使用 AI 销售助手", {
    contentType: "newsletter",
    targetPlatform: "Email",
    outputForm: "lifecycle email",
    renderPlatform: "generic",
  })
})

test("website copy routing works for landing page request", () => {
  assertRoute("帮我写一个落地页文案，卖点是 AI 客服自动化", {
    contentType: "website_copy",
    targetPlatform: "Website",
    outputForm: "landing page copy",
    renderPlatform: "generic",
  })
})

test("ads routing works for paid acquisition request", () => {
  assertRoute("写一组信息流广告文案，推广 AI SDR 产品", {
    contentType: "ads",
    targetPlatform: "Ads",
    outputForm: "paid social ad variants",
    renderPlatform: "generic",
  })
})

test("case study routing works for Chinese customer story request", () => {
  assertRoute("整理一个客户成功案例，讲制造业客户如何用 AI 销售助手提升线索转化", {
    contentType: "case_study",
    outputForm: "formal case study",
    renderPlatform: "generic",
  })
})

test("product routing works for FAQ style request", () => {
  assertRoute("给我写一份产品 FAQ，介绍 AI 外呼助手怎么接入 CRM", {
    contentType: "product",
    outputForm: "product documentation",
    renderPlatform: "generic",
  })
})

test("speech routing works for Chinese keynote request", () => {
  assertRoute("写一份 10 分钟的 keynote 演讲稿，主题是企业如何落地 AI agent", {
    contentType: "speech",
    lengthTarget: "10-minute speech",
    outputForm: "full speech script",
    renderPlatform: "generic",
  })
})
