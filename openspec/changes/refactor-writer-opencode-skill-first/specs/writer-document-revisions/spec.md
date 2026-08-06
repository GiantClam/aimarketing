## Purpose

Define durable article revisions and editing behavior so users can continue refining an existing draft without losing prior versions, overwriting concurrent edits, or confusing task progress with document state.

## ADDED Requirements

### Requirement: Durable active draft revision
Each Writer conversation SHALL identify at most one active draft and a monotonically increasing revision. A successful create or transformation result SHALL create a new persisted revision, preserve prior revisions, and make the new revision active only after validation succeeds.

#### Scenario: Create the first article
- **WHEN** a draft-ready result is accepted for a conversation without an active draft
- **THEN** the system persists revision 1 and marks it active

#### Scenario: Revise an existing article
- **WHEN** a valid revision result is based on active revision N
- **THEN** the system persists revision N+1, keeps revision N accessible, and marks N+1 active

#### Scenario: Generation fails
- **WHEN** a create or revision task fails before a valid result is persisted
- **THEN** the active draft and revision remain unchanged

### Requirement: Revision-aware transformation
Revise, rewrite, translate, shorten, expand, and platform-adaptation operations MUST identify the active base revision. Unless the user explicitly requests otherwise, a transformation SHALL preserve the supplied title, supported facts, links, unaffected sections, and existing image intent.

#### Scenario: Change one section
- **WHEN** the user asks to modify one section of an existing article
- **THEN** the new revision changes the requested section and preserves unrelated article content

#### Scenario: Preserve an authored title
- **WHEN** the active article has a user-authored title and the user does not request a title change
- **THEN** the new revision retains the exact title

#### Scenario: Adapt to another platform
- **WHEN** the user explicitly requests cross-platform adaptation
- **THEN** the target-platform revision remains based on the complete source revision and preserves source facts while changing platform-native structure

### Requirement: Optimistic concurrency control
Every generated or manually edited revision SHALL declare its expected base revision. The system MUST reject an update whose expected revision is no longer active and MUST preserve the newer active draft.

#### Scenario: Two edits race
- **WHEN** one edit commits revision N+1 before another edit based on revision N submits
- **THEN** the second edit receives a revision-conflict response and cannot overwrite N+1

### Requirement: Manual edits participate in revision history
Inline article edits performed in the Writer workspace SHALL create a new revision through the same concurrency rules as AI-generated edits. Subsequent OpenCode turns SHALL receive the manually edited active revision in full.

#### Scenario: Continue after a manual edit
- **WHEN** a user edits and saves the article in the workspace and then asks the assistant for another change
- **THEN** the assistant receives the saved manual revision rather than an older generated version

### Requirement: Independent task, turn, and asset states
The system SHALL represent execution status, Writer turn outcome, active document revision, and asset generation status independently. Changing a task to pending/running or assets to generating MUST NOT erase the active draft or imply that no completed article exists.

#### Scenario: Revision task is running
- **WHEN** a new revision is pending or running
- **THEN** the existing active draft remains visible and editable until a validated new revision replaces it

#### Scenario: Images are generating
- **WHEN** text is ready and image generation starts
- **THEN** the active text revision remains ready while asset status independently reports generation progress

### Requirement: Revision-aware conversation display
The Writer workspace SHALL display the latest validated revision by default and SHALL allow previously persisted article revisions to be opened without changing the active revision unless the user explicitly selects a restore or edit action.

#### Scenario: View an older revision
- **WHEN** a user opens a prior article revision
- **THEN** the workspace shows that revision without silently making it active or changing subsequent assistant context
