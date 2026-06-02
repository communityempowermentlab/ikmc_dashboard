import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5001/api';

const todayStr = () => new Date().toISOString().slice(0, 10);

const VISIBILITY_KEY = 'ikmc-section-visibility';

const DEFAULT_VISIBILITY = {
  kpiCards:        true,
  admissionTrend:  true,
  inbornOutborn:   true,
  birthWeight:     true,
  gender:          true,
  kmcDuration:     true,
  earlyCare:       true,
  transport:       true,
  discharge:       true,
  executiveSummary:true,
  stayDuration:    true,
  weightStability: true,
  breastfeeding:   true,
  nurseLounge:     true,
  nurseMatrix:     true,
  // Feature toggles (shared across dashboards)
  geminiInsights:  true,
  weeklyAnalysis:  true,
  debugIcons:      true,
};

function loadVisibility() {
  try {
    const saved = localStorage.getItem(VISIBILITY_KEY);
    if (saved) return { ...DEFAULT_VISIBILITY, ...JSON.parse(saved) };
  } catch {}
  return { ...DEFAULT_VISIBILITY };
}

// ── Async Thunks ──────────────────────────────────────────────────────────────

export const fetchStates = createAsyncThunk('filters/fetchStates', async () => {
  const res = await axios.get(`${API_URL}/v1/locations/states`);
  return res.data;
});

export const fetchDistricts = createAsyncThunk('filters/fetchDistricts', async (stateIds = []) => {
  const ids = Array.isArray(stateIds) ? stateIds.join(',') : (stateIds || '');
  const res = await axios.get(`${API_URL}/v1/locations/districts?stateIds=${ids}`);
  return res.data;
});

export const fetchFacilities = createAsyncThunk('filters/fetchFacilities', async (districtIds = []) => {
  const ids = Array.isArray(districtIds) ? districtIds.join(',') : (districtIds || '');
  const res = await axios.get(`${API_URL}/v1/locations/facilities?districtIds=${ids}`);
  return res.data;
});

export const fetchLounges = createAsyncThunk('filters/fetchLounges', async (facilityIds = []) => {
  const ids = Array.isArray(facilityIds) ? facilityIds.join(',') : (facilityIds || '');
  const res = await axios.get(`${API_URL}/v1/locations/lounges?facilityIds=${ids}`);
  return res.data;
});

export const fetchEarliestDate = createAsyncThunk('filters/fetchEarliestDate', async () => {
  const res = await axios.get(`${API_URL}/v1/admissions/earliest`);
  return res.data.earliest; // "YYYY-MM-DD" string
});

// ── Slice ─────────────────────────────────────────────────────────────────────

const initialState = {
  states:    [],
  districts: [],
  facilities:[],
  lounges:   [],

  selectedStates:     [],
  selectedDistricts:  [],
  selectedFacilities: [],
  selectedLounges:    [],

  startDate:    '',   // "YYYY-MM-DD" — set from DB earliest on bootstrap
  endDate:      '',   // "YYYY-MM-DD" — today by default
  earliestDate: '',   // saved for Reset button

  visibility: loadVisibility(),

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
    // Sets all four selections at once without cascade-clearing the option arrays
    // Used by the bootstrap so the filter drawer still has its options visible
    setAllSelections(state, action) {
      const { states, districts, facilities, lounges } = action.payload;
      state.selectedStates     = states     || [];
      state.selectedDistricts  = districts  || [];
      state.selectedFacilities = facilities || [];
      state.selectedLounges    = lounges    || [];
    },
    setDateRange(state, action) {
      state.startDate = action.payload.startDate;
      state.endDate   = action.payload.endDate;
    },
    setStartDate(state, action) { state.startDate = action.payload; },
    setEndDate(state, action)   { state.endDate   = action.payload; },
    toggleSectionVisibility(state, action) {
      const key = action.payload;
      if (key in state.visibility) {
        state.visibility[key] = !state.visibility[key];
        try { localStorage.setItem(VISIBILITY_KEY, JSON.stringify(state.visibility)); } catch {}
      }
    },
    resetSectionVisibility(state) {
      state.visibility = { ...DEFAULT_VISIBILITY };
      try { localStorage.setItem(VISIBILITY_KEY, JSON.stringify(state.visibility)); } catch {}
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
      .addCase(fetchLounges.rejected,  (s, a) => { s.loading.lounges = false; s.error = a.error.message; })

      .addCase(fetchEarliestDate.fulfilled, (s, a) => {
        const earliest = a.payload || todayStr();
        s.earliestDate = earliest;
        s.startDate    = earliest;   // full history — user can narrow with filters
        s.endDate      = todayStr();
      });
  },
});

export const {
  setSelectedStates,
  setSelectedDistricts,
  setSelectedFacilities,
  setSelectedLounges,
  setAllSelections,
  setDateRange,
  setStartDate,
  setEndDate,
  toggleSectionVisibility,
  resetSectionVisibility,
} = filterSlice.actions;

export default filterSlice.reducer;
