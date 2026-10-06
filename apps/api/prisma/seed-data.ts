export interface SeedProduct {
  name: string;
  description: string;
  /** Decimal string with two fraction digits. */
  price: string;
  stock: number;
}

export interface SeedCategory {
  name: string;
  products: SeedProduct[];
}

// Stock levels are deliberately uneven: a few sold-out and almost-sold-out products make the
// out-of-stock and low-stock states visible in the catalog from the first run.
export const SEED_CATEGORIES: readonly SeedCategory[] = [
  {
    name: 'Electronics',
    products: [
      {
        name: 'Wireless Mouse',
        price: '24.99',
        stock: 120,
        description:
          'Ergonomic 2.4 GHz wireless mouse with silent clicks and a battery that lasts a year.',
      },
      {
        name: 'Mechanical Keyboard',
        price: '89.90',
        stock: 45,
        description:
          'Compact tenkeyless keyboard with tactile switches and a detachable USB-C cable.',
      },
      {
        name: 'Noise-Cancelling Headphones',
        price: '199.00',
        stock: 3,
        description:
          'Over-ear Bluetooth headphones with active noise cancelling and 30 hours of playback.',
      },
      {
        name: '27-inch 4K Monitor',
        price: '349.99',
        stock: 18,
        description:
          'IPS display with 99% sRGB coverage, height-adjustable stand and USB-C power delivery.',
      },
      {
        name: 'USB-C Hub 7-in-1',
        price: '39.50',
        stock: 200,
        description:
          'HDMI, two USB-A ports, SD and microSD readers, Ethernet and 100 W pass-through charging.',
      },
      {
        name: 'Portable SSD 1TB',
        price: '109.00',
        stock: 60,
        description: 'Pocket-sized solid-state drive with read speeds up to 1,000 MB/s.',
      },
      {
        name: 'Bluetooth Speaker',
        price: '59.99',
        stock: 0,
        description:
          'Water-resistant portable speaker with 360-degree sound and a 12-hour battery.',
      },
      {
        name: 'Webcam 1080p',
        price: '49.00',
        stock: 35,
        description: 'Full HD webcam with autofocus, a built-in microphone and a privacy shutter.',
      },
      {
        name: 'Aluminium Laptop Stand',
        price: '29.90',
        stock: 150,
        description:
          'Foldable stand that raises the screen to eye level and keeps the laptop cool.',
      },
      {
        name: 'Smart Plug 4-Pack',
        price: '27.00',
        stock: 90,
        description: 'Wi-Fi plugs with scheduling and energy monitoring, no hub required.',
      },
    ],
  },
  {
    name: 'Home & Kitchen',
    products: [
      {
        name: "Chef's Knife 8-inch",
        price: '54.00',
        stock: 70,
        description: 'Forged stainless steel blade with a balanced full-tang handle.',
      },
      {
        name: 'Cast Iron Skillet',
        price: '34.90',
        stock: 55,
        description:
          'Pre-seasoned 26 cm skillet that works on any hob, in the oven or over a fire.',
      },
      {
        name: 'French Press 1L',
        price: '28.00',
        stock: 80,
        description: 'Borosilicate glass carafe with a stainless steel plunger and filter.',
      },
      {
        name: 'Electric Kettle',
        price: '42.50',
        stock: 40,
        description: '1.7 L kettle with temperature presets and automatic shut-off.',
      },
      {
        name: 'Non-Stick Pan Set',
        price: '119.00',
        stock: 22,
        description: 'Three-piece ceramic-coated set, free of PFAS and compatible with induction.',
      },
      {
        name: 'Bamboo Cutting Board',
        price: '21.99',
        stock: 130,
        description: 'Large reversible board with a juice groove and a built-in handle.',
      },
      {
        name: 'Glass Food Containers (10 pieces)',
        price: '32.00',
        stock: 95,
        description: 'Oven-safe containers with airtight snap-on lids that stack neatly.',
      },
      {
        name: 'Digital Kitchen Scale',
        price: '17.50',
        stock: 0,
        description: 'Precise to 1 g up to 5 kg, with a tare function and a backlit display.',
      },
      {
        name: 'Stainless Steel Water Bottle',
        price: '19.90',
        stock: 210,
        description: 'Double-wall insulated bottle that keeps drinks cold for 24 hours.',
      },
      {
        name: 'Aroma Diffuser',
        price: '26.00',
        stock: 2,
        description: 'Ultrasonic diffuser with a soft night light and an automatic timer.',
      },
    ],
  },
  {
    name: 'Books',
    products: [
      {
        name: 'The Quiet Algorithm',
        price: '16.99',
        stock: 150,
        description:
          'A novel about an engineer who discovers that a scheduling system has been making decisions on its own.',
      },
      {
        name: 'Notes on Distributed Systems',
        price: '49.90',
        stock: 35,
        description:
          'A practical guide to consistency, replication and failure handling, with worked examples.',
      },
      {
        name: 'Designing for Humans',
        price: '38.50',
        stock: 28,
        description: 'How to build interfaces that people understand on the first try.',
      },
      {
        name: 'A Year of Small Habits',
        price: '14.99',
        stock: 140,
        description: 'Twelve months of tiny, sustainable changes, one chapter per month.',
      },
      {
        name: 'The Last Lighthouse',
        price: '12.99',
        stock: 90,
        description: 'A coastal mystery spanning three generations of one family.',
      },
      {
        name: 'Cooking with Fewer Ingredients',
        price: '27.00',
        stock: 75,
        description: 'Eighty recipes that need no more than six ingredients each.',
      },
      {
        name: 'A Short History of Money',
        price: '18.00',
        stock: 60,
        description: 'From shells to digital payments: how people decided what a thing is worth.',
      },
      {
        name: 'Learning Statistics by Doing',
        price: '44.00',
        stock: 40,
        description: 'An applied introduction to probability and inference using real datasets.',
      },
      {
        name: 'Letters from the Orchard',
        price: '13.99',
        stock: 85,
        description: 'A warm collection of short stories set in one small village.',
      },
      {
        name: 'Refactoring Legacy Projects',
        price: '47.00',
        stock: 12,
        description: 'Techniques for safely improving code that nobody dares to touch.',
      },
    ],
  },
  {
    name: 'Sports & Outdoors',
    products: [
      {
        name: 'Yoga Mat 6 mm',
        price: '25.00',
        stock: 100,
        description: 'Non-slip cushioned mat with a carry strap.',
      },
      {
        name: 'Adjustable Dumbbell Pair',
        price: '149.00',
        stock: 14,
        description: 'Each dumbbell adjusts from 2 to 20 kg with a quick-lock dial.',
      },
      {
        name: 'Trail Running Backpack 20L',
        price: '79.90',
        stock: 33,
        description: 'Lightweight vest-style pack with two soft flasks and rain cover.',
      },
      {
        name: 'Insulated Camping Mug',
        price: '15.50',
        stock: 120,
        description: 'Stainless steel mug with a lid that folds into a carabiner.',
      },
      {
        name: 'Resistance Bands Set',
        price: '18.90',
        stock: 160,
        description: 'Five bands of different strengths with handles and a door anchor.',
      },
      {
        name: 'Speed Jump Rope',
        price: '9.99',
        stock: 250,
        description: 'Adjustable steel-cable rope with ball-bearing handles.',
      },
      {
        name: 'Foam Roller',
        price: '22.00',
        stock: 65,
        description: 'High-density roller for muscle recovery and mobility work.',
      },
      {
        name: 'Trekking Poles (pair)',
        price: '45.00',
        stock: 41,
        description: 'Telescopic carbon poles with cork grips and replaceable tips.',
      },
      {
        name: 'Fitness Tracker Band',
        price: '59.00',
        stock: 0,
        description: 'Heart-rate and sleep tracking with a 14-day battery.',
      },
      {
        name: 'Compact Sleeping Bag',
        price: '69.00',
        stock: 26,
        description:
          'Three-season bag rated to 0 °C that packs down to the size of a loaf of bread.',
      },
    ],
  },
  {
    name: 'Clothing',
    products: [
      {
        name: 'Organic Cotton T-Shirt',
        price: '19.00',
        stock: 300,
        description: 'Soft midweight tee in a relaxed fit.',
      },
      {
        name: 'Slim Fit Jeans',
        price: '59.00',
        stock: 85,
        description: 'Stretch denim with a mid rise and a tapered leg.',
      },
      {
        name: 'Merino Wool Socks (3 pairs)',
        price: '24.00',
        stock: 140,
        description: 'Breathable, odour-resistant socks with a cushioned sole.',
      },
      {
        name: 'Waterproof Rain Jacket',
        price: '99.00',
        stock: 38,
        description: 'Taped seams, an adjustable hood and a pocket that doubles as a stuff sack.',
      },
      {
        name: 'Fleece Hoodie',
        price: '54.90',
        stock: 72,
        description: 'Warm brushed-fleece hoodie with a kangaroo pocket.',
      },
      {
        name: 'Canvas Sneakers',
        price: '44.00',
        stock: 0,
        description: 'Classic low-top sneakers with a vulcanised rubber sole.',
      },
      {
        name: 'Leather Belt',
        price: '29.00',
        stock: 90,
        description: 'Full-grain leather belt with a brushed metal buckle.',
      },
      {
        name: 'Wool Beanie',
        price: '16.00',
        stock: 115,
        description: 'Ribbed knit hat lined with soft fleece.',
      },
      {
        name: 'Running Shorts',
        price: '27.50',
        stock: 98,
        description: 'Lightweight shorts with a zip pocket and reflective details.',
      },
      {
        name: 'Denim Jacket',
        price: '84.00',
        stock: 3,
        description: 'Washed denim jacket with a classic trucker cut.',
      },
    ],
  },
  {
    name: 'Toys & Games',
    products: [
      {
        name: 'Wooden Building Blocks (100 pieces)',
        price: '34.00',
        stock: 80,
        description: 'Natural beech blocks in assorted shapes, finished with water-based paint.',
      },
      {
        name: 'Strategy Board Game',
        price: '42.00',
        stock: 47,
        description: 'A game of trade and expansion for two to five players, about 60 minutes.',
      },
      {
        name: '1000-Piece Jigsaw Puzzle',
        price: '19.50',
        stock: 110,
        description: 'Mountain lake panorama printed on thick, glare-free board.',
      },
      {
        name: 'RC Racing Car',
        price: '49.90',
        stock: 30,
        description: 'Rechargeable 1:16 scale car that reaches 25 km/h.',
      },
      {
        name: 'Plush Bear',
        price: '17.00',
        stock: 150,
        description: 'Machine-washable bear, 35 cm tall.',
      },
      {
        name: 'Party Card Game',
        price: '14.99',
        stock: 200,
        description: 'Fast-paced card game for groups of three to ten.',
      },
      {
        name: 'Magnetic Tiles (60 pieces)',
        price: '39.00',
        stock: 52,
        description: 'Translucent magnetic tiles for building 3D shapes.',
      },
      {
        name: 'Science Experiment Kit',
        price: '29.90',
        stock: 44,
        description: 'Thirty safe experiments with step-by-step illustrated instructions.',
      },
      {
        name: 'Wooden Chess Set',
        price: '36.00',
        stock: 25,
        description: 'Hand-finished pieces and a folding board with storage.',
      },
      {
        name: 'Retro Handheld Console',
        price: '64.00',
        stock: 0,
        description: 'Pocket console preloaded with two hundred classic-style games.',
      },
    ],
  },
];
