// @ts-check
import eslint from '@eslint/js';
import tasty from '@tenphi/eslint-plugin-tasty';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  eslint.configs.recommended,
  tseslint.configs.recommended,
  tseslint.configs.stylistic,
  prettier,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          destructuredArrayIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
      '@typescript-eslint/consistent-type-imports': 'error',
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },
  {
    files: ['**/*.test.ts', '**/*.test.tsx'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },
  // Dogfood the Tasty ESLint plugin on the repo's own style objects, so the
  // rules stay exercised and version drift in the plugin gets noticed.
  //
  // Scope note: the plugin recognizes bare `styles` objects and `styles={...}`
  // JSX props. It does not see through `tasty({ styles: {...} })`, which is the
  // shape most of this repo uses, so coverage here is partial by construction.
  {
    files: ['**/*.{ts,tsx}'],
    ...tasty.configs.recommended,
  },
  {
    // This repo *implements and tests* the parser, so its sources necessarily
    // contain exactly the inputs these rules exist to reject. Each rule below is
    // off for a structural reason, not because the finding was inconvenient.
    files: ['**/*.{ts,tsx}'],
    rules: {
      // Tests use arbitrary token names (`#purple`, `#surface`) to exercise token
      // machinery; tasty.config.ts deliberately declares no app tokens.
      'tasty/valid-color-token': 'off',
      'tasty/no-raw-color-values': 'off',
      // Parser and pipeline tests feed deliberately invalid values and units to
      // assert the errors and fallbacks.
      'tasty/valid-value': 'off',
      'tasty/valid-custom-unit': 'off',
      // State-map tests deliberately omit or misorder the default/`_` keys to
      // assert the warnings and autocorrection.
      'tasty/require-default-state': 'off',
      'tasty/valid-default-state-order': 'off',
      // The plugin does not know every pseudo-class the parser supports
      // (`:-webkit-autofill`, `:-moz-placeholder`), which tests cover by name.
      'tasty/valid-state-key': 'off',
      // Longhand and unit-conversion handlers can only be tested by using the
      // longhand property and raw pixel values directly.
      'tasty/prefer-shorthand-property': 'off',
      'tasty/consistent-token-usage': 'off',
      // Cannot see through the `as` casts these tests use for sub-element values.
      'tasty/valid-sub-element': 'off',
      // Tests and benchmarks build style objects from parameters (`it.each`,
      // loops over values) to exercise many inputs through one code path.
      'tasty/no-runtime-styles-mutation': 'off',
      // `mergeStyles()` is implemented here, and tests spread style objects to
      // assert where shallow replacement and `mergeStyles()` differ.
      'tasty/no-style-spread': 'off',
      // The parser still supports state conditions inside `$` selectors and
      // the `:not()` spelling of negation, and the pipeline tests cover both.
      'tasty/no-state-in-selector': 'off',
      'tasty/prefer-state-negation': 'off',
    },
  },
  {
    ignores: ['dist/**', 'node_modules/**'],
  },
);
