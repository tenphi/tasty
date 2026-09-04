import { isSelector } from './is-selector';

describe('isSelector', () => {
  it.each(['&', '& > span', '.', '.label', 'Icon', 'A'])(
    'accepts %j',
    (key) => {
      expect(isSelector(key)).toBe(true);
    },
  );

  it.each(['', 'color', '@media', '$token', 'élement', '[data-active]'])(
    'rejects %j',
    (key) => {
      expect(isSelector(key)).toBe(false);
    },
  );
});
