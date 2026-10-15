export const images = {
  hero: '/images/hero.jpg',
  story: '/images/stylist-curling-hair.jpg',
  services: [
    '/images/classic-haircut.jpg',
    '/images/hair-coloring.png',
    '/images/hair-treatment.jpg',
  ],
  gallery: {
    hair: [
      '/images/gallery-hair-1.jpg',
      '/images/gallery-hair-2.jpg',
      '/images/gallery-hair-3.jpg',
      '/images/gallery-hair-4.jpg',
      '/images/gallery-hair-5.jpg',
    ],
    barber: [
      '/images/gallery-barber-1.jpg',
      '/images/gallery-barber-2.jpg',
      '/images/gallery-barber-3.jpg',
      '/images/gallery-barber-4.jpg',
      '/images/gallery-barber-5.jpg',
    ],
    beauty: [
      '/images/gallery-beauty-1.jpg',
      '/images/gallery-beauty-2.jpg',
      '/images/gallery-beauty-3.jpg',
      '/images/gallery-beauty-4.jpg',
      '/images/gallery-beauty-5.jpg',
    ],
  },
}

export const serviceDetails = [
  {
    title: 'Classic Haircut',
    price: '₱800',
    duration: '45 MIN',
    image: images.services[0],
    description:
      'Professional haircut and styling tailored to your unique look and personality.',
  },
  {
    title: 'Hair Coloring',
    price: '₱2,500',
    duration: '2 HRS',
    image: images.services[1],
    description:
      'Premium hair coloring with professional salon products for vivid, lasting results.',
  },
  {
    title: 'Hair Treatment',
    price: '₱1,200',
    duration: '1 HR',
    image: images.services[2],
    description:
      'Nourishing treatment designed to restore softness, shine, and vitality to every strand.',
  },
]
