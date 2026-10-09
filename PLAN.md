# streamer-games — Plan

A **party pack of physics games for Twitch streamers**, set up like Jackbox:
- **The streamer runs a real Steam game.** It is the host: it runs the physics and owns the game. OBS captures it like any other game.
- **Viewers play from their browser.** They go to our website, enter the **room code** shown on stream, and log in with Twitch. Or they just type in Twitch chat.
- **Their Twitch username, profile picture, chat color, skin, and stats carry over and save.**
- **Shared pieces across every game:** physics, ragdoll people, skins, and Twitch profiles.
- **Games:**
  - **Chat Tower** (#1): Mount Your Friends meets World of Goo, with Marbles-style skins.
  - **Fartman** (#2): a Braid-style puzzle platformer about a green-gas farting man.
  - **Bridge Breakers** (#3): Poly Bridge, except the streamer builds and chat bets on wrecking it.
  - More later.
- **Viewers never connect to the streamer's PC. Ever.** Everything goes through our relay server, so the streamer's IP address is never exposed (§5).

> Status: planning only. No code yet.

---

## Inspirations: what each game actually does, and what we take

### Jackbox Party Packs (*You Don't Know Jack* and others): the model for the whole product

**How it works:**
- The host runs the game on Steam or a console and streams it.
- Players go to **jackbox.tv** and enter a **room code** on their phones. The **phone is a controller**; the game itself is on the stream.
- **"Require Twitch" setting:** players must log in at jackbox.tv with Twitch, and **their Twitch username becomes their in-game name**.
- Other streamer settings:
  - Audience mode (up to 10,000 viewers)
  - "Max players"
  - Hide the room code
  - **Extended timers** to cover stream delay
- The **Audience Kit Twitch extension** lets viewers play without leaving Twitch.

**What we take:**
- Steam host plus browser players.
- Room codes.
- Required Twitch login, so names are real.
- Streamer-safety settings.
- Longer timers for stream delay.
- The party-pack framing: one app, many games, shared profiles.

### Mount Your Friends (Stegersaurus, 2013 on Xbox Live Indie Games, 2014 on Steam; *MYF 3D* in 2018)

**How it plays:**
- Players take turns climbing a tower made of the previous climbers.
- **Each limb has its own button.** Hold it and steer that limb with the stick or mouse. Let go and the limb grabs whatever is close.
- When part of your man passes the old height, **he freezes and becomes part of the stack**.
- Turns are timed.

**What makes it fun:** floppy limbs, and freezing in awkward poses to make the next player's climb harder.

**What we take:**
- Freeze on contact.
- **Per-limb control**, simplified: one key per limb that **extends** it from a tucked ball, plus rotate. Shape yourself on the way down.
- Floppy physics.
- A per-person score.

### World of Goo (2D Boy, 2008; *World of Goo 2* in 2024)

**How it plays:**
- Goo balls connect with **springy struts**. A leaning tower squeezes one side and stretches the other until struts **snap** or it tips past its balance point.
- **Tall towers sway in wind.**
- Climbing goo adds weight and makes it swing more.
- Players fix a lean with a **counterweight**.
- **Limited undo**, because the wobble is too unpredictable to tolerate full resets.
- **World of Goo Corporation** (the tallest-tower mode) shows **other players' towers as clouds at their heights**.

**What we take:**
- Springy welds.
- **New struts form wherever things touch**: our sticky limbs.
- Snapping, with **stress you can see**.
- Wind that grows with altitude.
- Counterweighting.
- Past rounds shown as clouds.

### Marbles on Stream (Pixel by Pixel Studios)

**How skins work there:**
- The streamer sets up skin slots, some for **everyone** and some for **subscribers only**.
- Viewers keep a **personal loadout that follows them to any stream**.
- **Cosmetics never change physics.**

**What we take:** all of that.

### Braid (Jonathan Blow, 2008): for Fartman

**How it plays:**
- **Each world gives you a different power over time**, and the puzzles come out of that power.
- Blow's method was to ask **how each rule touches every object**: keys, doors, enemies, platforms, the player. He **found** the rules by prototyping and playtesting rather than designing them up front.
- **Every puzzle shows you one new thing.** Nearly every object serves a puzzle.
- **Keys and locked doors.** "Two doors, one key." Enemies can carry the key or be used as platforms.
- Worlds are completed by collecting **puzzle pieces** that assemble into a picture.

**The critique to avoid:** a couple of puzzles were impossible with the tools you had at that point, which made players stop trusting that hard puzzles had answers.

**What we take:**
- One fart type per world, explored against every object.
- One-new-thing rooms.
- Keys to keyholes.
- Optional collectibles.
- Prototype first, then find the puzzles.
- **Time isn't the core** (your call), so rooms get an **instant reset**.
- **Time does come back as a late-game twist**: the **Fart Incapacitor**, a Back to the Future parody (§11).

### Poly Bridge (Dry Cactus, 2016; *Poly Bridge 2* 2020): for Bridge Breakers

**How it plays:**
- You build a bridge between fixed **anchor points**, under a **budget**, from materials with different costs and strengths: road deck, wood, steel, cable/rope, and later hydraulics and springs.
- Vehicles drive across. Every beam shows its **stress**, and you must keep it **under 100%**.
- Ramps, several vehicles at once, and boats hitting the side all add stress. When it fails, vehicles end up in the water.
- After a level you see other players' cost and stress. It's a puzzle of **saving money piece by piece**.

**What we take:**
- Anchors, budget, materials, and stress colors.
- Pin-jointed beams that **snap past their limit**.
- Vehicles as the load.

**The flip:** the **streamer** builds, and **chat** sends loads to wreck it.

Sources:
- [Jackbox streamer's guide (PP5)](https://jackboxgames.com/the-jackbox-party-pack-5-streamers-guide/)
- [How to stream Jackbox on Twitch](https://www.jackboxgames.com/how-to-stream-jackbox-games-on-twitch/)
- [Jackbox PP8 streaming features](https://www.jackboxgames.com/streaming-moderation-accessibility-features-jackbox-party-pack-eight/)
- [Mount Your Friends on Steam](https://store.steampowered.com/app/296470/Mount_Your_Friends/)
- [Hardcore Gamer review](https://hardcoregamer.com/reviews/review-mount-your-friends/96776/)
- [Midlife Gamer Geek review](https://midlifegamergeek.com/2023/04/23/video-game-review-mount-your-friends-pc-2013/)
- [World of Goo (Wikipedia)](https://en.wikipedia.org/wiki/World_of_Goo)
- [UAF physics page](https://ffden-2.phys.uaf.edu/211_spring2009.web/chris_plutt/goo.html)
- [Game Developer: Finding the Fun](https://www.gamedeveloper.com/design/finding-the-fun-world-of-goo)
- [Marbles on Stream Steam discussions](https://steamcommunity.com/app/1170970/discussions/0/3829691612499256908)
- [Braid (Wikipedia)](https://en.wikipedia.org/wiki/Braid_(video_game))
- [Braid on Steam](https://store.steampowered.com/app/26800?l=english)
- [Game Maker's Toolkit: How Jonathan Blow Designs a Puzzle](https://amara.org/v/C3BFd)
- [Game Developer: IndieCade, inside Blow's puzzle design](https://gamedeveloper.com/design/indiecade-inside-jonathan-blow-s-puzzle-design-process)
- [Tom Francis on Braid](https://www.pentadact.com/?p=349)
- [Poly Bridge on Steam (community)](https://steamcommunity.com/app/367450/discussions/0/351659808475192806)
- [Poly Bridge 2 review (Bonus Stage)](https://www.bonusstage.co.uk/archives/144520)
- [Twitch Bits Acceptable Use Policy](https://legal.twitch.com/legal/bits-acceptable-use)
- [Twitch Predictions API guide](https://dev.twitch.tv/docs/api/predictions/)
- [Twitch API reference](https://dev.twitch.tv/docs/api/reference/)

---

## 0. Decisions so far

| Question | Decision |
|---|---|
| Product | A Jackbox-style party pack. **A Steam game for the host**, a **browser game for viewers** (room code + Twitch login), and Twitch chat as the always-available fallback. |
| Platform | Twitch only |
| Identity | A player is a **Twitch user ID** whether they come in by chat or the website. Name, color, profile picture, and badges carry over. Profiles and stats **save on the host** (Steam Cloud). |
| OBS | None required: Game Capture. Optional later: clip or replay-buffer triggers. |
| **Streamer safety (hard rule)** | The streamer's PC accepts **zero** connections from viewers. It only connects **out** to Twitch and our relay. **No WebRTC or peer-to-peer anywhere**, because it would reveal the streamer's home IP and invite DDoS and doxxing. The host also **never fetches a URL a viewer supplied**. |
| Viewer website | A static site. Viewers talk only to **our relay server** (§5), which needs a backend. Scale: **100 website players to start, built to grow to 10k+**. A custom short domain is optional (see §16). |
| Games | Chat Tower first, Fartman second. All games live in one app and share profiles and skins. |
| Turn length (Tower) | A host setting, default 3 s. Auto-drop when it runs out. |
| Player controls (Tower + Bridge) | **Limbs and neck are short stubs by default**; **hold a key to stretch that one out**, release to pull it back in. Four limbs plus the neck give **32 shapes**. **Right hand:** J K L ; = limbs, **, = neck**, **I / O = rotate**, **U / P = drift left / right**. **Left hand (mirror):** A S D F = limbs, **X = neck**, **W / E = rotate**, **Q / R = drift**. No mouse. Live for website players and hotseat; chat players type a shape and angle. Remappable. *(Set by you.)* |
| The people | **Stumpy little humans, Mount Your Friends style**, whose **head, hands, and feet are sticky orbs** (World of Goo). One body plus five orbs on five stretch joints. **The streamer is the same person frozen in a T-pose.** *(Set by you; built in Phase 0.)* |
| Skins | Cosmetic only. Chat commands, Twitch emote or profile-picture faces, channel/sub presets, and a website skin editor. |
| Betting and prizes | **Never with Bits** (real money; Twitch bans Bits wagers). Betting uses **Scrap**, a free game currency topped up with channel points, plus optional **Twitch Predictions**. Bits only buy effects, for glory. See §11b. |

---

## 1. How it fits together

```
 ┌──────────────── Streamer's PC ────────────────┐
 │  STEAM GAME (host)                            │        Twitch
 │  physics · rules · profiles · saves           │◄──── chat (EventSub / IRC)
 │  Twitch login (device code) ──────────────────┼────► channel points, subs, bits,
 │  shows ROOM CODE on screen                    │      raids, profile pictures, clips
 │  OBS Game Capture → stream                    │
 └────────┬──────────────────────────────────────┘
          │ ONE outbound WebSocket (the host dials out; nothing dials in)
          ▼
 ┌── RELAY (our Linux server, behind Cloudflare) ┐
 │  one room per code · checks Twitch logins     │
 │  fans state out to viewers · batches inputs   │
 │  never reveals the host's IP · shards past ~1k│
 └────────▲──────────────────────────────────────┘
          │ viewers' WebSockets (they only ever see the relay)
 ┌──── viewer website (static) ──────────────────┐
 │  enter code → log in with Twitch → play       │
 │  phone/PC = controller + live view on my turn │
 │  skin editor · my stats                       │
 └───────────────────────────────────────────────┘
```

---

## 2. Core tech choices

| Choice | Pick | Why |
|---|---|---|
| Host app | **Electron** wrapping the same web code, with **steamworks.js** for Steam (Cloud saves, achievements, overlay) | **One codebase** for the Steam game and the viewer website. Viewers' live view uses the exact same renderer. Electron is a normal way to ship web-tech games on Steam. During development the host also runs in a plain browser tab, **with no Twitch login there**: simulated chat and anonymous chat reading only, so tokens never live in a web page. |
| Language | **TypeScript everywhere**: host app, viewer website, relay | Shared message and skin types across all three. Fewer mismatch bugs, and the language AI coding sessions handle best. |
| Game framework | **Phaser 4** (4.2.1, July 2026; WebGL) | Scenes, input, audio, cameras, particles, text, asset loading, and **Tiled map loading** for Fartman. Runs the same in Electron and phone browsers. |
| Physics | **Box2D v3** via **box2d3-wasm 5.2.0** (Box2D v3.2, WASM). **Chosen in Phase 0** ([results](spikes/phase0/RESULTS.md)): 4–7× faster than Planck, bit-identical across Node, Chrome, and both builds. Planck.js stays behind the adapter as a fallback. | Physics runs only on the host, plus in Fartman play-along on viewers' own machines. |
| Build | **Vite** | One build for Electron and the website. |
| Chat | Anonymous IRC (works without login), upgraded to **EventSub** once the streamer logs in | Message tags give `user-id`, `display-name`, `color`, `badges`, and `emotes`. |
| Streamer login | **Twitch device code flow**: the app opens twitch.tv/activate in the streamer's browser **with the code pre-filled** | Made for desktop apps. No client secret, no server. |
| Viewer login | **Twitch OIDC implicit flow** on the website | Returns an ID token **signed by Twitch** (user ID + username). **The relay checks it** and passes only verified identities to the host. |
| Host ↔ viewers | **Relay: a Node.js (TypeScript) WebSocket server on our Linux server**, behind **Cloudflare's free proxy** | Both sides connect **out** to the relay, so the host's IP is never exposed. The proxy hides the relay server's IP too and absorbs DDoS. Works on every network. The streamer uploads each update once. Shares message types with the host and website. Scales from 100 to 10k+. |
| Dev and targets | Develop on **Mac**. Ship Steam builds for **Windows** (most Steam players) and Mac, Linux optional. The relay runs on **Linux**. | Electron packages Windows builds from a Mac. **Test on a real Windows PC before launch.** |
| Tests | **Vitest** plus headless physics tests in Node | Both physics engines run in Node. |

**Why Box2D v3.** It's Erin Catto's 2024 ground-up rewrite of Box2D. I checked these names in its headers:

| Need | Box2D v3 feature |
|---|---|
| Stable tall stacks of heavy bodies (50-person tower, bridge trusses) | **Soft-step solver**, continuous collision, island sleep |
| Repeatable Fartman replays, recorded room solutions, viewer play-along | **Cross-platform determinism** since v3.1 |
| World of Goo wobble | **Weld joints with springs**: `linearHertz`, `angularHertz`, and their damping ratios |
| Snapping joints | `b2Joint_GetConstraintForce` / `b2Joint_GetConstraintTorque` |
| Ragdolls and limb extend/tuck | Revolute joints with limits, motors, and springs (`lowerAngle`, `maxMotorTorque`, `enableSpring`, `hertz`) |
| Streamer's cart, stretchy neck | Prismatic (sliding) joint with a motor and limits |
| Bridge cables | Distance joint with `minLength` / `maxLength` (tension-only rope) |
| Vehicles | Wheel joint |
| Freezing people into one body | **Compound bodies** (many shapes on one body) |
| Freeze on contact, keyholes, gas clouds | Contact and sensor **event lists after each step**: `b2World_GetContactEvents` / `b2World_GetSensorEvents`, enabled per shape. Since events arrive between steps, freezing someone is easy and safe. |

**The risk, and how we handle it:**
- box2d3-wasm is a small community project (about 66 GitHub stars; npm 5.2.0, Feb 2026).
- Phaser's own JS port of Box2D v3 hasn't been updated since January 2025.
- **Mitigation:** the game talks to physics through a thin **adapter** (`physics/`) that exposes only what we use: bodies, compound shapes, the joints above, constraint force, and events. It has two backends, `box2d3.ts` and `planck.ts`.
- **Phase 0 runs the same tests on both** and we keep the one that passes. Planck.js (an older Box2D port) is proven and has every feature above except v3's solver and determinism.

**Ruled out:**
- **Godot 4.7**: its 2D physics only has pin, groove, and spring joints (no weld, wheel, or rope, and no strain readout in the docs). Web export is heavy for phones, and C# still can't export to web.
- **Defold** (the runner-up): Box2D v3 built in and small web builds, but Lua, with separate code for the website and relay.
- **Matter.js**: no joint limits.
- **Rapier**: no spring weld built in.
- **Unity**: heavy web builds.

**Steam binding check:** steamworks.js's last npm release was 0.4.0 in August 2024. Confirm it works with the current Electron (44.x) before the Steam phase. If it doesn't, alternatives exist, and the Steam layer is small.

---

## 3. Twitch integration

**Two Twitch app registrations are needed** (free, at dev.twitch.tv, with two-factor auth on).
- Twitch's docs say a **public** client can only use the device flow, so:
  - **"Streamer Games Host"**: public client, device code flow. Its Client ID ships in the Steam app.
  - **"Streamer Games Web"**: implicit flow, with redirect URLs set to the website and localhost.
- Neither one ever uses a client secret.

### Streamer login (in the Steam app)

**How it works:**
- The app opens Twitch's activation page **in the streamer's own browser**, with the code already filled in. **The code is never drawn in the game window**, because the game window is on stream and a viewer could type it in first and hijack the login.
- After login the app shows "Logged in as @name. Not you?"
- Docs say: never enter a code this app didn't open for you.
- **All Twitch auth, Helix, and EventSub run in Electron's main process.** Tokens never enter the game renderer (§14a).
- Tokens are stored **encrypted on disk** with Electron `safeStorage`, outside any Steam Cloud folder (§14a).
- Twitch's rules: access tokens last 4 hours. Refresh tokens are **single-use** and **expire after 30 days unused**, after which the streamer logs in again.

**What it unlocks.** Scopes are requested **only when the streamer turns that feature on**. The first login asks for `user:read:chat` + `moderation:read` only.

| Feature | Twitch API (scope) |
|---|---|
| Chat with full tags | EventSub `channel.chat.message` (`user:read:chat`). Falls back to anonymous IRC. |
| **Profile pictures** and display names for every player | Helix `GET /users` (100 per call) |
| **Channel point rewards** inside games: skip the queue, golden skin, "feed Fartman a burrito"… | The game **creates its own rewards** (`channel:manage:redemptions`), **pauses them while the game is closed**, and refunds any it can't fulfill. EventSub events are de-duplicated by `message_id`. |
| **Ban list**: banned or timed-out users can't play from the website either | Helix Get Banned Users (`moderation:read`) |
| Subs, bits, raids as in-game events. Raid → "the raiders all drop at once." | EventSub subscribe/cheer/raid events (scopes per event) |
| **Auto-clip** a new record or a big collapse | Helix Create Clip (`clips:edit`) |

### Viewer login (on the website)

- Login uses `response_type=id_token` and `scope=openid` only, with no email.
- **The `nonce` is a random, single-use value the relay issued for this join**, not the room code, so a leaked token can't be replayed.
- **The relay checks:**
  - RS256 signature using Twitch's public keys (`id.twitch.tv/oauth2/keys`, cached and looked up by `kid`)
  - `iss`, `aud` = the Web client ID, and the nonce
  - the token is under 10 minutes old
- **The viewer site** checks the OAuth `state` value before sending anything to the relay.
- The site wipes the token from the URL right away.
- One socket per Twitch ID per room.
- The host only ever receives already-verified `{twitchId, name}`, never tokens and never viewer IPs.
- **"Require Twitch login"** is always on for the website, as in Jackbox's option. **Logged-out visitors see only the join page** (which streamer the code belongs to, and a login button). Playing and the live view both require login. Anyone without a login can still play through chat.

### What "links and saves" means

A player's **Twitch user ID** is the key. The same ID comes from:
- chat tags
- website logins
- channel-point and bits events

So all of it attaches to **one profile**:
- display name and color
- profile picture
- badges (sub, VIP, mod)
- skin
- per-game stats

See §6.

---

## 4. OBS

- **Nothing required.** The streamer captures the Steam game with Game Capture, like any game.
- **Optional, later:** OBS 28+ has obs-websocket built in, so the game could save the replay buffer or switch scenes on a new record or collapse. Off by default; the streamer turns it on with their OBS websocket password.

---

## 5. Host and viewers

**The rule that keeps this cheap: the renderer draws a "view list," never physics directly.**
- The host turns the world into `{id, shapeRef, x, y, angle, style}` plus HUD state.
- The same renderer draws it in the Steam app and in viewers' browsers.
- Viewers never run physics.

**Every input is a command.**
- Chat messages, website buttons, channel-point redemptions, and bits all become `{player, cmd, args}`.
- Live controls arrive as `{player, limbs, rotate}`: limbs is a 5-bit mask of which parts are extended (four limbs + neck), and rotate is -1, 0, or 1. **They're sent only when they change**, so each message is a few bytes.
- Games only see commands. The host enforces all rules.

### Joining, Jackbox-style

1. **Room code.**
   - The host connects out to the relay and **proves it's the broadcaster**: it sends its Twitch token once. The relay checks it with Twitch, keeps only the user ID, and throws the token away.
   - The relay allows **one room per broadcaster** and returns a 4-letter code (8 characters when hidden) plus a secret the host needs to reconnect.
   - The website shows "Joining **@broadcaster**", so a fake room is obvious.
2. **Join.** The viewer goes to the website, enters the code, and logs in with Twitch.
   - **The relay** checks the ID token (§3).
   - **The host** rejects anyone banned or timed out in chat.
3. **The viewer's screen is a controller first:**
   - join or queue status
   - their skin and stats
   - the game's buttons
4. **A live view only when it matters.** The **active player** (and whoever is next) gets full-rate snapshots so they can shape and rotate with no stream delay. Everyone else gets a light lobby feed, with an optional low-rate live view.

### IP safety: where an address could leak, and how each is closed

| Possible leak | Rule |
|---|---|
| Viewers connecting to the streamer | **Never.** No WebRTC, no peer-to-peer, no open ports. The host only dials out. |
| The relay passing the host's address on | The relay forwards **game messages only**, never connection details, headers, or IPs, in either direction. |
| The host fetching something a viewer controls | **Never fetch a viewer-supplied URL.** Skins are IDs and enums only. Emote faces are emote IDs, and the host builds the Twitch CDN URL itself. Profile pictures come from Twitch's API. Fartman level codes are data, never links. |
| Viewers' IPs reaching the host or other viewers | The host gets only verified `{twitchId, name}`. Viewers never see each other. The relay doesn't log viewer IPs. |
| OBS websocket (optional feature) | **Our client** connects only to `127.0.0.1`. OBS itself listens on the network, so docs say: keep the OBS websocket password on and never port-forward 4455. |
| Third-party signaling relays (the old Trystero idea) | **Removed.** Nothing about a room is published anywhere public. |

### Bandwidth and scale

**The streamer uploads each update once,** no matter how many viewers there are. The relay does the fan-out.

| Who gets what | Rate | Streamer's upload |
|---|---|---|
| Active player (and next up): full snapshots for live control | 15–20 Hz | ≈ 15 KB/s each |
| Everyone else: state changes only (lobby, queue, pot, balances) | as it changes | the same single upload for all of them |
| Optional low-rate live view | ~5 Hz | from the relay, not the streamer |

**Relay scaling:**
- **To start:** one relay process on the Linux server, one in-memory room per code, capped at **100 website players** (a setting).
- **For 1k–10k+** (Bridge Breakers at a 10k-viewer stream):
  - Use a high-performance WebSocket library (uWebSockets.js), which holds many thousands of sockets per process. Past one process, add **fan-out worker processes** that each hold a share of a room's viewer sockets.
  - Workers rebroadcast the room's state.
  - Workers **batch and rate-limit viewer inputs** before forwarding them: one bet per viewer per window, merged load requests.
- **Cost:** the Linux server itself, plus Cloudflare's free proxy plan. Outbound bandwidth is the main cost at scale. Lobby state is tiny, and only the active player gets full-rate snapshots.
- **Chat always works too.** Twitch chat scales for free for anyone who doesn't open the website.

---

## 6. Profiles and saves

**Profile** (keyed by Twitch user ID):
- name, color, profile picture URL, badges
- skin
- stats per game: Tower height added, best placement, rounds; Fartman rooms helped…

**Where it lives:**
- **The host's save file**, synced by **Steam Cloud**. Each streamer's community has its own profiles, records, and history.
- **The viewer's browser** keeps their own skin, so it follows them to any streamer's game.

**Global profiles** (one profile and leaderboard across every streamer) would mean adding a database next to the relay. That's a later decision (§16).

---

## 7. What we run and depend on

| Service | Used for | If it's down |
|---|---|---|
| **Our relay** (Node.js on our Linux server, behind Cloudflare's proxy) | Rooms, login checks, fan-out, input batching | Website play is down; chat and the game still work |
| Static site hosting: **GitHub Pages**, or the Linux server **only through the Cloudflare Tunnel** so the origin IP stays hidden | The viewer website | Viewers use chat |
| Steam | Distribution, Cloud saves, achievements | The game runs offline; saves stay local |
| Twitch IRC / EventSub / Helix | Chat, events, profile pictures | Bots or the sim textbox; built-in faces instead of profile pictures |
| Twitch logins + public keys | Streamer and viewer identity | Chat still works |

**Things you'll do yourself:**
- Register the two Twitch apps.
- Set up the **Linux server** and a **Cloudflare account** (free) for DNS and the proxy in front of it.
- Set up a **Steamworks partner account**: the $100 Steam Direct fee per game, tax and bank info, store page.
- Optionally buy a short domain for the website.

---

## 8. Repo layout (TypeScript monorepo, npm workspaces)

```
streamer-games/
  packages/
    protocol/                shared by host, website, and relay: message types, skin schema, validation
    engine/                  shared by host + website (Phaser 4)
      physics/               adapter API + two backends: box2d3.ts (Box2D v3 WASM) · planck.ts (fallback)
      scenes/                Phaser scene base classes; view.ts (world → view list) · render.ts (view list → sprites)
      person.ts  limbs.ts    ragdoll humans + limb extend/tuck + rotate (§9)
      platformer/            character controller, Tiled maps → bodies, triggers, doors/keys,
                             gas particles (for Fartman, reusable)
      skins/   catalog.ts  draw.ts
      players.ts  commands.ts  storage.ts  audio.ts  hud.ts
      net/     snapshot.ts  interp.ts   (shared encode/decode; no sockets here)
      dev/     sim-chat.ts  bots.ts
    games/
      tower/                 Game #1: Chat Tower
      fartman/               Game #2: Fartman (+ levels/ made in Tiled)
      bridge/                Game #3: Bridge Breakers
      sandbox/               dev sandbox + copy-and-edit template (not a shipped game)
  apps/
    host/                    Electron main + preload (Steam, token storage, saves); loads the host UI
      main/twitch/           ALL Twitch auth, chat, EventSub, Helix: main process only, tokens never reach the renderer
      main/net/              network allowlist (webRequest), safeFetch, and the host's relay socket
                             (main process only, because host auth sends the Twitch token)
      web/                   host UI: game picker, settings, Twitch login, room code
    viewer/                  the website: join by code, Twitch login (OIDC), relay-client.ts (viewer socket),
                             controller, live view, skin editor
    relay/                   Node.js WebSocket server for the Linux server: rooms, codes, token checks
                             (verify.ts), fan-out workers, input batching/rate limits; never forwards IPs
  spikes/                    Phase 0 head-to-head (Box2D v3 vs Planck), kept for reference
  test/                      vitest: parsers, state machines, token checks, snapshots, headless sims
  .github/workflows/         typecheck + tests; viewer site deploy; host builds
```

### Game interface

```js
export default {
  id: 'tower', title: 'Chat Tower',
  createHost(ctx) {              // HOST ONLY: ctx = { world, physics, makePerson, players, settings, save, hud, emit, twitch }
                                 // ctx.twitch = the narrow preload API (createClip, startPrediction…), never a Twitch client or token
    return {
      update(dt) {},
      onCommand(player, cmd, args) {},     // chat, website, channel points, bits — all the same
      onLimbInput(player, input) {},       // live {limbs mask, rotate} (website or hotseat)
      onKey(e) {},                         // streamer keys
      state() {},                          // small JSON for HUD + viewers
      destroy() {},
    };
  },
  draw: { background(r, s) {}, world(r, view, s) {}, overlay(r, s) {} },   // host + viewers
  controller: { /* which buttons the viewer's phone shows, per game state */ },
};
```

---

## 9. The shared Person

*(Redesigned during Phase 0 from your feedback. Code: `packages/engine/src/person/person.ts`.)*

- **The look:** a **stumpy little human**, Mount Your Friends style:
  - a chunky torso in shorts
  - thick, short arms and legs
  - an outlined cartoon look
  - a cute face

  Its **head, hands, and feet are round sticky orbs**, World of Goo style.
- **The physics:** one **body** plus **five orbs** (head, two hands, two feet). Each orb rides a **stretch (prismatic) joint** along a fixed direction from the body: neck up, arms out, legs down.
  - That's **6 bodies and 5 joints**, down from 11 and 10.
  - The limbs themselves are drawn, not simulated. Only the body and the orbs collide.
- **Short until pressed:** every limb and the neck are **short stubs by default**. **Hold the key and that one stretches out**, about 5× longer for arms. Release and it pulls back in. The stretch is motor-driven and force-capped, so it has a little give.
- **Shapes:** four limbs plus the neck give **32 shapes**, and freezing on contact locks in whichever you're holding. Strategy is choosing the shape and timing the landing.
- **Air control while hanging or falling:**
  - **rotate** slowly (I/O or W/E)
  - **drift** sideways (U/P or Q/R)

  Both have capped speeds, so they nudge the landing rather than letting you fly.
- **States:**
  - **live**: body and orbs on their joints
  - **frozen**: merged into **one rigid body**, momentum preserved, so a 50-person tower is about 50 bodies
  - `unfreeze()` splits them back apart, keeping the motion
- **Only the orbs are sticky.** A head, hand, or foot touching another person bonds; body-to-body just collides.
- **Controls:**

  | | ← drift | ↺ rotate | ↻ rotate | drift → | L arm | L leg | R leg | R arm | Neck |
  |---|---|---|---|---|---|---|---|---|---|
  | Right hand | U | I | O | P | J | K | L | ; | , |
  | Left hand | Q | W | E | R | A | S | D | F | X |

  Both layouts are always active and remappable. On phones: five stretch buttons, two rotate buttons, two drift buttons.
- **Chat shapes** name which parts are out: `star` (all four limbs), `ball` (nothing), or letters from either layout (`drop jl`, `drop asx`, where `x` is the neck), plus an optional angle.
- **The streamer** is the same person, frozen in a **T-pose** (arms straight out sideways). That gives three wide landing spots: both hands and the head.
- **Skins** (§13) are drawn on top and never change the physics. Name tag over the head; X-eyes for debris.

---

## 10. Game #1: Chat Tower

### The round

1. **Start.** The streamer's guy stands in the middle of the ground with his arms up.
2. **Join.** Viewers join by `!join` (or `drop` when it isn't their turn), by the website's Join button, or with a channel-point "skip the queue."
3. **Turn.**
   - A claw-machine crane holds the viewer's person **by the back** above the tower, limbs tucked. Live players slide the claw with U/P or Q/R.
   - A name tag and a countdown show above it; turn length is a setting, default 3 s.
   - **"UP NEXT: @name"** shows one turn ahead.
4. **Drop.**
   - `drop` in chat, or the website button.
   - **Website and hotseat players extend and tuck limbs and slowly rotate** (I/O or W/E) while hanging and all the way down.
   - **Chat players** can add a shape and an angle: `drop star`, `drop jl 90`, `drop ball -45`. The body holds that shape, and the claw turns to that angle before letting go.
   - If the window runs out, it drops as a tucked ball.
5. **Contact = freeze.**
   - On first touch, the body freezes in its pose, merges into one body, and is **welded where it touched**.
   - The soft weld wobbles. Landing on the low side counterweights a lean.
   - The player gets credit for the height they added ("+2.4 m @bob").
   - **From then on their limbs and head are sticky.** If the tower sways and one landed person's limb touches another's, they **bond** at that spot (see "Sticky bonds" below). The tower turns from a chain into a web.
6. **Miss.** Hitting the ground first shows **MISSED**; the ragdoll lies there and fades out.
7. **Balance.** The streamer moves with ← / →, holding Shift for fine control. The tower is a broom balanced on a hand.
8. **Collapse.**
   - Trigger: leaning more than about 55° for over 0.4 s.
   - Everything unfreezes and **rag dolls**.
   - Then: slow-mo, shake, final height, **NEW RECORD**, and an optional auto-clip. A new round starts after about 6 s.

### The streamer's balance (the make-or-break design)

- **Cart.** An invisible body on a prismatic joint. The arrow keys drive its motor with ramping and a capped force.
- **Streamer.** A posed person on a revolute **ankle** joint above the cart.
  - The ankle motor is a capped spring toward upright: short towers stand alone, tall ones need balancing.
  - The standing streamer doesn't collide with the ground.
- **Tuning.** Values live in `tuning.js`:
  - weld `angularHertz` (around 5) and damping (around 0.5)
  - ankle stiffness and cap
  - cart acceleration and speed
  - crane height and sway
  - collapse angle
  - bond breaking points per direction (compression ≫ tension, shear, twist), stress smoothing, max bonds per person, bond-forming speed limit
  - limb strength
  - **wind that grows with altitude**

### Showing off

- Live height and this round's max.
- A dashed **record line** with the record holder's name.
- Milestone toasts at 10, 25, 50, 100, 200, and 300 m.
- **Sky by altitude**, up to space at around 300 m.
- A side ruler.
- The tower roster.
- **Past rounds as clouds at their heights.**
- Round summary and hall of fame, saved in the host save: top contributors and best placements.

### Sticky bonds, stress, and breaking (core mechanic)

**Like World of Goo struts forming wherever balls touch, every connection in the tower is a real physics joint.**

- **Bonds form on touch.**
  - When a **sticky orb** (head, hand, foot) of one landed person touches another landed person, a **soft weld (bond)** forms there.
  - Touches are found geometrically every 0.1 s (orbs as circles, the body as a capsule). Bonded pairs don't collide, because a weld locked onto an overlap fights the contact solver (Phase 0 finding).
  - Body-to-body contact just collides.
- **Limits, so it stays a wobbly web and not one rigid blob:**
  - **one bond (one weld) per pair of people.** More touches between the same pair **widen** that bond instead of adding a weld; two welds between the same pair fight each other.
  - at most about 4 bonds per person (tuning)
  - bonds only form at low relative speed. A hard smack bumps instead of glues.
  - **bonds to the streamer never snap.** The streamer is the foundation; losing balance is the main way to fail.
- **Failure load: the masonry rule** *(your call: compression is super strong, so towers get big; refined in Phase 0)*:
  - Each step, the bond's force (`b2Joint_GetConstraintForce`) is split along its axis into **compression** and **tension**, plus **shear**. Twist comes from `b2Joint_GetConstraintTorque`.
  - The bond acts like a joint of some **width**: a single orb is about 0.25 m, and extra touches widen it.
    - Twist turns into tension on one edge of the bond and compression on the other.
    - **The weight pressing down on the bond cancels edge tension.** A bond only fails once the load shifts past its edge, like a stone column.

    | Load | Breaking point | Effect |
    |---|---|---|
    | **Compression** | **Effectively unbreakable** | Straight stacks never fail |
    | **Edge tension** (from pulling or bending) | Normal, the main way bonds fail | Leans and overhangs fail once the load leaves the bond |
    | **Shear** | Medium | Sideways sliding at overhangs |

  - Phase 0 tried four independent limits first. The bottom bond always snapped from twist around 7–10 m, because it carries the bending of everything above. The masonry rule fixed that while still breaking leans.
  - **Stress** = the worst load ÷ breaking point, smoothed over a few frames so a one-frame spike doesn't break anything.
  - Over 100% for a short moment → **the bond snaps** (pop sound, goo splat).
  - **What this means for play:** straight stacks are nearly free. **Leaning, overhangs, and sideways hooks are where the risk is**, and that's exactly where the streamer's balancing and viewers' bracing matter.
  - **Phase 4 tuning:** springy bonds wobble but can't hold very tall columns, and rigid ones break on impact. Current tuning tops out around 13–22 m.
- **You can see the stress:**
  - Each bond is drawn as a small **goo blob** between the two limbs, tinted **green → yellow → red** by stress. It pulses when close to breaking.
  - Each person gets a **red tint** from their most-stressed bond, so you can read the whole tower's strain at a glance.
  - Debug overlay (F1) shows numbers.
- **When bonds break:**
  - After any snap, the game walks the bond graph from the streamer.
  - Anyone **no longer connected** unfreezes into a ragdoll and falls as debris. Debris isn't sticky.
  - The tower gets shorter but the round goes on. A clean break near the top costs a little; one near the bottom costs everything.
- **Gameplay this creates:**
  - Viewers aim for spots where their limbs will **brace** two people (a new bond spreads the load and turns stress back to green).
  - The streamer watches the reds and shifts under them.
  - Chat yells "the left side is red!"
- **Shared with Bridge Breakers:** the same stress, tint, and snap code (`engine/physics/stress.ts`), which is Poly Bridge's stress colors.

### Settings and hotkeys

**Settings:**
- turn length
- bots
- hotseat
- wind
- name tags
- max website players
- bond strength (stickiness/breaking load)
- skin permissions
- channel-point reward mapping
- auto-clip

**Hotkeys:**

| Key | Action |
|---|---|
| ← / → | move (Shift = fine) |
| Space | drop now |
| J K L ; , + U I O P, or A S D F X + Q W E R | stretch limbs and neck, rotate, drift the dropper in hotseat |
| F1 | debug overlay |
| F2 | toggle hotseat |
| F3 | toggle bots |
| F5 | reset round |
| F6 | skip turn |

Streamer hotkeys live on **function keys** so they never collide with the letter keys players use for limbs and rotation.

---

## 11. Game #2: Fartman (concept; viewer integration still to work out)

**Pitch.** A Braid-style puzzle platformer on the same physics engine, without the time powers.
- **Fartman** is a green-gas man who **eats things to fill his fart meter** and **spends farts as his tools**.
- Every room's goal is to **get the key to the keyhole**: carry it, blow it, float it, explode it across.

### The hero

- **Controller.** A tight platformer controller: a capsule body, coyote time, jump buffering.
  - Not a floppy ragdoll, because puzzles need precise movement.
  - He goes floppy (the shared Person) when he dies, faints, or over-farts.
- **Belly = fart meter.** **His belly visibly inflates** as the meter fills, so the meter is right on his body. Cosmetic only; it doesn't change physics.
- **Controls:** arrows to move, jump, and **Fart**.
  - The fart pushes him away from the direction held: down + fart = fart-jump, side + fart = jet.
  - It also leaves a **gas cloud** behind.
- **Rooms.** Rooms are small and single-screen, as in Braid.
  - **R = instant room reset**, since there's no rewind.
  - Checkpoints every room.

### Food = fart type = world

Braid gave one time power per world. We give one fart type per world, and each world explores how it touches every object.

| World | Food | Fart | Explores |
|---|---|---|---|
| 1 | Beans | **Toot**: thrust | Fart-jumps, mid-air boosts, blasting the key or crates across gaps, spinning fans |
| 2 | Cabbage | **Heavy gas**: the cloud **sinks and pools** like a liquid | Light things float on gas pools. Sniffers faint in it. Fill a pit to float the key across. |
| 3 | Soda | **Bubble**: traps an object and floats it up | Carry the key over walls. Spikes pop bubbles. Bubble a sniffer as a platform. |
| 4 | Chili | **Fire**: ignites gas | Explosions break cracked walls and launch things. **Lighting earlier gases** links back to worlds 1–3. |
| 5 | Mixed | Combinations | The "aha" late game |
| 6+ | **The Fart Incapacitor** | **Time** | The late twist below |

### Late-game twist: the Fart Incapacitor (optional time worlds)

**The setup:** a wild-haired mad-scientist parody shows up with the **Fart Incapacitor**, and time mechanics arrive *after* players have mastered every fart. Ideas, in Braid's spirit:
- **Rewind, but gas is immune.** Time rewinds and **green gas stays put**. That's Braid's green-glow time-immune objects, and Fartman's gas is already green.
- **Fart echo.** After a rewind, a ghost of your past self replays what you did, farts included, so you can solve with two of you (like Braid's shadow world).

**How it would be built:**
- Rooms are small, so we record every body's position and velocity each frame and restore them to rewind.
- Echoes replay their recorded path as kinematic bodies, so they can still push crates.

**Keep the scientist our own character.** The "Fart Incapacitor" pun is fine. Avoid Doc Brown's name and likeness, the DeLorean, and movie quotes, since this goes on Steam. (Not legal advice; check before launch.)

### Objects every fart type must touch (Blow's method)

- key
- keyhole / locked door
- crate
- balloon
- fan
- candle or torch
- **sniffers**: nose-creatures that chase you and **faint in gas**, so they can become platforms or carry the key, like Braid's monsters
- spikes
- water
- a button that needs weight

### Collectibles

**Golden beans**: optional, hard, one per room. They **assemble into a picture**, like Braid's puzzle pieces, and are used for the end-of-world reveal.

### Design rules

- Every room teaches one new thing.
- Never require a trick the game hasn't shown.
- **Prototype the farts in the sandbox first** and find the puzzles by playing, which is how Blow worked.

### Platform pieces Fartman adds (reusable by future games)

- character controller
- tile maps → merged static bodies
- sensors and triggers
- doors and keys
- a **gas particle system** that applies buoyancy and push to bodies in clouds
- per-room camera
- level loader
- **sound** (it's a fart game, so audio is core)

**Level editing:**
- Start with **Tiled**, a free and mature map editor that exports JSON.
- Build our own in-browser editor only if viewer-made levels happen (option E below).

### Viewer integration: options to work out together

The streamer plays Fartman. Chat has stream delay; website players are live.

| # | Idea | Who | Notes |
|---|---|---|---|
| **A** | **Chat is the kitchen.** Fartman's food comes from chat. `!feed beans` drops a can down a chute with your name on it (with cooldowns); channel points buy rare foods. **Chat decides which fart tool the streamer gets.** | Chat + channel points | **Strongest tie-in.** Levels have food chutes, and the streamer begs chat for chili. Trolling (wrong food) is part of the fun. Rooms must stay solvable whatever chat sends. |
| **B** | **Viewers are the sniffers.** Viewers who `!join` appear as the room's nose-creatures, wearing their skin and name. They faint in gas, the streamer uses them as platforms, and fainted viewers get stats. | Chat | Reuses Person and skins. Cosmetic plus light gameplay. |
| **C** | **Play along.** Website players play the **same room** in their own browser, with no networking during play. The stream shows "14 of chat solved it, fastest @bob 0:42." **Their ghosts appear only after the streamer solves it**, so no spoilers. | Website | Very good for a puzzle game, and cheap: viewers run the room locally and just report a time. |
| **D** | **Player 2 doors.** Some rooms need two people: hold a button while the other crosses. A queued website viewer takes Player 2 live. | Website | Co-op moments. Needs a live view for P2. |
| **E** | **Viewer-made levels**, Mario Maker style. A browser editor; levels travel as a **compressed code in our own grid format**: never Tiled JSON (which can contain image paths), no text fields, size-capped (§14a); must be beaten by its maker before submitting; the streamer plays the queue. | Website | Huge for streamers. Biggest build. Tiles only, no free text, so it stays moderatable. |
| **F** | **Chaos for channel points**: wind gust, lights off, slippery floor, gravity flip for 5 s. | Channel points | Crowd Control style. Needs intensity caps so it doesn't ruin puzzles. |

**My recommendation:**
- Start with **A + B** for launch. Both are chat-native and reuse what Chat Tower builds.
- Add **C** next. It's cheap and great for puzzles.
- Keep **E** as the long-term hook.
- **D** and **F** are optional.

---

## 11b. Game #3: Bridge Breakers (concept)

**Pitch.** Poly Bridge flipped. **The streamer is the engineer** and builds a bridge across a gap on a budget. **Chat is the demolition crew** and pays to send loads across, betting they can break it.

### The round

1. **Build** (timed, a few minutes).
   - The streamer places beams between nodes, starting from fixed anchors, within a budget.
   - Materials:

     | Material | Notes |
     |---|---|
     | Road | the only surface vehicles touch |
     | Wood | cheap and weak |
     | Steel | strong and pricey |
     | Cable | tension only |
     | Springs, hydraulics | later |

   - Stress colors show live during a test drive.
2. **Bets open.** The pot and the bridge are shown on stream. **Bets and the Twitch Prediction lock before the first load touches the bridge**, so website players (who see it live) can't bet on a bridge they can already see cracking.
3. **Demolition window** (a few minutes). Chat sends loads. Heavier costs more:
   - viewer ragdolls marching across (`!march`, free, wearing their skins)
   - car, truck, bus, monster truck
   - an anvil from the sky
   - a wrecking ball

   **Same controls as Tower** for anything dropped from above (anvils, ragdolls, crates):
   - It hangs from the crane on the sender's turn. **I/O (or W/E) slowly rotates it.** Ragdolls also get limbs and neck (J K L ; , / A S D F X).
   - Then it drops. Chat uses `drop` with an angle (`drop 30`).
   - Vehicles drive on by themselves. Website players can gas and brake with ← / →, and rotate in mid-air with I/O so a jump lands on its roof.
   - **Big rooms (1k+ senders):**
     - Several cranes run at once, with short turns.
     - Live control goes to the highest bettors, or a random draw among them.
     - Everyone else's loads skip the crane and drop at the angle they asked for.
4. **Result:**
   - **Collapse** (road deck in the water) → **in bet rounds, the viewer whose load broke it wins** the jackpot. Every load in a bet round is Scrap-paid or free (`!march`); Bits never send loads in bet rounds.
   - **Free-for-all rounds** (the only rounds where Bits can send loads): **no bets, no Prediction, no Scrap payouts, and the pot isn't touched.** Breaking it earns glory and a hall-of-fame spot only.
   - **Survives** → the engineer wins, the streak grows, and the pot rolls over and grows.

### Physics (Box2D v3)

- **Beams** are thin bodies **pinned at nodes with revolute joints**, a pin-jointed truss like Poly Bridge.
- **Stress** is each joint's constraint force ÷ the material's strength. Beams turn green → red, and **break above 100%** (`b2Joint_GetConstraintForce`).
- **Cables** are distance joints with `minLength` 0 and `maxLength` = the cable length, so they carry tension only.
- **Vehicles** use a chassis plus **wheel joints** (suspension plus a motor).
- **Who broke it:** the load on the bridge when the fatal joint broke. Ties go to the most recently sent load.

### The jackpot: your rule

- **The pot** is everything bet since the last successful demolition.
- **How I read "either what they bet, or that plus 50%":**

  | Result | Payout | Pot |
  |---|---|---|
  | **Damage**: a beam snaps but it stands | **Bet back** | unchanged |
  | **Collapse** | **Bet + 50% of the pot** | the other half seeds the next one |

  Please confirm.

### Currency: why not Bits or raw channel points

- **Bits are real money.** Twitch's Bits policy bans "using Bits as a bet or wager." Real money in and prizes out also makes it gambling legally.
- **Channel points** have no cash value, but **Twitch has no API to give a viewer channel points.** It can only pay out through **Predictions** (Twitch splits the pool among winners) or refund a canceled redemption. Our exact jackpot formula can't be paid in real channel points.

### The plan: Scrap, a free in-game currency

**Where Scrap comes from:**
- A daily allowance (`!scrap`)
- Earned by playing (a `!march` that does damage, for example)
- Topped up **one-way** with a channel-point reward ("1,000 points → 100 Scrap"). There's no way back out.

**What it's for:**
- Bets and the jackpot run in Scrap with **your exact formula**.
- Balances live in the host save and are shown on profiles and a leaderboard.
- It works even for streamers who aren't affiliates (no channel points).

**What it isn't:** never sold for money and never cashed out. That's what keeps it out of gambling.

### Other pieces

- **Optional Twitch Prediction** each round, "Will the bridge hold?", run by the game through `channel:manage:predictions`. That's real channel-point betting for everyone, paid out by Twitch itself. If the round is aborted or the game crashes, the Prediction is **cancelled and refunded**.
- **Bits buy effects that can't affect a bet:** fireworks, horns, crowd noise, confetti. Bits **never send a load** in a round with bets or a Prediction, because a Bits truck that breaks the bridge would decide who wins, and that's a Bits wager. Bits loads like "Cheer 500 → monster truck" exist only in **no-bet "free-for-all" rounds**, for glory.

**Why build this before Fartman:**
- It needs **no hand-built levels**: the streamer makes the content every round.
- It's the most chat-native idea so far.
- Chat Tower already builds most of what it needs: Person, ragdolls, joints that snap, and Twitch events.

---

## 12. Sandbox (dev tool + template, not a shipped game)

- Every chat message drops your ragdoll, in your skin, into a sandbox.
- It's where new mechanics get prototyped (Fartman's farts first).
- It's also the copy-and-edit starting point for new games.

---

## 13. Skins and profile looks (all games)

**Rule: cosmetic only.** A skin is a small JSON object of allowed parts, and the host checks every field.

```js
{ v: 1, body: '#ff4f9a', pattern: 'stripes', patternColor: '#222', shirt: '#2b6', shorts: '#124',
  face: 'grin' | { emote: '25' } | 'twitch-avatar', hat: 'tophat', accessory: 'cape', preset: 'channel:team-red' }
```

**From chat:**

| Command | What it does |
|---|---|
| `!skin red stripes tophat` | Sets parts by name, in any order |
| `!skin random` | Rolls a random skin |
| `!face <emote>` | Uses any Twitch emote you can post as your face. The emote CDN allows cross-site loading (checked). |
| `!face me` | Uses **your Twitch profile picture** as your face, once the streamer is logged in |

**Channel and sub/VIP/mod-only presets:**
- The streamer builds them in settings, like Marbles' skin slots.
- They can also be **channel point rewards** ("Golden Tower Skin").

**Website skin editor:**
- Live ragdoll preview.
- Saved in the viewer's browser and sent to any host they join, so it follows them across streamers.

**Not now: draw-your-own.** Later only with a streamer approval queue.

---

## 14. Known risks and edge cases

| Risk | Plan |
|---|---|
| Stream delay for chat players | Turn-length setting, "UP NEXT" ahead, poses for chat. Live play goes through the website. |
| Tall chains unstable (Tower) | Merged people, solver iterations, a headless 50-drop test. |
| Sticky bonds turn the tower into one rigid blob, or too many joints slow it down | One bond per part pair, about 4 bonds per person, a speed limit for forming, and a performance check in Phase 0. |
| Bonds snap from single-frame force spikes | Smooth the stress reading over a few frames, and require it to stay over 100% briefly before snapping. |
| Limb and rotate controls used to "swim," climb, or hover | Capped motor torque and a capped, slow rotate. Flapping limbs mid-air can't add lift. Tune so controls shape the landing only. |
| **Betting becomes gambling** (Bridge Breakers) | No Bits or money in any wager; Scrap can't be bought or cashed out; Twitch Predictions for native betting. Get a quick legal check before a paid Steam launch. |
| Parody IP (Fart Incapacitor scientist) | Original character design and name; puns only. |
| Fartman rooms broken by chat (option A) | Every room is designed solvable with only the food placed in the room; chat food is a bonus or alternate route. Plus an instant reset. |
| Physics puzzles softlock (no rewind) | Instant room reset, small rooms, checkpoints. |
| Offensive skins | Allowed parts plus approved emotes and Twitch avatars only. Toggles for the host. |
| Fake identities on the website | Signed ID tokens **checked by the relay** with a single-use nonce (§3). Unit tests reject forged, expired, wrong-audience, wrong-issuer, and replayed tokens. |
| Twitch tokens on the streamer's PC | Main process only. Encrypted with `safeStorage`, never in a Steam Cloud folder. No client secret exists to leak. Re-login after 30 days unused. See §14a. |
| Streamer's upload | Controller-first website; full rate only for the active player. |
| **Streamer's IP exposed** | Hard rule in §0 and §5: no inbound connections, no peer-to-peer, the relay forwards no addresses, and no viewer-supplied URLs. **A test checks that relay messages never contain IPs or headers.** |
| Relay overload at 10k viewers | Fan-out shards, per-viewer rate limits, input batching. Load-test with simulated viewers before advertising big-room support. |
| Relay outage | The game keeps running from chat. The website shows "reconnecting." |
| steamworks.js maintenance | Check with current Electron before the Steam phase; the Steam layer is small and swappable. |
| Electron security | Full hardening list in §14a. |
| Spam or abuse | Duplicate-queue removal, cooldowns, name caps, text-only rendering, per-viewer rate limits. |
| Performance | Merged bodies, debris cleanup; target 60 fps with 100 frozen people. |

---

## 14a. Security requirements (from the independent review; all must be met)

The plan has no code yet, so these are requirements, each with a test. **Streamer exposure comes first.**

### Host app (Electron)

1. **Network allowlist, enforced and not just a convention.** The main process uses `session.webRequest.onBeforeRequest` to **cancel every request** except:
   - our relay's `wss://` address
   - `*.twitch.tv`
   - `static-cdn.jtvnw.net`
   - the app's own files

   The renderer's Content-Security-Policy matches that list. Main-process HTTP goes through one allowlisted `safeFetch`.

   *Test:* fuzz skins, levels, and every message type, and assert zero requests outside the list.
2. **Twitch tokens never reach the renderer.**
   - Auth, Helix, EventSub, and token storage live in the main process (`apps/host/main/twitch/`).
   - The preload exposes only narrow calls: `onCommand`, `createClip`, `startPrediction`… No token, raw fetch, or Steam object crosses over.
3. **Hardening:**
   - `contextIsolation` and `sandbox` on, Node off in the renderer.
   - Deny `window.open` and navigation.
   - The permission handler denies everything.
   - `openExternal` only opens `https://www.twitch.tv/…`.
   - Electron fuses: `RunAsNode`, `NODE_OPTIONS`, and inspect arguments off; ASAR integrity and only-load-from-ASAR on.
   - **No deep-link protocol.**
   - Steam is the only update channel.
   - Ship Electron security patches within 14 days (image-decoder bugs are the realistic risk from Twitch CDN images).
4. **Token storage.**
   - Steam Cloud syncs `saves/` only; tokens are never in a synced folder.
   - If `safeStorage` falls back to plaintext (`basic_text` on some Linux setups), keep tokens in memory only.
   - Refresh under a single-instance lock, and save the new refresh token before using it.
   - Logs redact tokens and device codes.
5. **Nothing secret on screen.**
   - The device-code login opens in the system browser and its code is never drawn in the game.
   - Secrets (OBS password) are typed in a **separate window**, masked. Game Capture of the main window won't record it, but warn that Display Capture would.
   - The OBS password is stored with `safeStorage` next to the Twitch tokens, never in a synced folder.
   - In-game errors never show file paths, usernames, or stack traces.
6. **OBS (optional feature):** connect only to `ws://127.0.0.1:4455`. Docs say never to port-forward 4455.
7. **No telemetry.** No third-party crash or analytics SDKs, and Electron `crashReporter` uploads are off. Any future crash reporting is opt-in, sends no memory dumps, and removes file paths.
8. **Supply chain.**
   - Pin exact dependency versions with integrity hashes. Vendor `box2d3-wasm` and `steamworks.js` and review their diffs on upgrade.
   - `npm ci --ignore-scripts`.
   - CI never holds Steamworks credentials; uploads are done by hand with Steam Guard.
   - Sign Windows builds.

### Relay (Linux server)

9. **Host authentication and room ownership.**
   - Separate host endpoint.
   - The host sends its Twitch token once; the relay calls `id.twitch.tv/oauth2/validate`, checks that `client_id` is the Host app, keeps only `user_id`, and throws the token away without logging it.
   - **One room per broadcaster.** A 128-bit resume secret is needed to reconnect.
   - No website room without a logged-in host.
10. **Viewer login.** As in §3: a relay-issued single-use nonce, plus checks on RS256, `kid`, `iss`, `aud`, and token age under 10 minutes. The OAuth `state` is checked by the viewer site. One socket per Twitch ID per room.
11. **Strict input validation, at the relay, before anything reaches the host.**
    - The `protocol` package has one strict schema per message: no extra keys, `__proto__` rejected.
    - Numbers must be finite and are clamped. Limb input is a 5-bit mask plus -1/0/1, only from the active player, at most 30 Hz.
    - Bets are integers between 1 and the balance.
    - Colors match `^#[0-9a-f]{6}$`. Emote IDs must look like Twitch IDs.
    - **Viewer→relay frames are capped at 1 KB** (4 KB for level codes), and decompression stops at 64 KB.
    - **Host→relay frames** (snapshots, state) come only from the authenticated host socket and have their own larger cap (about 256 KB, tuned in Phase 8). Bigger frames are dropped and logged.
    - Sub-only presets are checked against Twitch, not taken on the client's word.
12. **No streamer IPs, ever.**
    - Host sockets never read `CF-Connecting-IP`; hosts are rate-limited by broadcaster ID.
    - Viewer IPs are kept in memory for at most 1 hour (for rate limits only), never on disk, and never sent to the host.
13. **Hide the server.**
    - The origin sits behind **Cloudflare Tunnel**, so the Linux server has **no open inbound ports** and no unproxied DNS records.
    - 2FA everywhere, and a registrar lock on the domain.
14. **Abuse limits.**
    - Wrong room codes are limited to 10 per minute per IP, with backoff, plus a Cloudflare rate-limit rule.
    - "Not found" and "full" return the same error.
    - Codes aren't reused for 24 hours.
    - Live view requires login.
    - Per-IP and global socket caps.
15. **Moderation.** Banned and timed-out chatters are rejected on join (§3). The streamer and mods can kick or ban from the host, and the relay enforces it by Twitch ID.

### Viewer website and privacy

16. **The viewer site only loads image URLs that start with `https://static-cdn.jtvnw.net/`** (Twitch avatars and emotes). It checks the prefix in code, and CSP `img-src https://static-cdn.jtvnw.net` plus its own files enforces it. Any other URL from the host is ignored, so a hostile host can't learn viewers' IPs.
17. **Data kept on the host:**
    - Never store chat text.
    - Delete profiles idle more than 12 months.
    - `!forgetme` deletes yours.
    - Publish a privacy policy that names Cloudflare as a processor.
    - Global profiles (§16) would need viewer consent and a check against the Twitch developer agreement.

### Game rules with security impact

18. **Betting (Bridge Breakers):**
    - Bets and the Prediction lock before the first load.
    - Bits never send loads in bet rounds.
    - Aborted rounds cancel and refund the Prediction.
    - `!scrap` requires a Twitch account at least 7 days old, so alt accounts can't farm Scrap.
    - Check Steam's content survey and age rating for simulated-gambling disclosure.
19. **Auto-clip** is off by default, at most once every 10 minutes, with an F-key to stop it.
20. **Viewer-made levels** use our own grid format, never Tiled JSON (Tiled is only for levels we ship).

---

## 15. Phases

Each phase ends with a check before the next one starts.

**Stage 1: Chat Tower, playable on stream**

0. **Physics head-to-head — ✅ done.** Box2D v3 chosen. Numbers, design findings, and risks are in [spikes/phase0/RESULTS.md](spikes/phase0/RESULTS.md).
   - Built along the way: the physics adapter, both backends, the stress model, the new Person, and the tower, column, bridge, and determinism tests plus a viewer.
   - 65 tests pass.
1. **Scaffold.**
   - TypeScript monorepo (npm workspaces), Vite, Phaser 4 scene base, view list, camera, HUD, settings, the `protocol` package.
   - **The Electron shell from day one**, so the same build runs in both the app and a browser on the Mac. The browser-tab mode never has a Twitch login: simulated or anonymous chat only.
   - **Hardened from day one** (§14a items 1, 3, 7, 8): network allowlist, sandbox, fuses, CSP, no telemetry, pinned dependencies. Test: the allowlist blocks an arbitrary URL.
2. **Person.** Mostly done in Phase 0 (stumpy human with orbs, stretch, freeze/unfreeze, air control). Remaining: the Phaser renderer, skins hook, and a test page.
3. **Chat.** Anonymous IRC **in the main process**, parsers, players table, commands with strict validation, sim, bots.
4. **Chat Tower.** Full round loop, hotseat, chat poses, scoring, records.
5. **Skins v1 + profiles.** Schema, catalog, chat commands, emote faces, presets, host save file.
6. **Juice.** Sky, wind, record line, clouds, shake, slow-mo, roster.

Check: a real Twitch stream test.

**Stage 2: Twitch login + the Jackbox-style website**

7. **Streamer Twitch login** (device code, opened in the system browser, never shown on stream):
   - EventSub chat and events, profile pictures, ban list, app-created channel-point rewards, raids, auto-clips.
   - Scopes requested per feature.
   - All in the main process (§14a items 2, 4, 5).
8. **Relay** (Node.js on the Linux server, behind Cloudflare's proxy; runs locally on the Mac during development):
   - room codes, host and viewer sockets, Twitch ID-token checks on the server
   - fan-out, per-viewer rate limits, 100-player cap
   - host authentication and one room per broadcaster, resume secret, strict schemas and frame caps, abuse limits, ban enforcement (§14a items 9–15)
   - deployed behind Cloudflare Tunnel with no open inbound ports
   - tests: forged, expired, replayed, and wrong-room tokens rejected; a fake host can't claim a live room; oversized or malformed frames dropped; **no message ever carries an IP or headers**
9. **Viewer website:**
   - join by code, controller UI, live view for the active player, live limb + rotate controls, phone buttons
   - skin editor
   - deployed as a static site

Check:
- two browsers, then a phone on cellular data
- **confirm with a packet capture that the streamer's PC makes only outbound connections** (Twitch and the relay) and receives no inbound ones
- 100 simulated viewers

Later, before advertising big rooms: fan-out shards and a 10k simulated-viewer load test.

**Stage 3: Bridge Breakers** (recommended before Fartman; see §11b)

10a. **Truss physics spike:** beams, pins, stress, snapping, a cable, and one vehicle. Gate: stable with 150 beams.
10b. **Build mode:** editor, materials, budget, anchors, test drive.
10c. **Demolition:** loads, `!march`, Scrap, the jackpot rule (unit-tested), the optional Prediction, Bits effects.

**Stage 4: Fartman**

11. **Fart sandbox prototype.** Controller plus the four fart types plus the key, door, crate, and sniffer objects. Find the puzzles by playing.
12. **World 1 (beans)**, 8–12 rooms, with **viewer integration A + B**.
13. **Worlds 2–4**, golden beans, then **integration C (play-along)**.

**Stage 5: Steam**

14. **Steam layer:** steamworks.js, Cloud saves, achievements, packaging for Windows and Mac (Linux optional).
15. **Launch prep:**
    - Relay load test at 1k and 10k simulated viewers, store page, trailer, playtest with a few streamers.
    - **You:** Steamworks account and fee.

**Verification along the way:**
- Vitest for parsers, state machines, snapshots, token checks, and the skin schema.
- Headless bot sims for Tower: 50 turns, no NaN, collapse and reset, no leaks.
- Fartman rooms each get a recorded solution replay that must still solve after physics changes.
- Screenshots at each phase.
- Live Twitch tests at the end of stages 1 and 2.

---

## 16. Still open (my defaults in bold)

1. Pack name → **"streamer-games" for now.** Game names → **Chat Tower / Fartman.**
2. Fartman viewer integration → **A (chat is the kitchen) + B (viewers are sniffers) first, then C (play along)**, with E (viewer levels) later. **Needs your input.**
3. Price and model on Steam (paid, free, or free host with paid packs) → **decide later.** It affects who pays the relay costs.
4. Global profiles and leaderboards across all streamers → **no for now** (needs a backend).
5. Short domain for the website (something like `ftg.gg`) → **nice to have.** Jackbox's "go to jackbox.tv" is part of why it works.
6. Player keys → **limbs and neck short by default; hold J K L ; , (or A S D F X) to stretch; I/O (W/E) rotate; U/P (Q/R) drift.** Both layouts active, remappable. Streamer hotkeys on F-keys. *(Set by you.)*
7. Streamer's extra balance control (lean or crouch) → **no, left/right + Shift** until playtesting says otherwise.
8. Website-player cap → **25 lobby players**, with full-rate live view only for the active and next player.
9. Draw-your-own skins → **not now**; later with an approval queue.
10. Tower undo (pop the top person off once per round) → **off; try it in playtesting.**
11. Twitch Extension version of the viewer site (play inside Twitch, like Jackbox's Audience Kit) → **later.** Needs a check on whether extensions can open a WebSocket to our relay.
12. OBS websocket triggers (replay buffer on a record) → **later, optional.**
13. Bridge Breakers jackpot → **damage = bet back; collapse = bet + 50% of the pot, the other half seeds the next pot.** Confirm my reading.
14. Build order after Chat Tower → **Bridge Breakers, then Fartman.**
15. Fartman time worlds (Fart Incapacitor) → **yes, as late-game worlds**, with an original scientist character.
16. **Should stretched limbs be solid once frozen in the tower**, so people can land on someone's outstretched arm, or stay drawn-only, with just the orbs and body colliding (World of Goo strands)? → **Drawn-only for now. Solid frozen limbs would add platforms for strategy, so worth trying in Phase 4.**
17. **How tall should a good tower get?** Current tuning tops out around 13–22 m. → **Decide in Phase 4 playtesting.** The knobs are bond stiffness, tension limit, and bond width.
18. **Node version** → your Mac has Node 23 (end of life). Recommend **Node 24 LTS** before Phase 1. Your call; I won't change it without asking.
