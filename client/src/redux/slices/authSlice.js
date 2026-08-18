import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5002/api';

// Initial state from storage
const getStoredToken = () => localStorage.getItem('token') || sessionStorage.getItem('token');
const getStoredUser = () => localStorage.getItem('user') || sessionStorage.getItem('user');

export const loginAsync = createAsyncThunk(
  'auth/login',
  async ({ email, password, rememberMe }, { rejectWithValue }) => {
    try {
      const response = await axios.post(`${API_URL}/v1/auth/login`, { email, password, rememberMe });
      return { ...response.data, rememberMe }; // { token, user, rememberMe }
    } catch (error) {
      return rejectWithValue(error.response?.data?.error || 'Login failed');
    }
  }
);

export const logoutAsync = createAsyncThunk(
  'auth/logoutAPI',
  async (_, { dispatch }) => {
    try {
      await axios.post(`${API_URL}/v1/auth/logout`);
    } catch (error) {
      console.error('Logout API failed:', error);
    } finally {
      dispatch(logout()); // always clear local state
    }
  }
);

const authSlice = createSlice({
  name: 'auth',
  initialState: {
    token: getStoredToken(),
    user: getStoredUser() ? JSON.parse(getStoredUser()) : null,
    isAuthenticated: !!getStoredToken(),
    loading: false,
    error: null,
  },
  reducers: {
    logout: (state) => {
      state.token = null;
      state.user = null;
      state.isAuthenticated = false;
      state.error = null;
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      sessionStorage.removeItem('token');
      sessionStorage.removeItem('user');
    },
    clearAuthError: (state) => {
      state.error = null;
    }
  },
  extraReducers: (builder) => {
    builder
      .addCase(loginAsync.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(loginAsync.fulfilled, (state, action) => {
        state.loading = false;
        state.isAuthenticated = true;
        state.token = action.payload.token;
        state.user = action.payload.user;
        
        const storage = action.payload.rememberMe ? localStorage : sessionStorage;
        storage.setItem('token', action.payload.token);
        storage.setItem('user', JSON.stringify(action.payload.user));
      })
      .addCase(loginAsync.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      });
  },
});

export const { logout, clearAuthError } = authSlice.actions;
export default authSlice.reducer;
