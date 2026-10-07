import { createRef, forwardRef } from 'react';
import { configure, tasty, useStyles } from '@tenphi/tasty';
import { computeStyles } from '@tenphi/tasty/core';
import { tastyStatic } from '@tenphi/tasty/static';
import { createServerStyleCollector } from '@tenphi/tasty/ssr';

configure({ tokens: { $gap: '8px' } });

const Button = tasty({
  as: 'button',
  styleProps: ['padding'],
  styles: { padding: '$gap' },
});

const ref = createRef<HTMLButtonElement>();
const button = (
  <Button
    ref={ref}
    padding="16px"
    disabled
    onClick={(event) => event.currentTarget.focus()}
  >
    Save
  </Button>
);

const Base = forwardRef<HTMLButtonElement, { label: string }>(
  ({ label }, forwardedRef) => <button ref={forwardedRef}>{label}</button>,
);
const Extended = tasty(Base, { styles: { color: 'red' } });
const extended = <Extended label="Save" ref={ref} />;

const styles = useStyles({ display: 'block' });
const computed = computeStyles({ display: 'grid' });
const staticStyles = tastyStatic({ display: 'flex' });
const collector = createServerStyleCollector();

void [button, extended, styles, computed, staticStyles, collector];
