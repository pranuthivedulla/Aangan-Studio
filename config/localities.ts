/**
 * Service area, as DATA. Criterion 2 is decided from this table.
 *
 * Source of truth: context/services.md "Service area".
 *
 * The important rule here is the DEFAULT. services.md ends its list with "and
 * adjoining areas", and the September transcripts contain Pune localities that
 * appear in neither list — Kharadi (T10) and Nanded City (T08). A wrong
 * decline on criterion 2 is a lost project with no human in the loop, so an
 * unrecognised locality scores `unclear`, never `fail`. Only the explicitly
 * excluded list can produce a `fail`.
 */

export const PUNE_CITY_AREAS: readonly string[] = [
  'Kothrud',
  'Baner',
  'Aundh',
  'Wakad',
  'Koregaon Park',
  'Kalyani Nagar',
  'Viman Nagar',
  'Hadapsar',
  'Magarpatta',
  'NIBM',
  'Kondhwa',
  'Undri',
  'Shivane',
  'Warje',
  'Erandwane',
  'Deccan',
] as const;

export const PCMC_AREAS: readonly string[] = [
  'Pimpri',
  'Chinchwad',
  'Pimple Saudagar',
  'Pimple Nilakh',
  'Ravet',
  'Hinjewadi',
] as const;

/** services.md: "We do not currently serve Talegaon, Lonavala, Nashik, Mumbai, or other cities outside this area." */
export const EXCLUDED_PLACES: readonly string[] = [
  'Talegaon',
  'Talegaon Dabhade',
  'Lonavala',
  'Nashik',
  'Mumbai',
] as const;

/**
 * Localities seen in the September enquiries that are in Pune but are not in
 * services.md's list. They resolve to `unclear`, not `fail`, and the front desk
 * confirms. Listed here so the gap is visible rather than silent — and so
 * Nikhil can promote them into PUNE_CITY_AREAS in one edit.
 */
export const KNOWN_GAPS: readonly { place: string; seenIn: string }[] = [
  { place: 'Kharadi', seenIn: 'T10' },
  { place: 'Nanded City', seenIn: 'T08' },
] as const;

export type AreaVerdict = 'in_area' | 'excluded' | 'unknown';

function normalise(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

/**
 * Resolve a free-text location to a verdict. Deliberately conservative:
 * anything not recognised is `unknown`, which the scorer maps to `unclear`.
 */
export function resolveArea(location: string | null): AreaVerdict {
  if (!location) return 'unknown';
  const hay = normalise(location);
  if (!hay) return 'unknown';

  // Excluded wins over served: "Talegaon, near Pune" is excluded (F03).
  for (const place of EXCLUDED_PLACES) {
    if (hay.includes(normalise(place))) return 'excluded';
  }
  for (const place of [...PUNE_CITY_AREAS, ...PCMC_AREAS]) {
    if (hay.includes(normalise(place))) return 'in_area';
  }
  // Bare "Pune" or "PCMC" with no locality: in area per qualified.md
  // ("Pune city or PCMC"), since the city itself is the rule.
  if (hay === 'pune' || hay === 'pune city' || hay === 'pcmc') return 'in_area';

  return 'unknown';
}
