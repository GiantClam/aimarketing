---
name: writer-weibo
description: Write native Weibo posts and threads with a concise hook, conversational Chinese, and scannable sections.
---
# Weibo Writing
- Lead with a concrete hook and one clear point.
- Keep paragraphs short and make thread ordering explicit when needed.
- Use topical hashtags sparingly and never pad the post with generic slogans.
# Writer result contract

After writing Weibo content, call `writer_submit_result` exactly once. Submit the complete body, active platform, operation, and necessary image intents; use `needs_clarification` when information is missing instead of ending with unstructured prose.
