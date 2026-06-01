import React, { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Link } from 'react-router-dom';
import {
  fetchStates, fetchDistricts, fetchFacilities, fetchLounges,
  fetchEarliestDate,
  setAllSelections,
} from '../../redux/slices/filterSlice';
import FilterDrawer from './FilterDrawer';
import './HeaderFilters.css';

const fmtDDMMYYYY = s => (s ? `${s.slice(8)}-${s.slice(5, 7)}-${s.slice(0, 4)}` : '');

const HeaderFilters = () => {
  const dispatch = useDispatch();
  const { startDate, endDate } = useSelector(state => state.filters);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  useEffect(() => {
    const bootstrap = async () => {
      // Load all filter options in parallel
      const [statesRes, districtsRes, facilitiesRes, loungesRes] = await Promise.all([
        dispatch(fetchStates()),
        dispatch(fetchDistricts([])),
        dispatch(fetchFacilities([])),
        dispatch(fetchLounges([])),
      ]);

      // Select ALL available options as the default
      dispatch(setAllSelections({
        states:     statesRes.payload?.map(s => s.id)    || [],
        districts:  districtsRes.payload?.map(d => d.id) || [],
        facilities: facilitiesRes.payload?.map(f => f.id)|| [],
        lounges:    loungesRes.payload?.map(l => l.id)   || [],
      }));

      // Date range: From = first check-in record, To = today
      dispatch(fetchEarliestDate());
    };

    bootstrap();
  }, [dispatch]); // eslint-disable-line react-hooks/exhaustive-deps

  const filterBadge = startDate && endDate
    ? `${fmtDDMMYYYY(startDate)} → ${fmtDDMMYYYY(endDate)}`
    : null;

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

      <Link to="/district-weekly-dashboard" className="btn-district-view">
        District View
      </Link>

      <FilterDrawer
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
      />
    </div>
  );
};

export default HeaderFilters;
