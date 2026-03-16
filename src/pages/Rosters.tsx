import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/use-auth';
import { AdminNavbar } from '@/components/AdminNavbar';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';
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

  return (
    <div className="min-h-screen bg-background">
      <AdminNavbar />
      <header className="border-b border-border px-6 py-4">
        <h1 className="text-lg font-bold">Roster Manager</h1>
        <p className="text-sm text-muted-foreground">Drag and drop players between teams to reassign</p>
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
                          ₹{team.purse_balance.toLocaleString()} · B:{team.boys_count} G:{team.girls_count}
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
