import { create } from "zustand";

export type Role = "designer" | "client";

export interface PendingMapElement {
  type: string;
  name: string;
  description: string;
  placement: string;
  priority: string;
}

interface AppState {
  role: Role;
  activePropertyId: string | null;
  pendingMapElement: PendingMapElement | null;
  setRole: (role: Role) => void;
  setActivePropertyId: (id: string | null) => void;
  setPendingMapElement: (el: PendingMapElement | null) => void;
}

export const useAppStore = create<AppState>((set) => ({
  role: "designer",
  activePropertyId: null,
  pendingMapElement: null,
  setRole: (role) => set({ role }),
  setActivePropertyId: (id) => set({ activePropertyId: id }),
  setPendingMapElement: (el) => set({ pendingMapElement: el }),
}));
