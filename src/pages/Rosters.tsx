import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/use-auth';
import { AdminNavbar } from '@/components/AdminNavbar';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { Database } from '@/integrations/supabase/types';

type Player = Database['public']['Tables']['players']['Row'];
type Team = Database['public']['Tables']['teams']['Row'];

export default function RostersPage() {
  const { id: auctionId } = useParams<{ id: string }>();
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [teams, setTeams] = useState<Team[]>([]);
  const [soldPlayers, setSoldPlayers] = useState<Player[]>([]);

  useEffect(() => {
    if (!authLoading && !user) navigate('/login');
  }, [user, authLoading, navigate]);

  const fetchData = useCallback(async () => {
    if (!auctionId) return;
    const [tRes, pRes] = await Promise.all([
      supabase.from('teams').select('*').eq('auction_id', auctionId),
      supabase.from('players').select('*').eq('auction_id', auctionId).eq('status', 'sold').order('name'),
    ]);
    setTeams(tRes.data || []);
    setSoldPlayers(pRes.data || []);
  }, [auctionId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const onDragEnd = async (result: DropResult) => {
    if (!result.destination) return;
    const toTeamId = result.destination.droppableId;
    const playerId = result.draggableId;
    const fromTeamId = result.source.droppableId;
    if (fromTeamId === toTeamId) return;

    // Optimistic update
    setSoldPlayers(prev => prev.map(p => p.id === playerId ? { ...p, team_id: toTeamId } : p));

    const { data } = await supabase.rpc('reassign_player' as any, { p_player_id: playerId, p_to_team_id: toTeamId });
    const res = data as any;
    if (!res?.success) {
      toast({ title: 'Error', description: res?.error || 'Reassignment failed', variant: 'destructive' });
      fetchData(); // revert
    } else {
      fetchData(); // refresh counts
    }
  };

  // ── Export helpers ──────────────────────────────────────────────────────────

  const buildRosterRows = () =>
    teams.map(team => ({
      team,
      players: soldPlayers.filter(p => p.team_id === team.id),
    }));

  const exportExcel = () => {
    const wb = XLSX.utils.book_new();

    // Sheet 1 – Summary (all teams side-by-side)
    const maxPlayers = Math.max(...teams.map(t => soldPlayers.filter(p => p.team_id === t.id).length), 0);
    const summaryData: (string | number)[][] = [];

    // Header row
    const headerRow: (string | number)[] = [];
    teams.forEach(t => {
      headerRow.push(t.name, 'Gender', 'Bid (₹)', '');
    });
    summaryData.push(headerRow);

    // Meta row (purse / counts)
    const metaRow: (string | number)[] = [];
    teams.forEach(t => {
      metaRow.push(`Purse: ₹${t.purse_balance.toLocaleString()}`, `B:${t.boys_count}`, `G:${t.girls_count}`, '');
    });
    summaryData.push(metaRow);

    // Player rows
    for (let i = 0; i < maxPlayers; i++) {
      const row: (string | number)[] = [];
      teams.forEach(team => {
        const teamPlayers = soldPlayers.filter(p => p.team_id === team.id);
        const player = teamPlayers[i];
        if (player) {
          row.push(player.name, player.gender ?? '', player.current_highest_bid ?? '', '');
        } else {
          row.push('', '', '', '');
        }
      });
      summaryData.push(row);
    }

    const summarySheet = XLSX.utils.aoa_to_sheet(summaryData);
    // Column widths
    summarySheet['!cols'] = Array(teams.length * 4).fill(null).map((_, i) =>
      i % 4 === 3 ? { wch: 2 } : { wch: i % 4 === 0 ? 22 : 10 }
    );
    XLSX.utils.book_append_sheet(wb, summarySheet, 'All Teams');

    // One sheet per team
    buildRosterRows().forEach(({ team, players }) => {
      const rows: (string | number)[][] = [
        [`Team: ${team.name}`],
        [`Purse Balance: ₹${team.purse_balance.toLocaleString()}`, `Boys: ${team.boys_count}`, `Girls: ${team.girls_count}`],
        [],
        ['#', 'Player Name', 'Gender', 'Bid Amount (₹)'],
        ...players.map((p, idx) => [idx + 1, p.name, p.gender ?? '', p.current_highest_bid ?? '']),
        [],
        ['Total Players', players.length],
      ];
      const ws = XLSX.utils.aoa_to_sheet(rows);
      ws['!cols'] = [{ wch: 5 }, { wch: 24 }, { wch: 10 }, { wch: 16 }];
      // Safe name: max 31 chars, no special chars
      const sheetName = team.name.replace(/[:\\/?*[\]]/g, '').slice(0, 31);
      XLSX.utils.book_append_sheet(wb, ws, sheetName);
    });

    XLSX.writeFile(wb, 'auction_rosters.xlsx');
  };

  const exportPDF = () => {
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const pageWidth = doc.internal.pageSize.getWidth();

    // Title
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text('Auction Rosters', pageWidth / 2, 14, { align: 'center' });

    const rosterRows = buildRosterRows();
    const colCount = rosterRows.length;
    if (colCount === 0) return;

    // Build a multi-column table: each pair of columns = Team name + players
    const maxRows = Math.max(...rosterRows.map(r => r.players.length), 0);

    // Head: team names spanning their columns
    const head = [rosterRows.map(({ team }) => ({
      content: `${team.name}\n₹${team.purse_balance.toLocaleString()} · B:${team.boys_count} G:${team.girls_count}`,
      styles: { fontStyle: 'bold' as const, halign: 'center' as const, fillColor: [41, 128, 185] as [number, number, number], textColor: 255 },
    }))];

    // Body rows
    const body: { content: string; styles?: object }[][] = [];
    for (let i = 0; i < maxRows; i++) {
      const row = rosterRows.map(({ players }) => {
        const p = players[i];
        return p
          ? { content: `${p.name}\n${p.gender ?? ''} · ₹${(p.current_highest_bid ?? 0).toLocaleString()}` }
          : { content: '' };
      });
      body.push(row);
    }

    // Footer row with totals
    const footer = [rosterRows.map(({ players }) => ({
      content: `Total: ${players.length} player${players.length !== 1 ? 's' : ''}`,
      styles: { fontStyle: 'bold' as const, fillColor: [236, 240, 241] as [number, number, number] },
    }))];

    autoTable(doc, {
      startY: 20,
      head,
      body: [...body, ...footer],
      margin: { left: 10, right: 10 },
      styles: { fontSize: 9, cellPadding: 3, overflow: 'linebreak' },
      columnStyles: Object.fromEntries(
        rosterRows.map((_, i) => [i, { cellWidth: (pageWidth - 20) / colCount }])
      ),
      theme: 'grid',
    });

    doc.save('auction_rosters.pdf');
  };

  // ────────────────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-background">
      <AdminNavbar />
      <header className="border-b border-border px-6 py-4 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-lg font-bold">Roster Manager</h1>
          <p className="text-sm text-muted-foreground">Drag and drop players between teams to reassign</p>
        </div>
        <div className="flex gap-2 shrink-0">
          <Button
            variant="outline"
            size="sm"
            onClick={exportExcel}
            disabled={teams.length === 0}
            className="gap-2"
          >
            {/* Spreadsheet icon */}
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
              <line x1="8" y1="13" x2="16" y2="13"/>
              <line x1="8" y1="17" x2="16" y2="17"/>
              <line x1="8" y1="9" x2="10" y2="9"/>
            </svg>
            Export Excel
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={exportPDF}
            disabled={teams.length === 0}
            className="gap-2"
          >
            {/* PDF icon */}
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
              <path d="M9 15v-4h2a2 2 0 0 1 0 4H9z"/>
              <path d="M13 15v-4"/>
              <path d="M15 11h2"/>
              <path d="M15 13h2"/>
            </svg>
            Export PDF
          </Button>
        </div>
      </header>
      <main className="p-6">
        <DragDropContext onDragEnd={onDragEnd}>
          <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${Math.min(teams.length, 4)}, 1fr)` }}>
            {teams.map(team => {
              const teamPlayers = soldPlayers.filter(p => p.team_id === team.id);
              return (
                <Droppable key={team.id} droppableId={team.id}>
                  {(provided, snapshot) => (
                    <Card
                      ref={provided.innerRef}
                      {...provided.droppableProps}
                      className={`transition-colors ${snapshot.isDraggingOver ? 'ring-2 ring-primary' : ''}`}
                    >
                      <CardHeader className="pb-2">
                        <CardTitle className="text-base">{team.name}</CardTitle>
                        <p className="text-xs text-muted-foreground">
                          ₹{team.purse_balance.toLocaleString()} · Boys:{team.boys_count} Girls:{team.girls_count}
                        </p>
                      </CardHeader>
                      <CardContent className="min-h-[120px]">
                        {teamPlayers.map((p, idx) => (
                          <Draggable key={p.id} draggableId={p.id} index={idx}>
                            {(dragProvided, dragSnapshot) => (
                              <div
                                ref={dragProvided.innerRef}
                                {...dragProvided.draggableProps}
                                {...dragProvided.dragHandleProps}
                                className={`p-2 mb-1 rounded-md text-sm transition-colors cursor-grab active:cursor-grabbing ${
                                  dragSnapshot.isDragging ? 'bg-primary/20 shadow-lg' : 'bg-muted/50 hover:bg-muted'
                                }`}
                              >
                                <span className="font-medium">{p.name}</span>
                                <span className="text-xs text-muted-foreground ml-2">
                                  {p.gender} · ₹{p.current_highest_bid}
                                </span>
                              </div>
                            )}
                          </Draggable>
                        ))}
                        {provided.placeholder}
                        {teamPlayers.length === 0 && (
                          <p className="text-xs text-muted-foreground text-center py-4">No players</p>
                        )}
                      </CardContent>
                    </Card>
                  )}
                </Droppable>
              );
            })}
          </div>
        </DragDropContext>
      </main>
    </div>
  );
}
