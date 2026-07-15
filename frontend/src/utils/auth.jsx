import React, { createContext, useContext, useState, useEffect } from 'react';

const AuthContext = createContext(null);

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem('tb_token'));
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  // Set API base URL depending on window environment
  const API_URL = window.location.origin.includes('localhost') || window.location.origin.includes('127.0.0.1')
    ? 'http://127.0.0.1:8000'
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

  const value = {
    user,
    token,
    isLoading,
    error,
    login,
    register,
    logout,
    API_URL,
    fetchUserProfile
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
