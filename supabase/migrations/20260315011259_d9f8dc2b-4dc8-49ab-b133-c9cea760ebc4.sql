
-- Create the auctions table
CREATE TABLE public.auctions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  join_code TEXT UNIQUE NOT NULL,
  budget_per_team INTEGER NOT NULL DEFAULT 10000,
  status TEXT NOT NULL DEFAULT 'setup' CHECK (status IN ('setup', 'live', 'completed')),
  current_player_id UUID,
  timer_ends_at TIMESTAMPTZ,
  admin_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create the teams table
CREATE TABLE public.teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auction_id UUID NOT NULL REFERENCES public.auctions(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  captain_name TEXT NOT NULL,
  purse_balance INTEGER NOT NULL DEFAULT 10000 CHECK (purse_balance >= 0),
  boys_count INTEGER NOT NULL DEFAULT 0,
  girls_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create the players table
CREATE TABLE public.players (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auction_id UUID NOT NULL REFERENCES public.auctions(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  gender TEXT NOT NULL CHECK (gender IN ('Male', 'Female')),
  skill_tier TEXT,
  base_price INTEGER NOT NULL DEFAULT 100,
  status TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'on_block', 'sold', 'unsold')),
  team_id UUID REFERENCES public.teams(id),
  current_highest_bid INTEGER,
  current_highest_bidder_id UUID REFERENCES public.teams(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Add FK from auctions to players (after players table exists)
ALTER TABLE public.auctions ADD CONSTRAINT fk_current_player FOREIGN KEY (current_player_id) REFERENCES public.players(id);

-- Create the bids table (immutable ledger)
CREATE TABLE public.bids (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auction_id UUID NOT NULL REFERENCES public.auctions(id) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES public.players(id) ON DELETE CASCADE,
  team_id UUID NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_bids_created_at ON public.bids(created_at DESC);
CREATE INDEX idx_bids_auction_player ON public.bids(auction_id, player_id);
CREATE INDEX idx_players_auction ON public.players(auction_id);
CREATE INDEX idx_teams_auction ON public.teams(auction_id);

-- Enable RLS on all tables
ALTER TABLE public.auctions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.players ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bids ENABLE ROW LEVEL SECURITY;

-- RLS Policies for auctions
CREATE POLICY "Anyone can read auctions" ON public.auctions FOR SELECT USING (true);
CREATE POLICY "Admin can insert auctions" ON public.auctions FOR INSERT WITH CHECK (auth.uid() = admin_id);
CREATE POLICY "Admin can update auctions" ON public.auctions FOR UPDATE USING (auth.uid() = admin_id);

-- RLS Policies for teams
CREATE POLICY "Anyone can read teams" ON public.teams FOR SELECT USING (true);
CREATE POLICY "Anyone can insert teams" ON public.teams FOR INSERT WITH CHECK (true);
CREATE POLICY "Admin can update teams" ON public.teams FOR UPDATE USING (
  EXISTS (SELECT 1 FROM public.auctions WHERE id = auction_id AND admin_id = auth.uid())
);

-- RLS Policies for players
CREATE POLICY "Anyone can read players" ON public.players FOR SELECT USING (true);
CREATE POLICY "Admin can insert players" ON public.players FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM public.auctions WHERE id = auction_id AND admin_id = auth.uid())
);
CREATE POLICY "Admin can update players" ON public.players FOR UPDATE USING (
  EXISTS (SELECT 1 FROM public.auctions WHERE id = auction_id AND admin_id = auth.uid())
);

-- RLS Policies for bids (insert via RPC only, read for all)
CREATE POLICY "Anyone can read bids" ON public.bids FOR SELECT USING (true);
CREATE POLICY "Anyone can insert bids" ON public.bids FOR INSERT WITH CHECK (true);

-- Enable Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.auctions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.teams;
ALTER PUBLICATION supabase_realtime ADD TABLE public.players;
ALTER PUBLICATION supabase_realtime ADD TABLE public.bids;

-- ============================================
-- THE ATOMIC place_bid RPC FUNCTION
-- ============================================
CREATE OR REPLACE FUNCTION public.place_bid(
  p_auction_id UUID,
  p_team_id UUID,
  p_player_id UUID,
  p_amount INTEGER
) RETURNS JSONB AS $$
DECLARE
  v_player RECORD;
  v_team RECORD;
  v_auction RECORD;
  v_remaining_slots INTEGER;
  v_max_bid INTEGER;
BEGIN
  -- 1. Lock the player row
  SELECT * INTO v_player FROM public.players WHERE id = p_player_id FOR UPDATE;
  IF v_player IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Player not found');
  END IF;
  IF v_player.status != 'on_block' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Player is not on the block');
  END IF;

  -- 2. Lock the auction row
  SELECT * INTO v_auction FROM public.auctions WHERE id = p_auction_id FOR UPDATE;
  IF v_auction.status != 'live' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Auction is not live');
  END IF;

  -- 3. Time validation
  IF v_auction.timer_ends_at IS NOT NULL AND NOW() > v_auction.timer_ends_at THEN
    RETURN jsonb_build_object('success', false, 'error', 'Timer has expired');
  END IF;

  -- 4. Bid amount validation
  IF v_player.current_highest_bid IS NOT NULL AND p_amount <= v_player.current_highest_bid THEN
    RETURN jsonb_build_object('success', false, 'error', 'Bid must be higher than current bid');
  ELSIF v_player.current_highest_bid IS NULL AND p_amount < v_player.base_price THEN
    RETURN jsonb_build_object('success', false, 'error', 'Bid must be at least the base price');
  END IF;

  -- 5. Lock the team row
  SELECT * INTO v_team FROM public.teams WHERE id = p_team_id FOR UPDATE;

  -- 6. Gender cap validation
  IF v_player.gender = 'Female' AND v_team.girls_count >= 3 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Category full: 3/3 Girls drafted');
  END IF;
  IF v_player.gender = 'Male' AND v_team.boys_count >= 7 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Category full: 7/7 Boys drafted');
  END IF;

  -- 7. Minimum balance validation
  v_remaining_slots := 10 - (v_team.boys_count + v_team.girls_count);
  v_max_bid := v_team.purse_balance - ((v_remaining_slots - 1) * 200);
  IF p_amount > v_max_bid THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient funds to complete roster');
  END IF;

  -- 8. Anti-snipe: extend timer if bid within 5 seconds of end
  IF v_auction.timer_ends_at IS NOT NULL AND (v_auction.timer_ends_at - NOW()) <= INTERVAL '5 seconds' THEN
    UPDATE public.auctions SET timer_ends_at = NOW() + INTERVAL '5 seconds' WHERE id = p_auction_id;
  END IF;

  -- 9. Write the bid
  INSERT INTO public.bids (auction_id, player_id, team_id, amount)
  VALUES (p_auction_id, p_player_id, p_team_id, p_amount);

  -- 10. Update player with new highest bid
  UPDATE public.players
  SET current_highest_bid = p_amount, current_highest_bidder_id = p_team_id
  WHERE id = p_player_id;

  RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- ADMIN CONTROL FUNCTIONS
-- ============================================

-- Push player to block
CREATE OR REPLACE FUNCTION public.set_active_player(
  p_auction_id UUID,
  p_player_id UUID
) RETURNS VOID AS $$
BEGIN
  UPDATE public.players SET status = 'available'
  WHERE auction_id = p_auction_id AND status = 'on_block';

  UPDATE public.players
  SET status = 'on_block', current_highest_bid = NULL, current_highest_bidder_id = NULL
  WHERE id = p_player_id;

  UPDATE public.auctions
  SET current_player_id = p_player_id, timer_ends_at = NULL
  WHERE id = p_auction_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Start timer
CREATE OR REPLACE FUNCTION public.start_auction_timer(
  p_auction_id UUID,
  p_seconds INTEGER DEFAULT 30
) RETURNS VOID AS $$
BEGIN
  UPDATE public.auctions
  SET timer_ends_at = NOW() + (p_seconds || ' seconds')::INTERVAL
  WHERE id = p_auction_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Pause timer
CREATE OR REPLACE FUNCTION public.pause_auction_timer(
  p_auction_id UUID
) RETURNS VOID AS $$
BEGIN
  UPDATE public.auctions SET timer_ends_at = NULL WHERE id = p_auction_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Process sale
CREATE OR REPLACE FUNCTION public.process_sale(
  p_auction_id UUID
) RETURNS JSONB AS $$
DECLARE
  v_player RECORD;
  v_team RECORD;
BEGIN
  SELECT p.* INTO v_player FROM public.players p
  JOIN public.auctions a ON a.current_player_id = p.id
  WHERE a.id = p_auction_id FOR UPDATE;

  IF v_player IS NULL OR v_player.current_highest_bidder_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No valid bid to process');
  END IF;

  SELECT * INTO v_team FROM public.teams WHERE id = v_player.current_highest_bidder_id FOR UPDATE;

  UPDATE public.teams
  SET purse_balance = purse_balance - v_player.current_highest_bid,
      boys_count = CASE WHEN v_player.gender = 'Male' THEN boys_count + 1 ELSE boys_count END,
      girls_count = CASE WHEN v_player.gender = 'Female' THEN girls_count + 1 ELSE girls_count END
  WHERE id = v_team.id;

  UPDATE public.players
  SET status = 'sold', team_id = v_team.id
  WHERE id = v_player.id;

  UPDATE public.auctions
  SET current_player_id = NULL, timer_ends_at = NULL
  WHERE id = p_auction_id;

  RETURN jsonb_build_object('success', true, 'player_name', v_player.name, 'team_name', v_team.name, 'amount', v_player.current_highest_bid);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Mark unsold
CREATE OR REPLACE FUNCTION public.mark_unsold(
  p_auction_id UUID
) RETURNS VOID AS $$
BEGIN
  UPDATE public.players
  SET status = 'unsold', current_highest_bid = NULL, current_highest_bidder_id = NULL
  WHERE id = (SELECT current_player_id FROM public.auctions WHERE id = p_auction_id);

  UPDATE public.auctions
  SET current_player_id = NULL, timer_ends_at = NULL
  WHERE id = p_auction_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
