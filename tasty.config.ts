export default {
  tokens: [
    '#white',
    '#black',
    '#current',
    '#clear',
    '$gap',
    '$radius',
    '$border-width',
    '$outline-width',
    '$transition',
    '$sharp-radius',
    '$bold-font-weight',
  ],
  styles: ['viewTransitionName'],
  // This repo imports its own API relatively, so the plugin's default
  // `@tenphi/tasty` import tracking never matches. List the local entry points so
  // `tasty({ styles })` call sites are actually linted.
  importSources: ['@tenphi/tasty', './tasty', '../tasty', './src/tasty'],
};
