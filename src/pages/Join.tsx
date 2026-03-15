import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { saveCaptainSession, getCaptainSession } from '@/lib/captain-session';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Users } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useEffect } from 'react';

export default function JoinPage() {
  const [joinCode, setJoinCode] = useState('');
  const [firstName, setFirstName] = useState('');
  const [teamName, setTeamName] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  // Check for existing session
  useEffect(() => {
    const session = getCaptainSession();
    if (session) {
      navigate(`/auction/${session.auctionId}/bid`);
    }
  }, [navigate]);

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      // Find auction by join code
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

      // Create team entry
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

      // Persist session
      saveCaptainSession({
        teamId: team.id,
        auctionId: auction.id,
        teamName: finalTeamName,
        captainName: firstName.trim(),
      });

      navigate(`/auction/${auction.id}/bid`);
    } catch {
      toast({ title: 'Error', description: 'Something went wrong.', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md stadium-shadow">
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
  );
}
