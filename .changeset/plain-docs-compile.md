---
'@tenphi/tasty': patch
---

Make the shipped documentation MDX-compatible. `docs/` is published with the
package, and three files used HTML that MDX cannot parse: a `<0.05 us` table
cell (read as a JSX tag opening), and unclosed `<br>` / `<img>` void elements.
Rendering on GitHub is unchanged.
