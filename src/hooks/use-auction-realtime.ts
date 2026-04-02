import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';

type Auction = Database['public']['Tables']['auctions']['Row'];
type Team = Database['public']['Tables']['teams']['Row'];
type Player = Database['public']['Tables']['players']['Row'];
type Bid = Database['public']['Tables']['bids']['Row'];

export interface AuctionRealtimeData {
  auction: Auction | null;
  teams: Team[];
  currentPlayer: Player | null;
  recentBids: Bid[];
  allPlayers: Player[];
}

export interface AuctionRealtimeResult extends AuctionRealtimeData {
  refetch: () => Promise<void>;
}

export function useAuctionRealtime(auctionId: string | undefined): AuctionRealtimeResult {
  const [data, setData] = useState<AuctionRealtimeData>({
    auction: null,
    teams: [],
    currentPlayer: null,
    recentBids: [],
    allPlayers: [],
  });

  const fetchAll = useCallback(async () => {
    if (!auctionId) return;

    const [auctionRes, teamsRes, allPlayersRes, bidsRes] = await Promise.all([
      supabase.from('auctions').select('*').eq('id', auctionId).single(),
      supabase.from('teams').select('*').eq('auction_id', auctionId),
      supabase.from('players').select('*').eq('auction_id', auctionId).order('name'),
      supabase.from('bids').select('*').eq('auction_id', auctionId).order('created_at', { ascending: false }).limit(20),
    ]) as any;

    const allPlayers = allPlayersRes.data || [];
    const onBlock = allPlayers.find(p => p.status === 'on_block') || null;

    setData({
      auction: auctionRes.data,
      teams: teamsRes.data || [],
      currentPlayer: onBlock,
      recentBids: bidsRes.data || [],
      allPlayers,
    });
  }, [auctionId]);

  useEffect(() => {
    fetchAll();
    if (!auctionId) return;

    const channel = supabase
      .channel(`auction:${auctionId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'auctions', filter: `id=eq.${auctionId}` }, () => fetchAll())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'players', filter: `auction_id=eq.${auctionId}` }, () => fetchAll())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'teams', filter: `auction_id=eq.${auctionId}` }, () => fetchAll())
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'bids', filter: `auction_id=eq.${auctionId}` }, () => fetchAll())
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [auctionId, fetchAll]);

  return {
    ...data,
    refetch: fetchAll,
  };
}
