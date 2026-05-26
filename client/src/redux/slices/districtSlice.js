import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5001/api';

function buildParams(args) {
  return new URLSearchParams(
    Object.fromEntries(Object.entries(args).filter(([, v]) => v != null && v !== ''))
  ).toString();
}

export const fetchDistrictFilters = createAsyncThunk('district/fetchFilters', async () => {
  const res = await axios.get(`${API_URL}/v1/district/filters`);
  return res.data;
});

export const fetchDistrictKpis = createAsyncThunk('district/fetchKpis', async (args) => {
  const res = await axios.get(`${API_URL}/v1/district/kpiSummary?${buildParams(args)}`);
  return res.data;
});

export const fetchFacilityMatrix = createAsyncThunk('district/fetchMatrix', async (args) => {
  const res = await axios.get(`${API_URL}/v1/district/facilityMatrix?${buildParams(args)}`);
  return res.data;
});

const districtSlice = createSlice({
  name: 'district',
  initialState: {
    filterOptions: null,
    kpis:          null,
    matrix:        null,
    loading: {
      filters: false,
      kpis:    false,
      matrix:  false,
    },
    error: null,
  },
  reducers: {},
  extraReducers: builder => {
    builder
      .addCase(fetchDistrictFilters.pending,   s => { s.loading.filters = true; })
      .addCase(fetchDistrictFilters.fulfilled, (s, a) => { s.loading.filters = false; s.filterOptions = a.payload; })
      .addCase(fetchDistrictFilters.rejected,  (s, a) => { s.loading.filters = false; s.error = a.error.message; })

      .addCase(fetchDistrictKpis.pending,   s => { s.loading.kpis = true; })
      .addCase(fetchDistrictKpis.fulfilled, (s, a) => { s.loading.kpis = false; s.kpis = a.payload; })
      .addCase(fetchDistrictKpis.rejected,  (s, a) => { s.loading.kpis = false; s.error = a.error.message; })

      .addCase(fetchFacilityMatrix.pending,   s => { s.loading.matrix = true; })
      .addCase(fetchFacilityMatrix.fulfilled, (s, a) => { s.loading.matrix = false; s.matrix = a.payload; })
      .addCase(fetchFacilityMatrix.rejected,  (s, a) => { s.loading.matrix = false; s.error = a.error.message; });
  },
});

export default districtSlice.reducer;
