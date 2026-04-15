---
name: customer-intelligence-risk
description: Use when the user wants a customer profile, company research, website analysis, BD due diligence, sentiment analysis, partnership risk review, breach-risk judgment, or global customer intelligence from a company name and official website. Produces a customer-facing BD intelligence brief using Tavily API and Serper.dev API signals, with product pricing, customer persona, buying committee, ICP fit, market positioning, and commercial fulfillment risk. Also supports VBUY/威佰-specific customer development analysis using the bundled VBUY fit reference layer.
---

# Customer Intelligence Risk

## Overview

This skill is for public-information due diligence on a target company when the goal is to understand whether the company is worth pursuing, how to approach it, and what commercial risks may affect cooperation.

The default stance is sales-first, not legal-first. The output should help BD, partnerships, channel teams, and account strategy teams move faster with better judgment.

This skill does not replace:
- formal legal opinions
- sanctions screening
- paid credit reports
- audit work
- private investigative research

The skill should sound like one practical commercial advisor. It should not produce consultant theater, invented certainty, unsupported accusations, or internal debugging output.

## Online product scope

For V1 online product deployment, this skill assumes only server-side API capabilities.

Required online capabilities:
- `TavilyConnector`
- `SerperConnector`
- `LLMAnalysis`
- `EvidenceStore`
- report generation

Do not make the online V1 flow depend on:
- local `agent-reach`
- local `mcporter`
- local `xreach`
- local MCP services
- browser cookies
- user login-state scraping
- local proxies
- desktop browser automation

Agent-reach style tools can be useful for internal research or later enterprise deployments, but they are not part of the default online V1 chain.

## Customer-facing output rule

The final customer-facing report must be a clean BD intelligence brief.

Do not show these as customer-facing sections by default:
- `待验证问题`
- `证据矩阵`
- `工具覆盖与缺口`
- raw search logs
- API names, provider diagnostics, or search failure details
- Tavily, Serper, connector, cache, or extraction implementation details

Still build the internal evidence matrix for reasoning and quality control. Use it to ground claims, but surface only concise source-backed wording in the customer report. If coverage is limited, phrase it as a business uncertainty such as "公开信息覆盖有限" rather than exposing tool internals.

Critical confirmations may appear naturally inside the risk or outreach sections, but not as a separate internal checklist unless the user explicitly asks for an audit appendix.

## VBUY targeted mode

Use VBUY targeted mode when the user asks to analyze a customer from the perspective of VBUY, 威佰, 深圳市威佰实业有限公司, VBUY Textile, Jiangsu Vbuy Textile Group, or "our company knowledge base".

When this mode is active, read `references/vbuy-fit-layer.md` before generating the report.

VBUY targeted mode changes the output goal:
- Do not merely summarize the target company.
- Judge whether the target company is worth pursuing for VBUY.
- Identify the most relevant VBUY product line, cooperation scenario, and BD entry angle.
- Filter out unrelated VBUY products and capabilities.
- Convert VBUY's manufacturing, customization, quality, compliance, and delivery strengths into customer-specific sales logic.

Relevance rules:
- Recommend at most 1-3 VBUY product lines in the customer-facing report.
- Do not list the full VBUY product matrix unless the user explicitly asks for VBUY capability coverage.
- If the target company's public business has no clear textile, private-label, gifting, retail, ecommerce, cleaning, outdoor, pet, travel, golf, beach, hotel, resort, catalog, importer, distributor, or wholesale fit, state `低匹配` or `证据不足`.
- Product and pricing analysis must focus on the target company's products that could connect to VBUY's relevant product lines, not all products the target company sells.
- Use VBUY knowledge as internal seller context, not as a customer-facing appendix.

## When to use

Use this skill when the user provides or can provide:
- a company name
- an official website
- an intended cooperation context such as customer acquisition, channel partnership, supplier evaluation, or strategic BD

Common prompts:
- "分析这家公司的客户画像和合作风险"
- "我给你公司名和官网，做一份 BD 尽调"
- "帮我看这个客户的舆情，判断是否有违约风险"
- "做一下这家公司的全球客户分析和合作建议"
- "根据官网推断这家公司的目标客户和决策链"

