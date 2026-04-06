
-- Task 1: Add bidding_duration_seconds to auctions
ALTER TABLE public.auctions ADD COLUMN IF NOT EXISTS bidding_duration_seconds INTEGER NOT NULL DEFAULT 30;

-- Task 1: Update set_active_player to use dynamic bidding duration
CREATE OR REPLACE FUNCTION public.set_active_player(p_auction_id uuid, p_player_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE
  v_duration INTEGER;
BEGIN
  SELECT bidding_duration_seconds INTO v_duration FROM public.auctions WHERE id = p_auction_id;
  IF v_duration IS NULL THEN v_duration := 30; END IF;

  UPDATE public.players SET status = 'available'
  WHERE auction_id = p_auction_id AND status = 'on_block';

  UPDATE public.players
  SET status = 'on_block', current_highest_bid = NULL, current_highest_bidder_id = NULL
  WHERE id = p_player_id;

  UPDATE public.auctions
  SET
    current_player_id = p_player_id,
    preview_ends_at   = NOW() + INTERVAL '15 seconds',
    timer_ends_at     = NOW() + INTERVAL '15 seconds' + (v_duration || ' seconds')::INTERVAL
  WHERE id = p_auction_id;
END;
$$;

-- Task 2: Remove all roster/gender constraints from place_bid
CREATE OR REPLACE FUNCTION public.place_bid(p_auction_id uuid, p_team_id uuid, p_player_id uuid, p_amount integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE
  v_player RECORD;
  v_team RECORD;
  v_auction RECORD;
BEGIN
  SELECT * INTO v_player FROM public.players WHERE id = p_player_id FOR UPDATE;
  IF v_player IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'Player not found'); END IF;
  IF v_player.status != 'on_block' THEN RETURN jsonb_build_object('success', false, 'error', 'Player is not on the block'); END IF;

  SELECT * INTO v_auction FROM public.auctions WHERE id = p_auction_id FOR UPDATE;
  IF v_auction.status != 'live' THEN RETURN jsonb_build_object('success', false, 'error', 'Auction is not live'); END IF;

  -- Block bids during preview phase
  IF v_auction.preview_ends_at IS NOT NULL AND NOW() < v_auction.preview_ends_at THEN
    RETURN jsonb_build_object('success', false, 'error', 'Preview phase — bidding not open yet');
  END IF;

  IF v_auction.timer_ends_at IS NOT NULL AND NOW() > v_auction.timer_ends_at THEN
    RETURN jsonb_build_object('success', false, 'error', 'Timer has expired');
  END IF;

  IF v_player.current_highest_bid IS NOT NULL AND p_amount <= v_player.current_highest_bid THEN
    RETURN jsonb_build_object('success', false, 'error', 'Bid must be higher than current bid');
  ELSIF v_player.current_highest_bid IS NULL AND p_amount < v_player.base_price THEN
    RETURN jsonb_build_object('success', false, 'error', 'Bid must be at least the base price');
  END IF;

  SELECT * INTO v_team FROM public.teams WHERE id = p_team_id FOR UPDATE;

  -- Simple purse check: bid cannot exceed available balance
  IF p_amount > v_team.purse_balance THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient funds');
  END IF;

  -- Anti-snipe: reset to 5 seconds if bid in final 5s
  IF v_auction.timer_ends_at IS NOT NULL AND (v_auction.timer_ends_at - NOW()) <= INTERVAL '5 seconds' THEN
    UPDATE public.auctions SET timer_ends_at = NOW() + INTERVAL '5 seconds' WHERE id = p_auction_id;
  END IF;

  INSERT INTO public.bids (auction_id, player_id, team_id, amount) VALUES (p_auction_id, p_player_id, p_team_id, p_amount);
  UPDATE public.players SET current_highest_bid = p_amount, current_highest_bidder_id = p_team_id WHERE id = p_player_id;

  RETURN jsonb_build_object('success', true);
END;
$$;
