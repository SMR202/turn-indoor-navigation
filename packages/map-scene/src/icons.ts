/**
 * Category glyphs as 24-unit SVG path data (stroke 2, round caps), drawn for TURN in the same
 * geometric style as the mark. Used by the app and the web console so both render identically.
 */
export const ICON_PATHS: Record<string, string[]> = {
  door: ['M6 21V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v17', 'M3 21h18', 'M14 12h.01'],
  footprints: [
    'M8 17c-1.5 0-3-1.2-3-3.5S6.5 9 8 9s2.5 1.3 2.5 3.5S9.5 17 8 17Z',
    'M16 13c-1.5 0-2.5-1.2-2.5-3.5S14.5 5 16 5s3 1.3 3 3.5S17.5 13 16 13Z',
    'M7 20h2',
    'M15 16h2',
  ],
  restroom: [
    'M7 4.5a1.5 1.5 0 1 0 0 .01',
    'M5 21v-6H4l1.5-6h3L10 15H9v6',
    'M17 4.5a1.5 1.5 0 1 0 0 .01',
    'M15 21V9h4v12',
    'M12 3v18',
  ],
  coffee: [
    'M4 9h12v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5V9Z',
    'M16 10h1.5a2.5 2.5 0 0 1 0 5H16',
    'M8 3v3',
    'M12 3v3',
  ],
  bag: ['M5 8h14l-1 13H6L5 8Z', 'M9 8V6a3 3 0 0 1 6 0v2'],
  info: [
    'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Z',
    'M12 11v6',
    'M12 7.5h.01',
  ],
  cross: ['M9 3h6v6h6v6h-6v6H9v-6H3V9h6V3Z'],
  exit: [
    'M14 3h5a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-5',
    'M10 17l5-5-5-5',
    'M15 12H3',
  ],
  stairs: ['M3 20h5v-5h5v-5h5V5h3', 'M3 20v1'],
  users: [
    'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z',
    'M2 21v-1a6 6 0 0 1 12 0v1',
    'M16 3.5a4 4 0 0 1 0 7',
    'M18 14a6 6 0 0 1 4 6v1',
  ],
  desk: ['M3 8h18', 'M5 8v12', 'M19 8v12', 'M13 8v6h6'],
  tree: [
    'M12 22v-6',
    'M12 16a6 6 0 0 0 5-9.5A5 5 0 0 0 7 6.5 6 6 0 0 0 12 16Z',
  ],
  car: ['M5 17h14v-5l-2-5H7l-2 5v5Z', 'M5 12h14', 'M7.5 17v2', 'M16.5 17v2'],
  pin: ['M12 21s-7-6.2-7-12a7 7 0 0 1 14 0c0 5.8-7 12-7 12Z', 'M12 9.5h.01'],
};
