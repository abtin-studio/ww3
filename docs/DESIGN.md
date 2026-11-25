# WW3: فرماندهی جهانی (Global Command) — Design & Architecture Spec

## 1. Core Design Pillars
1. **100% Real-World Authenticity:** Real countries (16 major global & regional powers + world map geography), real weapon systems with authentic names and indigenous producer lock-in, real intelligence agencies, real strategic maritime chokepoints, real economic & stability mechanics.
2. **Zero-Reading Effortless UX:** Every complex simulation happens under the hood. Players interact through visual cards, 1-line impact previews, a Smart Cabinet Advisor (one-click suggested moves), and a sleek click-any-country Tactical Drawer. Fully RTL Persian (`Vazirmatn`), responsive across Mobile (bottom-nav app feel) and Desktop (Pentagon War Room dashboard).
3. **Dual Game Master Modes:**
   - **Auto-GM:** Engine + smart news generator runs global events, resolves rounds, and controls non-player AI nations so the host can play as a country.
   - **Human GM (Control Room):** Dedicated God-View dashboard for the narrator to inspect hidden reserves/ops, publish custom breaking news, trigger crises, whisper intel, modify country stats, and control round flow while math stays automated.
4. **3-Phase Simultaneous Rounds:**
   - **Phase 1 (Planning & Diplomacy):** Simultaneous orders, construction, arms procurement, flights, cyber viruses, espionage, and live private/global/UN diplomacy. Advances immediately when all human players mark Ready (or optional timer expires).
   - **Phase 2 (30s Radar Intercept Alert):** Triggered automatically if incoming air/missile strikes are detected by an intact radar network (unless blinded by cyber Jamming!). Target nations get 30 seconds of live alarm to scramble fighters, boost air defense, or launch immediate retaliation.
   - **Phase 3 (Resolution & World News Broadcast):** Animated map trajectories, private intelligence reports, global news ticker & headlines, UN Security Council resolutions, and DEFCON shifts.

## 2. Tech Stack & Deployment Architecture
- **Runtime:** Single unified Node.js + Express + Socket.io + Vite (React 19 + TypeScript + Tailwind CSS + Lucide Icons) full-stack application.
- **Map:** Real Natural Earth world countries GeoJSON rendered as a crisp interactive tactical SVG map with pan/zoom, country selection, chokepoint markers, radar rings, and animated flight/missile/cyber arcs.
- **Audio:** Zero-dependency Web Audio API tactical synthesizer (radar ping, DEFCON/intercept klaxon, news chime, launch feedback) with mute toggle.
- **Persistence:** Atomic JSON state store (`data/lobbies.json`) with player reconnect tokens so browser refreshes or brief mobile disconnects never drop a player.
- **One-Click Deployment:** Ready out-of-the-box for **Render**, **Railway**, **Docker**, and **Liara** (for zero-VPN low-latency play in Iran).
