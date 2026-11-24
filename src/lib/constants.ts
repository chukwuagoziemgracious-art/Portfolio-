export const ASSETS = {
  heroPlate:
    'https://images.higgs.ai/?default=1&output=webp&url=https%3A%2F%2Fd8j0ntlcm91z4.cloudfront.net%2Fuser_38xzZboKViGWJOttwIXH07lWA1P%2Fhf_20261123_061107_c3030a30-c49e-4b74-be3f-c8a0750c193b.png&w=1344&q=85',
  section2Plate:
    'https://images.higgs.ai/?default=1&output=webp&url=https%3A%2F%2Fd8j0ntlcm91z4.cloudfront.net%2Fuser_38xzZboKViGWJOttwIXH07lWA1P%2Fhf_20261123_061140_af2262a5-c52c-472a-be3c-ccfbdf621c3a.png&w=1344&q=85',
  mounds:
    'https://images.higgs.ai/?default=1&output=webp&url=https%3A%2F%2Fd8j0ntlcm91z4.cloudfront.net%2Fuser_38xzZboKViGWJOttwIXH07lWA1P%2Fhf_20261123_071757_11ac0e5d-35f5-4e49-bdab-2cee6a7a2ae3.png&w=1344&q=85',
  cardSheet:
    'https://images.higgs.ai/?default=1&output=webp&url=https%3A%2F%2Fd8j0ntlcm91z4.cloudfront.net%2Fuser_38xzZboKViGWJOttwIXH07lWA1P%2Fhf_20261123_061140_b66e0e91-d128-4f2f-9076-3a6fee12924e.png&w=1024&q=85',
  cameraVideo:
    'https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20261123_061238_19527355-b1cd-46dc-b72e-6eb7e0efd788.mp4',
} as const;

export const EASINGS = {
  QOUT: 'cubic-bezier(.25,1,.5,1)',
  COUT: 'cubic-bezier(.33,1,.68,1)',
  CIN: 'cubic-bezier(.32,0,.67,0)',
} as const;

export const NAV_ITEMS = ['Forges', 'Halls', 'Relics', 'Braziers', 'Ashes'] as const;

export const CAPTIONS = [
  { num: '01', line1: 'Ancient techniques,', line2: 'modern purpose.' },
  { num: '02', line1: 'Crafted by fire,', line2: 'refined by time.' },
  { num: '03', line1: 'More than metal,', line2: 'enduring legacy.' },
  { num: '04', line1: 'The forge lives', line2: 'in what we build.' },
] as const;

export const S2_CARDS = [
  {
    id: 'forge-hall',
    title: 'Stone Forge Hall',
    subtitle: 'Columns & Skylight Shaft',
    description:
      'Monumental basalt columns channel heat and light down into the central smelting floor, anchoring the foundry in quiet permanence.',
    pos: '0% 0%',
  },
  {
    id: 'workshop',
    title: 'Lantern Workshop',
    subtitle: 'Long Timber Benches',
    description:
      'Under warm oil lanterns, artisans temper blades, calibrate bronze fittings, and finish castings by hand.',
    pos: '100% 0%',
  },
  {
    id: 'anvil',
    title: 'The Great Anvil',
    subtitle: 'Glowing Steel & Sparks',
    description:
      'Every hammer strike compresses grain and character into molten iron before it cools to stillness.',
    pos: '0% 100%',
  },
] as const;
