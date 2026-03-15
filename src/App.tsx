import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import LoginPage from "./pages/Login";
import JoinPage from "./pages/Join";
import DashboardPage from "./pages/Dashboard";
import SetupPage from "./pages/Setup";
import LiveProjector from "./pages/LiveProjector";
import CaptainBid from "./pages/CaptainBid";
import AdminControl from "./pages/AdminControl";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/join" element={<JoinPage />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/auction/:id/setup" element={<SetupPage />} />
          <Route path="/auction/:id/live" element={<LiveProjector />} />
          <Route path="/auction/:id/bid" element={<CaptainBid />} />
          <Route path="/auction/:id/admin" element={<AdminControl />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
