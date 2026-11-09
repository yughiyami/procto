/**
 * PROCTO platform accounts. Public keys only: the secrets live in stellar-cli (testnet aliases
 * procto-treasury and procto-impact) and never in the repository.
 */
export const PLATFORM_ACCOUNTS = {
  /** Receives the platform commission (net of the impact share). */
  treasury: 'GCJGAJ5JJIGLYMHX72TQVLUP5ZG2HY5SUHAW664NBGI47WBBKFFWTRJ3',
  /** Impact fund (reforestation and Andean communities, through the PRISMA program). */
  impact: 'GAQ7ULNLVHEHLJ4PU74ULLYDDEBLSD2AXCVFAF55IX7E6GMLWO3QN63Q',
} as const;
