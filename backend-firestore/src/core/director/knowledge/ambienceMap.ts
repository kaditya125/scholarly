/**
 * Location → layered ambience stack.
 *
 * Exhaustive over the closed `LocationId` union (compile-time `Record`), which
 * is why the schema keeps that union closed: a planner cannot invent a location
 * with no environment behind it.
 *
 * Layers are ordered base → texture → detail → accent and mixed together to
 * build one believable place. A single track always sounds like a single track;
 * three or four quiet, differently-looping layers sound like a room.
 *
 * Volume calibration: base sits around −26 dB, detail and accent lower still.
 * The whole stack must stay under the duck floor so narration always wins —
 * `TimelineBuilder` validates that, but these defaults are already safe.
 */

import type { LocationId } from '../schema/scene.schema';
import type { AmbienceLayerRole } from '../schema/audio.schema';

export interface AmbienceLayerSpec {
  /** Asset id — must exist in the catalogue or the layer is dropped. */
  assetId: string;
  layerRole: AmbienceLayerRole;
  volumeDb: number;
  /** Randomised loop-start window; prevents layers repeating in lockstep. */
  jitterMs?: number;
}

export interface AmbienceStack {
  location: LocationId;
  /** Human label for the inspector. */
  label: string;
  layers: AmbienceLayerSpec[];
}

