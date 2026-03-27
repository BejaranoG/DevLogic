/**
 * engine/periodo/festivos-us.ts
 * Federal holidays de Estados Unidos 2024–2031.
 * Fuente: OPM (Office of Personnel Management).
 * New Year's, MLK, Presidents' Day, Memorial Day, Juneteenth,
 * Independence Day, Labor Day, Columbus Day, Veterans Day, Thanksgiving, Christmas.
 */

export const FESTIVOS_US: ReadonlySet<string> = new Set([
  // 2024
  "2024-01-01", // New Year's Day
  "2024-01-15", // MLK Jr. Day (3rd Mon Jan)
  "2024-02-19", // Presidents' Day (3rd Mon Feb)
  "2024-05-27", // Memorial Day (last Mon May)
  "2024-06-19", // Juneteenth
  "2024-07-04", // Independence Day
  "2024-09-02", // Labor Day (1st Mon Sep)
  "2024-10-14", // Columbus Day (2nd Mon Oct)
  "2024-11-11", // Veterans Day
  "2024-11-28", // Thanksgiving (4th Thu Nov)
  "2024-12-25", // Christmas

  // 2025
  "2025-01-01",
  "2025-01-20", // MLK
  "2025-02-17", // Presidents'
  "2025-05-26", // Memorial
  "2025-06-19", // Juneteenth
  "2025-07-04",
  "2025-09-01", // Labor
  "2025-10-13", // Columbus
  "2025-11-11",
  "2025-11-27", // Thanksgiving
  "2025-12-25",

  // 2026
  "2026-01-01",
  "2026-01-19",
  "2026-02-16",
  "2026-05-25",
  "2026-06-19",
  "2026-07-03", // Observed: July 4 is Saturday, observed Friday
  "2026-09-07",
  "2026-10-12",
  "2026-11-11",
  "2026-11-26",
  "2026-12-25",

  // 2027
  "2027-01-01",
  "2027-01-18",
  "2027-02-15",
  "2027-05-31",
  "2027-06-18", // Observed: June 19 is Saturday, observed Friday
  "2027-07-05", // Observed: July 4 is Sunday, observed Monday
  "2027-09-06",
  "2027-10-11",
  "2027-11-11",
  "2027-11-25",
  "2027-12-24", // Observed: Dec 25 is Saturday, observed Friday

  // 2028
  "2028-01-01",
  "2028-01-17",
  "2028-02-21",
  "2028-05-29",
  "2028-06-19",
  "2028-07-04",
  "2028-09-04",
  "2028-10-09",
  "2028-11-10", // Observed: Nov 11 is Saturday, observed Friday
  "2028-11-23",
  "2028-12-25",

  // 2029
  "2029-01-01",
  "2029-01-15",
  "2029-02-19",
  "2029-05-28",
  "2029-06-19",
  "2029-07-04",
  "2029-09-03",
  "2029-10-08",
  "2029-11-12", // Observed: Nov 11 is Sunday, observed Monday
  "2029-11-22",
  "2029-12-25",

  // 2030
  "2030-01-01",
  "2030-01-21",
  "2030-02-18",
  "2030-05-27",
  "2030-06-19",
  "2030-07-04",
  "2030-09-02",
  "2030-10-14",
  "2030-11-11",
  "2030-11-28",
  "2030-12-25",

  // 2031
  "2031-01-01",
  "2031-01-20",
  "2031-02-17",
  "2031-05-26",
  "2031-06-19",
  "2031-07-04",
  "2031-09-01",
  "2031-10-13",
  "2031-11-11",
  "2031-11-27",
  "2031-12-25",
]);
