import React, { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
  fetchDistricts, fetchFacilities, fetchLounges,
  setSelectedStates, setSelectedDistricts, setSelectedFacilities, setSelectedLounges,
  setAllSelections, setDateRange, toggleSectionVisibility, resetSectionVisibility,
} from '../../redux/slices/filterSlice';
import SearchableSelect from './SearchableSelect';
import './FilterDrawer.css';

const SECTION_LABELS = [
  { key: 'kpiCards',         label: 'KPI Summary Cards' },
  { key: 'admissionTrend',   label: 'Admission Trend' },
  { key: 'inbornOutborn',    label: 'Inborn / Outborn Composition' },
  { key: 'birthWeight',      label: 'Birth Weight Distribution' },
  { key: 'gender',           label: 'Gender Composition' },
  { key: 'kmcDuration',      label: 'KMC Duration Trend' },
  { key: 'earlyCare',        label: 'Early Care Indicators' },
  { key: 'transport',        label: 'Transportation in KMC Position' },
  { key: 'discharge',        label: 'Discharge Outcomes' },
  { key: 'executiveSummary', label: 'Executive Performance Summary' },
  { key: 'stayDuration',     label: 'Stay Duration Analytics' },
  { key: 'weightStability',  label: 'Weight Stability Analytics' },
  { key: 'breastfeeding',    label: 'Breastfeeding Analytics' },
  { key: 'nurseLounge',      label: 'Nurse Lounge Performance' },
  { key: 'nurseMatrix',      label: 'Nurse Attendance Matrix' },
];

const FEATURE_LABELS = [
  { key: 'geminiInsights', label: '✦ AI विश्लेषण (Gemini)', desc: 'Main dashboard Hindi insights' },
  { key: 'weeklyAnalysis', label: 'साप्ताहिक विश्लेषण',     desc: 'District dashboard weekly insights' },
  { key: 'debugIcons',     label: '⚙ Validation & Debug Icons', desc: 'Show/hide settings icons on all cards' },
];

const todayStr = () => new Date().toISOString().slice(0, 10);

// ── Date Range Section ────────────────────────────────────────────────────────
const DateRangePicker = ({ startDate, endDate, onStartChange, onEndChange }) => {
  const today = todayStr();
  return (
    <div className="dr-wrap">
      <div className="dr-section-label">Date Range</div>
      <div className="dr-row">
        <div className="dr-field">
          <label className="dr-field-label">From Date</label>
          <input
            type="date"
            className="dr-input"
            value={startDate}
            max={endDate || today}
            onChange={e => onStartChange(e.target.value)}
          />
        </div>
        <div className="dr-field">
          <label className="dr-field-label">To Date</label>
          <input
            type="date"
            className="dr-input"
            value={endDate}
            min={startDate}
            max={today}
            onChange={e => onEndChange(e.target.value)}
          />
        </div>
      </div>
    </div>
  );
};

