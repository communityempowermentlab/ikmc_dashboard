import React from 'react';
import './DebugModal.css';

const DebugModal = ({ info, onClose, filters }) => {
  if (!info) return null;

  // Format the applied filters from the global redux state
  const { selectedStates, selectedDistricts, selectedFacilities, selectedLounges, selectedMonths } = filters;

  return (
    <div className="debug-modal-overlay" onClick={onClose}>
      <div className="debug-modal-content" onClick={e => e.stopPropagation()}>
        <div className="debug-modal-header">
          <h2>
            🛠 Validation &amp; Debug Info
          </h2>
          <button className="debug-modal-close" onClick={onClose}>&times;</button>
        </div>
        <div className="debug-modal-body">
          
          <div className="debug-section">
            <h3>Module / Section</h3>
            <p><strong>{info.title}</strong></p>
          </div>

          <div className="debug-section">
            <h3>Data Source Information</h3>
            <p>Source Table: <code>{info.sourceTable || 'Multiple'}</code></p>
          </div>

          <div className="debug-section">
            <h3>Applied Filters</h3>
            <p><strong>States:</strong> {selectedStates?.length > 0 ? selectedStates.join(', ') : 'All'}</p>
            <p><strong>Districts:</strong> {selectedDistricts?.length > 0 ? selectedDistricts.join(', ') : 'All'}</p>
            <p><strong>Facilities:</strong> {selectedFacilities?.length > 0 ? selectedFacilities.join(', ') : 'All'}</p>
            <p><strong>Lounges:</strong> {selectedLounges?.length > 0 ? selectedLounges.join(', ') : 'All'}</p>
            <p><strong>Months:</strong> {selectedMonths?.length > 0 ? selectedMonths.join(', ') : 'None'}</p>
          </div>

          <div className="debug-section">
            <h3>Applied Logic</h3>
            <p>{info.appliedLogic}</p>
          </div>

          {info.queryLogic && (
            <div className="debug-section">
              <h3>Query Logic / Aggregation Logic</h3>
              <pre className="debug-code-block">{info.queryLogic}</pre>
            </div>
          )}

          {info.formulas && (
            <div className="debug-section">
              <h3>Formula / Calculation Logic</h3>
              {info.formulas.map((f, idx) => (
                <p key={idx}>{f}</p>
              ))}
            </div>
          )}

          {info.groupingLogic && (
            <div className="debug-section">
              <h3>Grouping Logic</h3>
              <p>{info.groupingLogic}</p>
            </div>
          )}

          {info.trendLogic && (
            <div className="debug-section">
              <h3>Trend Logic</h3>
              <p>{info.trendLogic}</p>
            </div>
          )}

          <div className="debug-section">
            <h3>Last Refreshed Time</h3>
            <p>{new Date().toLocaleString()}</p>
          </div>
          
        </div>
      </div>
    </div>
  );
};

export default DebugModal;
