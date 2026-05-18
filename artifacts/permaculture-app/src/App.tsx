import { useEffect } from "react";
import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import MapPage from "@/pages/MapPage";
import PropertiesPage from "@/pages/PropertiesPage";
import IntakePage from "@/pages/IntakePage";
import AnalysisPage from "@/pages/AnalysisPage";
import DossierPage from "@/pages/DossierPage";
import { useAuth } from "@workspace/replit-auth-web";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
    },
  },
});

function RootRedirect() {
  const [, navigate] = useLocation();
  useEffect(() => {
    navigate("/properties");
  }, [navigate]);
  return null;
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={RootRedirect} />
      <Route path="/properties" component={PropertiesPage} />
      <Route path="/intake" component={IntakePage} />
      <Route path="/workspace" component={MapPage} />
      <Route path="/analysis" component={AnalysisPage} />
      <Route path="/dossier" component={DossierPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function AuthGate({ children }: { children: React.ReactNode }) {
  const { isLoading, isAuthenticated, login } = useAuth();

  if (isLoading) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-slate-950">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin border-emerald-500" />
          <span className="text-[13px] text-slate-400 font-mono uppercase tracking-widest">INITIALIZING SECURE UPLINK...</span>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-slate-950 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-slate-900 via-slate-950 to-black">
        <div className="flex flex-col items-center gap-6 max-w-sm w-full px-6">
          <div className="text-center space-y-2">
            <div className="text-4xl mb-3 text-slate-300">🛡</div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-100">TerraGuard OS</h1>
            <p className="text-[13px] text-slate-400 font-mono">
              Autonomous Property Resilience & Security
            </p>
          </div>
          <button
            onClick={login}
            className="w-full py-3 rounded-md text-[14px] font-bold tracking-wide uppercase transition-all bg-emerald-600/10 text-emerald-500 hover:bg-emerald-600/20 border border-emerald-600/30 shadow-[0_0_15px_rgba(16,185,129,0.15)] hover:shadow-[0_0_25px_rgba(16,185,129,0.3)]"
          >
            Authenticate Access
          </button>
          <p className="text-[11px] text-center text-slate-500 font-mono">
            Encrypted connection. Topographical data is secured.
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AuthGate>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <Router />
          </WouterRouter>
        </AuthGate>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
