---
name: writer-linkedin
description: Write credible LinkedIn posts for professional audiences with a clear insight, evidence, and practical takeaway.
---
# LinkedIn Writing
- Lead with a specific observation or decision, not a generic motivational claim.
- Use professional first-person only when supported by supplied context.
- End with a useful takeaway or focused discussion prompt.
# Writer result contract

After writing LinkedIn content, call `writer_submit_result` exactly once. Submit complete platform-native content, operation, and compatible image intents; use `needs_clarification` when information is missing instead of returning unsubmitted prose.
