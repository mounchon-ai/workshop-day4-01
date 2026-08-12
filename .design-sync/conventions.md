## Meeting Room Booking UI — conventions

This is a small internal-tool kit (Button, Input, Label, Table + its 7 sub-parts) built on
[Base UI](https://base-ui.com) primitives, styled with Tailwind v4 utility classes and a
CSS-custom-property token layer. The theme is **blue** (primary/ring recolored from the
original neutral shadcn "base-nova" preset).

### Setup

No provider/root wrapper is required — these components read no React context. Just render
them. `Table` already wraps its `<table>` in a scroll container (`overflow-x-auto`); don't
add another one.

### Styling idiom

Tailwind utility classes on `className`, backed by CSS variables (`oklch(...)`) defined in
`:root`/`.dark`. Never invent new utility names — compose from this vocabulary:

| Purpose | Classes |
|---|---|
| Primary action | `bg-primary text-primary-foreground` (blue) |
| Secondary surface | `bg-secondary text-secondary-foreground` |
| Destructive action | `bg-destructive/10 text-destructive` (outline-style, not solid) |
| Page/card surface | `bg-background text-foreground`, `bg-card text-card-foreground` |
| Muted text | `text-muted-foreground` |
| Border | `border-border` (or `border-input` on form controls) |
| Focus ring | `ring-3 ring-ring/50` (blue), paired with `border-ring` |
| Radius | `rounded-lg` (buttons/inputs use the `--radius-lg` scale, not raw px) |

`Button` takes `variant` (`default | outline | secondary | ghost | destructive | link`) and
`size` (`default | xs | sm | lg | icon | icon-xs | icon-sm | icon-lg`) props — don't override
its look with ad hoc classes when a variant already exists.

### Where the truth lives

Read `styles.css` (imports `_ds_bundle.css`, which contains both the compiled Tailwind
utilities and the `:root`/`.dark` token definitions) before styling anything — it's the full
list of available classes and token values. Per-component usage is in each
`components/general/<Name>/<Name>.prompt.md`.

### Example

```tsx
<div className="flex flex-col gap-3 max-w-sm rounded-lg border border-border bg-card p-4">
  <Label htmlFor="room-name">ชื่อห้อง</Label>
  <Input id="room-name" placeholder="ห้องประชุม A" />
  <Button variant="default">ยืนยันการจอง</Button>
</div>
```
