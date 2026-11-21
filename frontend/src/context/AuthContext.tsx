import React, { createContext, useContext, useState, useEffect } from 'react';
import { AuthResult, AuthUser, LoginInput, RegisterInput } from '../api/types';
import { apiClient, clearAuthStorage, VSE_STORAGE_KEYS } from '../api/client';

interface AuthContextType {
  user: AuthUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (input: LoginInput) => Promise<AuthUser>;
  register: (input: RegisterInput) => Promise<AuthUser>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function readStoredUser(): AuthUser | null {
  const token = localStorage.getItem(VSE_STORAGE_KEYS.TOKEN);
  const role = localStorage.getItem(VSE_STORAGE_KEYS.ROLE);
  const orgId = localStorage.getItem(VSE_STORAGE_KEYS.ORG_ID);
  const legalName = localStorage.getItem(VSE_STORAGE_KEYS.LEGAL_NAME);

  if (token && role && orgId && legalName) {
    return {
      token,
      role: role as AuthUser['role'],
      orgId,
      legalName,
    };
  }
  return null;
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AuthUser | null>(readStoredUser);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  useEffect(() => {
    setUser(readStoredUser());
    setIsLoading(false);
  }, []);

  const saveAuthSession = (result: AuthResult): AuthUser => {
    const authUser: AuthUser = {
      token: result.token,
      role: result.organisation.role,
      orgId: result.organisation.id,
      legalName: result.organisation.legal_name,
    };

    localStorage.setItem(VSE_STORAGE_KEYS.TOKEN, authUser.token);
    localStorage.setItem(VSE_STORAGE_KEYS.ROLE, authUser.role);
    localStorage.setItem(VSE_STORAGE_KEYS.ORG_ID, authUser.orgId);
    localStorage.setItem(VSE_STORAGE_KEYS.LEGAL_NAME, authUser.legalName);

    setUser(authUser);
    return authUser;
  };

  const login = async (input: LoginInput): Promise<AuthUser> => {
    const result = await apiClient.post<AuthResult>('/auth/login', input);
    return saveAuthSession(result);
  };

  const register = async (input: RegisterInput): Promise<AuthUser> => {
    const result = await apiClient.post<AuthResult>('/auth/register', input);
    return saveAuthSession(result);
  };

  const logout = (): void => {
    clearAuthStorage();
    setUser(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        isLoading,
        login,
        register,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
