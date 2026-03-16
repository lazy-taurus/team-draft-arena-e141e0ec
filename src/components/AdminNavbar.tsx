import { Link, useParams, useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/use-auth';
import { Button } from '@/components/ui/button';
import { Zap, LogOut } from 'lucide-react';

export function AdminNavbar() {
  const { id } = useParams();
  const location = useLocation();
  const { signOut } = useAuth();

  const links = [
    { to: '/dashboard', label: 'Dashboard' },
    ...(id
      ? [
          { to: `/auction/${id}/setup`, label: 'Setup' },
          { to: `/auction/${id}/admin`, label: 'Control Room' },
          { to: `/auction/${id}/live`, label: 'Projector' },
          { to: `/auction/${id}/rosters`, label: 'Rosters' },
        ]
      : []),
  ];

  return (
    <nav className="border-b border-border bg-card px-4 py-2 flex items-center gap-1">
      <Link to="/dashboard" className="mr-3 flex items-center gap-2">
        <div className="h-7 w-7 rounded-lg bg-primary flex items-center justify-center">
          <Zap className="h-4 w-4 text-primary-foreground" />
        </div>
      </Link>
      {links.map(link => (
        <Link
          key={link.to}
          to={link.to}
          className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
            location.pathname === link.to
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:text-foreground hover:bg-muted'
          }`}
        >
          {link.label}
        </Link>
      ))}
      <div className="ml-auto">
        <Button variant="ghost" size="icon" onClick={signOut} title="Sign out">
          <LogOut className="h-4 w-4" />
        </Button>
      </div>
    </nav>
  );
}
