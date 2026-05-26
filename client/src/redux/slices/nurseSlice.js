import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5001/api';

const buildParams = ({ facilityIds, startDate, endDate, loungeIds }) => {
  const p = new URLSearchParams({ facilityIds, startDate, endDate });
  if (loungeIds) p.append('loungeIds', loungeIds);
  return p.toString();
};

export const fetchLoungePerformance = createAsyncThunk(
  'nurses/fetchLoungePerformance',
  async (args) => {
    const response = await axios.get(`${API_URL}/v1/nurses/loungePerformance?${buildParams(args)}`);
    return response.data;
  }
);

export const fetchAttendanceMatrix = createAsyncThunk(
  'nurses/fetchAttendanceMatrix',
  async (args) => {
    const response = await axios.get(`${API_URL}/v1/nurses/attendanceMatrix?${buildParams(args)}`);
    return response.data;
  }
);

const nurseSlice = createSlice({
  name: 'nurses',
  initialState: {
    loungePerformance: null,
    attendanceMatrix:  null,
    loading: {
      loungePerformance: false,
      attendanceMatrix:  false,
    },
    error: null,
  },
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchLoungePerformance.pending,   (s) => { s.loading.loungePerformance = true;  s.error = null; })
      .addCase(fetchLoungePerformance.fulfilled, (s, a) => { s.loading.loungePerformance = false; s.loungePerformance = a.payload; })
      .addCase(fetchLoungePerformance.rejected,  (s, a) => { s.loading.loungePerformance = false; s.error = a.error.message; })

      .addCase(fetchAttendanceMatrix.pending,   (s) => { s.loading.attendanceMatrix = true;  s.error = null; })
      .addCase(fetchAttendanceMatrix.fulfilled, (s, a) => { s.loading.attendanceMatrix = false; s.attendanceMatrix = a.payload; })
      .addCase(fetchAttendanceMatrix.rejected,  (s, a) => { s.loading.attendanceMatrix = false; s.error = a.error.message; });
  },
});

export default nurseSlice.reducer;
