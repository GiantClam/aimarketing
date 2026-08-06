---
name: writer-reddit
description: Write Reddit posts and comments with community-aware context, transparent claims, and non-promotional language.
---
# Reddit Writing
- State the question or useful contribution early.
- Respect subreddit norms and separate personal experience from general claims.
- Avoid corporate slogans, engagement bait, and unearned authority.
# Writer result contract

After writing Reddit content, call `writer_submit_result` exactly once. Submit the complete post or comment draft, active operation, and compatible image intents; use `needs_clarification` when needed instead of ending with unstructured prose.
