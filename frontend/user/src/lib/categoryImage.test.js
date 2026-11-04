import { describe, expect, it } from 'vitest'
import { categoryImage } from './categoryImage.js'

describe('categoryImage', () => {
  it('maps every seeded service category to a local catalogue photo', () => {
    expect(categoryImage('Hair Cutting')).toBe('/images/catalogue/service-hair-cutting.jpg')
    expect(categoryImage('Hair Coloring')).toBe('/images/catalogue/service-hair-coloring.jpg')
    expect(categoryImage('Hair')).toBe('/images/catalogue/service-hair-styling.jpg')
    expect(categoryImage('Nails')).toBe('/images/catalogue/service-nails.jpg')
  })

  it('matches case-insensitively and tolerates padding', () => {
    expect(categoryImage('  NAILS ')).toBe('/images/catalogue/service-nails.jpg')
    expect(categoryImage('hair cutting')).toBe('/images/catalogue/service-hair-cutting.jpg')
  })

  it('returns undefined for unknown or missing categories (hero fallback stays)', () => {
    expect(categoryImage('Spa')).toBeUndefined()
    expect(categoryImage(undefined)).toBeUndefined()
    expect(categoryImage('')).toBeUndefined()
  })
})
