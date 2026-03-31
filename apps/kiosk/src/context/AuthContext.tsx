'use client';

import { createContext, useContext, useState, useCallback } from 'react';

interface AuthState {
  staffName: string;
  pin: string;
  role: string;
  isLoggedIn: boolean;
}

interface AuthContextValue extends AuthState {
  login: (pin: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [auth, setAuth] = useState<AuthState>({
    staffName: '',
    pin: '',
    role: '',
    isLoggedIn: false,
  });

  const login = useCallback(async (pin: string) => {
    const res = await fetch(`${API_BASE}/api/staff/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin }),
    });
    if (!res.ok) throw new Error('Invalid PIN');
    const data = await res.json() as { name: string; role: string };
    setAuth({ staffName: data.name, pin, role: data.role, isLoggedIn: true });
  }, []);

  const logout = useCallback(() => {
    setAuth({ staffName: '', pin: '', role: '', isLoggedIn: false });
  }, []);

  return (
    <AuthContext.Provider value={{ ...auth, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
