import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/use-auth';
import { supabase } from '@/integrations/supabase/client';
import { generateJoinCode } from '@/lib/captain-session';
import { AdminNavbar } from '@/components/AdminNavbar';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Plus, Settings, Monitor } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import type { Database } from '@/integrations/supabase/types';

type Auction = Database['public']['Tables']['auctions']['Row'];

export default function DashboardPage() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [auctions, setAuctions] = useState<Auction[]>([]);
  const [newTitle, setNewTitle] = useState('');
  const [newBudget, setNewBudget] = useState(10000);
  const [newBiddingDuration, setNewBiddingDuration] = useState(30);
  const [creating, setCreating] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) navigate('/login');
  }, [user, authLoading, navigate]);

  useEffect(() => {
    if (!user) return;
    supabase
      .from('auctions')
      .select('*')
      .eq('admin_id', user.id)
      .order('created_at', { ascending: false })
      .then(({ data }) => setAuctions(data || []));
  }, [user]);

  const createAuction = async () => {
    if (!user || !newTitle.trim()) return;
    setCreating(true);
    const { data, error } = await supabase
      .from('auctions')
      .insert({
        title: newTitle.trim(),
        join_code: generateJoinCode(),
        budget_per_team: newBudget,
        admin_id: user.id,
      } as any)
      .select()
      .single();

    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else if (data) {
      setAuctions(prev => [data, ...prev]);
      setDialogOpen(false);
      setNewTitle('');
      navigate(`/auction/${data.id}/setup`);
    }
    setCreating(false);
  };

  if (authLoading) return <div className="flex min-h-screen items-center justify-center">Loading...</div>;

  return (
    <div className="min-h-screen bg-background">
      <AdminNavbar />
      <main className="container py-8">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold">Your Auctions</h2>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="mr-2 h-4 w-4" /> Create New Auction</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Create Auction</DialogTitle></DialogHeader>
              <div className="space-y-4 pt-2">
                <div className="space-y-2">
                  <Label>Event Name</Label>
                  <Input value={newTitle} onChange={e => setNewTitle(e.target.value)} placeholder="Spring Draft 2026" />
                </div>
                <div className="space-y-2">
                  <Label>Default Team Budget</Label>
                  <Input type="number" value={newBudget} onChange={e => setNewBudget(Number(e.target.value))} />
                </div>
                <Button onClick={createAuction} disabled={creating || !newTitle.trim()} className="w-full">
                  {creating ? 'Creating...' : 'Initialize'}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
        {auctions.length === 0 ? (
          <div className="text-center py-20 text-muted-foreground">
            <p>No auctions yet. Create one to get started.</p>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {auctions.map(a => (
              <Card key={a.id} className="stadium-shadow">
                <CardHeader>
                  <CardTitle className="text-lg">{a.title}</CardTitle>
                  <p className="text-sm text-muted-foreground">
                    Code: <span className="font-mono font-bold text-foreground">{a.join_code}</span>
                    {' · '}
                    <span className={a.status === 'live' ? 'text-success' : a.status === 'completed' ? 'text-muted-foreground' : ''}>{a.status}</span>
                  </p>
                </CardHeader>
                <CardContent className="flex gap-2 flex-wrap">
                  <Button size="sm" variant="outline" onClick={() => navigate(`/auction/${a.id}/setup`)}>
                    <Settings className="mr-1 h-3 w-3" /> Setup
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => navigate(`/auction/${a.id}/admin`)}>
                    <Monitor className="mr-1 h-3 w-3" /> Control
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => navigate(`/auction/${a.id}/live`)}>
                    <Monitor className="mr-1 h-3 w-3" /> Live
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => navigate(`/auction/${a.id}/rosters`)}>
                    Rosters
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
