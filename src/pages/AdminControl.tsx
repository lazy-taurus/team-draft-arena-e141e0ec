import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/use-auth';
import { useAuctionRealtime } from '@/hooks/use-auction-realtime';
import { useCountdown } from '@/hooks/use-countdown';
import { usePreviewCountdown } from '@/hooks/use-preview-countdown';
import { AdminNavbar } from '@/components/AdminNavbar';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Play, Pause, XCircle, Gavel, Search, OctagonX, Undo2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import type { Database } from '@/integrations/supabase/types';

type Player = Database['public']['Tables']['players']['Row'];

export default function AdminControl() {
  const { id: auctionId } = useParams<{ id: string }>();
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { auction, teams, currentPlayer, recentBids, allPlayers, refetch } = useAuctionRealtime(auctionId);
  const previewLeft = usePreviewCountdown(auction?.preview_ends_at);
  const secondsLeft = useCountdown(auction?.timer_ends_at);
  const isPreviewPhase = previewLeft !== null && previewLeft > 0;
  const biddingSecondsLeft = isPreviewPhase ? null : secondsLeft;

  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'available' | 'unsold'>('available');
  const autoSellFired = useRef(false);

  useEffect(() => {
    if (!authLoading && !user) navigate('/login');
  }, [user, authLoading, navigate]);

  // Auto-sell when bidding timer hits 0 (not during preview)
  useEffect(() => {
    if (biddingSecondsLeft === 0 && currentPlayer && !autoSellFired.current && !isPreviewPhase) {
      autoSellFired.current = true;
      if (currentPlayer.current_highest_bidder_id) {
        handleForceSell();
      } else {
        handleMarkUnsold();
      }
    }
    if (biddingSecondsLeft !== null && biddingSecondsLeft > 0) {
      autoSellFired.current = false;
    }
  }, [biddingSecondsLeft, currentPlayer, isPreviewPhase]);

  // Auto-end auction if all players processed
  useEffect(() => {
    if (!auction || auction.status !== 'live' || !auctionId) return;
    const remaining = allPlayers.filter(p => p.status === 'available' || p.status === 'on_block');
    if (allPlayers.length > 0 && remaining.length === 0) {
      supabase.rpc('end_auction' as any, { p_auction_id: auctionId });
      toast({ title: 'Auction Complete', description: 'All players have been processed.' });
    }
  }, [allPlayers, auction]);

  const availablePlayers = allPlayers.filter(p => p.status === 'available');
  const unsoldPlayers = allPlayers.filter(p => p.status === 'unsold');
  const soldPlayers = allPlayers.filter(p => p.status === 'sold');

  const pushToBlock = async (playerId: string) => {
    if (!auctionId) return;
    autoSellFired.current = false;
    await supabase.rpc('set_active_player', { p_auction_id: auctionId, p_player_id: playerId });
  };

  const startTimer = async () => {
    if (!auctionId) return;
    await supabase.rpc('start_auction_timer', { p_auction_id: auctionId, p_seconds: 30 });
  };

  const pauseTimer = async () => {
    if (!auctionId) return;
    await supabase.rpc('pause_auction_timer', { p_auction_id: auctionId });
  };

  const handleForceSell = async () => {
    if (!auctionId) return;
    const { data } = await supabase.rpc('process_sale', { p_auction_id: auctionId });
    const result = data as any;
    if (result?.success) {
      toast({ title: 'SOLD!', description: `${result.player_name} → ${result.team_name} for ₹${result.amount}` });
    } else {
      toast({ title: 'Error', description: result?.error || 'Failed', variant: 'destructive' });
    }
  };

  const handleMarkUnsold = async () => {
    if (!auctionId) return;
    await supabase.rpc('mark_unsold', { p_auction_id: auctionId });
    toast({ title: 'Unsold', description: 'Player marked as unsold.' });
  };

  const endAuction = async () => {
    if (!auctionId) return;
    await supabase.rpc('end_auction' as any, { p_auction_id: auctionId });
    toast({ title: 'Auction Ended' });
  };

  const moveToUnsold = async (playerId: string) => {
    const { data } = await supabase.rpc('move_player_to_unsold' as any, { p_player_id: playerId });
    const result = data as any;
    if (result?.success) {
      toast({ title: 'Restored', description: `${result.player_name} moved to unsold. ₹${result.restored_amount} restored.` });
    } else {
      toast({ title: 'Error', description: result?.error || 'Failed', variant: 'destructive' });
    }
  };

  const playerList = activeTab === 'available' ? availablePlayers : unsoldPlayers;
  const filtered = playerList.filter(p => p.name.toLowerCase().includes(searchQuery.toLowerCase()));
  const highestBidderTeam = teams.find(t => t.id === currentPlayer?.current_highest_bidder_id);

  // Dynamic caps
  const teamCount = teams.length || 1;
  const malePool = allPlayers.filter(p => p.gender === 'Male').length;
  const femalePool = allPlayers.filter(p => p.gender === 'Female').length;
  const maleCap = Math.ceil(malePool / teamCount);
  const femaleCap = Math.ceil(femalePool / teamCount);

  if (!auction) return <div className="flex min-h-screen items-center justify-center">Loading...</div>;

  return (
    <div className="min-h-screen bg-background">
      <AdminNavbar />
      <header className="border-b border-border px-6 py-3 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold">{auction.title} — Control Room</h1>
          <p className="text-xs text-muted-foreground">Code: {auction.join_code} · {teams.length} teams · Status: {auction.status}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => window.open(`/auction/${auctionId}/live`, '_blank')}>
            Open Projector ↗
          </Button>
          <Button variant="destructive" size="sm" onClick={endAuction}>
            <OctagonX className="mr-1 h-4 w-4" /> End Auction
          </Button>
        </div>
      </header>

      <div className="flex h-[calc(100vh-105px)]">
        {/* Queue Panel */}
        <div className="w-[340px] border-r border-border flex flex-col">
          <div className="p-3 border-b border-border">
            <div className="flex gap-1 mb-2">
              <button onClick={() => setActiveTab('available')} className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-colors ${activeTab === 'available' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}`}>
                Up Next ({availablePlayers.length})
              </button>
              <button onClick={() => setActiveTab('unsold')} className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-colors ${activeTab === 'unsold' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}`}>
                Unsold ({unsoldPlayers.length})
              </button>
            </div>
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <Input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Search players..." className="pl-8 h-8 text-sm" />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto scrollbar-hide p-2 space-y-1">
            {filtered.map(p => (
              <div key={p.id} className="flex items-center justify-between p-2.5 rounded-lg hover:bg-muted transition-colors">
                <div>
                  <p className="text-sm font-medium">{p.name}</p>
                  <p className="text-xs text-muted-foreground">{p.gender} · {p.skill_tier || '—'} · ₹{p.base_price}</p>
                </div>
                <Button size="sm" variant="outline" onClick={() => pushToBlock(p.id)} className="text-xs h-7">Push</Button>
              </div>
            ))}
          </div>
        </div>

        {/* Main Control Area */}
        <div className="flex-1 p-6 overflow-y-auto">
          {currentPlayer ? (
            <div className="max-w-2xl mx-auto space-y-6">
              <Card className="stadium-shadow">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-2xl">{currentPlayer.name}</CardTitle>
                      <p className="text-muted-foreground">{currentPlayer.gender} · {currentPlayer.skill_tier || 'Untiered'} · Base: ₹{currentPlayer.base_price}</p>
                    </div>
                    {isPreviewPhase ? (
                      <div className="text-center">
                        <p className="text-xs uppercase tracking-wider text-[hsl(280,80%,60%)] font-bold">Preview</p>
                        <div className="text-4xl font-mono tabular-nums font-bold text-[hsl(280,80%,70%)]">
                          {previewLeft}s
                        </div>
                      </div>
                    ) : biddingSecondsLeft !== null ? (
                      <div className={`text-4xl font-mono tabular-nums font-bold ${biddingSecondsLeft <= 5 ? 'text-destructive' : 'text-primary'}`}>
                        {biddingSecondsLeft}s
                      </div>
                    ) : null}
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="text-center py-4">
                    <p className="text-sm text-muted-foreground uppercase tracking-wider">Current Bid</p>
                    <p className="text-5xl font-black font-mono tabular-nums">
                      ₹{(currentPlayer.current_highest_bid || currentPlayer.base_price).toLocaleString()}
                    </p>
                    {highestBidderTeam && (
                      <p className="text-primary font-medium mt-2">{highestBidderTeam.name}</p>
                    )}
                  </div>
                </CardContent>
              </Card>

              <div className="grid grid-cols-2 gap-3">
                <Button onClick={startTimer} className="h-14 text-lg"><Play className="mr-2 h-5 w-5" /> Start Timer</Button>
                <Button onClick={pauseTimer} variant="outline" className="h-14 text-lg border-warning text-warning hover:bg-warning hover:text-warning-foreground"><Pause className="mr-2 h-5 w-5" /> Pause</Button>
                <Button onClick={handleMarkUnsold} variant="outline" className="h-14 text-lg border-destructive text-destructive hover:bg-destructive hover:text-destructive-foreground"><XCircle className="mr-2 h-5 w-5" /> Mark Unsold</Button>
                <Button onClick={handleForceSell} disabled={!currentPlayer.current_highest_bidder_id} className="h-14 text-lg"><Gavel className="mr-2 h-5 w-5" /> Force Sell</Button>
              </div>

              <Card>
                <CardHeader><CardTitle className="text-base">Live Bid Log</CardTitle></CardHeader>
                <CardContent>
                  <div className="space-y-1 max-h-60 overflow-y-auto scrollbar-hide">
                    {recentBids.map(bid => {
                      const team = teams.find(t => t.id === bid.team_id);
                      return (
                        <div key={bid.id} className="flex justify-between text-sm py-1.5 border-b border-border last:border-0">
                          <span className="text-muted-foreground">{team?.name || '?'}</span>
                          <span className="font-mono tabular-nums font-medium">₹{bid.amount.toLocaleString()}</span>
                        </div>
                      );
                    })}
                    {recentBids.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">No bids yet</p>}
                  </div>
                </CardContent>
              </Card>
            </div>
          ) : (
            <div className="flex items-center justify-center h-full">
              <p className="text-xl text-muted-foreground">Select a player from the queue to begin.</p>
            </div>
          )}
        </div>

        {/* Teams Sidebar with drafted names */}
        <div className="w-[280px] border-l border-border p-4 overflow-y-auto scrollbar-hide">
          <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-3">Franchises</h3>
          <div className="space-y-3">
            {teams.map(team => {
              const teamPlayers = soldPlayers.filter(p => p.team_id === team.id);
              return (
                <div key={team.id} className="p-3 rounded-lg bg-muted/50">
                  <p className="font-medium text-sm">{team.name}</p>
                  <p className="text-lg font-mono font-bold tabular-nums text-primary">₹{team.purse_balance.toLocaleString()}</p>
                  <div className="flex gap-2 text-xs text-muted-foreground mt-1">
                    <span>B:{team.boys_count}/{maleCap}</span>
                    <span>G:{team.girls_count}/{femaleCap}</span>
                  </div>
                  {teamPlayers.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {teamPlayers.map(p => (
                        <div key={p.id} className="flex items-center justify-between text-xs">
                          <span className="truncate">{p.name} <span className="text-muted-foreground">₹{p.current_highest_bid}</span></span>
                          <Button size="icon" variant="ghost" className="h-5 w-5 text-destructive" onClick={() => moveToUnsold(p.id)} title="Move to unsold">
                            <Undo2 className="h-3 w-3" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
