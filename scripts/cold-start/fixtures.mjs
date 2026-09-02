/**
 * The styles the benchmark page renders.
 *
 * One module so the runtime page, the server-rendered control, and the checks
 * that the two produce the same result all read the same list.
 */
/**
 * The design tokens the fixtures reference. An unconfigured `#purple` compiles
 * to `var(--purple-color)` with nothing behind it, so the page would render
 * transparent boxes and the benchmark would be timing unstyled divs.
 */
export const TOKENS = {
  '#purple': '#7b61ff',
  '#dark': '#12121f',
};

export const COMPONENT_STYLES = [
  {
    display: 'flex',
    fill: '#purple',
    padding: '2x',
    color: '#white',
    radius: '1r',
  },
  { display: 'grid', gap: '1x', radius: '1r', border: '1bw solid #dark.10' },
  { display: 'block', border: '1bw solid #dark', width: '10x', padding: '1x' },
  {
    display: 'flex',
    flow: 'column',
    gap: '2x',
    fill: '#dark.04',
    padding: '2x',
  },
  {
    display: 'inline-flex',
    placeContent: 'center',
    height: '4x',
    padding: '0 2x',
  },
  { display: 'grid', gridColumns: '1fr 2fr', padding: '1x 2x', gap: '1x' },
  { display: 'flex', placeItems: 'center', gap: '1x', color: '#dark.75' },
  { display: 'block', preset: 'h5', color: '#dark', margin: '2x bottom' },
  {
    display: 'flex',
    flow: 'row wrap',
    gap: '.5x',
    fill: '#white',
    shadow: '0 1x 2x #dark.10',
  },
  {
    display: 'grid',
    placeContent: 'stretch',
    height: '8x',
    fill: '#purple.10',
  },
];

/** Distinct styles for `count` components, cycling the base list with a tweak. */
export function stylesFor(count) {
  return Array.from({ length: count }, (_, i) => ({
    ...COMPONENT_STYLES[i % COMPONENT_STYLES.length],
    // A per-component value so no two components share a chunk cache key.
    outlineOffset: `${i}px`,
  }));
}
