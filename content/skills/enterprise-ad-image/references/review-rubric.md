# Review Rubric

Score each output from 1 to 5:

- Objective fit
- Subject clarity
- Brand safety
- Composition and hierarchy
- Ratio/crop safety
- Delivery readiness

Automatic fail conditions:

- Product identity deformation or missing key parts
- Brand color intent clearly off
- Missing logo safety area or legal/copy zone required by brief
- Cannot satisfy confirmed ratio or safe crop
- Concept-like quality that is not production deliverable

Return only one next action:

- `pass`
- `minor_fix`
- `regenerate_composition`
- `regenerate_subject`
- `handoff_to_designer`
