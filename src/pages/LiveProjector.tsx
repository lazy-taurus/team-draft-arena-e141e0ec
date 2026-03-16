import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useAuctionRealtime } from '@/hooks/use-auction-realtime';
import { useCountdown } from '@/hooks/use-countdown';
import { useSound } from '@/hooks/use-sound';
import { motion, AnimatePresence } from 'framer-motion';
import confetti from 'canvas-confetti';

export default function LiveProjector() {
  const { id: auctionId } = useParams<{ id: string }>();
  const { auction, teams, currentPlayer, recentBids, allPlayers } = useAuctionRealtime(auctionId);
  const secondsLeft = useCountdown(auction?.timer_ends_at);
  const { playSwoosh, playTick, playGavel } = useSound();

  const [soldOverlay, setSoldOverlay] = useState<{ playerName: string; teamName: string; amount: number } | null>(null);
  const prevPlayerIdRef = useRef<string | null>(null);
  const tickedRef = useRef<number | null>(null);

  const highestBidderTeam = teams.find(t => t.id === currentPlayer?.current_highest_bidder_id);
  const soldPlayers = allPlayers.filter(p => p.status === 'sold');

  // Dynamic caps
  const teamCount = teams.length || 1;
  const malePool = allPlayers.filter(p => p.gender === 'Male').length;
  const femalePool = allPlayers.filter(p => p.gender === 'Female').length;
  const maleCap = Math.ceil(malePool / teamCount);
  const femaleCap = Math.ceil(femalePool / teamCount);

  // Detect player changes for sounds/animations
  useEffect(() => {
    if (currentPlayer && currentPlayer.id !== prevPlayerIdRef.current) {
      playSwoosh();
      prevPlayerIdRef.current = currentPlayer.id;
    }
    if (!currentPlayer && prevPlayerIdRef.current) {
      // Player was removed - check if sold
      const prev = allPlayers.find(p => p.id === prevPlayerIdRef.current);
      if (prev?.status === 'sold') {
        const team = teams.find(t => t.id === prev.team_id);
        playGavel();
        setSoldOverlay({ playerName: prev.name, teamName: team?.name || '?', amount: prev.current_highest_bid || 0 });
        confetti({ particleCount: 150, spread: 100, origin: { y: 0.6 } });
        setTimeout(() => setSoldOverlay(null), 4000);
      }
      prevPlayerIdRef.current = null;
    }
  }, [currentPlayer, allPlayers]);

  // Ticking in last 5 seconds
  useEffect(() => {
    if (secondsLeft !== null && secondsLeft <= 5 && secondsLeft > 0 && tickedRef.current !== secondsLeft) {
      tickedRef.current = secondsLeft;
      playTick();
    }
    if (secondsLeft === null || secondsLeft > 5) tickedRef.current = null;
  }, [secondsLeft]);

  return (
    <div className="dark min-h-screen bg-[hsl(222,47%,11%)] text-[hsl(210,40%,98%)] flex overflow-hidden relative">
      {/* Sold Overlay */}
      <AnimatePresence>
        {soldOverlay && (
          <motion.div
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            className="absolute inset-0 z-50 flex items-center justify-center bg-[hsl(222,47%,11%)]/90 backdrop-blur-lg"
          >
            <div className="text-center">
              <motion.div
                initial={{ rotate: -10, scale: 0 }}
                animate={{ rotate: 0, scale: 1 }}
                transition={{ type: 'spring', stiffness: 200, damping: 15 }}
                className="inline-block px-12 py-8 rounded-3xl border-4 border-[hsl(142,71%,45%)] bg-[hsl(142,71%,45%)]/10"
              >
                <p className="text-3xl font-bold text-[hsl(142,71%,45%)] uppercase tracking-widest mb-4">SOLD!</p>
                <p className="text-6xl font-black mb-2">{soldOverlay.playerName}</p>
                <p className="text-4xl font-mono tabular-nums text-[hsl(217,91%,60%)]">₹{soldOverlay.amount.toLocaleString()}</p>
                <p className="text-2xl mt-4 text-[hsl(210,40%,98%)]/80">→ {soldOverlay.teamName}</p>
              </motion.div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Stage */}
      <div className="flex-1 flex flex-col items-center justify-center p-8 relative">
        <AnimatePresence mode="wait">
          {currentPlayer ? (
            <motion.div
              key={currentPlayer.id}
              initial={{ opacity: 0, y: 60, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -40, scale: 0.95 }}
              transition={{ type: 'spring', stiffness: 300, damping: 25 }}
              className="text-center"
            >
              <motion.div
                initial={{ opacity: 0, x: -30 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.2 }}
                className="mb-4"
              >
                <span className="inline-block px-4 py-1 rounded-full text-sm font-medium bg-[hsl(217,91%,60%)]/20 text-[hsl(217,91%,60%)]">
                  {currentPlayer.gender} · {currentPlayer.skill_tier || 'Untiered'}
                </span>
              </motion.div>
              <motion.h1
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="text-[8vw] font-black leading-none tracking-tighter mb-6"
              >
                {currentPlayer.name}
              </motion.h1>

              <div className="mb-8">
                <p className="text-xl text-[hsl(215,20%,65%)] mb-2 uppercase tracking-wider">
                  {currentPlayer.current_highest_bid ? 'Current Bid' : 'Base Price'}
                </p>
                <motion.p
                  key={currentPlayer.current_highest_bid || currentPlayer.base_price}
                  initial={{ scale: 1.3, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 20 }}
                  className="text-[15vw] font-black leading-none tracking-tighter font-mono tabular-nums"
                >
                  ₹{(currentPlayer.current_highest_bid || currentPlayer.base_price).toLocaleString()}
                </motion.p>
                {highestBidderTeam && (
                  <motion.p
                    key={highestBidderTeam.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="text-2xl mt-4 text-[hsl(217,91%,60%)]"
                  >
                    {highestBidderTeam.name}
                  </motion.p>
                )}
              </div>

              {secondsLeft !== null && (
                <motion.div
                  key={secondsLeft}
                  initial={{ scale: 1.1 }}
                  animate={{ scale: 1 }}
                  className={`inline-flex items-center justify-center text-8xl font-mono tabular-nums px-12 py-6 rounded-2xl backdrop-blur-xl border transition-colors ${
                    secondsLeft <= 5
                      ? 'bg-[hsl(0,84%,60%)]/10 border-[hsl(0,84%,60%)]/30 text-[hsl(0,84%,60%)] animate-pulse'
                      : 'bg-[hsl(210,40%,98%)]/5 border-[hsl(210,40%,98%)]/10'
                  }`}
                >
                  {secondsLeft}s
                </motion.div>
              )}
            </motion.div>
          ) : (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center">
              <h2 className="text-4xl font-bold text-[hsl(215,20%,65%)]">
                {auction?.status === 'completed' ? '🏆 Auction Complete!' : auction?.status === 'live' ? 'Waiting for next player...' : 'Auction not started'}
              </h2>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Leaderboard Sidebar */}
      <div className="w-[30%] min-w-[300px] border-l border-[hsl(215,25%,22%)] p-6 flex flex-col overflow-y-auto scrollbar-hide">
        <h3 className="text-sm font-medium uppercase tracking-wider text-[hsl(215,20%,65%)] mb-4">Franchises</h3>
        <div className="space-y-3 flex-1">
          {teams.map(team => {
            const teamPlayers = soldPlayers.filter(p => p.team_id === team.id);
            const totalPlayers = team.boys_count + team.girls_count;
            const totalCap = maleCap + femaleCap;
            const isLocked = totalPlayers >= totalCap;
            return (
              <div
                key={team.id}
                className={`p-4 rounded-xl transition-all ${isLocked ? 'opacity-40' : ''} ${
                  team.id === currentPlayer?.current_highest_bidder_id
                    ? 'bg-[hsl(217,91%,60%)]/10 border border-[hsl(217,91%,60%)]/30'
                    : 'bg-[hsl(215,25%,15%)]'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="font-bold">{team.name}</span>
                  {isLocked && <span className="text-xs">🔒</span>}
                </div>
                <p className="text-2xl font-mono font-bold tabular-nums text-[hsl(217,91%,60%)]">
                  ₹{team.purse_balance.toLocaleString()}
                </p>
                <div className="mt-2 flex gap-3 text-xs text-[hsl(215,20%,65%)]">
                  <span>Boys: {team.boys_count}/{maleCap}</span>
                  <span>Girls: {team.girls_count}/{femaleCap}</span>
                </div>
                <div className="mt-2 h-1 rounded-full bg-[hsl(215,25%,22%)] overflow-hidden">
                  <div className="h-full rounded-full bg-[hsl(217,91%,60%)] transition-all" style={{ width: `${(totalPlayers / Math.max(totalCap, 1)) * 100}%` }} />
                </div>
                {teamPlayers.length > 0 && (
                  <div className="mt-2 space-y-0.5">
                    {teamPlayers.map(p => (
                      <p key={p.id} className="text-xs text-[hsl(215,20%,65%)] truncate">
                        {p.name} <span className="text-[hsl(217,91%,60%)]">₹{p.current_highest_bid}</span>
                      </p>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="mt-6">
          <h3 className="text-sm font-medium uppercase tracking-wider text-[hsl(215,20%,65%)] mb-3">Recent Bids</h3>
          <div className="space-y-1">
            {recentBids.slice(0, 8).map(bid => {
              const team = teams.find(t => t.id === bid.team_id);
              return (
                <div key={bid.id} className="flex justify-between text-sm py-1">
                  <span className="text-[hsl(215,20%,65%)]">{team?.name || '?'}</span>
                  <span className="font-mono tabular-nums">₹{bid.amount.toLocaleString()}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
