
-- 1. Allow admin to delete players
CREATE POLICY "Admin can delete players" ON public.players
FOR DELETE TO public
USING (EXISTS (
  SELECT 1 FROM auctions WHERE auctions.id = players.auction_id AND auctions.admin_id = auth.uid()
));

-- 2. Update set_active_player to auto-start 30s timer
CREATE OR REPLACE FUNCTION public.set_active_player(p_auction_id uuid, p_player_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  UPDATE public.players SET status = 'available'
  WHERE auction_id = p_auction_id AND status = 'on_block';

  UPDATE public.players
  SET status = 'on_block', current_highest_bid = NULL, current_highest_bidder_id = NULL
  WHERE id = p_player_id;

  UPDATE public.auctions
  SET current_player_id = p_player_id, timer_ends_at = NOW() + INTERVAL '30 seconds'
  WHERE id = p_auction_id;
END;
$$;

-- 3. Update place_bid for dynamic gender caps
CREATE OR REPLACE FUNCTION public.place_bid(p_auction_id uuid, p_team_id uuid, p_player_id uuid, p_amount integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_player RECORD;
  v_team RECORD;
  v_auction RECORD;
  v_remaining_slots INTEGER;
  v_max_bid INTEGER;
  v_team_count INTEGER;
  v_category_pool INTEGER;
  v_dynamic_cap INTEGER;
  v_male_pool INTEGER;
  v_female_pool INTEGER;
  v_male_cap INTEGER;
  v_female_cap INTEGER;
  v_total_cap INTEGER;
BEGIN
  SELECT * INTO v_player FROM public.players WHERE id = p_player_id FOR UPDATE;
  IF v_player IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'Player not found'); END IF;
  IF v_player.status != 'on_block' THEN RETURN jsonb_build_object('success', false, 'error', 'Player is not on the block'); END IF;

  SELECT * INTO v_auction FROM public.auctions WHERE id = p_auction_id FOR UPDATE;
  IF v_auction.status != 'live' THEN RETURN jsonb_build_object('success', false, 'error', 'Auction is not live'); END IF;
  IF v_auction.timer_ends_at IS NOT NULL AND NOW() > v_auction.timer_ends_at THEN
    RETURN jsonb_build_object('success', false, 'error', 'Timer has expired');
  END IF;

  IF v_player.current_highest_bid IS NOT NULL AND p_amount <= v_player.current_highest_bid THEN
    RETURN jsonb_build_object('success', false, 'error', 'Bid must be higher than current bid');
  ELSIF v_player.current_highest_bid IS NULL AND p_amount < v_player.base_price THEN
    RETURN jsonb_build_object('success', false, 'error', 'Bid must be at least the base price');
  END IF;

  SELECT * INTO v_team FROM public.teams WHERE id = p_team_id FOR UPDATE;

  -- Dynamic gender cap
  SELECT COUNT(*) INTO v_team_count FROM public.teams WHERE auction_id = p_auction_id;
  SELECT COUNT(*) INTO v_category_pool FROM public.players WHERE auction_id = p_auction_id AND gender = v_player.gender;
  v_dynamic_cap := CEIL(v_category_pool::NUMERIC / GREATEST(v_team_count, 1));

  IF v_player.gender = 'Female' AND v_team.girls_count >= v_dynamic_cap THEN
    RETURN jsonb_build_object('success', false, 'error', format('Category full: %s/%s %s drafted', v_team.girls_count, v_dynamic_cap, v_player.gender));
  END IF;
  IF v_player.gender = 'Male' AND v_team.boys_count >= v_dynamic_cap THEN
    RETURN jsonb_build_object('success', false, 'error', format('Category full: %s/%s %s drafted', v_team.boys_count, v_dynamic_cap, v_player.gender));
  END IF;

  -- Dynamic total roster cap for budget check
  SELECT COUNT(*) INTO v_male_pool FROM public.players WHERE auction_id = p_auction_id AND gender = 'Male';
  SELECT COUNT(*) INTO v_female_pool FROM public.players WHERE auction_id = p_auction_id AND gender = 'Female';
  v_male_cap := CEIL(v_male_pool::NUMERIC / GREATEST(v_team_count, 1));
  v_female_cap := CEIL(v_female_pool::NUMERIC / GREATEST(v_team_count, 1));
  v_total_cap := v_male_cap + v_female_cap;
  v_remaining_slots := v_total_cap - (v_team.boys_count + v_team.girls_count);

  v_max_bid := v_team.purse_balance - (GREATEST(v_remaining_slots - 1, 0) * 200);
  IF p_amount > v_max_bid THEN
    RETURN jsonb_build_object('success', false, 'error', 'Insufficient funds to complete roster');
  END IF;

  IF v_auction.timer_ends_at IS NOT NULL AND (v_auction.timer_ends_at - NOW()) <= INTERVAL '5 seconds' THEN
    UPDATE public.auctions SET timer_ends_at = NOW() + INTERVAL '5 seconds' WHERE id = p_auction_id;
  END IF;

  INSERT INTO public.bids (auction_id, player_id, team_id, amount) VALUES (p_auction_id, p_player_id, p_team_id, p_amount);
  UPDATE public.players SET current_highest_bid = p_amount, current_highest_bidder_id = p_team_id WHERE id = p_player_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

-- 4. Move sold player back to unsold (restore team purse/counts)
CREATE OR REPLACE FUNCTION public.move_player_to_unsold(p_player_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_player RECORD;
BEGIN
  SELECT * INTO v_player FROM public.players WHERE id = p_player_id FOR UPDATE;
  IF v_player IS NULL OR v_player.status != 'sold' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Player not found or not sold');
  END IF;

  UPDATE public.teams SET
    purse_balance = purse_balance + COALESCE(v_player.current_highest_bid, 0),
    boys_count = CASE WHEN v_player.gender = 'Male' THEN GREATEST(boys_count - 1, 0) ELSE boys_count END,
    girls_count = CASE WHEN v_player.gender = 'Female' THEN GREATEST(girls_count - 1, 0) ELSE girls_count END
  WHERE id = v_player.team_id;

  UPDATE public.players SET
    status = 'unsold', team_id = NULL, current_highest_bid = NULL, current_highest_bidder_id = NULL
  WHERE id = p_player_id;

  RETURN jsonb_build_object('success', true, 'player_name', v_player.name, 'restored_amount', v_player.current_highest_bid);
END;
$$;

-- 5. End auction manually
CREATE OR REPLACE FUNCTION public.end_auction(p_auction_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  UPDATE public.players SET status = 'unsold', current_highest_bid = NULL, current_highest_bidder_id = NULL
  WHERE auction_id = p_auction_id AND status = 'on_block';

  UPDATE public.auctions SET status = 'completed', current_player_id = NULL, timer_ends_at = NULL
  WHERE id = p_auction_id;
END;
$$;

-- 6. Reassign player between teams (for roster manager)
CREATE OR REPLACE FUNCTION public.reassign_player(p_player_id uuid, p_to_team_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_player RECORD;
BEGIN
  SELECT * INTO v_player FROM public.players WHERE id = p_player_id FOR UPDATE;
  IF v_player IS NULL OR v_player.status != 'sold' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Player not found or not sold');
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
END;
$$;
