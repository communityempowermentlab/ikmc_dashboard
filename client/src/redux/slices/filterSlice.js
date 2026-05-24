import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5001/api';

// ── Async Thunks ──────────────────────────────────────────────────────────────

export const fetchStates = createAsyncThunk('filters/fetchStates', async () => {
  const res = await axios.get(`${API_URL}/v1/locations/states`);
  return res.data;
});

// Accepts array of stateIds → GET /v1/locations/districts?stateIds=9,27
export const fetchDistricts = createAsyncThunk('filters/fetchDistricts', async (stateIds) => {
  const ids = Array.isArray(stateIds) ? stateIds.join(',') : stateIds;
  const res = await axios.get(`${API_URL}/v1/locations/districts?stateIds=${ids}`);
  return res.data;
});

// Accepts array of districtIds → GET /v1/locations/facilities?districtIds=136,137
export const fetchFacilities = createAsyncThunk('filters/fetchFacilities', async (districtIds) => {
  const ids = Array.isArray(districtIds) ? districtIds.join(',') : districtIds;
  const res = await axios.get(`${API_URL}/v1/locations/facilities?districtIds=${ids}`);
  return res.data;
});

// Accepts array of facilityIds → GET /v1/locations/lounges?facilityIds=228,229
export const fetchLounges = createAsyncThunk('filters/fetchLounges', async (facilityIds) => {
  const ids = Array.isArray(facilityIds) ? facilityIds.join(',') : facilityIds;
  const res = await axios.get(`${API_URL}/v1/locations/lounges?facilityIds=${ids}`);
  return res.data;
});

// ── Slice ─────────────────────────────────────────────────────────────────────

const initialState = {
  states:    [],
  districts: [],
  facilities:[],
  lounges:   [],

  // All selections are arrays of IDs
  selectedStates:     [],
  selectedDistricts:  [],
  selectedFacilities: [],
  selectedLounges:    [],
  selectedMonths:     [],   // array of "YYYY-MM" strings

  loading: { states: false, districts: false, facilities: false, lounges: false },
  error: null,
};

const filterSlice = createSlice({
  name: 'filters',
  initialState,
  reducers: {
    setSelectedStates(state, action) {
      state.selectedStates     = action.payload;
      state.selectedDistricts  = [];
      state.selectedFacilities = [];
      state.selectedLounges    = [];
      state.districts  = [];
      state.facilities = [];
      state.lounges    = [];
    },
    setSelectedDistricts(state, action) {
      state.selectedDistricts  = action.payload;
      state.selectedFacilities = [];
      state.selectedLounges    = [];
      state.facilities = [];
      state.lounges    = [];
    },
    setSelectedFacilities(state, action) {
      state.selectedFacilities = action.payload;
      state.selectedLounges    = [];
      state.lounges = [];
    },
    setSelectedLounges(state, action) {
      state.selectedLounges = action.payload;
    },
    setSelectedMonths(state, action) {
      state.selectedMonths = action.payload;
    },
    toggleMonth(state, action) {
      const id  = action.payload;
      const idx = state.selectedMonths.indexOf(id);
      if (idx === -1) {
        state.selectedMonths = [...state.selectedMonths, id];
      } else if (state.selectedMonths.length > 1) {
        state.selectedMonths = state.selectedMonths.filter(m => m !== id);
      }
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchStates.pending,    s => { s.loading.states = true; })
      .addCase(fetchStates.fulfilled,  (s, a) => { s.loading.states = false; s.states = a.payload; })
      .addCase(fetchStates.rejected,   (s, a) => { s.loading.states = false; s.error = a.error.message; })

      .addCase(fetchDistricts.pending,   s => { s.loading.districts = true; })
      .addCase(fetchDistricts.fulfilled, (s, a) => { s.loading.districts = false; s.districts = a.payload; })
      .addCase(fetchDistricts.rejected,  (s, a) => { s.loading.districts = false; s.error = a.error.message; })

      .addCase(fetchFacilities.pending,   s => { s.loading.facilities = true; })
      .addCase(fetchFacilities.fulfilled, (s, a) => { s.loading.facilities = false; s.facilities = a.payload; })
      .addCase(fetchFacilities.rejected,  (s, a) => { s.loading.facilities = false; s.error = a.error.message; })

      .addCase(fetchLounges.pending,   s => { s.loading.lounges = true; })
      .addCase(fetchLounges.fulfilled, (s, a) => { s.loading.lounges = false; s.lounges = a.payload; })
      .addCase(fetchLounges.rejected,  (s, a) => { s.loading.lounges = false; s.error = a.error.message; });
  },
});

export const {
  setSelectedStates,
  setSelectedDistricts,
  setSelectedFacilities,
  setSelectedLounges,
  setSelectedMonths,
  toggleMonth,
} = filterSlice.actions;

export default filterSlice.reducer;
