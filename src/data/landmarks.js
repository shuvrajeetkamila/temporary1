/** Geographic positions are approximate and intentionally use original structures. */
export const LANDMARKS = Object.freeze([
  { id: 'airport', name: 'Nauru International Airport', district: 'Yaren', detail: 'Southern aviation district', x: -480, z: 1800, radius: 520, icon: 'airport' },
  { id: 'government', name: 'Civic Centre', district: 'Yaren', detail: 'Public and government precinct', x: 390, z: 1490, radius: 180, icon: 'civic' },
  { id: 'lagoon', name: 'Buada Lagoon', district: 'Buada', detail: 'Freshwater interior lagoon', x: -650, z: 420, radius: 230, icon: 'water' },
  { id: 'topsides', name: 'Topside Pinnacles', district: 'Ewa', detail: 'Phosphate mining landscape', x: -40, z: -580, radius: 500, icon: 'mine' },
  { id: 'command', name: 'Command Ridge', district: 'Aiwo', detail: 'Island highlands', x: -1080, z: -240, radius: 190, icon: 'ridge' },
  { id: 'harbour', name: 'Aiwo Boat Harbour', district: 'Aiwo', detail: 'Western working waterfront', x: -2530, z: 380, radius: 230, icon: 'harbour' },
  { id: 'anibare', name: 'Anibare Bay', district: 'Anibare', detail: 'Eastern beach and reef', x: 2130, z: 360, radius: 430, icon: 'beach' },
  { id: 'north', name: 'North Point', district: 'Anetan', detail: 'Northern coastal road', x: 180, z: -2850, radius: 260, icon: 'coast' },
]);

export const DISTRICTS = Object.freeze([
  { name: 'Anetan', angle: -1.48 }, { name: 'Anabar', angle: -0.92 },
  { name: 'Ijuw', angle: -0.45 }, { name: 'Anibare', angle: 0.05 },
  { name: 'Meneng', angle: 0.62 }, { name: 'Yaren', angle: 1.16 },
  { name: 'Boe', angle: 1.70 }, { name: 'Aiwo', angle: 2.35 },
  { name: 'Denigomodu', angle: 2.73 }, { name: 'Nibok', angle: 3.02 },
  { name: 'Uaboe', angle: -2.93 }, { name: 'Baiti', angle: -2.53 },
  { name: 'Ewa', angle: -2.12 },
]);
