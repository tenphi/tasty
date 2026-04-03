interface PlacementStyleProps {
  place?: string | boolean;
  placeItems?: string | boolean;
  placeContent?: string | boolean;
  align?: string | boolean;
  justify?: string | boolean;
  alignItems?: string | boolean;
  alignContent?: string | boolean;
  justifyItems?: string | boolean;
  justifyContent?: string | boolean;
}

function str(val: string | boolean | undefined): string | null {
  if (val == null || val === false || val === '') return null;
  if (val === true) return 'center';

  return String(val);
}

/**
 * Unified placement handler replacing align, justify, and place.
 *
 * Priority (later overrides earlier):
 * 1. place (lowest) — sets all 4 longhands
 * 2. placeItems, placeContent, align, justify (medium) — each sets 2 longhands
 * 3. alignItems, alignContent, justifyItems, justifyContent (highest) — each sets 1 longhand
 */
export function placementStyle({
  place,
  placeItems,
  placeContent,
  align,
  justify,
  alignItems,
  alignContent,
  justifyItems,
  justifyContent,
}: PlacementStyleProps) {
  const result: Record<string, string> = {};

  const placeVal = str(place);

  if (placeVal) {
    const parts = placeVal.split(/\s+/);
    const first = parts[0];
    const second = parts[1] || first;

    result['align-items'] = first;
    result['justify-items'] = second;
    result['align-content'] = first;
    result['justify-content'] = second;
  }

  const placeItemsVal = str(placeItems);

  if (placeItemsVal) {
    const parts = placeItemsVal.split(/\s+/);

    result['align-items'] = parts[0];
    result['justify-items'] = parts[1] || parts[0];
  }

  const placeContentVal = str(placeContent);

  if (placeContentVal) {
    const parts = placeContentVal.split(/\s+/);

    result['align-content'] = parts[0];
    result['justify-content'] = parts[1] || parts[0];
  }

  const alignVal = str(align);

  if (alignVal) {
    result['align-items'] = alignVal;
    result['align-content'] = alignVal;
  }

  const justifyVal = str(justify);

  if (justifyVal) {
    result['justify-items'] = justifyVal;
    result['justify-content'] = justifyVal;
  }

  const alignItemsVal = str(alignItems);

  if (alignItemsVal) result['align-items'] = alignItemsVal;

  const alignContentVal = str(alignContent);

  if (alignContentVal) result['align-content'] = alignContentVal;

  const justifyItemsVal = str(justifyItems);

  if (justifyItemsVal) result['justify-items'] = justifyItemsVal;

  const justifyContentVal = str(justifyContent);

  if (justifyContentVal) result['justify-content'] = justifyContentVal;

  if (Object.keys(result).length === 0) return null;

  return result;
}

placementStyle.__lookupStyles = [
  'place',
  'placeItems',
  'placeContent',
  'align',
  'justify',
  'alignItems',
  'alignContent',
  'justifyItems',
  'justifyContent',
];
