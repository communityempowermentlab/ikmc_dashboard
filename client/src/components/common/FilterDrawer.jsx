import React, { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
  fetchDistricts, fetchFacilities, fetchLounges,
  setSelectedStates, setSelectedDistricts, setSelectedFacilities, setSelectedLounges, setSelectedMonths
} from '../../redux/slices/filterSlice';
import SearchableSelect from './SearchableSelect';
import './FilterDrawer.css';

// ── Inline month multi-select ─────────────────────────────────────────────────
const MonthMultiSelect = ({ options, selected, onChange }) => {
  const allSelected = selected.length === options.length;

  const toggle = (id) => {
    if (selected.includes(id)) {
      if (selected.length > 1) onChange(selected.filter(m => m !== id));
    } else {
      onChange([...selected, id]);
    }
  };

  const toggleAll = () => {
    onChange(allSelected ? [options[options.length - 1].id] : options.map(o => o.id));
  };

  return (
    <div className="mm-wrap">
      <div className="mm-header-row">
        <span className="mm-field-label">Month(s)</span>
        <div className="mm-badge-count">
          {allSelected ? 'All' : `${selected.length}`} selected
        </div>
        <button type="button" className="mm-toggle-all-btn" onClick={toggleAll}>
          {allSelected ? 'Deselect all' : 'Select all'}
        </button>
      </div>
      <div className="mm-list">
        {options.map(opt => {
          const checked = selected.includes(opt.id);
          return (
            <label key={opt.id} className={`mm-item ${checked ? 'mm-item-checked' : ''}`}>
              <span className={`mm-checkbox ${checked ? 'mm-checked' : ''}`}>
                {checked && (
                  <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                    <path d="M2 6l3 3 5-5" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                )}
              </span>
              <input type="checkbox" className="mm-hidden-input" checked={checked} onChange={() => toggle(opt.id)} />
              <span className="mm-item-name">{opt.name}</span>
            </label>
          );
        })}
      </div>
    </div>
  );
};

// ── Main FilterDrawer ─────────────────────────────────────────────────────────
const FilterDrawer = ({ isOpen, onClose, monthOptions }) => {
  const dispatch = useDispatch();
  const {
    states, districts, facilities, lounges,
    selectedStates, selectedDistricts, selectedFacilities, selectedLounges, selectedMonths,
    loading
  } = useSelector(state => state.filters);

  const [draftStates,     setDraftStates]     = useState([]);
  const [draftDistricts,  setDraftDistricts]  = useState([]);
  const [draftFacilities, setDraftFacilities] = useState([]);
  const [draftLounges,    setDraftLounges]    = useState([]);
  const [draftMonths,     setDraftMonths]     = useState([]);

  // Sync draft when drawer opens
  useEffect(() => {
    if (isOpen) {
      setDraftStates(selectedStates);
      setDraftDistricts(selectedDistricts);
      setDraftFacilities(selectedFacilities);
      setDraftLounges(selectedLounges);
      setDraftMonths(selectedMonths.length ? selectedMonths : monthOptions.map(o => o.id));

      if (selectedStates.length)     dispatch(fetchDistricts(selectedStates));
      if (selectedDistricts.length)  dispatch(fetchFacilities(selectedDistricts));
      if (selectedFacilities.length) dispatch(fetchLounges(selectedFacilities));
    }
  }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleStatesChange = (vals) => {
    setDraftStates(vals);
    setDraftDistricts([]);
    setDraftFacilities([]);
    setDraftLounges([]);
    if (vals.length) dispatch(fetchDistricts(vals));
  };

  const handleDistrictsChange = (vals) => {
    setDraftDistricts(vals);
    setDraftFacilities([]);
    setDraftLounges([]);
    if (vals.length) dispatch(fetchFacilities(vals));
  };

  const handleFacilitiesChange = (vals) => {
    setDraftFacilities(vals);
    setDraftLounges([]);
    if (vals.length) dispatch(fetchLounges(vals));
  };

  const handleLoungesChange = (vals) => setDraftLounges(vals);

  const handleReset = () => {
    setDraftStates([]);
    setDraftDistricts([]);
    setDraftFacilities([]);
    setDraftLounges([]);
    setDraftMonths(monthOptions.map(o => o.id));
  };

  const handleApply = () => {
    dispatch(setSelectedStates(draftStates));
    dispatch(setSelectedDistricts(draftDistricts));
    dispatch(setSelectedFacilities(draftFacilities));
    dispatch(setSelectedLounges(draftLounges));
    dispatch(setSelectedMonths(draftMonths));
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
            disabled={!draftStates.length}
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
            disabled={!draftDistricts.length}
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
            onChange={handleLoungesChange}
            disabled={!draftFacilities.length}
            loading={loading.lounges}
            multiSelect
            pluralLabel="Lounges"
          />

          <MonthMultiSelect
            options={monthOptions}
            selected={draftMonths}
            onChange={setDraftMonths}
          />
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
