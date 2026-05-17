import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import MapPage from "@/pages/MapPage";
import PropertiesPage from "@/pages/PropertiesPage";
import { useAuth } from "@workspace/replit-auth-web";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 30_000,
    },
  },
});

function Router() {
  return (
    <Switch>
      <Route path="/" component={MapPage} />
      <Route path="/properties" component={PropertiesPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function AuthGate({ children }: { children: React.ReactNode }) {
  const { isLoading, isAuthenticated, login } = useAuth();

  if (isLoading) {
    return (
      <div className="h-screen w-screen flex items-center justify-center" style={{ background: "hsl(103, 18%, 8%)" }}>
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: "hsl(103, 40%, 35%)" }} />
          <span className="text-[13px]" style={{ color: "hsl(42, 20%, 50%)" }}>Loading…</span>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="h-screen w-screen flex items-center justify-center" style={{ background: "hsl(103, 18%, 8%)" }}>
        <div className="flex flex-col items-center gap-6 max-w-sm w-full px-6">
          <div className="text-center space-y-2">
            <div className="text-4xl mb-3">🛡</div>
            <h1 className="text-[22px] font-bold" style={{ color: "hsl(42, 28%, 88%)" }}>TerraGuard</h1>
            <p className="text-[13px]" style={{ color: "hsl(42, 15%, 52%)" }}>
              Land Security & Autonomous Property Architect
            </p>
          </div>
          <button
            onClick={login}
            className="w-full py-3 rounded-xl text-[14px] font-semibold transition-all"
            style={{
              background: "linear-gradient(135deg, #1a4a0d, #3a8220)",
              color: "#e8f5e2",
              border: "1px solid #4a9a28",
              boxShadow: "0 4px 18px rgba(45,106,26,0.45)",
            }}
          >
            Log in to continue
          </button>
          <p className="text-[11px] text-center" style={{ color: "hsl(42, 10%, 38%)" }}>
            Your designs, properties, and AI reports are private to your account.
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
