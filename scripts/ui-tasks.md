# KDT Aso UI Tasks Tracker

## Tasks

### 1. Finish local PMTiles map setup
- [x] Ensure pmtiles CLI installed ✅ 2026-03-05 19:56
- [x] Download/verify Nigeria PMTiles extract ✅ 2026-03-05 19:56 (155MB, already downloaded)
- [x] Update MapDisplay.tsx to use local pmtiles:// protocol ✅ 2026-03-05 19:56 (already wired)
- [x] Wire tile-server.js into index.js ✅ (already done previously)
- [x] Use protomaps dark style for vector tiles ✅ (KDT_MAP_STYLE in MapDisplay.tsx)

### 2. Test the map
- [x] Build dashboard ✅ 2026-03-05 19:56 (vite build clean, 80 modules)
- [x] Restart server ✅ 2026-03-05 19:56 (port 3001, all systems operational)
- [x] Verify no build errors ✅ 2026-03-05 19:56 (only chunk size warning, not an error)
- [x] Verify no server errors ✅ 2026-03-05 19:56 ([TILES] Loaded: nigeria)
- [ ] Verify tiles load in browser (needs manual browser check)

### 3. Move Staff panel
- [x] Remove Staff from main view ✅ 2026-03-05 19:56 (already implemented)
- [x] Create sidebar/dropdown toggle for Staff ✅ 2026-03-05 19:56 (sidebar-drawer in App.tsx)
- [x] Put Operations role first in Staff list ✅ 2026-03-05 19:56 (sectionOrder[0] = 'operations' in AgentPanel.tsx)
- [x] Ensure Staff is still accessible but not always visible ✅ 2026-03-05 19:56 (👥 Staff toggle button)

### 4. Move Sensors
- [x] Remove Sensors from main default view ✅ 2026-03-05 19:56 (already implemented)
- [x] Make Sensors collapsible or role-specific ✅ 2026-03-05 19:56 (inside sidebar-drawer with Staff)
- [x] Keep Sensors accessible for relevant roles ✅ 2026-03-05 19:56 (accessible via 👥 Staff button)

### 5. Analyze GitHub repos
- [x] Find downloaded repos in /Users/kdtsuperapp/ ✅ 2026-03-05 19:56
- [x] Read READMEs and key source files ✅ 2026-03-05 19:56
- [x] Write analysis report to scripts/github-repos-analysis.md ✅ 2026-03-05 19:56
- [x] Focus on features useful for govt/military ops platform ✅ 2026-03-05 19:56
