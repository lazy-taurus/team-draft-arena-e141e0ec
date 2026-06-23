## Complete User Flow Reference — Organizer & Captain

This is a documentation deliverable (no code changes). It maps every page, action, and possible path through the app as it exists today.

---

### 1. Landing Page — `/`

Two entry buttons:
- **Organizer Login** → `/login`
- **Join as Captain** → `/join`

---

### 2. ORGANIZER FLOW

#### 2a. `/login` — Sign in / Sign up
- Toggle between Sign In and Sign Up (email + password).
- On success → `/dashboard`. On failure → error toast.

#### 2b. `/dashboard` — Auction list
- Lists all auctions owned by this organizer (newest first).
- **Create New Auction** dialog: Title, Default Team Budget, Bidding Timer Duration (default 30s, range 5–300s). On submit, inserts row with a random 5-char `join_code` and `status='draft'`, then redirects to Setup.
- Each auction card → buttons: **Setup**, **Control**, **Live**, **Rosters**.

#### 2c. `/auction/:id/setup` — Pre-auction configuration
- Header shows title, join code, and an editable **Timer (s)** field that live-updates `auctions.bidding_duration_seconds`.
- **Initialize Live Auction** button → sets `status='live'` and navigates to Control Room.
- Tabs:
  - **Teams**: shows captains who have joined via the join code (read-only here).
  - **Player Pool**:
    - Bulk upload via CSV or Excel (`.xlsx`/`.xls`) — auto-detects `Name`, `Gender`, `Base Price` columns (header variants accepted).
    - Manual add: Name, Gender (Male/Female), Base Price, optional Photo (uploaded to `player-photos` storage bucket, public URL stored on `players.photo_url`).
    - Player table: Name · Gender · Base Price · Status · delete button (only while `status='available'`).

#### 2d. `/auction/:id/admin` — Control Room (live event command center)
Three-column layout:
- **Left — Queue panel**
  - Tabs: **Up Next** (available players) / **Unsold** (previously unsold).
  - Search box filters by name.
  - **Push** button on each row → calls `set_active_player` RPC, which sets that player's `status='on_block'` and starts a **15s preview phase** followed by a bidding window of `bidding_duration_seconds`.
- **Center — Current Player card**
  - Avatar (uploaded photo or gender-based SVG fallback), name, gender, base price.
  - Timer display: purple "Preview Xs" during the 15s lock, then primary bidding countdown (turns red ≤5s).
  - Current Bid amount + highest-bidder team name.
  - Four action buttons:
    - **Start Timer** — manual `start_auction_timer` using `bidding_duration_seconds`.
    - **Pause** — `pause_auction_timer`.
    - **Mark Unsold** — `mark_unsold`.
    - **Force Sell** — `process_sale` (disabled if no bidder).
  - **Live Bid Log** below: most recent 20 bids with team name + amount.
- **Right — Franchises sidebar**
  - Per-team: name, purse balance, Boys/Girls counts, list of drafted players, ↩ Undo button per player → `move_player_to_unsold` (restores purse).
- **Header buttons**: Open Projector (new tab) · End Auction (`end_auction` RPC).
- **Automatic transitions**:
  - When bidding timer hits 0: auto-sells if there is a highest bidder, else marks unsold.
  - When every player has been processed (none `available` or `on_block`): auction auto-ends.

#### 2e. `/auction/:id/live` — Public Projector display (read-only spectacle)
- Dark theme, full-screen, animated.
- **Left + Right team columns** split evenly (`Math.ceil(teams.length/2)` per side).
- **Center stage**: current player avatar, name, gender, base price, big timer (preview vs. bidding), current bid, highest bidder.
- Sound + visual FX: bid placed tone, new highest bidder fanfare, final-3-seconds tension, gavel + confetti on sale, sad tone on unsold.
- **SOLD overlay** with confetti when a sale completes.
- No interactive controls — purely a broadcast view.

#### 2f. `/auction/:id/rosters` — Post-auction roster management
- Drag-and-drop sold players between teams (calls `reassign_player` RPC, restores/deducts purse accordingly).
- **Export Excel**: one summary sheet + one sheet per team.
- **Export PDF**: landscape multi-column table.

#### 2g. Navigation (AdminNavbar)
Persistent top bar across all organizer pages with links: Dashboard · Setup · Control Room · Projector · Rosters · Sign Out.

---

### 3. CAPTAIN FLOW

#### 3a. `/join` — Lobby & Join
- **Your Draft Rooms** panel: every previous captain session stored in `localStorage` — Rejoin or Remove.
- **Join form**: Auction Code (5 chars), First Name, optional Team Name (defaults to `Team {firstName}`).
- On submit: looks up auction by `join_code`, inserts a `teams` row (purse = auction's `budget_per_team`), saves session to localStorage, → `/auction/:id/bid`.

#### 3b. `/auction/:id/bid` — Captain bidding console (mobile-first)
- **Header**: Team name, Purse balance, Boys/Girls counters.
- **States**:
  - **Auction completed** → 🏆 thank-you screen.
  - **No player on block** → "Waiting for the Organizer…".
  - **Preview phase (15s)** → purple "PREVIEW PHASE" card with countdown, bidding controls **locked** with "⏳ Bidding locked during preview".
  - **Bidding phase**:
    - Big timer (red + pulse ≤5s).
    - Current Bid display (animated on change).
    - "YOU HAVE THE HIGHEST BID" banner when applicable.
    - **Quick-bid buttons**: `+₹100` and `+₹250`.
    - **Custom amount** input + large primary **BID ₹X** button.
    - All bids call `place_bid` RPC; only check is `amount ≤ purse_balance` (no gender or roster caps).
    - Buttons disable when: already highest bidder, insufficient funds, or amount ≤ current bid.
    - Rejected bids show a destructive toast with the RPC error.

#### 3c. Session persistence
Captains can close the tab and return via `/join` → "Your Draft Rooms" without re-entering name/code.

---

### 4. Backend State Machine (reference)

```text
player.status:  available ──push──▶ on_block ──sell──▶ sold
                                    │
                                    └─unsold──▶ unsold ──push again──▶ on_block
                                                              ▲
                                                              └─ admin undo from sold
auction.status: draft ──Initialize──▶ live ──End Auction / all processed──▶ completed
```

Bidding window per player: **15s preview (locked)** → **`bidding_duration_seconds` bidding window** → auto-resolve (sell if bid exists, else unsold).

---

### Technical notes
- Real-time everywhere via `useAuctionRealtime` (Supabase Postgres-changes channel on `auctions`, `players`, `teams`, `bids`).
- Timers driven strictly off DB timestamps `preview_ends_at` and `timer_ends_at` (no client drift).
- RPCs in use: `set_active_player`, `start_auction_timer`, `pause_auction_timer`, `place_bid`, `process_sale`, `mark_unsold`, `move_player_to_unsold`, `reassign_player`, `end_auction`.
- Storage: `player-photos` bucket (public-read) for uploaded avatars; gender SVG fallback otherwise.

---

This is a read-only summary — no files will be changed. Approve if you'd like me to follow up with any specific gap-filling work (e.g. the earlier consistency-audit plan).
