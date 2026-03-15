import { useParams } from 'react-router-dom';
import { useAuctionRealtime } from '@/hooks/use-auction-realtime';
import { useCountdown } from '@/hooks/use-countdown';
import { motion, AnimatePresence } from 'framer-motion';

export default function LiveProjector() {
  const { id: auctionId } = useParams<{ id: string }>();
  const { auction, teams, currentPlayer, recentBids } = useAuctionRealtime(auctionId);
  const secondsLeft = useCountdown(auction?.timer_ends_at);

  const highestBidderTeam = teams.find(t => t.id === currentPlayer?.current_highest_bidder_id);

  return (
    <div className="dark min-h-screen bg-[hsl(222,47%,11%)] text-[hsl(210,40%,98%)] flex overflow-hidden">
      {/* Main Stage */}
      <div className="flex-1 flex flex-col items-center justify-center p-8 relative">
        <AnimatePresence mode="wait">
          {currentPlayer ? (
            <motion.div
              key={currentPlayer.id}
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -40 }}
              className="text-center"
            >
              {/* Player info */}
              <div className="mb-4">
                <span className="inline-block px-4 py-1 rounded-full text-sm font-medium bg-[hsl(217,91%,60%)]/20 text-[hsl(217,91%,60%)]">
                  {currentPlayer.gender} · {currentPlayer.skill_tier || 'Untiered'}
                </span>
              </div>
              <h1 className="text-[8vw] font-black leading-none tracking-tighter mb-6">
                {currentPlayer.name}
              </h1>

              {/* Current Bid */}
              <div className="mb-8">
                <p className="text-xl text-[hsl(215,20%,65%)] mb-2 uppercase tracking-wider">
                  {currentPlayer.current_highest_bid ? 'Current Bid' : 'Base Price'}
                </p>
                <motion.p
                  key={currentPlayer.current_highest_bid || currentPlayer.base_price}
                  initial={{ scale: 1.2, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  className="text-[15vw] font-black leading-none tracking-tighter font-mono tabular-nums"
                >
                  ₹{(currentPlayer.current_highest_bid || currentPlayer.base_price).toLocaleString()}
                </motion.p>
                {highestBidderTeam && (
                  <motion.p
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="text-2xl mt-4 text-[hsl(217,91%,60%)]"
                  >
                    {highestBidderTeam.name}
                  </motion.p>
                )}
              </div>

              {/* Timer */}
              {secondsLeft !== null && (
                <div className={`inline-flex items-center justify-center text-8xl font-mono tabular-nums px-12 py-6 rounded-2xl backdrop-blur-xl border transition-colors ${
                  secondsLeft <= 5 
                    ? 'bg-[hsl(0,84%,60%)]/10 border-[hsl(0,84%,60%)]/30 text-[hsl(0,84%,60%)]' 
                    : 'bg-[hsl(210,40%,98%)]/5 border-[hsl(210,40%,98%)]/10'
                }`}>
                  {secondsLeft}s
                </div>
              )}
            </motion.div>
          ) : (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-center"
            >
              <h2 className="text-4xl font-bold text-[hsl(215,20%,65%)]">
                {auction?.status === 'live' ? 'Waiting for next player...' : 'Auction not started'}
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
            const totalPlayers = team.boys_count + team.girls_count;
            const isLocked = totalPlayers >= 10;
            return (
              <div
                key={team.id}
                className={`p-4 rounded-xl transition-opacity ${
                  isLocked ? 'opacity-40' : ''
                } ${
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
                  <span>Boys: {team.boys_count}/7</span>
                  <span>Girls: {team.girls_count}/3</span>
                </div>
                {/* Progress bar */}
                <div className="mt-2 h-1 rounded-full bg-[hsl(215,25%,22%)] overflow-hidden">
                  <div
                    className="h-full rounded-full bg-[hsl(217,91%,60%)] transition-all"
                    style={{ width: `${(totalPlayers / 10) * 100}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>

        {/* Recent bids */}
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
