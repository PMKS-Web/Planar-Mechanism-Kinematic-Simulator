# Canvas entity stories — planned, not built

This directory is reserved for the gallery's canvas section: joints, links, slots, slides,
cylinders, forces, the glyph primitives they are drawn from, and the ambiguous hit targets
where two of them overlap.

**Nothing belongs here yet.** That gallery is stage **S6** of the bodies-and-joints migration,
planned on the unmerged branch `bodies-and-joints-plan` in `docs/bodies-and-joints-plan.md`:
"Rebuild the dev object gallery to expose all new entities and ambiguous hit targets". Building
it against today's `Joint` / `Link` model would mean building it twice.

Until then:

- The visual grammar those stories will illustrate is written down in
  [`docs/joint-types-plan.md` §2.8](../../../docs/joint-types-plan.md#28-visual-grammar).
- The form primitives the panels are built from are in `src/stories/blocks/`.
- The gallery's "Canvas entities" docs page (`src/stories/docs/canvas-entities.mdx`) says the
  same thing inside Storybook.
