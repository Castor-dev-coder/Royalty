# Empty-state placeholder assets

Replaceable illustrations for the customer-facing empty states. The components
reference these files **by path only** — drop in a new file with the **same
name** in this folder and it is used automatically, with no code changes.

| File | State it illustrates | Used in | Recommended size |
| --- | --- | --- | --- |
| `empty-search.svg` | No results for a search or filter | `/services` and `/reviews` lists | 160×120 (4:3) |
| `empty-reviews.svg` | No reviews at all | Homepage reviews carousel, `/my-reviews` | 160×120 (4:3) |
| `empty-gallery.svg` | No gallery images available | Client gallery section (home) | 160×120 (4:3) |
| `empty-booking.svg` | No appointments in a tab/filter | `/appointments` lists | 160×120 (4:3) |

## Replacement guidance

- Keep the exact filename; the path is hard-coded in the empty-state call sites.
- SVG is recommended (crisp at every size). A transparent PNG of the same name
  also works; keep it near 2:3 landscape (320×240 px maximum) so the layout box
  (`clamp(116px, 20vw, 168px)` wide) stays stable.
- Design notes: line art at 2–2.5 px stroke in champagne gold `#d4b45c` with
  `#e5c66c` accents reads best against both app themes. Keep artwork light and
  low-contrast; the text next to the illustration carries the message.
- The illustration is decorative (`aria-hidden`); no alt text is required.
