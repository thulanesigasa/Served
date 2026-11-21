const paths = {
  settings: '<path d="M4 7h16M4 12h16M4 17h16M8 5v4m8 1v4m-6 1v4"/>',
  bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  qr: '<rect x="3" y="3" width="6" height="6" rx="1"/><rect x="15" y="3" width="6" height="6" rx="1"/><rect x="3" y="15" width="6" height="6" rx="1"/><path d="M15 15h3v3h3v3m-6 0v-3m6-5v2m-8-2v-2m0 10v-2"/>',
  history: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  phone: '<rect x="7" y="2" width="10" height="20" rx="2"/><path d="M11 18h2"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m20 0v-2a4 4 0 0 0-3-4"/><circle cx="9" cy="7" r="4"/><path d="M17 3a4 4 0 0 1 0 8"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  table: '<path d="M3 8h18M6 8l-2 12m14-12 2 12M8 8V5h8v3"/>',
  card: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18M7 15h4"/>',
  bag: '<path d="M4 7h16l1 14H3L4 7Zm5 2V6a3 3 0 0 1 6 0v3"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  link: '<path d="M10 14l4-4m-5 7-2 2a4 4 0 1 1-6-6l4-4a4 4 0 0 1 6 0m2-2 2-2a4 4 0 1 1 6 6l-4 4a4 4 0 0 1-6 0" transform="translate(1 0)"/>',
  volume: '<path d="M3 9v6h4l5 4V5L7 9H3zm13-1a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/>',
  building: '<path d="M3 21h18M5 21V8l7-5 7 5v13m-9 0v-5h4v5M9 11h.01M15 11h.01"/>',
  download: '<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>',
  search: '<circle cx="10" cy="10" r="6"/><path d="m15 15 5 5"/>',
};
export const icon = (name, size = 20) =>
  `<svg aria-hidden="true" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${paths[name]}</svg>`;
