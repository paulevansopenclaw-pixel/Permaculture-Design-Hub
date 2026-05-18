import { useState } from "react";
import { useLocation } from "wouter";
import {
  useListProperties,
  useCreateProperty,
  useDeleteProperty,
  getListPropertiesQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useAppStore } from "@/store/useAppStore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

function formatArea(ha: number | null | undefined, ac: number | null | undefined) {
  if (!ha && !ac) return "No boundary set";
  return `${ha?.toFixed(2) ?? "?"} ha · ${ac?.toFixed(2) ?? "?"} ac`;
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default function PropertiesPage() {
  const [, navigate] = useLocation();
  const { setActivePropertyId } = useAppStore();
  const queryClient = useQueryClient();

  const { data: properties = [], isLoading } = useListProperties();
  const createProperty = useCreateProperty();
  const deleteProperty = useDeleteProperty();

  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [deleteId, setDeleteId] = useState<string | null>(null);

  function handleCreate() {
    if (!newName.trim()) return;
    createProperty.mutate(
      { data: { name: newName.trim() } },
      {
        onSuccess: (property) => {
          queryClient.invalidateQueries({ queryKey: getListPropertiesQueryKey() });
          setShowCreate(false);
          setNewName("");
          setActivePropertyId(property.id);
          navigate("/");
        },
      },
    );
  }

  function handleOpen(id: string) {
    setActivePropertyId(id);
    navigate("/");
  }

  function handleDelete() {
    if (!deleteId) return;
    deleteProperty.mutate(
      { id: deleteId },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListPropertiesQueryKey() });
          setDeleteId(null);
        },
      },
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate("/")}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M19 12H5M12 19l-7-7 7-7"/>
            </svg>
          </button>
          <div>
            <h1 className="text-xl font-semibold text-foreground tracking-tight">Properties</h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              {properties.length} {properties.length === 1 ? "property" : "properties"}
            </p>
          </div>
        </div>
        <Button onClick={() => setShowCreate(true)} size="sm">
          New Property
        </Button>
      </header>

      {/* Content */}
      <main className="max-w-5xl mx-auto px-6 py-8">
        {isLoading ? (
          <div className="flex items-center justify-center py-24">
            <div className="flex flex-col items-center gap-3">
              <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              <p className="text-sm text-muted-foreground">Loading properties...</p>
            </div>
          </div>
        ) : properties.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 gap-4">
            <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-muted-foreground">
                <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/>
                <polyline points="9,22 9,12 15,12 15,22"/>
              </svg>
            </div>
            <div className="text-center">
              <h3 className="font-medium text-foreground">No sites yet</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Add your first site to begin your autonomous property design
              </p>
            </div>
            <Button onClick={() => setShowCreate(true)}>Create Property</Button>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {properties.map((property) => (
              <div
                key={property.id}
                className="bg-card border border-card-border rounded-lg p-5 hover:shadow-md transition-shadow group cursor-pointer"
                onClick={() => handleOpen(property.id)}
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="w-9 h-9 rounded-md bg-primary/10 flex items-center justify-center flex-shrink-0">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-primary">
                      <polygon points="1,6 1,22 8,18 16,22 23,18 23,2 16,6 8,2"/>
                    </svg>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); setDeleteId(property.id); }}
                    className="opacity-60 sm:opacity-0 sm:group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-all p-2.5 rounded-lg"
                    style={{ minWidth: "44px", minHeight: "44px" }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="3,6 5,6 21,6"/><path d="M19,6l-1,14a2,2,0,0,1-2,2H8a2,2,0,0,1-2-2L5,6"/><path d="M10,11v6M14,11v6"/><path d="M9,6V4a1,1,0,0,1,1-1h4a1,1,0,0,1,1,1V6"/>
                    </svg>
                  </button>
                </div>
                <h3 className="font-medium text-foreground text-sm leading-snug mb-1">
                  {property.name}
                </h3>
                <p className="text-xs text-muted-foreground mb-3">
                  {formatArea(property.areaHectares, property.areaAcres)}
                </p>
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-muted-foreground">
                    {formatDate(property.createdAt)}
                  </span>
                  <span className="text-[11px] font-medium text-primary opacity-60 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                    Open →
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Create Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Property</DialogTitle>
          </DialogHeader>
          <div className="py-2">
            <Input
              placeholder="Property name (e.g. Hillside Farm)"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleCreate()}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={!newName.trim() || createProperty.isPending}>
              {createProperty.isPending ? "Creating..." : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete property?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the property and all its feedback pins.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
