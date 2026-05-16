import { create } from "zustand";

export type Role = "designer" | "client";

interface AppState {
  role: Role;
  activePropertyId: string | null;
  setRole: (role: Role) => void;
  setActivePropertyId: (id: string | null) => void;
}

export const useAppStore = create<AppState>((set) => ({
  role: "designer",
  activePropertyId: null,
  setRole: (role) => set({ role }),
  setActivePropertyId: (id) => set({ activePropertyId: id }),
}));
