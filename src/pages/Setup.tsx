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
import * as XLSX from 'xlsx';
import type { Database } from '@/integrations/supabase/types';

type Player  = Database['public']['Tables']['players']['Row'];
type Team    = Database['public']['Tables']['teams']['Row'];
type Auction = Database['public']['Tables']['auctions']['Row'];

const DEFAULT_BASE_PRICE = 100;
const FIXED_SKILL_TIER = 'player';

export default function SetupPage() {
  const { id: auctionId } = useParams<{ id: string }>();
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [auction, setAuction]           = useState<Auction | null>(null);
  const [players, setPlayers]           = useState<Player[]>([]);
  const [teams, setTeams]               = useState<Team[]>([]);
  const [newPlayerName, setNewPlayerName]   = useState('');
  const [newPlayerGender, setNewPlayerGender] = useState<'Male' | 'Female'>('Male');
  const [newPlayerBasePrice, setNewPlayerBasePrice] = useState(DEFAULT_BASE_PRICE);
  const [newPlayerPhoto, setNewPlayerPhoto] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

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

  // ── Shared insert helper ──────────────────────────────────────────────────
  const insertPlayers = async (rows: { name: string; gender: 'Male' | 'Female'; base_price?: number }[]) => {
    const inserts = rows
      .filter(r => r.name.trim())
      .map(r => ({
        auction_id:  auctionId!,
        name:        r.name.trim(),
        gender:      r.gender,
        skill_tier:  FIXED_SKILL_TIER,
        base_price:  r.base_price || DEFAULT_BASE_PRICE,
      }));

    if (inserts.length === 0) {
      toast({ title: 'No valid rows', description: 'Make sure the file has Name and Gender columns.', variant: 'destructive' });
      return;
    }

    const { error } = await supabase.from('players').insert(inserts);
    if (error) {
      toast({ title: 'Upload Error', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Success', description: `${inserts.length} players added to pool.` });
      fetchData();
    }
  };

  // ── Parse rows from a flat array of objects ───────────────────────────────
  const parseRows = (data: Record<string, string>[]) =>
    data.map(row => {
      const lower = Object.fromEntries(
        Object.entries(row).map(([k, v]) => [k.toLowerCase().trim(), String(v).trim()])
      );
      const get = (...keys: string[]) => keys.map(k => lower[k]).find(Boolean) ?? '';
      const name   = get('name', 'player name', 'player_name', 'full name', 'fullname');
      const gender = get('gender', 'category', 'sex') || 'Male';
      const priceStr = get('base_price', 'baseprice', 'base price', 'price');
      const base_price = priceStr ? parseInt(priceStr) || DEFAULT_BASE_PRICE : DEFAULT_BASE_PRICE;
      return {
        name,
        gender: (gender.trim() === 'Female' ? 'Female' : 'Male') as 'Male' | 'Female',
        base_price,
      };
    });

  // ── File upload handler (CSV + Excel) ─────────────────────────────────────
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !auctionId) return;
    e.target.value = '';

    const isExcel = /\.(xlsx|xls)$/i.test(file.name);

    if (isExcel) {
      const reader = new FileReader();
      reader.onload = (evt) => {
        try {
          const wb   = XLSX.read(evt.target?.result, { type: 'array' });
          const ws   = wb.Sheets[wb.SheetNames[0]];
          const rawData = XLSX.utils.sheet_to_json<Record<string, string>>(ws, { defval: '' });
          // Trim whitespace from header keys (e.g. "Name " → "Name")
          const data = rawData.map(row =>
            Object.fromEntries(Object.entries(row).map(([k, v]) => [k.trim(), v]))
          );
          insertPlayers(parseRows(data));
        } catch {
          toast({ title: 'Parse Error', description: 'Could not read the Excel file.', variant: 'destructive' });
        }
      };
      reader.readAsArrayBuffer(file);
    } else {
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        transformHeader: (h: string) => h.trim(),
        complete: (results) => {
          const trimmed = (results.data as Record<string, string>[]).map(row =>
            Object.fromEntries(Object.entries(row).map(([k, v]) => [k.trim(), v]))
          );
          insertPlayers(parseRows(trimmed));
        },
        error: (err) => toast({ title: 'Parse Error', description: err.message, variant: 'destructive' }),
      });
    }
  };

  // ── Add single player ─────────────────────────────────────────────────────
  const uploadPhoto = async (file: File): Promise<string | null> => {
    setUploading(true);
    const ext = file.name.split('.').pop();
    const path = `${auctionId}/${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from('player-photos').upload(path, file);
    setUploading(false);
    if (error) {
      toast({ title: 'Upload Error', description: error.message, variant: 'destructive' });
      return null;
    }
    const { data: { publicUrl } } = supabase.storage.from('player-photos').getPublicUrl(path);
    return publicUrl;
  };

  const addPlayer = async () => {
    if (!auctionId || !newPlayerName.trim()) return;
    let photoUrl: string | null = null;

    if (newPlayerPhoto) {
      photoUrl = await uploadPhoto(newPlayerPhoto);
      if (!photoUrl) return;
    }

    const { error } = await supabase.from('players').insert({
      auction_id: auctionId,
      name:       newPlayerName.trim(),
      gender:     newPlayerGender,
      skill_tier: FIXED_SKILL_TIER,
      base_price: newPlayerBasePrice,
      photo_url:  photoUrl,
    } as any);
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      setNewPlayerName('');
      setNewPlayerGender('Male');
      setNewPlayerBasePrice(DEFAULT_BASE_PRICE);
      setNewPlayerPhoto(null);
      fetchData();
    }
  };

  const deletePlayer = async (id: string) => {
    const { error } = await supabase.from('players').delete().eq('id', id);
    if (error) toast({ title: 'Error', description: error.message, variant: 'destructive' });
    else fetchData();
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
          <p className="text-sm text-muted-foreground">
            Code: <span className="font-mono font-bold">{auction.join_code}</span>
          </p>
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

          {/* ── Teams tab ── */}
          <TabsContent value="teams" className="mt-4">
            <div className="grid gap-4 md:grid-cols-2">
              {teams.map(t => (
                <Card key={t.id}>
                  <CardHeader>
                    <CardTitle className="text-base">{t.name}</CardTitle>
                    <p className="text-sm text-muted-foreground">
                      Captain: {t.captain_name} · Budget: ₹{t.purse_balance.toLocaleString()}
                    </p>
                  </CardHeader>
                </Card>
              ))}
              {teams.length === 0 && (
                <p className="text-muted-foreground col-span-2 text-center py-8">
                  Teams will appear here when captains join using code{' '}
                  <span className="font-mono font-bold">{auction.join_code}</span>
                </p>
              )}
            </div>
          </TabsContent>

          {/* ── Players tab ── */}
          <TabsContent value="players" className="mt-4 space-y-6">

            {/* File upload */}
            <Card>
              <CardContent className="pt-6">
                <label className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-border p-8 cursor-pointer hover:border-primary transition-colors">
                  <Upload className="h-8 w-8 text-muted-foreground mb-2" />
                   <span className="text-sm text-muted-foreground">Drop a file or click to upload</span>
                  <span className="text-xs text-muted-foreground mt-1">
                    CSV or Excel (.xlsx / .xls) — columns: <span className="font-mono">Name, Gender, Base Price</span> (optional)
                  </span>
                  <input type="file" accept=".csv,.xlsx,.xls" onChange={handleFileUpload} className="hidden" />
                </label>
              </CardContent>
            </Card>

            {/* Manual add */}
            <Card>
              <CardHeader><CardTitle className="text-base">Add Player Manually</CardTitle></CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-3 items-end">
                  <div className="space-y-1 flex-1 min-w-[140px]">
                    <Label className="text-xs">Name</Label>
                    <Input
                      value={newPlayerName}
                      onChange={e => setNewPlayerName(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && addPlayer()}
                      placeholder="Player name"
                    />
                  </div>
                  <div className="space-y-1 w-28">
                    <Label className="text-xs">Gender</Label>
                    <select
                      value={newPlayerGender}
                      onChange={e => setNewPlayerGender(e.target.value as 'Male' | 'Female')}
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    >
                      <option value="Male">Male</option>
                      <option value="Female">Female</option>
                    </select>
                  </div>
                  <div className="space-y-1 w-28">
                    <Label className="text-xs">Base Price (₹)</Label>
                    <Input
                      type="number"
                      value={newPlayerBasePrice}
                      onChange={e => setNewPlayerBasePrice(parseInt(e.target.value) || DEFAULT_BASE_PRICE)}
                      min={1}
                    />
                  </div>
                  <div className="space-y-1 w-40">
                    <Label className="text-xs">Photo (optional)</Label>
                    <Input
                      type="file"
                      accept="image/*"
                      onChange={e => setNewPlayerPhoto(e.target.files?.[0] || null)}
                      className="text-xs"
                    />
                  </div>
                  <Button onClick={addPlayer} disabled={!newPlayerName.trim() || uploading}>
                    <Plus className="mr-1 h-4 w-4" /> Add
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Player table */}
            {players.length > 0 && (
              <Card>
                <CardContent className="pt-4">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Gender</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="w-10"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {players.map(p => (
                        <TableRow key={p.id}>
                          <TableCell className="font-medium">{p.name}</TableCell>
                          <TableCell>{p.gender}</TableCell>
                          <TableCell>{p.status}</TableCell>
                          <TableCell>
                            {p.status === 'available' && (
                              <Button
                                size="icon" variant="ghost"
                                onClick={() => deletePlayer(p.id)}
                                className="h-8 w-8 text-destructive hover:text-destructive"
                              >
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