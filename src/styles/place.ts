export function placeStyle({ place }: { place?: string }) {
  if (typeof place !== 'string') return;

  if (!place) return;

  return {
    'place-items': place,
    'place-content': place,
  };
}

placeStyle.__lookupStyles = ['place'];
