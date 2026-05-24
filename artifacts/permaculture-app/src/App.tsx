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
import PresentationPage from "@/pages/PresentationPage";
import { useAuth } from "@workspace/replit-auth-web";
import { useAppStore } from "@/store/useAppStore";

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

function ClientBlockedPage() {
  return (
    <div className="h-screen w-screen flex items-center justify-center bg-slate-950 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-slate-900 via-slate-950 to-black">
      <div className="flex flex-col items-center gap-4 max-w-sm text-center px-6">
        <div className="w-12 h-12 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-red-400">
            <circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/>
          </svg>
        </div>
        <div>
          <h2 className="text-sm font-bold text-slate-100 tracking-tight uppercase">Access Restricted</h2>
          <p className="text-[12px] text-slate-500 font-mono mt-1">
            Client accounts are limited to presentation links shared by your designer.
          </p>
        </div>
      </div>
    </div>
  );
}

function Router() {
  const { role } = useAppStore();

  if (role === "client") {
    return (
      <Switch>
        <Route path="/presentation/:id" component={PresentationPage} />
        <Route component={ClientBlockedPage} />
      </Switch>
    );
  }

  return (
    <Switch>
      <Route path="/" component={RootRedirect} />
      <Route path="/properties" component={PropertiesPage} />
      <Route path="/intake" component={IntakePage} />
      <Route path="/workspace" component={MapPage} />
      <Route path="/analysis" component={AnalysisPage} />
      <Route path="/dossier" component={DossierPage} />
      <Route path="/presentation/:id" component={PresentationPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function AuthGate({ children }: { children: React.ReactNode }) {
  const { isLoading, isAuthenticated, login } = useAuth();

  if (isLoading) {
    return (
      <div style={{ height: "100vh", width: "100vw", display: "flex", alignItems: "center", justifyContent: "center", background: "#fff" }}>
        <span style={{ fontFamily: "monospace", fontSize: 10, letterSpacing: "0.18em", textTransform: "uppercase", color: "#bbb" }}>Loading…</span>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div style={{ height: "100vh", width: "100vw", display: "flex", alignItems: "center", justifyContent: "center", background: "#fff" }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 28, maxWidth: 360, width: "100%", padding: "0 24px" }}>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>🛡</div>
            <h1 style={{ margin: "0 0 6px", fontFamily: "monospace", fontSize: 22, fontWeight: 900, letterSpacing: "-0.03em", textTransform: "uppercase", color: "#111" }}>TerraGuard OS</h1>
            <p style={{ margin: 0, fontFamily: "monospace", fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase", color: "#1d4ed8" }}>
              Property Resilience & Security
            </p>
          </div>
          <button
            onClick={login}
            style={{ width: "100%", padding: "12px 0", fontFamily: "monospace", fontSize: 11, fontWeight: 900, letterSpacing: "0.12em", textTransform: "uppercase", background: "#111", color: "#fff", border: "2px solid #111", cursor: "pointer" }}
          >
            Sign In to Access
          </button>
          <p style={{ margin: 0, fontFamily: "monospace", fontSize: 9, letterSpacing: "0.1em", textTransform: "uppercase", color: "#bbb", textAlign: "center" }}>
            Secure connection · Data encrypted
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
