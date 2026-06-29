/* Single source of truth for the mission sequence. Load this before any page that references missions. */
window.MISSION_ORDER = [
  { id: 'read-water',      label: 'Read The Water',                    intro: 'mission-read-water.html',      play: 'viewer.html?mission=read-water' },
  { id: 'flooded-areas',   label: 'Identify Flooded Areas',            intro: 'mission-flooded-areas.html',   play: 'viewer.html?mission=flooded-areas' },
  { id: 'decision-making', label: 'Flood Awareness & Decision Making', intro: 'mission-decision-making.html', play: 'viewer.html?mission=decision-making' },
];
