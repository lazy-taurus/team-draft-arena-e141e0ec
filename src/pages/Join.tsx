import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { saveCaptainSession, getAllCaptainSessions, clearCaptainSession } from '@/lib/captain-session';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Users, ArrowRight, X } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export default function JoinPage() {
  const [joinCode, setJoinCode] = useState('');
  const [firstName, setFirstName] = useState('');
  const [teamName, setTeamName] = useState('');
  const [loading, setLoading] = useState(false);
  const [sessions, setSessions] = useState(getAllCaptainSessions());
  const navigate = useNavigate();
  const { toast } = useToast();

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { data: auction, error: auctionError } = await supabase
        .from('auctions')
        .select('*')
        .eq('join_code', joinCode.toUpperCase().trim())
        .single();

      if (auctionError || !auction) {
        toast({ title: 'Error', description: 'Invalid auction code.', variant: 'destructive' });
        setLoading(false);
        return;
      }

      const finalTeamName = teamName.trim() || `Team ${firstName.trim()}`;

      const { data: team, error: teamError } = await supabase
        .from('teams')
        .insert({
          auction_id: auction.id,
          name: finalTeamName,
          captain_name: firstName.trim(),
          purse_balance: auction.budget_per_team,
        })
        .select()
        .single();

      if (teamError || !team) {
        toast({ title: 'Error', description: 'Failed to join auction.', variant: 'destructive' });
        setLoading(false);
        return;
      }

      const session = {
        teamId: team.id,
        auctionId: auction.id,
        teamName: finalTeamName,
        captainName: firstName.trim(),
      };
      saveCaptainSession(session);
      navigate(`/auction/${auction.id}/bid`);
    } catch {
      toast({ title: 'Error', description: 'Something went wrong.', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const removeSession = (auctionId: string) => {
    clearCaptainSession(auctionId);
    setSessions(getAllCaptainSessions());
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-md space-y-4">
        {/* Previous sessions lobby */}
        {sessions.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Your Draft Rooms</CardTitle>
              <CardDescription>Rejoin a previous auction</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {sessions.map(s => (
                <div key={s.auctionId} className="flex items-center justify-between p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors">
                  <div>
                    <p className="font-medium text-sm">{s.teamName}</p>
                    <p className="text-xs text-muted-foreground">Captain: {s.captainName}</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button size="sm" onClick={() => navigate(`/auction/${s.auctionId}/bid`)}>
                      <ArrowRight className="h-4 w-4" />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => removeSession(s.auctionId)}>
                      <X className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Join new auction */}
        <Card className="stadium-shadow">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-primary">
              <Users className="h-6 w-6 text-primary-foreground" />
            </div>
            <CardTitle className="text-2xl font-bold">Join Draft Room</CardTitle>
            <CardDescription>Enter your auction code to begin</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleJoin} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="joinCode">Auction Code</Label>
                <Input
                  id="joinCode"
                  value={joinCode}
                  onChange={e => setJoinCode(e.target.value.toUpperCase())}
                  placeholder="e.g. AB3K9"
                  maxLength={5}
                  className="text-center text-lg font-mono tracking-widest uppercase"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="firstName">First Name</Label>
                <Input id="firstName" value={firstName} onChange={e => setFirstName(e.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="teamName">Team Name (optional)</Label>
                <Input id="teamName" value={teamName} onChange={e => setTeamName(e.target.value)} placeholder={firstName ? `Team ${firstName}` : 'Team Name'} />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? 'Joining...' : 'Enter Draft Room'}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
