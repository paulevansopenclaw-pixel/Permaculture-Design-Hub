import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import MapPage from "@/pages/MapPage";
import PropertiesPage from "@/pages/PropertiesPage";
import PatternLanding from "@/pages/PatternLanding";
import EnquirePage from "@/pages/EnquirePage";
import IntakePage from "@/pages/IntakePage";
import AnalysisPage from "@/pages/AnalysisPage";
import PlansPage from "@/pages/PlansPage";
import DossierPage from "@/pages/DossierPage";
import PresentationPage from "@/pages/PresentationPage";
import { useAuth } from "@workspace/replit-auth-web";
import { useAppStore } from "@/store/useAppStore";
import patternLogo from "@assets/pattern-logo.png";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
    },
  },
});

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
      <Route path="/properties" component={PropertiesPage} />
      <Route path="/intake" component={IntakePage} />
      <Route path="/workspace" component={MapPage} />
      <Route path="/analysis" component={AnalysisPage} />
      <Route path="/plans" component={PlansPage} />
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
      <div style={{ height: "100vh", width: "100vw", display: "flex", alignItems: "center", justifyContent: "center", background: "#f8f5f0", fontFamily: "'Inter', system-ui, sans-serif" }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 0, maxWidth: 380, width: "100%", padding: "0 24px" }}>
          <div style={{ background: "#fffdf9", border: "1px solid #ddd6cc", borderRadius: 16, padding: "44px 40px", width: "100%", boxSizing: "border-box", textAlign: "center", boxShadow: "0 8px 32px rgba(44,36,22,0.1)" }}>
            <img
              src={patternLogo}
              alt="Pattern — Natural Systems Design by Wattle Seed Permaculture"
              style={{ display: "block", width: "100%", maxWidth: 270, height: "auto", margin: "0 auto 30px" }}
            />
            <button
              onClick={login}
              style={{ width: "100%", padding: "13px 0", fontSize: 13, fontWeight: 600, background: "#4a6b2e", color: "#fff", border: "none", borderRadius: 9, cursor: "pointer", fontFamily: "inherit", boxShadow: "0 2px 10px rgba(74,107,46,0.35)" }}
            >
              Sign In to Access
            </button>
            <p style={{ margin: "18px 0 0", fontSize: 11, color: "#a89880" }}>
              Secure connection · Data encrypted
            </p>
          </div>
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
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Switch>
            <Route path="/" component={PatternLanding} />
            <Route path="/enquire" component={EnquirePage} />
            <Route>
              <AuthGate>
                <Router />
              </AuthGate>
            </Route>
          </Switch>
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
