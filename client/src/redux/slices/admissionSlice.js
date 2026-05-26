import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5001/api';

const buildParams = ({ facilityIds, startDate, endDate, loungeIds }) => {
  const p = new URLSearchParams({ facilityIds, startDate, endDate });
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

export const fetchTransportKpi = createAsyncThunk(
  'admissions/fetchTransport',
  async (args) => {
    const response = await axios.get(`${API_URL}/v1/admissions/transport?${buildParams(args)}`);
    return response.data;
  }
);

export const fetchKmcDurationTrend = createAsyncThunk(
  'admissions/fetchKmcDuration',
  async (args) => {
    const response = await axios.get(`${API_URL}/v1/admissions/kmcDuration?${buildParams(args)}`);
    return response.data;
  }
);

export const fetchGenderComposition = createAsyncThunk(
  'admissions/fetchGender',
  async (args) => {
    const response = await axios.get(`${API_URL}/v1/admissions/gender?${buildParams(args)}`);
    return response.data;
  }
);

export const fetchSummaryTable = createAsyncThunk(
  'admissions/fetchSummary',
  async (args) => {
    const response = await axios.get(`${API_URL}/v1/admissions/summary?${buildParams(args)}`);
    return response.data;
  }
);

export const fetchStayDuration = createAsyncThunk(
  'admissions/fetchStayDuration',
  async (args) => {
    const response = await axios.get(`${API_URL}/v1/admissions/stayDuration?${buildParams(args)}`);
    return response.data;
  }
);

export const fetchWeightStability = createAsyncThunk(
  'admissions/fetchWeightStability',
  async (args) => {
    const response = await axios.get(`${API_URL}/v1/admissions/weightStability?${buildParams(args)}`);
    return response.data;
  }
);

export const fetchBreastfeeding = createAsyncThunk(
  'admissions/fetchBreastfeeding',
  async (args) => {
    const response = await axios.get(`${API_URL}/v1/admissions/breastfeeding?${buildParams(args)}`);
    return response.data;
  }
);

const admissionSlice = createSlice({
  name: 'admissions',
  initialState: {
    kpi:          null,
    trend:        [],
    composition:  null,
    birthWeight:  null,
    discharge:    null,
    earlyCare:    null,
    transport:    null,
    kmcDuration:  [],
    gender:       null,
    summaryTable: null,
    stayDuration:    null,
    weightStability: null,
    breastfeeding:   null,
    loading: {
      kpi: false, trend: false, composition: false, birthWeight: false,
      discharge: false, earlyCare: false, transport: false, kmcDuration: false,
      gender: false, summary: false, stayDuration: false,
      weightStability: false, breastfeeding: false,
    },
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
      .addCase(fetchEarlyCareKpi.rejected,  (s, a) => { s.loading.earlyCare = false; s.error = a.error.message; })

      .addCase(fetchTransportKpi.pending,   (s) => { s.loading.transport = true;  s.error = null; })
      .addCase(fetchTransportKpi.fulfilled, (s, a) => { s.loading.transport = false; s.transport = a.payload; })
      .addCase(fetchTransportKpi.rejected,  (s, a) => { s.loading.transport = false; s.error = a.error.message; })

      .addCase(fetchKmcDurationTrend.pending,   (s) => { s.loading.kmcDuration = true;  s.error = null; })
      .addCase(fetchKmcDurationTrend.fulfilled, (s, a) => { s.loading.kmcDuration = false; s.kmcDuration = a.payload; })
      .addCase(fetchKmcDurationTrend.rejected,  (s, a) => { s.loading.kmcDuration = false; s.error = a.error.message; })

      .addCase(fetchGenderComposition.pending,   (s) => { s.loading.gender = true;  s.error = null; })
      .addCase(fetchGenderComposition.fulfilled, (s, a) => { s.loading.gender = false; s.gender = a.payload; })
      .addCase(fetchGenderComposition.rejected,  (s, a) => { s.loading.gender = false; s.error = a.error.message; })

      .addCase(fetchSummaryTable.pending,   (s) => { s.loading.summary = true;  s.error = null; })
      .addCase(fetchSummaryTable.fulfilled, (s, a) => { s.loading.summary = false; s.summaryTable = a.payload; })
      .addCase(fetchSummaryTable.rejected,  (s, a) => { s.loading.summary = false; s.error = a.error.message; })

      .addCase(fetchStayDuration.pending,   (s) => { s.loading.stayDuration = true;  s.error = null; })
      .addCase(fetchStayDuration.fulfilled, (s, a) => { s.loading.stayDuration = false; s.stayDuration = a.payload; })
      .addCase(fetchStayDuration.rejected,  (s, a) => { s.loading.stayDuration = false; s.error = a.error.message; })

      .addCase(fetchWeightStability.pending,   (s) => { s.loading.weightStability = true;  s.error = null; })
      .addCase(fetchWeightStability.fulfilled, (s, a) => { s.loading.weightStability = false; s.weightStability = a.payload; })
      .addCase(fetchWeightStability.rejected,  (s, a) => { s.loading.weightStability = false; s.error = a.error.message; })

      .addCase(fetchBreastfeeding.pending,   (s) => { s.loading.breastfeeding = true;  s.error = null; })
      .addCase(fetchBreastfeeding.fulfilled, (s, a) => { s.loading.breastfeeding = false; s.breastfeeding = a.payload; })
      .addCase(fetchBreastfeeding.rejected,  (s, a) => { s.loading.breastfeeding = false; s.error = a.error.message; });
  },
});

export default admissionSlice.reducer;