/** Educational locations stay deliberately sparse — clarity over atmosphere. */
export const AMBIENCE_MAP: Record<LocationId, AmbienceStack> = {
  // ── Neutral / abstract: intentionally empty ────────────────────────────
  neutral: { location: 'neutral', label: 'Neutral', layers: [] },
  abstract: {
    location: 'abstract',
    label: 'Abstract',
    layers: [{ assetId: 'amb_air_tone', layerRole: 'base', volumeDb: -32 }],
  },

  // ── Education ─────────────────────────────────────────────────────────
  classroom: {
    location: 'classroom',
    label: 'Classroom',
    layers: [
      { assetId: 'amb_room_tone_small', layerRole: 'base', volumeDb: -30 },
      { assetId: 'amb_paper_rustle', layerRole: 'detail', volumeDb: -34, jitterMs: 12_000 },
    ],
  },
  library: {
    location: 'library',
    label: 'Library',
    layers: [
      { assetId: 'amb_room_tone_large', layerRole: 'base', volumeDb: -31 },
      { assetId: 'amb_paper_rustle', layerRole: 'detail', volumeDb: -35, jitterMs: 15_000 },
    ],
  },
  laboratory: {
    location: 'laboratory',
    label: 'Laboratory',
    layers: [
      { assetId: 'amb_room_tone_small', layerRole: 'base', volumeDb: -30 },
      { assetId: 'amb_equipment_hum', layerRole: 'texture', volumeDb: -32 },
      { assetId: 'amb_liquid_bubble', layerRole: 'detail', volumeDb: -34, jitterMs: 9_000 },
    ],
  },
  lecture_hall: {
    location: 'lecture_hall',
    label: 'Lecture hall',
    layers: [
      { assetId: 'amb_room_tone_large', layerRole: 'base', volumeDb: -29 },
      { assetId: 'amb_crowd_murmur_quiet', layerRole: 'texture', volumeDb: -34, jitterMs: 14_000 },
    ],
  },
  study_room: {
    location: 'study_room',
    label: 'Study room',
    layers: [{ assetId: 'amb_room_tone_small', layerRole: 'base', volumeDb: -31 }],
  },

  // ── Nature ────────────────────────────────────────────────────────────
  forest: {
    location: 'forest',
    label: 'Forest',
    layers: [
      { assetId: 'amb_wind_leaves', layerRole: 'base', volumeDb: -26 },
      { assetId: 'amb_birds_forest', layerRole: 'texture', volumeDb: -28, jitterMs: 11_000 },
      { assetId: 'amb_branch_creak', layerRole: 'detail', volumeDb: -34, jitterMs: 18_000 },
    ],
  },
  river: {
    location: 'river',
    label: 'River',
    layers: [
      { assetId: 'amb_river_flow', layerRole: 'base', volumeDb: -25 },
      { assetId: 'amb_birds_forest', layerRole: 'detail', volumeDb: -32, jitterMs: 13_000 },
    ],
  },
  ocean: {
    location: 'ocean',
    label: 'Ocean',
    layers: [
      { assetId: 'amb_ocean_waves', layerRole: 'base', volumeDb: -24 },
      { assetId: 'amb_wind_open', layerRole: 'texture', volumeDb: -30 },
      { assetId: 'amb_gulls', layerRole: 'accent', volumeDb: -33, jitterMs: 16_000 },
    ],
  },
  mountain: {
    location: 'mountain',
    label: 'Mountain',
    layers: [
      { assetId: 'amb_wind_open', layerRole: 'base', volumeDb: -25 },
      { assetId: 'amb_eagle_distant', layerRole: 'accent', volumeDb: -34, jitterMs: 20_000 },
    ],
  },
  desert: {
    location: 'desert',
    label: 'Desert',
    layers: [
      { assetId: 'amb_wind_dry', layerRole: 'base', volumeDb: -26 },
      { assetId: 'amb_sand_shift', layerRole: 'detail', volumeDb: -34, jitterMs: 17_000 },
    ],
  },
  garden: {
    location: 'garden',
    label: 'Garden',
    layers: [
      { assetId: 'amb_wind_leaves', layerRole: 'base', volumeDb: -28 },
      { assetId: 'amb_birds_garden', layerRole: 'texture', volumeDb: -29, jitterMs: 10_000 },
      { assetId: 'amb_insects', layerRole: 'detail', volumeDb: -33, jitterMs: 12_000 },
    ],
  },

  // ── Built environment ─────────────────────────────────────────────────
  marketplace: {
    location: 'marketplace',
    label: 'Marketplace',
    layers: [
      { assetId: 'amb_crowd_murmur', layerRole: 'base', volumeDb: -24 },
      { assetId: 'amb_market_calls', layerRole: 'texture', volumeDb: -28, jitterMs: 9_000 },
      { assetId: 'amb_cart_wheels', layerRole: 'detail', volumeDb: -32, jitterMs: 14_000 },
    ],
  },
  temple: {
    location: 'temple',
    label: 'Temple',
    layers: [
      { assetId: 'amb_room_tone_large', layerRole: 'base', volumeDb: -29 },
      { assetId: 'amb_temple_bell', layerRole: 'accent', volumeDb: -30, jitterMs: 22_000 },
      { assetId: 'amb_chant_distant', layerRole: 'texture', volumeDb: -33 },
    ],
  },
  castle: {
    location: 'castle',
    label: 'Castle',
    layers: [
      { assetId: 'amb_room_tone_large', layerRole: 'base', volumeDb: -29 },
      { assetId: 'amb_torch_crackle', layerRole: 'detail', volumeDb: -32, jitterMs: 8_000 },
      { assetId: 'amb_wind_stone', layerRole: 'texture', volumeDb: -31 },
    ],
  },
  village: {
    location: 'village',
    label: 'Village',
    layers: [
      { assetId: 'amb_wind_leaves', layerRole: 'base', volumeDb: -28 },
      { assetId: 'amb_crowd_murmur_quiet', layerRole: 'texture', volumeDb: -31, jitterMs: 13_000 },
      { assetId: 'amb_livestock', layerRole: 'accent', volumeDb: -34, jitterMs: 19_000 },
    ],
  },
  city_street: {
    location: 'city_street',
    label: 'City street',
    layers: [
      { assetId: 'amb_traffic_distant', layerRole: 'base', volumeDb: -26 },
      { assetId: 'amb_crowd_murmur', layerRole: 'texture', volumeDb: -30, jitterMs: 11_000 },
      { assetId: 'amb_horn_distant', layerRole: 'accent', volumeDb: -35, jitterMs: 21_000 },
    ],
  },
  office: {
    location: 'office',
    label: 'Office',
    layers: [
      { assetId: 'amb_room_tone_small', layerRole: 'base', volumeDb: -31 },
      { assetId: 'amb_keyboard_distant', layerRole: 'detail', volumeDb: -34, jitterMs: 10_000 },
    ],
  },
  hospital: {
    location: 'hospital',
    label: 'Hospital',
    layers: [
      { assetId: 'amb_room_tone_small', layerRole: 'base', volumeDb: -31 },
      { assetId: 'amb_monitor_beep', layerRole: 'detail', volumeDb: -34, jitterMs: 7_000 },
    ],
  },
  cafe: {
    location: 'cafe',
    label: 'Cafe',
    layers: [
      { assetId: 'amb_crowd_murmur_quiet', layerRole: 'base', volumeDb: -27 },
      { assetId: 'amb_cutlery', layerRole: 'detail', volumeDb: -33, jitterMs: 9_000 },
      { assetId: 'amb_coffee_machine', layerRole: 'accent', volumeDb: -34, jitterMs: 15_000 },
    ],
  },
  train_station: {
    location: 'train_station',
    label: 'Train station',
    layers: [
      { assetId: 'amb_station_hall', layerRole: 'base', volumeDb: -26 },
      { assetId: 'amb_crowd_murmur', layerRole: 'texture', volumeDb: -30, jitterMs: 12_000 },
      { assetId: 'amb_train_distant', layerRole: 'accent', volumeDb: -32, jitterMs: 18_000 },
    ],
  },
  airport: {
    location: 'airport',
    label: 'Airport',
    layers: [
      { assetId: 'amb_station_hall', layerRole: 'base', volumeDb: -27 },
      { assetId: 'amb_crowd_murmur', layerRole: 'texture', volumeDb: -31, jitterMs: 12_000 },
      { assetId: 'amb_pa_muffled', layerRole: 'accent', volumeDb: -34, jitterMs: 20_000 },
    ],
  },

  // ── Dramatic ──────────────────────────────────────────────────────────
  battlefield: {
    location: 'battlefield',
    label: 'Battlefield',
    layers: [
      { assetId: 'amb_wind_open', layerRole: 'base', volumeDb: -27 },
      { assetId: 'amb_distant_rumble', layerRole: 'texture', volumeDb: -29 },
      { assetId: 'amb_crowd_shout_distant', layerRole: 'detail', volumeDb: -33, jitterMs: 11_000 },
    ],
  },
  space: {
    location: 'space',
    label: 'Space',
    layers: [
      { assetId: 'amb_space_drone', layerRole: 'base', volumeDb: -28 },
      { assetId: 'amb_shimmer_high', layerRole: 'texture', volumeDb: -33 },
    ],
  },
  underwater: {
    location: 'underwater',
    label: 'Underwater',
    layers: [
      { assetId: 'amb_underwater_muffle', layerRole: 'base', volumeDb: -26 },
      { assetId: 'amb_bubbles', layerRole: 'detail', volumeDb: -32, jitterMs: 8_000 },
    ],
  },
  cave: {
    location: 'cave',
    label: 'Cave',
    layers: [
      { assetId: 'amb_cave_drone', layerRole: 'base', volumeDb: -28 },
      { assetId: 'amb_water_drip', layerRole: 'detail', volumeDb: -32, jitterMs: 6_000 },
    ],
  },

  // ── Historical ────────────────────────────────────────────────────────
  ancient_rome: {
    location: 'ancient_rome',
    label: 'Ancient Rome',
    layers: [
      { assetId: 'amb_wind_soft', layerRole: 'base', volumeDb: -28 },
      { assetId: 'amb_market_calls', layerRole: 'texture', volumeDb: -29, jitterMs: 10_000 },
      { assetId: 'amb_cart_wheels', layerRole: 'detail', volumeDb: -33, jitterMs: 15_000 },
      { assetId: 'amb_temple_bell', layerRole: 'accent', volumeDb: -33, jitterMs: 24_000 },
    ],
  },
  ancient_egypt: {
    location: 'ancient_egypt',
    label: 'Ancient Egypt',
    layers: [
      { assetId: 'amb_wind_dry', layerRole: 'base', volumeDb: -27 },
      { assetId: 'amb_sand_shift', layerRole: 'detail', volumeDb: -33, jitterMs: 16_000 },
      { assetId: 'amb_chant_distant', layerRole: 'accent', volumeDb: -34 },
    ],
  },
  medieval_town: {
    location: 'medieval_town',
    label: 'Medieval town',
    layers: [
      { assetId: 'amb_crowd_murmur_quiet', layerRole: 'base', volumeDb: -27 },
      { assetId: 'amb_cart_wheels', layerRole: 'detail', volumeDb: -32, jitterMs: 13_000 },
      { assetId: 'amb_blacksmith', layerRole: 'accent', volumeDb: -33, jitterMs: 17_000 },
    ],
  },
  industrial_era: {
    location: 'industrial_era',
    label: 'Industrial era',
    layers: [
      { assetId: 'amb_machinery', layerRole: 'base', volumeDb: -26 },
      { assetId: 'amb_steam_hiss', layerRole: 'texture', volumeDb: -31, jitterMs: 9_000 },
    ],
  },
};

/** Never throws — an unknown location degrades to the empty neutral stack. */
export function ambienceStackFor(location: LocationId): AmbienceStack {
  return AMBIENCE_MAP[location] ?? AMBIENCE_MAP.neutral;
}

/**
 * Locations whose ambience would distract from study content. The planner
 * suppresses ambience for these when accessibility asks for reduced background.
 */
export const EDUCATIONAL_LOCATIONS: ReadonlySet<LocationId> = new Set<LocationId>([
  'neutral',
  'abstract',
  'classroom',
  'library',
  'study_room',
  'lecture_hall',
  'office',
]);

/** Runtime coverage guard for tests. */
export function assertAmbienceCoverage(all: readonly LocationId[]): LocationId[] {
  return all.filter((l) => !AMBIENCE_MAP[l]);
}
