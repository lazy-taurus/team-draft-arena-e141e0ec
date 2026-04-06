import { useState, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { useAuctionRealtime } from '@/hooks/use-auction-realtime';
import { useCountdown } from '@/hooks/use-countdown';
import { usePreviewCountdown } from '@/hooks/use-preview-countdown';
import { getCaptainSession } from '@/lib/captain-session';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { motion } from 'framer-motion';
import { PlayerAvatar } from '@/components/PlayerAvatar';

export default function CaptainBid() {
  const { id: auctionId } = useParams<{ id: string }>();
  const session = getCaptainSession(auctionId);
  const { auction, teams, currentPlayer, allPlayers, refetch } = useAuctionRealtime(auctionId);
  const previewLeft = usePreviewCountdown(auction?.preview_ends_at);
  const secondsLeft = useCountdown(auction?.timer_ends_at);
  const { toast } = useToast();
  const [customBid, setCustomBid] = useState('');
  const [bidding, setBidding] = useState(false);

  const myTeam = teams.find(t => t.id === session?.teamId);
  const isHighestBidder = currentPlayer?.current_highest_bidder_id === session?.teamId;
  const isPreviewPhase = previewLeft !== null && previewLeft > 0;

  // Bidding timer: only show after preview ends
  const biddingSecondsLeft = isPreviewPhase ? null : secondsLeft;

  const currentBid = currentPlayer?.current_highest_bid || currentPlayer?.base_price || 0;

  // Simple purse-based max bid (no roster caps)
  const maxBid = myTeam ? myTeam.purse_balance : 0;

  const placeBid = async (amount: number) => {
    if (!auctionId || !session?.teamId || !currentPlayer || bidding || isPreviewPhase) return;
    setBidding(true);
    try {
      const { data, error } = await supabase.rpc('place_bid', {
        p_auction_id: auctionId,
        p_team_id: session.teamId,
        p_player_id: currentPlayer.id,
        p_amount: amount,
      });
      if (error) throw error;
      const result = data as any;
      if (result && !result.success) {
        toast({ title: 'Bid Rejected', description: result.error, variant: 'destructive' });
      } else {
        await refetch();
      }
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setBidding(false);
      setCustomBid('');
    }
  };

  if (!session) {
    return (
      <div className="dark min-h-screen bg-[hsl(222,47%,11%)] text-[hsl(210,40%,98%)] flex items-center justify-center p-4">
        <p>No session found. Please <a href="/join" className="text-[hsl(217,91%,60%)] underline">join an auction</a>.</p>
      </div>
    );
  }

  return (
    <div className="dark min-h-screen bg-[hsl(222,47%,11%)] text-[hsl(210,40%,98%)] flex flex-col">
      <div className="px-4 py-3 border-b border-[hsl(215,25%,22%)] flex items-center justify-between">
        <div>
          <p className="font-bold">{session.teamName}</p>
          <p className="text-xs text-[hsl(215,20%,65%)]">
            Purse: <span className="font-mono text-[hsl(217,91%,60%)]">₹{myTeam?.purse_balance.toLocaleString() || '—'}</span>
          </p>
        </div>
        <div className="text-right text-xs text-[hsl(215,20%,65%)]">
          <p>Boys: {myTeam?.boys_count || 0}</p>
          <p>Girls: {myTeam?.girls_count || 0}</p>
        </div>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center p-6">
        {auction?.status === 'completed' ? (
          <div className="text-center">
            <p className="text-3xl font-bold text-[hsl(142,71%,45%)]">🏆 Auction Complete!</p>
            <p className="text-[hsl(215,20%,65%)] mt-2">Thanks for participating, {session.teamName}.</p>
          </div>
        ) : currentPlayer ? (
          <>
            <div className="text-center mb-4">
              <PlayerAvatar
                photoUrl={currentPlayer.photo_url}
                gender={currentPlayer.gender}
                name={currentPlayer.name}
                size="lg"
                className="mx-auto mb-3"
              />
              <span className="inline-block px-3 py-1 rounded-full text-xs font-medium bg-[hsl(217,91%,60%)]/20 text-[hsl(217,91%,60%)] mb-2">
                {currentPlayer.gender} · {currentPlayer.skill_tier || 'Untiered'}
              </span>
              <h2 className="text-3xl font-bold">{currentPlayer.name}</h2>
              <p className="text-sm text-[hsl(215,20%,65%)] mt-1">Base: ₹{currentPlayer.base_price}</p>
            </div>

            {/* Preview phase indicator */}
            {isPreviewPhase && (
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="w-full mb-4 py-4 rounded-xl bg-[hsl(280,80%,60%)]/15 border border-[hsl(280,80%,60%)]/30 text-center"
              >
                <p className="text-[hsl(280,80%,70%)] font-bold text-lg">PREVIEW PHASE</p>
                <p className="text-4xl font-mono tabular-nums text-[hsl(280,80%,70%)] mt-1">{previewLeft}s</p>
                <p className="text-xs text-[hsl(280,80%,60%)] mt-1">Bidding starts soon…</p>
              </motion.div>
            )}

            {!isPreviewPhase && biddingSecondsLeft !== null && (
              <div className={`text-5xl font-mono tabular-nums mb-4 ${biddingSecondsLeft <= 5 ? 'text-[hsl(0,84%,60%)] animate-pulse' : ''}`}>
                {biddingSecondsLeft}s
              </div>
            )}

            <motion.div key={currentBid} initial={{ scale: 1.1 }} animate={{ scale: 1 }} className="text-center mb-6">
              <p className="text-sm text-[hsl(215,20%,65%)] uppercase tracking-wider">Current Bid</p>
              <p className="text-5xl font-black font-mono tabular-nums">₹{currentBid.toLocaleString()}</p>
            </motion.div>

            {isHighestBidder && (
              <div className="w-full mb-4 py-3 rounded-xl bg-[hsl(142,71%,45%)]/15 border border-[hsl(142,71%,45%)]/30 text-center">
                <p className="text-[hsl(142,71%,45%)] font-bold">YOU HAVE THE HIGHEST BID</p>
              </div>
            )}

            {isPreviewPhase ? (
              <div className="w-full py-6 rounded-2xl bg-[hsl(215,25%,20%)] text-center opacity-50">
                <p className="text-xl font-bold text-[hsl(215,20%,65%)]">⏳ Bidding locked during preview</p>
              </div>
            ) : (
              <div className="w-full space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => placeBid(currentBid + 100)}
                    disabled={bidding || currentBid + 100 > maxBid || isHighestBidder}
                    className="py-4 rounded-xl bg-[hsl(215,25%,20%)] text-lg font-bold transition-all active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    +₹100 → ₹{(currentBid + 100).toLocaleString()}
                  </button>
                  <button
                    onClick={() => placeBid(currentBid + 250)}
                    disabled={bidding || currentBid + 250 > maxBid || isHighestBidder}
                    className="py-4 rounded-xl bg-[hsl(215,25%,20%)] text-lg font-bold transition-all active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    +₹250 → ₹{(currentBid + 250).toLocaleString()}
                  </button>
                </div>
                <div className="flex gap-2">
                  <input
                    type="number"
                    value={customBid}
                    onChange={e => setCustomBid(e.target.value)}
                    placeholder="Custom amount"
                    className="flex-1 h-14 rounded-xl bg-[hsl(215,25%,15%)] border border-[hsl(215,25%,22%)] px-4 text-lg font-mono tabular-nums text-[hsl(210,40%,98%)] placeholder:text-[hsl(215,20%,65%)]/50 focus:outline-none focus:border-[hsl(217,91%,60%)]"
                  />
                </div>
                <button
                  onClick={() => placeBid(customBid ? parseInt(customBid) : currentBid + 100)}
                  disabled={bidding || isHighestBidder || (customBid ? parseInt(customBid) > maxBid || parseInt(customBid) <= currentBid : currentBid + 100 > maxBid)}
                  className="w-full py-6 rounded-2xl bg-[hsl(217,91%,60%)] text-[hsl(0,0%,100%)] text-2xl font-bold transition-all active:scale-[0.98] active:translate-y-[2px] disabled:opacity-40 disabled:cursor-not-allowed bid-button-shadow active:bid-button-shadow-pressed"
                >
                  {bidding ? 'BIDDING...' : `BID ₹${(customBid ? parseInt(customBid) || 0 : currentBid + 100).toLocaleString()}`}
                </button>
                {maxBid < currentBid + 100 && (
                  <p className="text-xs text-center text-[hsl(0,84%,60%)]">Insufficient funds. Max bid: ₹{maxBid.toLocaleString()}</p>
                )}
              </div>
            )}
          </>
        ) : (
          <div className="text-center">
            <p className="text-xl text-[hsl(215,20%,65%)]">
              Welcome, {session.teamName}.<br />Waiting for the Organizer to begin the draft...
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
