# Canvas entity stories — planned, not built

This directory is reserved for the gallery's canvas section: joints, links, slots, slides,
cylinders, forces, the glyph primitives they are drawn from, and the ambiguous hit targets
where two of them overlap.

**Nothing belongs here yet.** Stages 1 and 2 of
[`docs/joint-type-and-cylinder-plan.md`](../../../docs/joint-type-and-cylinder-plan.md) change how a
slider and a cylinder are drawn — a slider becomes one joint with one mark, and a cylinder's slide
becomes a joint of its own — so building these stories against today's `Joint` / `Link` model
would mean building them twice.

Until then:

- The visual grammar those stories will illustrate is written down in
  [`docs/joint-types-plan.md` §2.8](../../../docs/joint-types-plan.md#28-visual-grammar).
- The form primitives the panels are built from are in `src/stories/blocks/`.
- The gallery's "Canvas entities" docs page (`src/stories/docs/canvas-entities.mdx`) says the
  same thing inside Storybook.
