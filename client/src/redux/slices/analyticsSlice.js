import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5001/api';

// Async Thunks
export const fetchAdmissionsKpi = createAsyncThunk(
  'analytics/fetchAdmissionsKpi',
  async ({ facilityId, month }) => {
    const response = await axios.get(`${API_URL}/v1/analytics/admissions/kpi`, {
      params: { facilityId, month }
    });
    return response.data;
  }
);

export const fetchAdmissionsTrend = createAsyncThunk(
  'analytics/fetchAdmissionsTrend',
  async ({ facilityId, month }) => {
    const response = await axios.get(`${API_URL}/v1/analytics/admissions/trend`, {
      params: { facilityId, month }
    });
    return response.data;
  }
);

const initialState = {
  admissionsKpi: null,
  admissionsTrend: [],
  loading: {
    kpi: false,
    trend: false,
  },
  error: null,
};

const analyticsSlice = createSlice({
  name: 'analytics',
  initialState,
  reducers: {},
  extraReducers: (builder) => {
    // KPI
    builder.addCase(fetchAdmissionsKpi.pending, (state) => {
      state.loading.kpi = true;
    });
    builder.addCase(fetchAdmissionsKpi.fulfilled, (state, action) => {
      state.loading.kpi = false;
      state.admissionsKpi = action.payload;
    });
    builder.addCase(fetchAdmissionsKpi.rejected, (state, action) => {
      state.loading.kpi = false;
      state.error = action.error.message;
    });

    // Trend
    builder.addCase(fetchAdmissionsTrend.pending, (state) => {
      state.loading.trend = true;
    });
    builder.addCase(fetchAdmissionsTrend.fulfilled, (state, action) => {
      state.loading.trend = false;
      state.admissionsTrend = action.payload;
    });
    builder.addCase(fetchAdmissionsTrend.rejected, (state, action) => {
      state.loading.trend = false;
      state.error = action.error.message;
    });
  },
});

export default analyticsSlice.reducer;
