
-- Fix search_path on all functions
ALTER FUNCTION public.place_bid(UUID, UUID, UUID, INTEGER) SET search_path = public;
ALTER FUNCTION public.set_active_player(UUID, UUID) SET search_path = public;
ALTER FUNCTION public.start_auction_timer(UUID, INTEGER) SET search_path = public;
ALTER FUNCTION public.pause_auction_timer(UUID) SET search_path = public;
ALTER FUNCTION public.process_sale(UUID) SET search_path = public;
ALTER FUNCTION public.mark_unsold(UUID) SET search_path = public;
