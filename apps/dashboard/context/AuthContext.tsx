'use client';

import { createContext, useContext, useState, useCallback } from 'react';
import { staffLogin, type StaffLoginResponse } from '@/lib/api';

interface AuthState {
  name: string;
  pin: string;
  role: 'STAFF' | 'OWNER' | '';
  isLoggedIn: boolean;
}

interface AuthContextValue extends AuthState {
  login: (pin: string) => Promise<StaffLoginResponse>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [auth, setAuth] = useState<AuthState>({
    name: '',
    pin: '',
    role: '',
    isLoggedIn: false,
  });

  const login = useCallback(async (pin: string): Promise<StaffLoginResponse> => {
    const data = await staffLogin(pin);
    if (data.role !== 'OWNER') {
      throw new Error('Owner access required');
    }
    setAuth({ name: data.name, pin, role: data.role, isLoggedIn: true });
    return data;
  }, []);

  const logout = useCallback(() => {
    setAuth({ name: '', pin: '', role: '', isLoggedIn: false });
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
