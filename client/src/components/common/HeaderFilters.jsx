import React, { useEffect, useMemo, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {
  fetchStates, fetchDistricts, fetchFacilities, fetchLounges,
  setSelectedStates, setSelectedDistricts, setSelectedFacilities, setSelectedLounges, setSelectedMonths
} from '../../redux/slices/filterSlice';
import { generateMonthOptions } from '../../utils/formatters';
import FilterDrawer from './FilterDrawer';
import './HeaderFilters.css';

const HeaderFilters = ({ onBootstrapComplete }) => {
  const dispatch = useDispatch();
  const {
    states, districts, facilities, lounges,
    selectedStates, selectedDistricts, selectedFacilities, selectedLounges, selectedMonths
  } = useSelector(state => state.filters);

  const [isDrawerOpen,     setIsDrawerOpen]     = useState(false);
  const [isBootstrapping,  setIsBootstrapping]  = useState(true);

  // Initial fetch
  useEffect(() => { dispatch(fetchStates()); }, [dispatch]);

  // Step 1: auto-select UP state (id=9)
  useEffect(() => {
    if (isBootstrapping && states.length > 0 && !selectedStates.length) {
      const up = states.find(s => s.id === 9 || String(s.id) === '9') || states[0];
      if (up) {
        dispatch(setSelectedStates([up.id]));
        dispatch(fetchDistricts([up.id]));
      }
    }
  }, [states, isBootstrapping, selectedStates.length, dispatch]);

  // Step 2: auto-select Ghaziabad district (id=136)
  useEffect(() => {
    if (isBootstrapping && districts.length > 0 && selectedStates.length && !selectedDistricts.length) {
      const d = districts.find(d => d.id === 136 || String(d.id) === '136') || districts[0];
      if (d) {
        dispatch(setSelectedDistricts([d.id]));
        dispatch(fetchFacilities([d.id]));
      }
    }
  }, [districts, isBootstrapping, selectedStates.length, selectedDistricts.length, dispatch]);

  // Step 3: auto-select DWH Ghaziabad facility (id=228)
  useEffect(() => {
    if (isBootstrapping && facilities.length > 0 && selectedDistricts.length && !selectedFacilities.length) {
      const f = facilities.find(f => f.id === 228 || String(f.id) === '228') || facilities[0];
      if (f) {
        dispatch(setSelectedFacilities([f.id]));
        dispatch(fetchLounges([f.id]));
      }
    }
  }, [facilities, isBootstrapping, selectedDistricts.length, selectedFacilities.length, dispatch]);

  // Step 4: auto-select MNCU lounge (id=222) → finish bootstrap
  useEffect(() => {
    if (isBootstrapping && lounges.length > 0 && selectedFacilities.length && !selectedLounges.length) {
      const l = lounges.find(l => l.id === 222 || String(l.id) === '222') || lounges[0];
      if (l) {
        dispatch(setSelectedLounges([l.id]));
        setIsBootstrapping(false);
        if (onBootstrapComplete) onBootstrapComplete();
      }
    }
  }, [lounges, isBootstrapping, selectedFacilities.length, selectedLounges.length, dispatch, onBootstrapComplete]);

  // Month options (Jan 2026 → current month)
  const monthOptions = useMemo(() => generateMonthOptions(2026, 1), []);

  // Default: all months selected
  useEffect(() => {
    if (selectedMonths.length === 0 && monthOptions.length > 0) {
      dispatch(setSelectedMonths(monthOptions.map(m => m.id)));
    }
  }, [selectedMonths.length, monthOptions, dispatch]);

  // Filters button badge label
  const filterBadge = useMemo(() => {
    const parts = [];
    if (selectedFacilities.length === 1) {
      // show nothing extra — facility name too long for badge
    } else if (selectedFacilities.length > 1) {
      parts.push(`${selectedFacilities.length} facilities`);
    }
    if (selectedMonths.length && selectedMonths.length < monthOptions.length) {
      parts.push(`${selectedMonths.length} mo`);
    }
    return parts.length ? parts.join(' · ') : null;
  }, [selectedFacilities, selectedMonths, monthOptions]);

  return (
    <div className="hf-bar">
      <button
        className="btn-export"
        onClick={() => setIsDrawerOpen(true)}
        style={{ background: 'var(--blue-bg)', borderColor: 'var(--blue-mid)', color: 'var(--blue-mid)' }}
      >
        <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
        </svg>
        Filters
        {filterBadge && (
          <span style={{
            fontSize: '10px', fontWeight: 700,
            background: 'var(--blue-mid)', color: '#fff',
            borderRadius: '99px', padding: '1px 7px', marginLeft: '2px'
          }}>
            {filterBadge}
          </span>
        )}
      </button>

      <FilterDrawer
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        monthOptions={monthOptions}
      />
    </div>
  );
};

export default HeaderFilters;
