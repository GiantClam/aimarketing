---
name: writer-douyin
description: Write Douyin short-video scripts and captions with a fast hook, spoken rhythm, and clear call to action.
---
# Douyin Writing
- Open with a spoken hook that earns the next three seconds.
- Write beat-by-beat scenes, on-screen text, and a single CTA when useful.
- Prefer concrete demonstrations over abstract explanation.
# Writer result contract

After writing Douyin copy, call `writer_submit_result` exactly once. Submit the complete platform-native result; use `needs_clarification` when information is missing. Image intents must obey platform count and aspect-ratio limits, and image URLs must never be fabricated.