## When not to use

Do not use this skill as the primary workflow when the user actually needs:
- a lawyer-grade legal conclusion
- a regulatory memo
- a formal KYC or AML review
- a sanctions or export-control screen
- a paid credit bureau or Dun and Bradstreet style report
- a financial audit or forensic accounting analysis

If those topics appear, keep the commercial view but state the boundary clearly.

## Required inputs

Minimum required:
- `company_name`
- `website_url`

Optional but useful:
- `hq_country`
- `industry_hint`
- `target_region`
- `cooperation_type`

If only `company_name` is available, first identify the official website. If the site is unavailable, continue with public sources and explicitly lower confidence.

If `cooperation_type` is missing, output a general BD brief. Mention in the outreach or risk section that cooperation-specific risk depends on the actual commercial structure.

## V1 connector strategy

### TavilyConnector

Use Tavily as the primary research and extraction provider.

Use it for:
- official website extraction
- About, product, pricing, store, support, shipping, return, refund, and policy pages
- collection, product, SKU, bundle, and promotion pages
- company blog and press releases
- mainstream media articles
- founder or executive interviews
- source-backed summaries of high-value URLs

Tavily-derived page content is preferred over search-result snippets for final evidence.

### SerperConnector

Use Serper.dev as the Google SERP discovery provider.

Use it for:
- Google organic result discovery
- Google news discovery
- product price and collection-page discovery
- review-site discovery
- complaint-site discovery
- BBB, Trustpilot, Reddit, forum, and community result discovery
- lawsuit, legal dispute, refund, shipping, customer service, and partner dispute keyword searches
- country, region, and language-specific search

Serper snippets are leads, not final proof. A Serper result can support a key judgment only when:
- the source itself is high-trust, or
- the page is later extracted and summarized by Tavily, or
- several independent sources point to the same low-risk pattern.

### LLMAnalysis

Use the LLM to:
- synthesize customer profile and ICP fit
- separate facts from inferred judgments
- classify signals as positive, negative, neutral, or uncertain
- assign commercial fulfillment risk
- translate buying committee and buying jobs into BD actions
- generate a concise customer-facing brief

### EvidenceStore

Every report should preserve an internal evidence layer. Store source evidence in a structured matrix for debugging, quality review, and admin/audit views. Do not output the full matrix to customers by default.

## V1 search flow

1. Accept `company_name`, `website_url`, and optional `cooperation_type`.
2. Generate a fixed query plan from the V1 query playbook.
3. Use Tavily first to extract the official website and core pages.
4. Extract product, pricing, collection, bundle, promotion, FAQ, return, refund, and shipping pages when available.
5. Use Serper to discover Google SERP, news, reviews, complaints, negative-keyword results, and price-related pages.
6. Deduplicate URLs and group them by source type.
7. Select the top sources for extraction and review.
8. Use Tavily to extract high-value URLs where possible.
9. Build the internal evidence matrix.
10. If VBUY targeted mode applies, load `references/vbuy-fit-layer.md` and build the VBUY fit assessment.
11. Generate the customer-facing Chinese BD brief with 8 sections only.

## V1 query playbook

Use a compact, repeatable query plan. Do not spray dozens of vague searches by default.

### Company basics

```text
"{company}" official website about founder headquarters
"{company}" LinkedIn company employees headquarters
"{company}" funding acquisition revenue expansion
```

### Business and market

```text
"{company}" products customers market positioning
"{company}" partnership collaboration launch
"{company}" CEO founder interview strategy
```

### Product and pricing

```text
"{company}" product price
site:{domain} price
site:{domain} collections products price
site:{domain} bundle discount promotion
"{company}" pricing product collection
```

In VBUY targeted mode, add product-line-specific queries only after identifying the most relevant scenario:

```text
"{company}" golf towel tournament gift member gift
"{company}" beach towel poncho quick dry travel towel
"{company}" microfiber cleaning towel private label wholesale
"{company}" pet towel pet bathrobe retail
"{company}" sustainable recycled textile collection
```

Use only the queries relevant to the target company. Do not search every VBUY category by default.

### Sentiment and commercial risk