// ── Main FilterDrawer ─────────────────────────────────────────────────────────
const FilterDrawer = ({ isOpen, onClose }) => {
  const dispatch = useDispatch();
  const {
    states, districts, facilities, lounges,
    selectedStates, selectedDistricts, selectedFacilities, selectedLounges,
    startDate, endDate, earliestDate, visibility,
    loading
  } = useSelector(state => state.filters);

  const [draftStates,     setDraftStates]     = useState([]);
  const [draftDistricts,  setDraftDistricts]  = useState([]);
  const [draftFacilities, setDraftFacilities] = useState([]);
  const [draftLounges,    setDraftLounges]    = useState([]);
  const [draftStartDate,  setDraftStartDate]  = useState('');
  const [draftEndDate,    setDraftEndDate]    = useState('');

  // Sync draft when drawer opens; reload child options relative to current selections
  useEffect(() => {
    if (!isOpen) return;
    setDraftStates(selectedStates);
    setDraftDistricts(selectedDistricts);
    setDraftFacilities(selectedFacilities);
    setDraftLounges(selectedLounges);
    setDraftStartDate(startDate);
    setDraftEndDate(endDate);

    // Reload options scoped to current selections (empty = all)
    dispatch(fetchDistricts(selectedStates));
    dispatch(fetchFacilities(selectedDistricts));
    dispatch(fetchLounges(selectedFacilities));
  }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Cascade handlers ───────────────────────────────────────────────────────

  const handleStatesChange = (vals) => {
    setDraftStates(vals);
    setDraftDistricts([]);
    setDraftFacilities([]);
    setDraftLounges([]);
    // Empty vals → fetch all districts; non-empty → fetch filtered
    dispatch(fetchDistricts(vals));
    dispatch(fetchFacilities([]));
    dispatch(fetchLounges([]));
  };

  const handleDistrictsChange = (vals) => {
    setDraftDistricts(vals);
    setDraftFacilities([]);
    setDraftLounges([]);
    dispatch(fetchFacilities(vals));
    dispatch(fetchLounges([]));
  };

  const handleFacilitiesChange = (vals) => {
    setDraftFacilities(vals);
    setDraftLounges([]);
    dispatch(fetchLounges(vals));
  };

  const handleReset = () => {
    // Reset to default: ALL options selected, full date range
    const allStateIds    = states.map(s => s.id);
    const allDistIds     = districts.map(d => d.id);
    const allFacIds      = facilities.map(f => f.id);
    const allLoungeIds   = lounges.map(l => l.id);
    setDraftStates(allStateIds);
    setDraftDistricts(allDistIds);
    setDraftFacilities(allFacIds);
    setDraftLounges(allLoungeIds);
    setDraftStartDate(earliestDate || startDate);
    setDraftEndDate(todayStr());
  };

  const handleApply = () => {
    // Use setAllSelections to avoid cascade clearing of option arrays
    dispatch(setAllSelections({
      states:     draftStates,
      districts:  draftDistricts,
      facilities: draftFacilities,
      lounges:    draftLounges,
    }));
    dispatch(setDateRange({ startDate: draftStartDate, endDate: draftEndDate }));
    onClose();
  };

  return (
    <>
      <div className={`filter-drawer-overlay ${isOpen ? 'open' : ''}`} onClick={onClose} />
      <div className={`filter-drawer ${isOpen ? 'open' : ''}`}>

        <div className="filter-drawer-header">
          <div className="filter-drawer-title">
            <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
            </svg>
            Filters
          </div>
          <button className="filter-drawer-close" onClick={onClose}>&times;</button>
        </div>

        <div className="filter-drawer-body">
          {/* No disabled constraints — all levels always accessible */}
          <SearchableSelect
            id="draft-sel-state"
            label="State"
            placeholder="All States"
            options={states}
            value={draftStates}
            onChange={handleStatesChange}
            loading={loading.states}
            multiSelect
            pluralLabel="States"
          />
          <SearchableSelect
            id="draft-sel-district"
            label="District"
            placeholder="All Districts"
            options={districts}
            value={draftDistricts}
            onChange={handleDistrictsChange}
            loading={loading.districts}
            multiSelect
            pluralLabel="Districts"
          />
          <SearchableSelect
            id="draft-sel-facility"
            label="Facility"
            placeholder="All Facilities"
            options={facilities}
            value={draftFacilities}
            onChange={handleFacilitiesChange}
            loading={loading.facilities}
            multiSelect
            pluralLabel="Facilities"
          />
          <SearchableSelect
            id="draft-sel-lounge"
            label="Lounge"
            placeholder="All Lounges"
            options={lounges}
            value={draftLounges}
            onChange={(vals) => setDraftLounges(vals)}
            loading={loading.lounges}
            multiSelect
            pluralLabel="Lounges"
          />

          <DateRangePicker
            startDate={draftStartDate}
            endDate={draftEndDate}
            onStartChange={setDraftStartDate}
            onEndChange={setDraftEndDate}
          />

          {/* ── Feature Toggles ── */}
          <div className="vis-wrap">
            <div className="vis-header">
              <span className="dr-section-label">Feature Toggles</span>
            </div>
            <div className="vis-feature-list">
              {FEATURE_LABELS.map(({ key, label, desc }) => (
                <label key={key} className="vis-feature-row">
                  <div className="vis-feature-info">
                    <span className="vis-feature-label">{label}</span>
                    <span className="vis-feature-desc">{desc}</span>
                  </div>
                  <div
                    className={`vis-pill ${visibility[key] !== false ? 'vis-pill-on' : 'vis-pill-off'}`}
                    onClick={() => dispatch(toggleSectionVisibility(key))}
                    role="switch"
                    aria-checked={visibility[key] !== false}
                  >
                    <div className="vis-pill-thumb" />
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* ── Dashboard Section Visibility ── */}
          <div className="vis-wrap">
            <div className="vis-header">
              <span className="dr-section-label">Dashboard Sections</span>
              <button
                className="vis-reset-btn"
                onClick={() => dispatch(resetSectionVisibility())}
                title="Show all sections"
              >
                Show All
              </button>
            </div>
            <div className="vis-grid">
              {SECTION_LABELS.map(({ key, label }) => (
                <label key={key} className="vis-toggle">
                  <input
                    type="checkbox"
                    className="vis-checkbox"
                    checked={visibility[key] !== false}
                    onChange={() => dispatch(toggleSectionVisibility(key))}
                  />
                  <span className="vis-label">{label}</span>
                </label>
              ))}
            </div>
          </div>
        </div>

        <div className="filter-drawer-footer">
          <button className="btn-drawer btn-drawer-reset" onClick={handleReset}>Reset</button>
          <button className="btn-drawer btn-drawer-apply" onClick={handleApply}>Apply Filters</button>
        </div>
      </div>
    </>
  );
};

export default FilterDrawer;
