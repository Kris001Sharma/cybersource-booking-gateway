/**
 * Embedded site configuration — source of truth for packages, rooms,
 * activities, theme tokens, and site metadata.
 *
 * This file replaces site-config.json so the config loads without an
 * external file fetch (fixes "metadata config / right config location
 * is not found" errors when deployed via wrangler).
 *
 * Where to change:
 * - Packages: edit the `packages` array below.
 * - Rooms: edit the `rooms` array.
 * - Activities: edit the `activities` array.
 * - Theme / site info: edit `theme` and `siteInfo` objects.
 *
 * For closest-match package selection:
 * When nights are selected (`nights > 0`), packages are filtered by
 * `pkg.nights <= selectedNights`, then sorted by closest match to
 * selected nights (ascending nights difference). The closest package
 * is shown/recommended first.
 *
 * Accommodation (room) recommendations:
 * After packages, rooms are shown based on total guests
 * (`adults + children`). Room capacity strings are parsed to match.
 *
 * Additional activities:
 * If the cart contains only room SKUs (no package SKUs like act-spa,
 * act-hike, act-dinner), additional activities not already included
 * are recommended.
 */

export const siteInfo = {
  siteName: "Sapana Village",
  subtitle: "A quiet retreat in the foothills — rooms, guided hikes, spa, and private dinners.",
  checkoutOrigin: "https://book.krishna-sharma.com.np",
  logoUrl: "https://res.cloudinary.com/devkrish/image/upload/v1789362870/e6d45606-15b6-402f-97d3-dbacdb266e8f-Photoroom_bc6vgy.png",
  backgroundUrl: "https://res.cloudinary.com/devkrish/image/upload/v1789361425/svl-front_vszhbm.webp",
  contentBackgroundUrl: "https://res.cloudinary.com/devkrish/image/upload/v1789483192/graffity_m0s6do.png",
  nrbForexUrl: "",
  heroTitle: "Sapana Village",
  heroSubtitle: "A quiet retreat in the foothills — rooms, guided hikes, spa, and private dinners.",
  siteTitle: "Sapana Village — Book",
};

export const packages = [
  {
    slug: "package-3night-retreat",
    name: "3-Night Wellness Retreat",
    theme: "Wellness",
    nights: 3,
    description: "A restorative stay with guided practices, healthy meals, and time to reconnect with nature.",
    includes: ["Daily breakfast", "3 spa sessions", "Sunset yoga"],
    priceRange: "$280 – $340",
    fullBoard: "$340",
    bb: "$280",
    skus: ["room-double", "act-spa", "act-hike"],
    imageUrl: "https://res.cloudinary.com/devkrish/image/upload/v1789488378/graffity_1_zs5njm.png",
    featured: true,
  },
  {
    slug: "package-5night-deep",
    name: "5-Night Deep Retreat",
    theme: "Wellness",
    nights: 5,
    description: "Extended immersion with deeper bodywork, silent mornings, and personalized guidance.",
    includes: ["Daily breakfast & dinner", "5 spa sessions", "Private hike"],
    priceRange: "$420 – $520",
    fullBoard: "$520",
    bb: "$420",
    skus: ["room-suite", "act-spa", "act-hike", "act-dinner"],
    imageUrl: "https://res.cloudinary.com/devkrish/image/upload/v1789488378/graffity_1_zs5njm.png",
    featured: false,
  },
  {
    slug: "package-weekend-escape",
    name: "Weekend Escape",
    theme: "Rest",
    nights: 2,
    description: "A quick reset: comfortable room, spa session, and a guided hike to start the week fresh.",
    includes: ["Breakfast", "1 spa session", "Guided hike"],
    priceRange: "$160 – $200",
    fullBoard: "$200",
    bb: "$160",
    skus: ["room-single", "act-spa", "act-hike"],
    imageUrl: "https://res.cloudinary.com/devkrish/image/upload/v1789483192/graffity_m0s6do.png",
    featured: true,
  },
  {
    slug: "package-4night-relax",
    name: "4-Night Relax Retreat",
    theme: "Rest",
    nights: 4,
    description: "Mid-length stay focused on rest, gentle yoga, and spa treatments with flexible scheduling.",
    includes: ["Daily breakfast", "2 spa sessions", "Private dinner", "Yoga class"],
    priceRange: "$340 – $400",
    fullBoard: "$400",
    bb: "$340",
    skus: ["room-twin", "act-spa", "act-dinner", "act-hike"],
    imageUrl: "",
    featured: false,
  },
  {
    slug: "package-6night-renew",
    name: "6-Night Renewal Retreat",
    theme: "Wellness",
    nights: 6,
    description: "A full-week renewal with personalized bodywork, guided meditation, and private hikes.",
    includes: ["All meals", "6 spa sessions", "2 private hikes", "Sunset yoga daily", "Private dinner"],
    priceRange: "$520 – $620",
    fullBoard: "$620",
    bb: "$520",
    skus: ["room-family", "act-spa", "act-hike", "act-dinner"],
    imageUrl: "",
    featured: true,
  },
];

export const rooms = [
  {
    slug: "room-deluxe",
    name: "Deluxe Room",
    capacity: "2 adults + 1 child",
    pricePerNight: 120,
    featured: true,
    description: "Spacious room with mountain view, king bed, and private balcony.",
  },
  {
    slug: "room-twin",
    name: "Twin Room",
    capacity: "2 adults",
    pricePerNight: 90,
    featured: true,
    description: "Two single beds, ideal for friends or colleagues traveling together.",
  },
  {
    slug: "room-double",
    name: "Double Room",
    capacity: "2 adults + 1 child",
    pricePerNight: 70,
    featured: false,
    description: "Comfortable double bed with modern amenities and garden view.",
  },
  {
    slug: "room-triple",
    name: "Triple Room",
    capacity: "3 adults",
    pricePerNight: 110,
    featured: false,
    description: "Three single beds, perfect for small groups or families with teens.",
  },
  {
    slug: "room-family",
    name: "Family Room",
    capacity: "2 adults + 2 children",
    pricePerNight: 130,
    featured: true,
    description: "Large family suite with separate sleeping areas for parents and children.",
  },
  {
    slug: "room-single",
    name: "Single Room",
    capacity: "1 adult",
    pricePerNight: 50,
    featured: false,
    description: "Cozy single bed with workspace and garden access.",
  },
];

export const activities = [
  {
    slug: "act-hike",
    name: "Guided Hike",
    durations: [
      { label: "Half-day", durationNights: 0, price: 20 },
      { label: "Full-day", durationNights: 1, price: 35 },
    ],
    imageUrl: "",
  },
  {
    slug: "act-spa",
    name: "Spa Session",
    durations: [
      { label: "60 min", durationNights: 0, price: 30 },
      { label: "90 min", durationNights: 0, price: 45 },
    ],
    imageUrl: "",
  },
  {
    slug: "act-dinner",
    name: "Private Dinner",
    durations: [{ label: "Evening", durationNights: 0, price: 25 }],
    imageUrl: "",
  },
];

export const theme = {
  accent: "#b85c38",
  accentHover: "#a04e2e",
};