```text
"{company}" reviews complaints refund shipping
"{company}" customer service complaints
"{company}" lawsuit legal dispute
"{company}" BBB complaints
"{company}" Trustpilot reviews
"{company}" Reddit complaints
```

### Regional and global market

```text
"{company}" Asia expansion
"{company}" China partner distributor
"{company}" Europe distributor expansion
"{company}" regional launch partnership
```

### Cooperation-specific queries

If `cooperation_type` is known, add targeted queries:

```text
"{company}" authorized partner distributor
"{company}" supplier partnership
"{company}" wholesale retail partner
"{company}" integration case study
"{company}" support status outage
```

## Research modes

### Quick mode

Use for early screening.

Default scope:
- Tavily: official site plus 3-5 high-value pages
- Serper: 5-8 discovery searches
- Output: compact BD conclusion with key risk and outreach angle

### Standard mode

Use as the default.

Default scope:
- Tavily: official site, product/pricing pages, policy pages, major media sources
- Serper: company basics, market, product pricing, reviews, complaints, regional signals
- Output: full 8-section customer-facing BD brief

### Deep mode

Use for high-value customers or high commercial exposure.

Default scope:
- broader regional and multilingual searches
- more source extraction
- stricter internal evidence matrix
- internal human-review flags for high-risk claims

Deep mode can recommend future connectors, but V1 must still degrade cleanly if only Tavily and Serper are available.

## Source priority

Always prefer higher-trust public sources first.

Priority order:
1. Official website, official blog, press releases, product pages, leadership pages, policy pages
2. Regulatory, court, exchange, or government records when relevant and available through public search
3. Mainstream media and reputable industry publications
4. LinkedIn, hiring pages, conference talks, podcast appearances, public video interviews
5. Review sites, forums, complaint boards, reposts, Reddit, and community chatter

Rules:
- Attribute important claims to a source type and, when possible, a date.
- Treat lower-trust sources as signals, not proof.
- If sources conflict, show the conflict instead of smoothing it away.
- If evidence is thin, say `证据不足` instead of guessing.
- Never write "no risk" when the accurate statement is "no public negative signal found."

## Internal evidence matrix

Every key judgment should map to internal evidence. This matrix is for internal reasoning, debugging, quality review, and optional admin/audit views. Do not include it in the default customer-facing report.

Use these fields:

```json
{
  "claim": "The specific claim used in the report",
  "source_url": "https://example.com/source",
  "source_type": "official | media | regulatory | review_site | forum | social | search_result | other",
  "source_provider": "tavily | serper | user_provided | other",
  "extracted_by": "tavily | not_extracted | user_provided",
  "date": "published or accessed date if available",
  "signal_type": "positive | negative | neutral | uncertain",
  "business_impact": "market_position | pricing | payment_risk | delivery_risk | service_risk | contracting_entity | channel_stability | BD_angle | ICP_fit | buying_committee | other",
  "confidence": "high | medium | low"
}
```

Confidence rules:
- `high`: official source, regulator/court/government record, reputable media, or multiple corroborating medium-trust sources
- `medium`: industry media, LinkedIn/hiring signals, partner pages, extracted customer-review patterns with enough context
- `low`: snippets, forums, single complaints, anonymous posts, reposts, or non-extracted pages

High-risk conclusions must be traceable to high-confidence evidence or multiple independent medium-confidence signals. Low-confidence evidence can trigger internal follow-up logic but should not alone support severe conclusions.

## Workflow

### 1. Collect company facts

Establish the basics:
- official name and website
- headquarters and operating regions
- product lines and business model
- customer-facing positioning
- evidence of scale such as hiring, funding, public metrics, or notable customers

### 2. Analyze product and pricing

Always identify:
- core products or services
- primary SKUs or packages
- price range and currency
- bundle or collection pricing
- discounts and promotions
- shipping, taxes, duties, and fees if visible
- pricing constraints, sale exclusions, or return-policy implications

For ecommerce and consumer brands, price range is a required output. If price cannot be extracted reliably, write `官网公开价格信息未能稳定提取` rather than guessing.

### 3. Derive the customer profile

Infer who the company is trying to serve and how.

