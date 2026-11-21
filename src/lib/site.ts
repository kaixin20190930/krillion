export const SITE = {
  name: 'Krillion Tips',
  url: 'https://krillion.tips',
  description: 'Daily Krillion answers, hints, tier explanations, Unlimited strategy, and a searchable answer archive.',
  officialGameUrl: 'https://krillion.io/',
};

export const tiers = {
  krillion: { label: 'One in a Krillion', score: 100 },
  deepcut: { label: 'Deep Cut', score: 85 },
  rare: { label: 'Rare', score: 60 },
  schooler: { label: 'Schooler', score: 30 },
  tooclever: { label: 'Too Clever', score: 15 },
  plankton: { label: 'Plankton', score: 10 },
} as const;

export type TierKey = keyof typeof tiers;

export const nav = [
  { href: '/krillion-answers-today/', label: 'Today' },
  { href: '/krillion-hints/', label: 'Hints' },
  { href: '/krillion-unlimited/', label: 'Unlimited' },
  { href: '/krillion-archive/', label: 'Archive' },
];
