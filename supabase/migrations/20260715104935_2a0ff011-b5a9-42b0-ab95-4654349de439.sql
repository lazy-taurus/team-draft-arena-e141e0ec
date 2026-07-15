
-- 1. Admin authorization checks in SECURITY DEFINER RPCs
CREATE OR REPLACE FUNCTION public.set_active_player(p_auction_id uuid, p_player_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_duration INTEGER;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.auctions WHERE id = p_auction_id AND admin_id = auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  SELECT bidding_duration_seconds INTO v_duration FROM public.auctions WHERE id = p_auction_id;
  IF v_duration IS NULL THEN v_duration := 30; END IF;
  UPDATE public.players SET status = 'available'
    WHERE auction_id = p_auction_id AND status = 'on_block';
  UPDATE public.players
    SET status = 'on_block', current_highest_bid = NULL, current_highest_bidder_id = NULL
    WHERE id = p_player_id;
  UPDATE public.auctions
    SET current_player_id = p_player_id,
        preview_ends_at   = NOW() + INTERVAL '15 seconds',
        timer_ends_at     = NOW() + INTERVAL '15 seconds' + (v_duration || ' seconds')::INTERVAL
    WHERE id = p_auction_id;
END; $$;

CREATE OR REPLACE FUNCTION public.start_auction_timer(p_auction_id uuid, p_seconds integer DEFAULT 30)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.auctions WHERE id = p_auction_id AND admin_id = auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  UPDATE public.auctions SET timer_ends_at = NOW() + (p_seconds || ' seconds')::INTERVAL WHERE id = p_auction_id;
END; $$;

CREATE OR REPLACE FUNCTION public.pause_auction_timer(p_auction_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.auctions WHERE id = p_auction_id AND admin_id = auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  UPDATE public.auctions SET timer_ends_at = NULL WHERE id = p_auction_id;
END; $$;

CREATE OR REPLACE FUNCTION public.process_sale(p_auction_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_player RECORD; v_team RECORD;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.auctions WHERE id = p_auction_id AND admin_id = auth.uid()) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authorized');
  END IF;
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
  UPDATE public.players SET status = 'sold', team_id = v_team.id WHERE id = v_player.id;
  UPDATE public.auctions SET current_player_id = NULL, timer_ends_at = NULL, preview_ends_at = NULL WHERE id = p_auction_id;
  RETURN jsonb_build_object('success', true, 'player_name', v_player.name, 'team_name', v_team.name, 'amount', v_player.current_highest_bid);
END; $$;

CREATE OR REPLACE FUNCTION public.mark_unsold(p_auction_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.auctions WHERE id = p_auction_id AND admin_id = auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  UPDATE public.players
    SET status = 'unsold', current_highest_bid = NULL, current_highest_bidder_id = NULL
    WHERE id = (SELECT current_player_id FROM public.auctions WHERE id = p_auction_id);
  UPDATE public.auctions
    SET current_player_id = NULL, timer_ends_at = NULL, preview_ends_at = NULL
    WHERE id = p_auction_id;
END; $$;

CREATE OR REPLACE FUNCTION public.end_auction(p_auction_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.auctions WHERE id = p_auction_id AND admin_id = auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  UPDATE public.players SET status = 'unsold', current_highest_bid = NULL, current_highest_bidder_id = NULL
    WHERE auction_id = p_auction_id AND status = 'on_block';
  UPDATE public.auctions SET status = 'completed', current_player_id = NULL, timer_ends_at = NULL
    WHERE id = p_auction_id;
END; $$;

CREATE OR REPLACE FUNCTION public.move_player_to_unsold(p_player_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_player RECORD;
BEGIN
  SELECT * INTO v_player FROM public.players WHERE id = p_player_id FOR UPDATE;
  IF v_player IS NULL OR v_player.status != 'sold' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Player not found or not sold');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.auctions WHERE id = v_player.auction_id AND admin_id = auth.uid()) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authorized');
  END IF;
  UPDATE public.teams SET
    purse_balance = purse_balance + COALESCE(v_player.current_highest_bid, 0),
    boys_count = CASE WHEN v_player.gender = 'Male' THEN GREATEST(boys_count - 1, 0) ELSE boys_count END,
    girls_count = CASE WHEN v_player.gender = 'Female' THEN GREATEST(girls_count - 1, 0) ELSE girls_count END
    WHERE id = v_player.team_id;
  UPDATE public.players SET status = 'unsold', team_id = NULL, current_highest_bid = NULL, current_highest_bidder_id = NULL
    WHERE id = p_player_id;
  RETURN jsonb_build_object('success', true, 'player_name', v_player.name, 'restored_amount', v_player.current_highest_bid);
END; $$;

CREATE OR REPLACE FUNCTION public.reassign_player(p_player_id uuid, p_to_team_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_player RECORD;
BEGIN
  SELECT * INTO v_player FROM public.players WHERE id = p_player_id FOR UPDATE;
  IF v_player IS NULL OR v_player.status != 'sold' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Player not found or not sold');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.auctions WHERE id = v_player.auction_id AND admin_id = auth.uid()) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authorized');
  END IF;
  IF v_player.team_id IS NOT NULL THEN
    UPDATE public.teams SET
      purse_balance = purse_balance + COALESCE(v_player.current_highest_bid, 0),
      boys_count = CASE WHEN v_player.gender = 'Male' THEN GREATEST(boys_count - 1, 0) ELSE boys_count END,
      girls_count = CASE WHEN v_player.gender = 'Female' THEN GREATEST(girls_count - 1, 0) ELSE girls_count END
      WHERE id = v_player.team_id;
  END IF;
  UPDATE public.teams SET
    purse_balance = purse_balance - COALESCE(v_player.current_highest_bid, 0),
    boys_count = CASE WHEN v_player.gender = 'Male' THEN boys_count + 1 ELSE boys_count END,
    girls_count = CASE WHEN v_player.gender = 'Female' THEN girls_count + 1 ELSE girls_count END
    WHERE id = p_to_team_id;
  UPDATE public.players SET team_id = p_to_team_id WHERE id = p_player_id;
  RETURN jsonb_build_object('success', true);
END; $$;

-- 2. Revoke EXECUTE from anon for admin-only RPCs (place_bid remains callable by captains)
REVOKE EXECUTE ON FUNCTION public.set_active_player(uuid, uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.start_auction_timer(uuid, integer) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.pause_auction_timer(uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.process_sale(uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.mark_unsold(uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.end_auction(uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.move_player_to_unsold(uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.reassign_player(uuid, uuid) FROM anon, PUBLIC;

-- 3. Bids: constrain WITH CHECK
DROP POLICY IF EXISTS "Anyone can insert bids" ON public.bids;
CREATE POLICY "Validated bids only" ON public.bids FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.teams t WHERE t.id = bids.team_id AND t.auction_id = bids.auction_id)
    AND EXISTS (SELECT 1 FROM public.players p WHERE p.id = bids.player_id AND p.auction_id = bids.auction_id AND p.status = 'on_block')
    AND EXISTS (SELECT 1 FROM public.auctions a WHERE a.id = bids.auction_id AND a.status = 'live')
  );

-- 4. Teams: only allow joining auctions still in setup/draft
DROP POLICY IF EXISTS "Anyone can insert teams" ON public.teams;
CREATE POLICY "Teams join open auctions" ON public.teams FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.auctions a WHERE a.id = teams.auction_id AND a.status IN ('setup','draft'))
  );

-- 5. Hide admin_id from public auction reads
REVOKE SELECT (admin_id) ON public.auctions FROM anon, authenticated;

-- 6. Storage: update/delete restricted to authenticated (organizer), drop broad public SELECT
DROP POLICY IF EXISTS "Public can read player photos" ON storage.objects;
CREATE POLICY "Authenticated can read player photos" ON storage.objects FOR SELECT
  USING (bucket_id = 'player-photos' AND auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated can update player photos" ON storage.objects FOR UPDATE
  USING (bucket_id = 'player-photos' AND auth.uid() IS NOT NULL)
  WITH CHECK (bucket_id = 'player-photos' AND auth.uid() IS NOT NULL);
CREATE POLICY "Authenticated can delete player photos" ON storage.objects FOR DELETE
  USING (bucket_id = 'player-photos' AND auth.uid() IS NOT NULL);