Cover:
- target segments
- likely buyer and likely user
- geographic focus
- firmographic clues such as company size, industry, maturity
- psychographic clues such as decision style, risk appetite, growth orientation
- goals, pain points, and jobs-to-be-done
- buying triggers and likely objections
- anti-persona signals that suggest poor fit

### 4. Map buying committee and buying jobs

Identify the likely:
- buyer
- user
- influencer
- approver
- procurement stakeholder
- finance stakeholder

Infer which buying jobs matter most:
- problem identification
- solution exploration
- requirements building
- supplier selection
- validation
- internal consensus creation

Convert this into BD action. Do not present it as academic buying-process theory.

### 5. Judge ICP and cooperation fit

Assess whether the company looks like a good commercial target or partner.

Internal ICP fit rating:
- `高匹配`
- `中匹配`
- `低匹配`
- `证据不足`

Internal scoring dimensions:
- cooperation value
- likely budget
- decision complexity
- risk exposure
- channel or regional fit

Customer-facing output should show a concise cooperation-fit judgment, not a long scoring table.

In VBUY targeted mode, also assess:
- VBUY customer type: importer, distributor, wholesaler, brand buyer, retail/ecommerce brand, catalog buyer, or low-fit/unclear
- relevant VBUY product lines, limited to the best 1-3 matches
- likely VBUY buying trigger such as private label, brand merchandise, event gifting, retail line extension, compliance-ready supply, replenishment stability, or supplier diversification
- VBUY-specific disqualification risks such as unrelated category, unrealistic claims, unclear purchasing entity, or unsuitable order structure

### 6. Place the company in the market

Summarize:
- market positioning
- product and messaging emphasis
- competitive context
- growth or transformation themes such as AI, enterprise expansion, vertical focus, channel strategy
- notable GTM signals from launches, campaigns, hiring, or leadership statements

### 7. Assess sentiment and commercial risk

Review public sentiment and operational signals that may affect cooperation.

Look for:
- positive momentum
- reputational concerns
- delivery reliability concerns
- payment risk signals
- service and after-sales risk signals
- partner stability signals
- unusual volatility in leadership, hiring, or public commitments

### 8. Produce BD guidance

End with practical customer-facing guidance:
- `建议推进`
- `谨慎推进`
- `暂缓推进`

Support it with:
- the top reasons
- the best entry angle
- the first outreach hypothesis
- the main risk to manage
- key confirmations embedded naturally in the recommendation

## Analysis framework

Combine five lenses into one brief.

### Company research lens

Capture:
- company overview
- history and major milestones
- business model and product stack
- executive and leadership signals
- strategic direction and operating priorities

Prefer substance over brochure copy. If executives have spoken publicly, extract the underlying strategic signal rather than reproducing PR language.

### Product and pricing lens

Capture:
- core product categories
- price range and currency
- hero product pricing
- bundle and collection structure
- active promotions
- likely willingness-to-pay segment
- whether pricing supports mass-market, premium, enterprise, or niche positioning

### Customer persona lens

Infer:
- demographics or firmographics
- psychographics
- goals
- pain points
- jobs-to-be-done
- buying triggers
- decision objections
- anti-persona or non-fit segments

Use ranges and patterns, not invented precision.

### Ideal customer profile lens

Assess:
- company size and vertical fit
- buyer behavior and adoption behavior
- decision-making process
- budget and stakeholder clues
- fit criteria
- disqualification criteria
- highest-value segment clues

Keep the judgment commercial and actionable. The point is prioritization, not academic taxonomy.

### Market intelligence lens

Extract:
- market positioning
- competitive pressure
- external messaging patterns
- likely growth bets
- signals from campaigns, launches, hiring, or public narrative shifts

The goal is to understand how this company presents itself to the market and what that implies for BD timing and positioning.

## Industry-specific checks

Apply these checks when the company type is identifiable.

### DTC, ecommerce, consumer, or retail brands

Must check:
- product price range
- hero product pricing
- bundles, discounts, and promotions
- whether shipping, taxes, or duties are charged separately
- shipping
- returns
- refund
- sale-item restrictions
- customer service
- reviews
- complaints
- order cancellation patterns

