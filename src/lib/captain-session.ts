// Captain session persistence — supports multiple auctions
const CAPTAIN_SESSIONS_KEY = 'auction_captain_sessions';

export interface CaptainSession {
  teamId: string;
  auctionId: string;
  teamName: string;
  captainName: string;
}

export function getAllCaptainSessions(): CaptainSession[] {
  const raw = localStorage.getItem(CAPTAIN_SESSIONS_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [parsed]; // migrate old format
  } catch {
    return [];
  }
}

export function getCaptainSession(auctionId?: string): CaptainSession | null {
  const sessions = getAllCaptainSessions();
  if (auctionId) return sessions.find(s => s.auctionId === auctionId) || null;
  return sessions[0] || null;
}

export function saveCaptainSession(session: CaptainSession) {
  const sessions = getAllCaptainSessions().filter(s => s.auctionId !== session.auctionId);
  sessions.push(session);
  localStorage.setItem(CAPTAIN_SESSIONS_KEY, JSON.stringify(sessions));
}

export function clearCaptainSession(auctionId: string) {
  const sessions = getAllCaptainSessions().filter(s => s.auctionId !== auctionId);
  localStorage.setItem(CAPTAIN_SESSIONS_KEY, JSON.stringify(sessions));
}

export function generateJoinCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 5; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}
