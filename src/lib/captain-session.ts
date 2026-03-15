// Captain session persistence
const CAPTAIN_SESSION_KEY = 'auction_captain_session';

export interface CaptainSession {
  teamId: string;
  auctionId: string;
  teamName: string;
  captainName: string;
}

export function saveCaptainSession(session: CaptainSession) {
  localStorage.setItem(CAPTAIN_SESSION_KEY, JSON.stringify(session));
}

export function getCaptainSession(): CaptainSession | null {
  const raw = localStorage.getItem(CAPTAIN_SESSION_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function clearCaptainSession() {
  localStorage.removeItem(CAPTAIN_SESSION_KEY);
}

// Generate a 5-char join code
export function generateJoinCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 5; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}
