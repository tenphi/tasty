import { forwardRef, memo } from 'react';

import { getDisplayName } from './get-display-name';

describe('getDisplayName()', () => {
  it('names functions by displayName, then by name', () => {
    function Button() {
      return null;
    }
    const Labeled = () => null;
    Labeled.displayName = 'Labeled';

    expect(getDisplayName(Button)).toBe('Button');
    expect(getDisplayName(Labeled)).toBe('Labeled');
  });

  it('looks through forwardRef() and memo()', () => {
    const Anchor = forwardRef<HTMLAnchorElement>(function Anchor() {
      return null;
    });
    const Memoized = memo(function Card() {
      return null;
    });
    const Both = memo(Anchor);
    const Named = forwardRef(() => null);
    Named.displayName = 'Named';

    expect(getDisplayName(Anchor)).toBe('Anchor');
    expect(getDisplayName(Memoized)).toBe('Card');
    expect(getDisplayName(Both)).toBe('Anchor');
    expect(getDisplayName(Named)).toBe('Named');
  });

  it('names tags after themselves', () => {
    expect(getDisplayName('section')).toBe('section');
  });

  it('falls back when nothing has a name', () => {
    expect(
      getDisplayName(
        forwardRef(() => null),
        'Fallback',
      ),
    ).toBe('Fallback');
    expect(getDisplayName(memo(() => null))).toBe('Anonymous');
  });
});
