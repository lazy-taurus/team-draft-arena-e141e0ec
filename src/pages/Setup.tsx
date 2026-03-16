import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/use-auth';
import { supabase } from '@/integrations/supabase/client';
import { AdminNavbar } from '@/components/AdminNavbar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Upload, Plus, Rocket, Trash2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import Papa from 'papaparse';
import type { Database } from '@/integrations/supabase/types';

type Player = Database['public']['Tables']['players']['Row'];
type Team = Database['public']['Tables']['teams']['Row'];
type Auction = Database['public']['Tables']['auctions']['Row'];

export default function SetupPage() {
  const { id: auctionId } = useParams<{ id: string }>();
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [auction, setAuction] = useState<Auction | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [newPlayerName, setNewPlayerName] = useState('');
  const [newPlayerGender, setNewPlayerGender] = useState<'Male' | 'Female'>('Male');
  const [newPlayerTier, setNewPlayerTier] = useState('');
  const [newPlayerPrice, setNewPlayerPrice] = useState(200);

  const fetchData = useCallback(async () => {
    if (!auctionId) return;
    const [aRes, pRes, tRes] = await Promise.all([
      supabase.from('auctions').select('*').eq('id', auctionId).single(),
      supabase.from('players').select('*').eq('auction_id', auctionId).order('name'),
      supabase.from('teams').select('*').eq('auction_id', auctionId),
    ]);
    setAuction(aRes.data);
    setPlayers(pRes.data || []);
    setTeams(tRes.data || []);
  }, [auctionId]);

  useEffect(() => {
    if (!authLoading && !user) navigate('/login');
  }, [user, authLoading, navigate]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleCSVUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !auctionId) return;

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h: string) => h.trim(),
      complete: async (results) => {
        const rows = results.data as Record<string, string>[];
        const inserts = rows.map(row => {
          const name = row['Name'] || row['name'] || row['Player Name'] || row['player_name'] || '';
          const gender = row['Gender'] || row['gender'] || row['Category'] || row['category'] || 'Male';
          const tier = row['Skill Tier'] || row['skill_tier'] || row['Tier'] || row['tier'] || '';
          const price = parseInt(row['Base Price'] || row['base_price'] || row['Price'] || row['price'] || '200') || 200;
          return {
            auction_id: auctionId,
            name: name.trim(),
            gender: (gender.trim() === 'Female' ? 'Female' : 'Male') as 'Male' | 'Female',
            skill_tier: tier.trim() || null,
            base_price: price,
          };
        }).filter(p => p.name);

        if (inserts.length === 0) {
          toast({ title: 'No valid rows', description: 'Check your CSV columns.', variant: 'destructive' });
          return;
        }

        const { error } = await supabase.from('players').insert(inserts);
        if (error) {
          toast({ title: 'Upload Error', description: error.message, variant: 'destructive' });
        } else {
          toast({ title: 'Success', description: `${inserts.length} players added to pool.` });
          fetchData();
        }
      },
      error: (err) => {
        toast({ title: 'Parse Error', description: err.message, variant: 'destructive' });
      },
    });
    // Reset input
    e.target.value = '';
  };

  const addPlayer = async () => {
    if (!auctionId || !newPlayerName.trim()) return;
    const { error } = await supabase.from('players').insert({
      auction_id: auctionId,
      name: newPlayerName.trim(),
      gender: newPlayerGender,
      skill_tier: newPlayerTier || null,
      base_price: newPlayerPrice,
    });
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      setNewPlayerName('');
      setNewPlayerTier('');
      setNewPlayerPrice(200);
      fetchData();
    }
  };

  const deletePlayer = async (id: string) => {
    const { error } = await supabase.from('players').delete().eq('id', id);
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      fetchData();
    }
  };

  const goLive = async () => {
    if (!auctionId) return;
    await supabase.from('auctions').update({ status: 'live' }).eq('id', auctionId);
    navigate(`/auction/${auctionId}/admin`);
  };

  if (!auction) return <div className="flex min-h-screen items-center justify-center">Loading...</div>;

  return (
    <div className="min-h-screen bg-background">
      <AdminNavbar />
      <header className="border-b border-border px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold">{auction.title}</h1>
          <p className="text-sm text-muted-foreground">Code: <span className="font-mono font-bold">{auction.join_code}</span></p>
        </div>
        <Button onClick={goLive} className="bg-success hover:bg-success/90 text-success-foreground">
          <Rocket className="mr-2 h-4 w-4" /> Initialize Live Auction
        </Button>
      </header>

      <main className="container py-6">
        <Tabs defaultValue="players">
          <TabsList>
            <TabsTrigger value="teams">Teams ({teams.length})</TabsTrigger>
            <TabsTrigger value="players">Player Pool ({players.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="teams" className="mt-4">
            <div className="grid gap-4 md:grid-cols-2">
              {teams.map(t => (
                <Card key={t.id}>
                  <CardHeader>
                    <CardTitle className="text-base">{t.name}</CardTitle>
                    <p className="text-sm text-muted-foreground">Captain: {t.captain_name} · Budget: ₹{t.purse_balance.toLocaleString()}</p>
                  </CardHeader>
                </Card>
              ))}
              {teams.length === 0 && (
                <p className="text-muted-foreground col-span-2 text-center py-8">
                  Teams will appear here when captains join using code <span className="font-mono font-bold">{auction.join_code}</span>
                </p>
              )}
            </div>
          </TabsContent>

          <TabsContent value="players" className="mt-4 space-y-6">
            <Card>
              <CardContent className="pt-6">
                <label className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-border p-8 cursor-pointer hover:border-primary transition-colors">
                  <Upload className="h-8 w-8 text-muted-foreground mb-2" />
                  <span className="text-sm text-muted-foreground">Drop CSV file or click to upload</span>
                  <span className="text-xs text-muted-foreground mt-1">Columns: Name, Gender, Skill Tier, Base Price</span>
                  <input type="file" accept=".csv" onChange={handleCSVUpload} className="hidden" />
                </label>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-base">Add Player Manually</CardTitle></CardHeader>
              <CardContent>
                <div className="grid gap-3 md:grid-cols-5 items-end">
                  <div className="space-y-1">
                    <Label className="text-xs">Name</Label>
                    <Input value={newPlayerName} onChange={e => setNewPlayerName(e.target.value)} placeholder="Player name" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Gender</Label>
                    <select value={newPlayerGender} onChange={e => setNewPlayerGender(e.target.value as 'Male' | 'Female')} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                      <option value="Male">Male</option>
                      <option value="Female">Female</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Skill Tier</Label>
                    <Input value={newPlayerTier} onChange={e => setNewPlayerTier(e.target.value)} placeholder="e.g. Gold" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Base Price</Label>
                    <Input type="number" value={newPlayerPrice} onChange={e => setNewPlayerPrice(Number(e.target.value))} />
                  </div>
                  <Button onClick={addPlayer} disabled={!newPlayerName.trim()}>
                    <Plus className="mr-1 h-4 w-4" /> Add
                  </Button>
                </div>
              </CardContent>
            </Card>

            {players.length > 0 && (
              <Card>
                <CardContent className="pt-4">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Gender</TableHead>
                        <TableHead>Tier</TableHead>
                        <TableHead>Base Price</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="w-10"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {players.map(p => (
                        <TableRow key={p.id}>
                          <TableCell className="font-medium">{p.name}</TableCell>
                          <TableCell>{p.gender}</TableCell>
                          <TableCell>{p.skill_tier || '—'}</TableCell>
                          <TableCell className="font-mono">₹{p.base_price}</TableCell>
                          <TableCell>{p.status}</TableCell>
                          <TableCell>
                            {p.status === 'available' && (
                              <Button size="icon" variant="ghost" onClick={() => deletePlayer(p.id)} className="h-8 w-8 text-destructive hover:text-destructive">
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
