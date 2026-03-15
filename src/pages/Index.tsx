import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Zap, Users } from 'lucide-react';

export default function Index() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6">
      <div className="text-center max-w-lg">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary stadium-shadow">
          <Zap className="h-8 w-8 text-primary-foreground" />
        </div>
        <h1 className="text-4xl font-black tracking-tight mb-3">Auction Platform</h1>
        <p className="text-muted-foreground mb-8">
          Real-time sports franchise auction with atomic bidding, anti-snipe protection, and live projector displays.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Button size="lg" onClick={() => navigate('/login')} className="text-lg px-8">
            <Zap className="mr-2 h-5 w-5" /> Organizer Login
          </Button>
          <Button size="lg" variant="outline" onClick={() => navigate('/join')} className="text-lg px-8">
            <Users className="mr-2 h-5 w-5" /> Join as Captain
          </Button>
        </div>
      </div>
    </div>
  );
}
