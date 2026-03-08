import React, { createContext, useContext, useState, useEffect, useMemo, ReactNode } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import { getApiUrl } from "@/lib/query-client";
import type { User } from "@/lib/types";
import { fetch } from "expo/fetch";

interface AuthContextValue {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  login: (username: string, password: string) => Promise<void>;
  register: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

async function saveToken(token: string) {
  if (Platform.OS === "web") {
    await AsyncStorage.setItem("auth_token", token);
  } else {
    await SecureStore.setItemAsync("auth_token", token);
  }
}

async function getToken(): Promise<string | null> {
  try {
    if (Platform.OS === "web") {
      return await AsyncStorage.getItem("auth_token");
    }
    return await SecureStore.getItemAsync("auth_token");
  } catch {
    return null;
  }
}

async function removeToken() {
  if (Platform.OS === "web") {
    await AsyncStorage.removeItem("auth_token");
  } else {
    await SecureStore.deleteItemAsync("auth_token");
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const savedToken = await getToken();
        if (savedToken) {
          const baseUrl = getApiUrl();
          const res = await fetch(new URL("/api/auth/me", baseUrl).toString(), {
            headers: { Authorization: `Bearer ${savedToken}` },
          });
          if (res.ok) {
            const userData = await res.json();
            setUser(userData);
            setToken(savedToken);
          } else {
            await removeToken();
          }
        }
      } catch {
        await removeToken();
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  const login = async (username: string, password: string) => {
    const baseUrl = getApiUrl();
    const res = await fetch(new URL("/api/auth/login", baseUrl).toString(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.message || "Login failed");
    }
    const data = await res.json();
    await saveToken(data.token);
    setToken(data.token);
    setUser(data.user);
  };

  const register = async (username: string, password: string) => {
    const baseUrl = getApiUrl();
    const res = await fetch(new URL("/api/auth/register", baseUrl).toString(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.message || "Registration failed");
    }
    const data = await res.json();
    await saveToken(data.token);
    setToken(data.token);
    setUser(data.user);
  };

  const logout = async () => {
    try {
      if (token) {
        const baseUrl = getApiUrl();
        await fetch(new URL("/api/auth/logout", baseUrl).toString(), {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        });
      }
    } catch {}
    await removeToken();
    setToken(null);
    setUser(null);
  };

  const value = useMemo(
    () => ({ user, token, isLoading, login, register, logout }),
    [user, token, isLoading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
}
