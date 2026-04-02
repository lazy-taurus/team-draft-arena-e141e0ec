import { useEffect, useRef, useState, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { useAuctionRealtime } from '@/hooks/use-auction-realtime';
import { useCountdown } from '@/hooks/use-countdown';
import { usePreviewCountdown } from '@/hooks/use-preview-countdown';
import { useSound } from '@/hooks/use-sound';
import { motion, AnimatePresence } from 'framer-motion';
import confetti from 'canvas-confetti';
import { PlayerAvatar } from '@/components/PlayerAvatar';

// ─── Web-Audio synth ─────────────────────────────────────────────────────────
function useSynth() {
  const ctxRef = useRef<AudioContext | null>(null);
  const getCtx = useCallback(() => {
    if (!ctxRef.current) ctxRef.current = new AudioContext();
    return ctxRef.current;
  }, []);
  const tone = useCallback((freq: number, type: OscillatorType, duration: number, gain = 0.3, delay = 0) => {
    const ctx = getCtx();
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.connect(g); g.connect(ctx.destination);
    osc.type = type;
    osc.frequency.setValueAtTime(freq, ctx.currentTime + delay);
    g.gain.setValueAtTime(0, ctx.currentTime + delay);
    g.gain.linearRampToValueAtTime(gain, ctx.currentTime + delay + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + delay + duration);
    osc.start(ctx.currentTime + delay);
    osc.stop(ctx.currentTime + delay + duration + 0.05);
  }, [getCtx]);
  const playBidPlaced        = useCallback(() => { tone(880,'sine',0.12,0.2); tone(1320,'sine',0.08,0.15,0.05); }, [tone]);
  const playNewHighestBidder = useCallback(() => { [440,550,660].forEach((f,i)=>tone(f,'triangle',0.18,0.25,i*0.07)); }, [tone]);
  const playFinalThree       = useCallback(() => { tone(220,'sawtooth',0.3,0.4); tone(440,'sawtooth',0.2,0.25,0.05); }, [tone]);
  const playFanfare          = useCallback(() => { [523,659,784,1047,784,1047].forEach((f,i)=>tone(f,'triangle',0.22,0.35,i*0.1)); }, [tone]);
  const playNewPlayer        = useCallback(() => { tone(330,'sine',0.15,0.2); tone(495,'sine',0.12,0.18,0.1); tone(660,'sine',0.1,0.15,0.2); }, [tone]);
  const playUnsold           = useCallback(() => { tone(300,'sawtooth',0.25,0.3); tone(200,'sawtooth',0.3,0.3,0.15); }, [tone]);
  return { playBidPlaced, playNewHighestBidder, playFinalThree, playFanfare, playNewPlayer, playUnsold };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function Particle({ x, y, color, onDone }: { x:number; y:number; color:string; onDone:()=>void }) {
  return (
    <motion.div className="absolute rounded-full pointer-events-none"
      style={{ left:x, top:y, width:6, height:6, background:color, zIndex:5 }}
      initial={{ opacity:1, scale:1, x:0, y:0 }}
      animate={{ opacity:0, scale:0, x:(Math.random()-0.5)*200, y:-Math.random()*200-50 }}
      transition={{ duration:1.2, ease:'easeOut' }}
      onAnimationComplete={onDone}
    />
  );
}
function AmbientOrb({ delay,x,y,size,color }:{ delay:number; x:string; y:string; size:number; color:string }) {
  return (
    <motion.div className="absolute rounded-full pointer-events-none"
      style={{ left:x, top:y, width:size, height:size, background:color, filter:'blur(80px)', opacity:0.12 }}
      animate={{ scale:[1,1.3,1], opacity:[0.08,0.18,0.08], x:[0,30,-20,0], y:[0,-20,10,0] }}
      transition={{ duration:8+delay, repeat:Infinity, ease:'easeInOut', delay }}
    />
  );
}
function PulseRing({ color, delay=0 }:{ color:string; delay?:number }) {
  return (
    <motion.div className="absolute rounded-full pointer-events-none border-2"
      style={{ borderColor:color, width:100, height:100, left:'50%', top:'50%', marginLeft:-50, marginTop:-50 }}
      initial={{ scale:0.5, opacity:0.8 }}
      animate={{ scale:4, opacity:0 }}
      transition={{ duration:1.8, ease:'easeOut', delay, repeat:Infinity, repeatDelay:1.5 }}
    />
  );
}
function FlyingBid({ amount, onDone }:{ amount:number; onDone:()=>void }) {
  return (
    <motion.div className="absolute left-1/2 -translate-x-1/2 font-black font-mono tabular-nums pointer-events-none z-30"
      style={{ fontSize:'3vw', color:'hsl(217,91%,70%)', textShadow:'0 0 20px hsl(217,91%,60%)', top:'50%' }}
      initial={{ opacity:1, y:0, scale:1.2 }}
      animate={{ opacity:0, y:-160, scale:0.8 }}
      transition={{ duration:1.4, ease:'easeOut' }}
      onAnimationComplete={onDone}
    >
      +₹{amount.toLocaleString()}
    </motion.div>
  );
}
function EdgeFlash({ color }:{ color:string }) {
  return (
    <motion.div className="absolute inset-0 pointer-events-none z-20"
      style={{ boxShadow:`inset 0 0 80px 30px ${color}` }}
      initial={{ opacity:0.9 }} animate={{ opacity:0 }} transition={{ duration:0.6, ease:'easeOut' }}
    />
  );
}

// ─── Team card ───────────────────────────────────────────────────────────────
function TeamCard({ team, soldPlayers, maleCap, femaleCap, isHighest, isBidFlashing, side, idx }: {
  team: any; soldPlayers: any[]; maleCap:number; femaleCap:number;
  isHighest:boolean; isBidFlashing:boolean; side:'left'|'right'; idx:number;
}) {
  const teamPlayers = soldPlayers.filter(p => p.team_id === team.id);
  const totalPlayers = team.boys_count + team.girls_count;
  const totalCap = maleCap + femaleCap;
  const isLocked = totalPlayers >= totalCap;

  return (
    <motion.div
      initial={{ opacity:0, x: side==='left' ? -30 : 30 }}
      animate={{ opacity: isLocked ? 0.4 : 1, x:0 }}
      transition={{ delay: idx * 0.1 }}
      className={`p-4 rounded-xl border transition-all ${
        isHighest
          ? 'bg-[hsl(217,91%,60%)]/10 border-[hsl(217,91%,60%)]/40'
          : 'bg-[hsl(215,25%,15%)] border-transparent'
      }`}
      style={isBidFlashing
        ? { boxShadow:'0 0 0 2px hsl(217,91%,60%), 0 0 30px hsl(217,91%,60%,0.4)' }
        : isHighest
        ? { boxShadow:'0 0 20px hsl(217,91%,60%,0.2)' }
        : {}}
    >
      <div className="flex items-center justify-between mb-1">
        <span className="font-bold text-sm truncate">{team.name}</span>
        <div className="flex gap-1 items-center shrink-0">
          {isBidFlashing && (
            <motion.span initial={{scale:0}} animate={{scale:[1.4,1]}}
              className="text-[10px] bg-[hsl(217,91%,60%)] text-white px-1.5 py-0.5 rounded-full font-bold">
              BID!
            </motion.span>
          )}
          {isLocked && <span className="text-xs">🔒</span>}
        </div>
      </div>
      <motion.p
        key={team.purse_balance} initial={{scale:1.1}} animate={{scale:1}}
        className="text-xl font-mono font-bold tabular-nums text-[hsl(217,91%,60%)]"
      >
        ₹{team.purse_balance.toLocaleString()}
      </motion.p>
      <div className="mt-1 flex gap-2 text-[11px] text-[hsl(215,20%,65%)]">
        <span>B: {team.boys_count}/{maleCap}</span>
        <span>G: {team.girls_count}/{femaleCap}</span>
      </div>
      <div className="mt-1.5 h-1 rounded-full bg-[hsl(215,25%,22%)] overflow-hidden">
        <motion.div className="h-full rounded-full bg-[hsl(217,91%,60%)]"
          animate={{ width:`${(totalPlayers/Math.max(totalCap,1))*100}%` }}
          transition={{ duration:0.6, ease:'easeOut' }}
        />
      </div>
      {teamPlayers.length > 0 && (
        <div className="mt-2 space-y-0.5 max-h-[150px] overflow-y-auto scrollbar-hide">
          <AnimatePresence>
            {teamPlayers.map(p => (
              <motion.p key={p.id} initial={{opacity:0,x:-10}} animate={{opacity:1,x:0}} exit={{opacity:0}}
                className="text-[11px] text-[hsl(215,20%,65%)] truncate">
                {p.name} <span className="text-[hsl(217,91%,60%)]">₹{p.current_highest_bid}</span>
              </motion.p>
            ))}
          </AnimatePresence>
        </div>
      )}
    </motion.div>
  );
}

// ─── Main ────────────────────────────────────────────────────────────────────
export default function LiveProjector() {
  const { id: auctionId } = useParams<{ id: string }>();
  const { auction, teams, currentPlayer, recentBids, allPlayers } = useAuctionRealtime(auctionId);
  const previewLeft = usePreviewCountdown((auction as any)?.preview_ends_at);
  const secondsLeft = useCountdown(auction?.timer_ends_at);
  const isPreviewPhase = previewLeft !== null && previewLeft > 0;
  const biddingSecondsLeft = isPreviewPhase ? null : secondsLeft;
  const { playSwoosh, playTick, playGavel } = useSound();
  const { playBidPlaced, playNewHighestBidder, playFinalThree, playFanfare, playNewPlayer, playUnsold } = useSynth();

  const [soldOverlay, setSoldOverlay]       = useState<{playerName:string;teamName:string;amount:number}|null>(null);
  const [particles, setParticles]           = useState<{id:number;x:number;y:number;color:string}[]>([]);
  const [flyingBids, setFlyingBids]         = useState<{id:number;amount:number}[]>([]);
  const [edgeFlash, setEdgeFlash]           = useState<{key:number;color:string}|null>(null);
  const [bidFlashTeamId, setBidFlashTeamId] = useState<string|null>(null);
  const [timerShake, setTimerShake]         = useState(false);
  const [showBidHistory, setShowBidHistory] = useState(false);

  const prevPlayerIdRef      = useRef<string|null>(null);
  const prevBidRef           = useRef<number|null>(null);
  const prevHighestBidderRef = useRef<string|null>(null);
  const tickedRef            = useRef<number|null>(null);
  const particleIdRef        = useRef(0);
  const flyingBidIdRef       = useRef(0);
  const flashKeyRef          = useRef(0);

  const highestBidderTeam = teams.find(t => t.id === currentPlayer?.current_highest_bidder_id);
  const soldPlayers       = allPlayers.filter(p => p.status === 'sold');
  const teamCount         = teams.length || 1;
  const malePool          = allPlayers.filter(p => p.gender === 'Male').length;
  const femalePool        = allPlayers.filter(p => p.gender === 'Female').length;
  const maleCap           = Math.ceil(malePool / teamCount);
  const femaleCap         = Math.ceil(femalePool / teamCount);

  const leftTeams  = teams.slice(0, 2);
  const rightTeams = teams.slice(2, 4);

  const flash = useCallback((color: string) =>
    setEdgeFlash({ key: flashKeyRef.current++, color }), []);

  const spawnParticles = useCallback((count=12, colors=['hsl(217,91%,60%)','hsl(142,71%,45%)','#fff']) => {
    setParticles(prev => [...prev, ...Array.from({length:count}, ()=>({
      id: particleIdRef.current++,
      x: window.innerWidth * (0.25 + Math.random() * 0.5),
      y: window.innerHeight * (0.3 + Math.random() * 0.3),
      color: colors[Math.floor(Math.random() * colors.length)],
    }))]);
  }, []);

  useEffect(() => {
    if (currentPlayer && currentPlayer.id !== prevPlayerIdRef.current) {
      playSwoosh(); playNewPlayer();
      spawnParticles(8, ['hsl(217,91%,60%)','hsl(280,80%,70%)','#fff']);
      flash('rgba(59,130,246,0.35)');
      prevPlayerIdRef.current = currentPlayer.id;
      prevBidRef.current = currentPlayer.current_highest_bid;
      prevHighestBidderRef.current = currentPlayer.current_highest_bidder_id ?? null;
    }
    if (!currentPlayer && prevPlayerIdRef.current) {
      const prev = allPlayers.find(p => p.id === prevPlayerIdRef.current);
      if (prev?.status === 'sold') {
        playGavel(); playFanfare();
        const team = teams.find(t => t.id === prev.team_id);
        setSoldOverlay({ playerName:prev.name, teamName:team?.name||'?', amount:prev.current_highest_bid||0 });
        confetti({ particleCount:120, spread:100, origin:{y:0.6} });
        setTimeout(() => confetti({ particleCount:80, spread:120, origin:{y:0.5,x:0.2}, angle:60 }), 300);
        setTimeout(() => confetti({ particleCount:80, spread:120, origin:{y:0.5,x:0.8}, angle:120 }), 600);
        setTimeout(() => setSoldOverlay(null), 4000);
        flash('rgba(34,197,94,0.5)');
        spawnParticles(20, ['hsl(142,71%,45%)','gold','#fff']);
      } else if (prev?.status === 'unsold') {
        playUnsold(); flash('rgba(239,68,68,0.35)');
      }
      prevPlayerIdRef.current = null;
    }
  }, [currentPlayer, allPlayers]);

  useEffect(() => {
    if (!currentPlayer) return;
    const newBid    = currentPlayer.current_highest_bid;
    const newBidder = currentPlayer.current_highest_bidder_id;
    if (newBid && prevBidRef.current !== null && newBid !== prevBidRef.current) {
      const delta = newBid - (prevBidRef.current ?? 0);
      playBidPlaced();
      spawnParticles(10, ['hsl(217,91%,60%)','hsl(60,100%,70%)','#fff']);
      flash('rgba(59,130,246,0.25)');
      if (delta > 0) setFlyingBids(prev => [...prev, { id:flyingBidIdRef.current++, amount:delta }]);
      if (newBidder && newBidder !== prevHighestBidderRef.current) {
        playNewHighestBidder();
        setBidFlashTeamId(newBidder);
        setTimeout(() => setBidFlashTeamId(null), 800);
      }
    }
    prevBidRef.current = newBid ?? null;
    prevHighestBidderRef.current = newBidder ?? null;
  }, [currentPlayer?.current_highest_bid, currentPlayer?.current_highest_bidder_id]);

  useEffect(() => {
    if (biddingSecondsLeft !== null && biddingSecondsLeft <= 5 && biddingSecondsLeft > 0 && tickedRef.current !== biddingSecondsLeft) {
      tickedRef.current = biddingSecondsLeft;
      playTick();
      if (biddingSecondsLeft <= 3) {
        playFinalThree();
        setTimerShake(true);
        setTimeout(() => setTimerShake(false), 400);
        flash('rgba(239,68,68,0.3)');
        spawnParticles(6, ['hsl(0,84%,60%)','hsl(30,100%,60%)']);
      }
    }
    if (biddingSecondsLeft === null || biddingSecondsLeft > 5) tickedRef.current = null;
  }, [biddingSecondsLeft]);

  const urgency = biddingSecondsLeft !== null && biddingSecondsLeft <= 5;

  return (
    <div className="dark min-h-screen bg-[hsl(222,47%,11%)] text-[hsl(210,40%,98%)] flex overflow-hidden relative">

      {/* Ambient orbs */}
      <AmbientOrb delay={0}   x="10%" y="20%" size={400} color="hsl(217,91%,50%)" />
      <AmbientOrb delay={3}   x="50%" y="60%" size={500} color="hsl(280,70%,50%)" />
      <AmbientOrb delay={1.5} x="80%" y="10%" size={300} color="hsl(142,71%,40%)" />
      {urgency && <AmbientOrb delay={0} x="30%" y="40%" size={600} color="hsl(0,84%,50%)" />}

      {/* Scanlines */}
      <div className="absolute inset-0 pointer-events-none z-10"
        style={{ background:'repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(0,0,0,0.04) 2px,rgba(0,0,0,0.04) 4px)' }}
      />

      {/* Edge flash */}
      <AnimatePresence>
        {edgeFlash && <EdgeFlash key={edgeFlash.key} color={edgeFlash.color} />}
      </AnimatePresence>

      {/* Particles */}
      {particles.map(p => (
        <Particle key={p.id} x={p.x} y={p.y} color={p.color}
          onDone={() => setParticles(prev => prev.filter(x => x.id !== p.id))}
        />
      ))}

      {/* Flying bids */}
      <div className="absolute inset-0 pointer-events-none z-30 flex items-center justify-center">
        <div className="relative w-full h-full">
          {flyingBids.map(fb => (
            <FlyingBid key={fb.id} amount={fb.amount}
              onDone={() => setFlyingBids(prev => prev.filter(x => x.id !== fb.id))}
            />
          ))}
        </div>
      </div>

      {/* SOLD overlay */}
      <AnimatePresence>
        {soldOverlay && (
          <motion.div
            initial={{opacity:0,scale:0.5}} animate={{opacity:1,scale:1}} exit={{opacity:0,scale:0.8}}
            className="absolute inset-0 z-50 flex items-center justify-center bg-[hsl(222,47%,11%)]/90 backdrop-blur-lg"
          >
            <PulseRing color="hsl(142,71%,45%)" delay={0} />
            <PulseRing color="hsl(142,71%,45%)" delay={0.6} />
            <PulseRing color="hsl(142,71%,45%)" delay={1.2} />
            <div className="text-center relative z-10">
              <motion.div
                initial={{rotate:-10,scale:0}} animate={{rotate:0,scale:1}}
                transition={{type:'spring',stiffness:200,damping:15}}
                className="inline-block px-12 py-8 rounded-3xl border-4 border-[hsl(142,71%,45%)] bg-[hsl(142,71%,45%)]/10"
                style={{boxShadow:'0 0 60px hsl(142,71%,45%,0.4),0 0 120px hsl(142,71%,45%,0.2)'}}
              >
                <motion.p className="text-3xl font-bold text-[hsl(142,71%,45%)] uppercase tracking-widest mb-4"
                  animate={{scale:[1,1.08,1]}} transition={{duration:0.5,repeat:Infinity}}>SOLD!</motion.p>
                <p className="text-6xl font-black mb-2">{soldOverlay.playerName}</p>
                <motion.p className="text-4xl font-mono tabular-nums text-[hsl(217,91%,60%)]"
                  initial={{opacity:0,y:20}} animate={{opacity:1,y:0}} transition={{delay:0.3}}>
                  ₹{soldOverlay.amount.toLocaleString()}
                </motion.p>
                <motion.p className="text-2xl mt-4 text-[hsl(210,40%,98%)]/80"
                  initial={{opacity:0}} animate={{opacity:1}} transition={{delay:0.5}}>
                  → {soldOverlay.teamName}
                </motion.p>
              </motion.div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ══ LEFT TEAMS (teams[0] & teams[1]) ══ */}
      <div className="w-[22%] min-w-[190px] border-r border-[hsl(215,25%,22%)] p-4 flex flex-col gap-3 overflow-y-auto scrollbar-hide z-10">
        <h3 className="text-[11px] font-semibold uppercase tracking-widest text-[hsl(215,20%,55%)] mb-1">Franchises</h3>
        {leftTeams.map((team, i) => (
          <TeamCard key={team.id} team={team} soldPlayers={soldPlayers}
            maleCap={maleCap} femaleCap={femaleCap} side="left" idx={i}
            isHighest={team.id === currentPlayer?.current_highest_bidder_id}
            isBidFlashing={team.id === bidFlashTeamId}
          />
        ))}
      </div>

      {/* ══ CENTER STAGE ══ */}
      <div className="flex-1 flex flex-col items-center justify-center p-6 relative z-10 min-w-0">
        <AnimatePresence mode="wait">
          {currentPlayer ? (
            <motion.div key={currentPlayer.id}
              initial={{opacity:0,y:60,scale:0.9}} animate={{opacity:1,y:0,scale:1}}
              exit={{opacity:0,y:-40,scale:0.95}} transition={{type:'spring',stiffness:300,damping:25}}
              className="text-center w-full"
            >
              {/* Avatar */}
              <PlayerAvatar
                photoUrl={currentPlayer.photo_url}
                gender={currentPlayer.gender}
                name={currentPlayer.name}
                size="xl"
                className="mx-auto mb-4"
              />

              {/* Badge */}
              <motion.div initial={{opacity:0,x:-30}} animate={{opacity:1,x:0}} transition={{delay:0.2}} className="mb-3">
                <motion.span
                  className="inline-block px-4 py-1 rounded-full text-sm font-medium bg-[hsl(217,91%,60%)]/20 text-[hsl(217,91%,60%)]"
                  animate={{boxShadow:['0 0 0px transparent','0 0 16px hsl(217,91%,60%,0.5)','0 0 0px transparent']}}
                  transition={{duration:2,repeat:Infinity}}
                >
                  {currentPlayer.gender} · {currentPlayer.skill_tier || 'Untiered'}
                </motion.span>
              </motion.div>

              {/* Name */}
              <motion.h1 initial={{opacity:0,y:20}} animate={{opacity:1,y:0}} transition={{delay:0.1}}
                className="font-black leading-none tracking-tighter mb-4"
                style={{ fontSize:'clamp(2rem,6vw,5rem)', textShadow:'0 0 40px rgba(255,255,255,0.15)' }}>
                {currentPlayer.name}
              </motion.h1>

              {/* Amount */}
              <div className="mb-5">
                <p className="text-sm text-[hsl(215,20%,65%)] mb-1 uppercase tracking-wider">
                  {currentPlayer.current_highest_bid ? 'Current Bid' : 'Base Price'}
                </p>
                <motion.p
                  key={currentPlayer.current_highest_bid || currentPlayer.base_price}
                  initial={{scale:1.4,opacity:0,y:-20}} animate={{scale:1,opacity:1,y:0}}
                  transition={{type:'spring',stiffness:400,damping:20}}
                  className="font-black leading-none tracking-tighter font-mono tabular-nums"
                  style={{
                    fontSize: 'clamp(2.5rem,10vw,8rem)',
                    textShadow: urgency
                      ? '0 0 60px hsl(0,84%,60%),0 0 30px hsl(0,84%,60%)'
                      : '0 0 40px hsl(217,91%,60%,0.4)',
                    color: urgency ? 'hsl(0,84%,60%)' : undefined,
                    transition:'color 0.5s,text-shadow 0.5s',
                  }}
                >
                  ₹{(currentPlayer.current_highest_bid || currentPlayer.base_price).toLocaleString()}
                </motion.p>
                {highestBidderTeam && (
                  <motion.p key={highestBidderTeam.id}
                    initial={{opacity:0,y:10,scale:0.9}} animate={{opacity:1,y:0,scale:1}}
                    className="text-lg mt-2 text-[hsl(217,91%,60%)] font-bold"
                    style={{textShadow:'0 0 20px hsl(217,91%,60%,0.6)'}}>
                    {highestBidderTeam.name}
                  </motion.p>
                )}
              </div>

              {/* Preview Phase */}
              {isPreviewPhase && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="inline-flex flex-col items-center justify-center px-10 py-5 rounded-2xl backdrop-blur-xl border bg-[hsl(280,80%,60%)]/10 border-[hsl(280,80%,60%)]/30"
                >
                  <p className="text-sm uppercase tracking-widest text-[hsl(280,80%,70%)] font-bold mb-1">Preview Phase</p>
                  <motion.span
                    key={previewLeft}
                    initial={{ scale: 1.2 }}
                    animate={{ scale: 1 }}
                    className="font-mono tabular-nums text-[hsl(280,80%,70%)]"
                    style={{ fontSize: 'clamp(2rem,5vw,4rem)' }}
                  >
                    {previewLeft}s
                  </motion.span>
                  <p className="text-xs text-[hsl(280,80%,60%)] mt-1">Bidding starts soon…</p>
                </motion.div>
              )}

              {/* Bidding Timer */}
              {!isPreviewPhase && biddingSecondsLeft !== null && (
                <motion.div key={biddingSecondsLeft}
                  initial={{scale:1.15}}
                  animate={timerShake ? {scale:1,x:[0,-8,8,-6,6,0]} : {scale:1}}
                  transition={timerShake ? {duration:0.35} : {}}
                  className={`inline-flex items-center justify-center font-mono tabular-nums px-8 py-4 rounded-2xl backdrop-blur-xl border transition-all ${
                    biddingSecondsLeft<=3
                      ? 'bg-[hsl(0,84%,60%)]/15 border-[hsl(0,84%,60%)]/50 text-[hsl(0,84%,60%)]'
                      : biddingSecondsLeft<=5
                      ? 'bg-[hsl(30,100%,60%)]/10 border-[hsl(30,100%,60%)]/30 text-[hsl(30,100%,60%)]'
                      : 'bg-[hsl(210,40%,98%)]/5 border-[hsl(210,40%,98%)]/10'
                  }`}
                  style={{
                    fontSize:'clamp(2.5rem,6vw,5rem)',
                    ...(biddingSecondsLeft<=3 ? {boxShadow:'0 0 30px hsl(0,84%,60%,0.3),inset 0 0 20px hsl(0,84%,60%,0.1)'} : {})
                  }}
                >
                  {biddingSecondsLeft}s
                </motion.div>
              )}
            </motion.div>
          ) : (
            <motion.div initial={{opacity:0}} animate={{opacity:1}} className="text-center">
              <motion.h2 className="text-3xl font-bold text-[hsl(215,20%,65%)]"
                animate={{opacity:[0.5,1,0.5]}} transition={{duration:2.5,repeat:Infinity}}>
                {auction?.status==='completed' ? '🏆 Auction Complete!'
                  : auction?.status==='live' ? 'Waiting for next player…'
                  : 'Auction not started'}
              </motion.h2>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Bid History button */}
        <button
          onClick={() => setShowBidHistory(true)}
          className="absolute bottom-5 right-5 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-[hsl(215,25%,20%)] hover:bg-[hsl(215,25%,26%)] border border-[hsl(215,25%,30%)] text-[hsl(215,20%,70%)] hover:text-white transition-colors z-20"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/>
          </svg>
          Bid History
        </button>
      </div>

      {/* ══ RIGHT TEAMS (teams[2] & teams[3]) ══ */}
      <div className="w-[22%] min-w-[190px] border-l border-[hsl(215,25%,22%)] p-4 flex flex-col gap-3 overflow-y-auto scrollbar-hide z-10">
        <h3 className="text-[11px] font-semibold uppercase tracking-widest text-[hsl(215,20%,55%)] mb-1">Franchises</h3>
        {rightTeams.map((team, i) => (
          <TeamCard key={team.id} team={team} soldPlayers={soldPlayers}
            maleCap={maleCap} femaleCap={femaleCap} side="right" idx={i}
            isHighest={team.id === currentPlayer?.current_highest_bidder_id}
            isBidFlashing={team.id === bidFlashTeamId}
          />
        ))}
      </div>

      {/* ══ BID HISTORY POPUP ══ */}
      <AnimatePresence>
        {showBidHistory && (
          <>
            <motion.div
              className="absolute inset-0 z-40 bg-black/60 backdrop-blur-sm"
              initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}}
              onClick={() => setShowBidHistory(false)}
            />
            <motion.div
              className="absolute z-50 left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] max-w-[90vw] rounded-2xl border border-[hsl(215,25%,25%)] bg-[hsl(222,47%,13%)] shadow-2xl overflow-hidden"
              initial={{opacity:0,scale:0.9,y:20}} animate={{opacity:1,scale:1,y:0}}
              exit={{opacity:0,scale:0.92,y:10}} transition={{type:'spring',stiffness:340,damping:28}}
            >
              <div className="flex items-center justify-between px-5 py-4 border-b border-[hsl(215,25%,22%)]">
                <div>
                  <h3 className="font-bold text-base">Bid History</h3>
                  <p className="text-xs text-[hsl(215,20%,55%)] mt-0.5">{recentBids.length} bids recorded</p>
                </div>
                <button
                  onClick={() => setShowBidHistory(false)}
                  className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-[hsl(215,25%,22%)] text-[hsl(215,20%,65%)] hover:text-white transition-colors"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                  </svg>
                </button>
              </div>
              <div className="max-h-[55vh] overflow-y-auto scrollbar-hide p-3 space-y-0.5">
                {recentBids.length === 0 ? (
                  <p className="text-center text-sm text-[hsl(215,20%,50%)] py-10">No bids yet</p>
                ) : (
                  <AnimatePresence initial={false}>
                    {recentBids.map((bid, i) => {
                      const team = teams.find(t => t.id === bid.team_id);
                      return (
                        <motion.div key={bid.id}
                          initial={{opacity:0,x:20,backgroundColor:'hsl(217,91%,60%,0.12)'}}
                          animate={{opacity:1,x:0,backgroundColor:'transparent'}}
                          transition={{delay:i*0.02}}
                          className="flex items-center justify-between px-3 py-2 rounded-lg"
                        >
                          <div className="flex items-center gap-2.5">
                            <div className="w-1.5 h-1.5 rounded-full bg-[hsl(217,91%,60%)] shrink-0" />
                            <span className="text-sm text-[hsl(215,20%,75%)]">{team?.name || '?'}</span>
                          </div>
                          <span className="font-mono tabular-nums text-sm font-semibold">
                            ₹{bid.amount.toLocaleString()}
                          </span>
                        </motion.div>
                      );
                    })}
                  </AnimatePresence>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
