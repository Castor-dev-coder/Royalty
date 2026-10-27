// Category → local catalogue photo (Pexels License, see docs/IMAGE-CREDITS.md).
// Unknown or missing categories return undefined so SafeImage keeps its hero
// fallback instead of guessing at an image.
const BY_CATEGORY = {
  'hair cutting': '/images/catalogue/service-hair-cutting.jpg',
  'hair coloring': '/images/catalogue/service-hair-coloring.jpg',
  hair: '/images/catalogue/service-hair-styling.jpg',
  nails: '/images/catalogue/service-nails.jpg',
}

export function categoryImage(categoryName) {
  return BY_CATEGORY[String(categoryName ?? '').trim().toLowerCase()]
}
