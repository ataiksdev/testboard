import React, { createContext, useContext, useState, useEffect } from 'react';

const AuthContext = createContext(null);

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem('tb_token'));
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  // In dev, the API runs on a separate port (8090) from the Vite dev server,
  // regardless of whether the page was loaded via localhost or a LAN IP.
  // In a production build, frontend and backend share an origin.
  const API_URL = import.meta.env.DEV
    ? `http://${window.location.hostname}:8090`
    : window.location.origin;

  useEffect(() => {
    if (token) {
      fetchUserProfile(token);
    } else {
      setIsLoading(false);
    }
  }, [token]);

  const fetchUserProfile = async (authToken) => {
    try {
      setIsLoading(true);
      const response = await fetch(`${API_URL}/api/auth/me`, {
        headers: {
          'Authorization': `Bearer ${authToken}`
        }
      });
      if (response.ok) {
        const data = await response.json();
        setUser(data);
        setError(null);
      } else {
        // Token expired or invalid
        logout();
      }
    } catch (err) {
      console.error("Failed to fetch user profile:", err);
      // Don't log out on network disconnect, just set loading false
    } finally {
      setIsLoading(false);
    }
  };

  const login = async (email, password) => {
    try {
      setIsLoading(true);
      setError(null);
      
      const formData = new URLSearchParams();
      formData.append('username', email);
      formData.append('password', password);

      const response = await fetch(`${API_URL}/api/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: formData
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.detail || 'Login failed');
      }

      const data = await response.json();
      localStorage.setItem('tb_token', data.access_token);
      setToken(data.access_token);
      await fetchUserProfile(data.access_token);
      return true;
    } catch (err) {
      setError(err.message);
      setIsLoading(false);
      return false;
    }
  };

  const register = async (email, password, fullName) => {
    try {
      setIsLoading(true);
      setError(null);

      const response = await fetch(`${API_URL}/api/auth/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password, full_name: fullName })
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.detail || 'Registration failed');
      }

      setIsLoading(false);
      return true; // Register success
    } catch (err) {
      setError(err.message);
      setIsLoading(false);
      return false;
    }
  };

  const logout = () => {
    localStorage.removeItem('tb_token');
    setToken(null);
    setUser(null);
    setIsLoading(false);
  };

  const requestPasswordReset = async (email) => {
    try {
      const response = await fetch(`${API_URL}/api/auth/forgot-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email })
      });
      const data = await response.json();
      return { success: response.ok, message: data.message || data.detail };
    } catch (err) {
      return { success: false, message: 'Could not reach the server. Please try again.' };
    }
  };

  const value = {
    user,
    token,
    isLoading,
    error,
    login,
    register,
    logout,
    requestPasswordReset,
    API_URL,
    fetchUserProfile
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
