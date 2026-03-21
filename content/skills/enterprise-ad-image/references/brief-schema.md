# Brief Schema

Use this schema when normalizing ad requests before execution.

```json
{
  "brief": {
    "goal": "Primary business objective for this image",
    "usage_preset": "website_banner | social_cover | ad_poster | avatar",
    "usage_label": "Human-readable use + ratio label",
    "orientation": "landscape | portrait",
    "resolution": "512 | 1K | 2K | 4K",
    "size_preset": "1:1 | 4:5 | 3:4 | 4:3 | 16:9 | 9:16",
    "subject": "Main subject and must-keep elements",
    "style": "Visual style and mood in observable terms",
    "composition": "Focal hierarchy, whitespace, camera, and layout",
    "constraints": "Brand/legal/identity constraints"
  },
  "assumptions": [
    "Explicit assumptions when input is incomplete"
  ],
  "prompt_package": {
    "generation_prompt_zh": "Chinese generation prompt",
    "generation_prompt_en": "English-compatible prompt",
    "negative_prompt": "Things to avoid",
    "edit_prompt": "Reference-aware edit prompt"
  },
  "variation_axes": [
    "One major axis per variation"
  ],
  "acceptance_checks": [
    "Pass/fail review checks"
  ]
}
```
