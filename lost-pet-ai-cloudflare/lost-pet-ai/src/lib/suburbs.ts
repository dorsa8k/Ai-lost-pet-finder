/**
 * Suburbs supported in the initial Knox / outer-east Melbourne pilot.
 * Coordinates are approximate suburb centre points (not addresses), used when
 * a reporter doesn't share a precise location. Add rows here to expand the
 * service area — everything else (search, validation, map) reads from this list.
 */
export interface Suburb {
  name: string;
  postcode: string;
  lat: number;
  lng: number;
  council: string;
}

export const SUBURBS: readonly Suburb[] = [
  { name: "Bayswater", postcode: "3153", lat: -37.8455, lng: 145.268, council: "Knox City Council" },
  { name: "Bayswater North", postcode: "3153", lat: -37.829, lng: 145.288, council: "Maroondah City Council" },
  { name: "Boronia", postcode: "3155", lat: -37.8605, lng: 145.2855, council: "Knox City Council" },
  { name: "Ferntree Gully", postcode: "3156", lat: -37.8845, lng: 145.2945, council: "Knox City Council" },
  { name: "Glen Waverley", postcode: "3150", lat: -37.878, lng: 145.1645, council: "City of Monash" },
  { name: "Knoxfield", postcode: "3180", lat: -37.8905, lng: 145.249, council: "Knox City Council" },
  { name: "Lysterfield", postcode: "3156", lat: -37.9355, lng: 145.2995, council: "Knox City Council" },
  { name: "Mulgrave", postcode: "3170", lat: -37.927, lng: 145.169, council: "City of Monash" },
  { name: "Rowville", postcode: "3178", lat: -37.9265, lng: 145.2335, council: "Knox City Council" },
  { name: "Scoresby", postcode: "3179", lat: -37.9005, lng: 145.2335, council: "Knox City Council" },
  { name: "The Basin", postcode: "3154", lat: -37.8525, lng: 145.3105, council: "Knox City Council" },
  { name: "Upper Ferntree Gully", postcode: "3156", lat: -37.893, lng: 145.311, council: "Knox City Council" },
  { name: "Vermont South", postcode: "3133", lat: -37.8575, lng: 145.183, council: "City of Whitehorse" },
  { name: "Wantirna", postcode: "3152", lat: -37.853, lng: 145.2275, council: "Knox City Council" },
  { name: "Wantirna South", postcode: "3152", lat: -37.8695, lng: 145.2265, council: "Knox City Council" },
  { name: "Wheelers Hill", postcode: "3150", lat: -37.905, lng: 145.1885, council: "City of Monash" },
  { name: "Dandenong North", postcode: "3175", lat: -37.955, lng: 145.215, council: "City of Greater Dandenong" },
  { name: "Lysterfield South", postcode: "3156", lat: -37.948, lng: 145.275, council: "City of Casey" },
  { name: "Belgrave", postcode: "3160", lat: -37.909, lng: 145.355, council: "Yarra Ranges Council" },
  { name: "Croydon", postcode: "3136", lat: -37.795, lng: 145.281, council: "Maroondah City Council" },
  { name: "Ringwood", postcode: "3134", lat: -37.814, lng: 145.229, council: "Maroondah City Council" },
  { name: "Vermont", postcode: "3133", lat: -37.836, lng: 145.196, council: "City of Whitehorse" },
] as const;

export function findSuburb(name: string): Suburb | undefined {
  const needle = name.trim().toLowerCase();
  return SUBURBS.find((s) => s.name.toLowerCase() === needle);
}

export function suburbsByPostcode(postcode: string): Suburb[] {
  return SUBURBS.filter((s) => s.postcode === postcode.trim());
}

export const SUBURB_NAMES = SUBURBS.map((s) => s.name).sort();
