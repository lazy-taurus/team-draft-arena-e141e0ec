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
}

export function useAuctionRealtime(auctionId: string | undefined) {
  const [data, setData] = useState<AuctionRealtimeData>({
    auction: null,
    teams: [],
    currentPlayer: null,
    recentBids: [],
  });

  const fetchAll = useCallback(async () => {
    if (!auctionId) return;
    
    const [auctionRes, teamsRes, playersRes, bidsRes] = await Promise.all([
      supabase.from('auctions').select('*').eq('id', auctionId).single(),
      supabase.from('teams').select('*').eq('auction_id', auctionId),
      supabase.from('players').select('*').eq('auction_id', auctionId).eq('status', 'on_block').limit(1),
      supabase.from('bids').select('*').eq('auction_id', auctionId).order('created_at', { ascending: false }).limit(20),
    ]);

    setData({
      auction: auctionRes.data,
      teams: teamsRes.data || [],
      currentPlayer: playersRes.data?.[0] || null,
      recentBids: bidsRes.data || [],
    });
  }, [auctionId]);

  useEffect(() => {
    fetchAll();

    if (!auctionId) return;

    const channel = supabase
      .channel(`auction:${auctionId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'auctions',
        filter: `id=eq.${auctionId}`,
      }, () => fetchAll())
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'players',
        filter: `auction_id=eq.${auctionId}`,
      }, () => fetchAll())
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'teams',
        filter: `auction_id=eq.${auctionId}`,
      }, () => fetchAll())
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'bids',
        filter: `auction_id=eq.${auctionId}`,
      }, () => fetchAll())
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [auctionId, fetchAll]);

  return data;
}
