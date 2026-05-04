import { create } from "zustand";
import { persist } from "zustand/middleware";

interface AuthState {
  accessToken: string | null;
  fullName: string | null;
  isAuthenticated: boolean;
  setAuth: (accessToken: string, fullName: string) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      accessToken: null,
      fullName: null,
      isAuthenticated: false,
      setAuth: (accessToken, fullName) =>
        set({ accessToken, fullName, isAuthenticated: true }),
      logout: () =>
        set({ accessToken: null, fullName: null, isAuthenticated: false }),
    }),
    {
      name: "fazicore-admin-auth",
      partialize: (state) => ({
        accessToken: state.accessToken,
        fullName: state.fullName,
        isAuthenticated: state.isAuthenticated,
      }),
    },
  ),
);