Consumer-review signals should be labeled as customer experience signals, not legal facts.

In VBUY targeted mode:
- If the brand is golf-related, prioritize golf towels, magnetic waffle towels, tri-fold towels, caddie towels, rain hood towels, event gifts, and member gifts.
- If the brand is swim, beach, resort, outdoor, or travel-related, prioritize beach towels, ponchos, quick-dry towels, cooling towels, travel towels, and packaging customization.
- If the brand sells pet products, prioritize pet towels, pet bathrobes, pet mats, retail packaging, and care scenarios.
- If the brand sells cleaning, automotive, hotel, or household utility products, prioritize microfiber and cotton cleaning towels, absorption, durability, replenishment, and cost efficiency.
- If the brand has a sustainability angle, check whether recycled or certification-supported textile directions are relevant, but do not overstate environmental claims.

### B2B SaaS or technology companies

Must check:
- security or trust pages
- customer case studies
- integrations
- pricing or packaging signals
- support and documentation
- status or outage signals when publicly available
- buying committee and procurement complexity

### Channel, distributor, or agency cooperation

Must check:
- authorized partner language
- distributor or reseller references
- regional entity
- payment subject
- contracting entity
- channel conflict or territory dispute signals
- return and after-sales responsibility

### Manufacturing or supply-chain customers

Must check:
- certifications
- capacity signals
- delivery reliability
- recall or quality issues
- factory or supplier dispute signals
- payment and delivery responsibility split

## Sentiment and risk rules

### Positive signals

Examples:
- funding, expansion, or new market entry
- major customer wins or case studies
- product launches and steady release cadence
- credible partnership announcements
- hiring growth in relevant teams
- executive consistency and clear strategic narrative
- positive coverage from reputable outlets
- stable pricing, policy, and customer-service pages

### Negative signals

Examples:
- lawsuits, enforcement actions, or repeated public disputes
- payment delays, collections, or chronic complaint patterns
- delivery failures, outages, or repeated service incidents
- unclear refunds, shipping, or return terms
- inconsistent official contact or contracting information
- layoffs tied to stress rather than routine optimization
- abrupt leadership turnover
- partner conflict, reseller disputes, or public contract friction
- aggressive claims that contradict observable traction

### Risk boundaries

`违约风险` in this skill means commercial fulfillment risk by default, including:
- payment reliability
- delivery reliability
- service and after-sales reliability
- commitment follow-through
- contracting-entity clarity
- partner or channel stability

Do not present this as a definitive legal breach finding.
Do not say a company has breached unless there is clear public evidence and the claim is attributed.
If signals are mixed or weak, state that the risk is inferred from public indicators and remains unverified.

### Risk output

Use one overall risk rating and five sub-ratings.

Allowed ratings:
- `低`
- `中`
- `高`
- `证据不足`

Sub-risks:
- 付款风险
- 交付风险
- 售后/客服风险
- 签约主体风险
- 渠道/合作稳定性风险

Suggested interpretation:
- `低`: no meaningful public warning signals and several positive stability signals
- `中`: mixed evidence, limited negative signals, or unresolved uncertainty
- `高`: multiple credible warning signals affecting payment, delivery, service, reputation, contracting entity, or partner stability
- `证据不足`: public information is too thin or conflicting for a responsible judgment

## V1 degradation rules

If Tavily is unavailable:
- Do not generate a full report.
- Return a research failure or retry-needed message internally.
- Customer-facing output should not pretend research was completed.

If Serper.dev is unavailable:
- A basic report may be generated from Tavily and user-provided sources.
- Customer-facing output should say public-sentiment coverage is limited, without naming the missing provider.
- Do not make strong negative-signal claims from missing SERP coverage.

If the official website is unavailable:
- Continue with public sources if available.
- Lower overall confidence.
- Mention that official-site information could not be fully verified.

If `cooperation_type` is missing:
- Output a general BD brief.
- Mention that risk exposure depends on the actual cooperation structure.
- Embed key commercial confirmations in the outreach recommendation.

## Output template

Default output is a concise Chinese customer-facing BD brief. Use exactly these 8 sections unless the user explicitly asks for an appendix.

