import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5001/api';

const buildParams = ({ facilityIds, months, loungeIds }) => {
  const p = new URLSearchParams({ facilityIds, months });
  if (loungeIds) p.append('loungeIds', loungeIds);
  return p.toString();
};

export const fetchAdmissionKpi = createAsyncThunk(
  'admissions/fetchKpi',
  async (args) => {
    const response = await axios.get(`${API_URL}/v1/admissions/kpi?${buildParams(args)}`);
    return response.data;
  }
);

export const fetchAdmissionTrend = createAsyncThunk(
  'admissions/fetchTrend',
  async (args) => {
    const response = await axios.get(`${API_URL}/v1/admissions/trend?${buildParams(args)}`);
    return response.data;
  }
);

export const fetchAdmissionComposition = createAsyncThunk(
  'admissions/fetchComposition',
  async (args) => {
    const response = await axios.get(`${API_URL}/v1/admissions/composition?${buildParams(args)}`);
    return response.data;
  }
);

export const fetchAdmissionBirthWeight = createAsyncThunk(
  'admissions/fetchBirthWeight',
  async (args) => {
    const response = await axios.get(`${API_URL}/v1/admissions/birthweight?${buildParams(args)}`);
    return response.data;
  }
);

export const fetchAdmissionDischarge = createAsyncThunk(
  'admissions/fetchDischarge',
  async (args) => {
    const response = await axios.get(`${API_URL}/v1/admissions/discharge?${buildParams(args)}`);
    return response.data;
  }
);

export const fetchEarlyCareKpi = createAsyncThunk(
  'admissions/fetchEarlyCare',
  async (args) => {
    const response = await axios.get(`${API_URL}/v1/admissions/earlyCare?${buildParams(args)}`);
    return response.data;
  }
);

const admissionSlice = createSlice({
  name: 'admissions',
  initialState: {
    kpi:         null,
    trend:       [],
    composition: null,
    birthWeight: null,
    discharge:   null,
    earlyCare:   null,
    loading: { kpi: false, trend: false, composition: false, birthWeight: false, discharge: false, earlyCare: false },
    error: null,
  },
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchAdmissionKpi.pending,   (s) => { s.loading.kpi = true;  s.error = null; })
      .addCase(fetchAdmissionKpi.fulfilled, (s, a) => { s.loading.kpi = false; s.kpi = a.payload; })
      .addCase(fetchAdmissionKpi.rejected,  (s, a) => { s.loading.kpi = false; s.error = a.error.message; })

      .addCase(fetchAdmissionTrend.pending,   (s) => { s.loading.trend = true;  s.error = null; })
      .addCase(fetchAdmissionTrend.fulfilled, (s, a) => { s.loading.trend = false; s.trend = a.payload; })
      .addCase(fetchAdmissionTrend.rejected,  (s, a) => { s.loading.trend = false; s.error = a.error.message; })

      .addCase(fetchAdmissionComposition.pending,   (s) => { s.loading.composition = true;  s.error = null; })
      .addCase(fetchAdmissionComposition.fulfilled, (s, a) => { s.loading.composition = false; s.composition = a.payload; })
      .addCase(fetchAdmissionComposition.rejected,  (s, a) => { s.loading.composition = false; s.error = a.error.message; })

      .addCase(fetchAdmissionBirthWeight.pending,   (s) => { s.loading.birthWeight = true;  s.error = null; })
      .addCase(fetchAdmissionBirthWeight.fulfilled, (s, a) => { s.loading.birthWeight = false; s.birthWeight = a.payload; })
      .addCase(fetchAdmissionBirthWeight.rejected,  (s, a) => { s.loading.birthWeight = false; s.error = a.error.message; })

      .addCase(fetchAdmissionDischarge.pending,   (s) => { s.loading.discharge = true;  s.error = null; })
      .addCase(fetchAdmissionDischarge.fulfilled, (s, a) => { s.loading.discharge = false; s.discharge = a.payload; })
      .addCase(fetchAdmissionDischarge.rejected,  (s, a) => { s.loading.discharge = false; s.error = a.error.message; })

      .addCase(fetchEarlyCareKpi.pending,   (s) => { s.loading.earlyCare = true;  s.error = null; })
      .addCase(fetchEarlyCareKpi.fulfilled, (s, a) => { s.loading.earlyCare = false; s.earlyCare = a.payload; })
      .addCase(fetchEarlyCareKpi.rejected,  (s, a) => { s.loading.earlyCare = false; s.error = a.error.message; });
  },
});

export default admissionSlice.reducer;
