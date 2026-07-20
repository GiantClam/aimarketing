## Purpose

This document defines how the executive consulting suite should be evaluated.

The main question is not “did it follow every structure block?” The main question is “did it make a strong executive judgment while staying inside the boundaries?”

## Evaluation philosophy

Reward outputs that help a company leader make a better decision under uncertainty.

Favor:
- real understanding of the business problem
- effective use of enterprise knowledge
- correct use of Dify-backed enterprise retrieval when platform binding exists
- sound legal-source behavior when legal guidance is given
- clear identification of the main constraint
- good handling of cross-domain tension
- one unified executive voice
- strong legal and governance boundaries
- useful prioritization
- reasonable flexibility in how the answer is structured

Do not over-reward:
- ceremonial framework output
- rigid template completion
- long reports
- consultant theater
- domain name-dropping without insight

## Primary scoring dimensions

### 1. Problem understanding
Did the skill correctly understand what the user was actually asking and what business outcome was at risk?

### 2. Enterprise knowledge usage
Did the skill use available enterprise knowledge before asking repetitive or low-value intake questions?

### 3. Dify retrieval behavior
When a bound Dify enterprise knowledge source was available through platform context, did the skill use bootstrap retrieval first, then narrow follow-up retrieval appropriately, rather than behaving as if no company context existed?

### 4. Clarification quality
Did the skill ask a small number of high-value questions when needed, and avoid over-interviewing the user when not needed?

### 5. Strategy awareness
Did the skill keep strategy or business-model mismatch visible when it materially changed the diagnosis?

### 6. Routing quality
Did the skill identify the right lead lens and preserve supporting domains when they materially changed the recommendation?

### 7. Integration quality
In mixed cases, did the skill produce one coherent recommendation stream rather than fragmented domain advice?

### 8. Prioritization quality
Did the final answer clearly indicate what matters most now?

### 9. Confidence calibration
Did the skill keep fact, inference, hypothesis, and missing data appropriately distinct?

### 10. Risk boundary correctness
Did the skill preserve legal, employment, compliance, and governance boundaries when triggered?

### 11. Artifact handoff quality
If a reusable artifact was requested, did the skill choose the right artifact type, preserve the right business framing, and carry forward review boundaries?

### 12. Legal guidance quality
When the skill gave contract or employment guidance, did it stay inside China-mainland supported scope, use source-aware reasoning, and assign the right review tier?

### 13. Contract review quality
When the skill handled a contract-like matter, did it classify the document type sensibly, identify risky clauses and missing protections, surface key obligations or deadlines, and give actionable revision or negotiation direction?

### 14. Review-mode judgment
When the user provided an existing draft, did the skill choose sensibly between comment-first review and full redraft, rather than rewriting by reflex?

### 15. Deliverable readiness judgment
When a user asked for a named deliverable, did the skill judge whether the business was actually ready for it, reframe naturally when needed, and distinguish provisional vs final output responsibly?

### 16. Output usefulness
Would this actually help a founder, CEO, or owner decide what to do next?

## Automatic blockers

Any of the following is a blocking failure:

1. **Enterprise knowledge exists but was ignored before broad follow-up questions**
2. **A bound Dify knowledge source exists through platform context but the skill behaves as if no company retrieval is available**
3. **Material knowledge-base gaps, staleness, or conflicts were ignored when they changed the judgment**
4. **The answer gives legal or employment certainty where bounded escalation was required**
5. **A multi-domain case is presented as separate persona outputs**
6. **A clearly mixed case is flattened into a fake single-cause story**
7. **A contract-type artifact is framed as final rather than draft-plus-review**
8. **A complex problem receives only generic wallpaper advice**
9. **A simple problem is over-processed into unnecessary ceremony without improving clarity**
10. **A clearly premature deliverable request is treated as if the business were already ready for a final artifact**
11. **Missing operating foundations are ignored and compressed into a fake one-step document-generation answer**
12. **Substantive legal guidance is presented without any source-aware strategy when authority or freshness matters**
13. **A high-risk legal matter is mislabeled as internal-confirmation only**
14. **A contract-like matter ignores obvious missing protections, key obligations, or timing duties that materially affect business use**
15. **A contract draft silently invents key missing facts instead of preserving placeholders or flagging the gap**

## Reviewer questions

Use questions like these during grading:

### Understanding
- Did the skill identify the real business problem?
- Did it distinguish symptoms from likely causes?

### Enterprise knowledge
- Did it check for enterprise knowledge before broad discovery questions?
- Did it use existing company materials to reduce repetitive intake?
- Did it handle coverage, freshness, and conflict responsibly?
- Did it prefer current user clarification over older enterprise knowledge when they conflicted?

### Dify retrieval behavior
- If `enterprise_id` and bound retrieval context were available, did the skill use that context before broad intake?
- Did it behave differently for bootstrap retrieval vs targeted retrieval vs artifact-context retrieval?
- If Dify binding was unbound or errored, did it fall back gracefully instead of failing or pretending full company knowledge?

### Clarification
- Did it ask only the next best questions?
- Did it stop asking once a useful judgment was possible?
- Did later turns update the diagnosis rather than restart it?

### Strategy awareness
- Did it test whether the issue was upstream of the named function?
- Did it keep strategy mismatch visible when it mattered?

### Routing and integration
- Was the lead lens defensible?
- Were supporting domains included only when they materially changed the answer?
- Did multi-expert cases end in one integrated recommendation stream?

### Prioritization
- Is it clear what should happen first?
- Is the recommendation appropriately scaled to the problem?

### Uncertainty
- Did the answer stay honest about what was known vs inferred?
- Did it avoid fake precision?

### Risk boundaries
- Was escalation triggered correctly?
- Did the answer avoid pseudo-legal certainty?
- If a contract draft or legal note was requested, was the correct review tier made clear?

### Legal guidance
- Did the answer stay inside China-mainland contract and employment scope unless the task explicitly supported more?
- Did it use enterprise legal materials when they existed?
- Did it use source-aware language when statutes, official rules, or case support mattered?
- Did it distinguish low-risk standardized matters from medium- and high-risk matters?
- Did it downgrade confidence when source support was incomplete?

### Contract review quality
- Did the answer classify the document type before applying clause advice?
- Did it distinguish bad language from missing protection?
- Did it surface the obligations, deadlines, notice duties, payment triggers, or return obligations that matter in practice?
- Did it propose a usable revision direction or fallback position instead of stopping at “this is risky”?
- Did it preserve review tier when negotiation suggestions became more aggressive?

### Review-mode judgment
- If the user asked to review an existing draft, did the answer consider comment-first review instead of rewriting automatically?
- Did it separate party, baseline text, commercial, and legal findings when that improved the review?
- If key facts were missing, did the draft preserve placeholders instead of fake certainty?

### Artifact generation
- Was the artifact type correct for the request?
- Did the handoff preserve the right business brief and key sections or columns?
- Did it reuse enterprise knowledge when relevant materials already existed?
- Was the output correctly labeled as provisional vs final when readiness was incomplete?
- If it was a legal artifact, did it carry the right review tier?

### Deliverable readiness
- Did the skill notice the gap between what the user asked for and what the business is ready to support?
- Did it naturally reframe the request without sounding obstructive?
- Did it identify the minimum foundations that must be fixed first?
- If it still produced something now, was it clearly presented as a provisional version rather than a fake final answer?

### Output quality
- Would this answer actually help a business leader?
- Did the answer stay in one executive voice?

## Scoring guidance

Use a 0-2 scale per dimension:
- **2 = strong**
- **1 = partial**
- **0 = failed**

Do not compensate for a failed boundary dimension with writing quality.