In VBUY targeted mode, every section must be written from VBUY's BD perspective and must pass the relevance filter:
- focus on target-company products, channels, buyers, and risks that affect VBUY cooperation
- do not mention unrelated VBUY product categories
- replace section 7 with `VBUY 合作切入点`

```markdown
# [Company Name] 客户画像与合作风险简报

## 1. 公司概览
- 公司名称：
- 官网：
- 总部与区域：
- 业务模式：
- 关键信号：

## 2. 业务与市场定位
- 核心产品或服务：
- 目标市场：
- 差异化定位：
- 当前增长或转型主题：

## 3. 产品与价格区间
- 核心产品/服务：
- 主推产品或套餐：
- 价格区间：
- 折扣/促销：
- 运费、税费或附加成本：
- 价格定位判断：

## 4. 目标客户画像
- 核心客户细分：
- 典型 buyer：
- 典型 user：
- 主要痛点：
- JTBD：
- 购买触发因素：
- 反向画像：

## 5. 采购与合作决策链
- 合作适配度判断：高匹配 / 中匹配 / 低匹配 / 证据不足
- 可能的预算拥有者：
- 关键影响者：
- 可能的评估流程：
- 当前最可能的 buying job：
- 主要异议：

## 6. 舆情与商业履约风险
- 舆情摘要：
- 总风险等级：低 / 中 / 高 / 证据不足
- 付款风险：
- 交付风险：
- 售后/客服风险：
- 签约主体风险：
- 渠道/合作稳定性风险：
- 风险边界说明：

## 7. 合作切入点
- 最可能切入的业务问题：
- 建议的价值主张：
- 不宜采用的切入方式：

## 8. 首次接洽建议
- 建议推进结论：建议推进 / 谨慎推进 / 暂缓推进
- 首次沟通主线：
- 应优先确认的商业事项：
```

For VBUY targeted mode, keep the same 8-section structure but apply these substitutions:
- Section 2 may include `与 VBUY 的潜在关联`.
- Section 3 should use `与 VBUY 相关的核心产品/服务`, `相关价格区间`, and `对 VBUY 合作的启示`.
- Section 4 should include `VBUY 视角下的客户类型`.
- Section 7 title must be `VBUY 合作切入点` and use: `推荐产品线`, `首推 SKU / 工艺方向`, `推荐合作方式`, `VBUY 价值主张`, `不宜采用的切入方式或表述`.

## Quality bar

Always:
- keep the tone commercial, practical, and evidence-aware
- separate observed facts from inferred judgments
- use the internal evidence matrix to ground key claims
- cite or summarize source basis naturally without exposing internal tooling
- mention dates when recency matters
- make uncertainty visible
- include product and pricing analysis for ecommerce, DTC, consumer, and retail brands
- include cooperation-fit judgment and buying committee inference
- in VBUY targeted mode, use `references/vbuy-fit-layer.md` and recommend only relevant VBUY product lines
- in VBUY targeted mode, make product analysis customer-specific rather than listing VBUY's full catalog
- prefer a short high-signal brief over a long generic report

Never:
- invent customers, revenue, prices, partnerships, or legal outcomes
- guess a price range when product pricing cannot be extracted reliably
- output `待验证问题`, `证据矩阵`, or `工具覆盖与缺口` in the default customer-facing report
- expose Tavily, Serper, API, connector, cache, or extraction details unless the user explicitly asks
- treat forum chatter as established fact
- treat Serper snippets as final evidence by default
- overfit a persona from one weak clue
- force-fit unrelated VBUY products into a target-company report
- use unverified VBUY claims about revenue, employee count, machine count, capacity, patents, brand endorsements, organic cotton, biodegradability, medical use, or absolute environmental performance
- declare "no risk" when the real state is "no public negative signal found"
- confuse commercial fulfillment risk with formal legal liability
- require local CLI tools for the online V1 product flow

## Final reminder

This skill is successful when it helps the user decide:
- whether to pursue the company
- how to approach the company
- what product and price positioning imply
- who likely participates in the buying decision
- what risks to watch before investing more BD effort

It is not successful when it merely summarizes the website or exposes internal research mechanics to the customer.
