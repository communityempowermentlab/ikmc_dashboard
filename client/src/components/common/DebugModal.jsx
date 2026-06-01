import React, { useState } from 'react';
import './DebugModal.css';

// Replace :paramName with actual values in SQL strings
function fillQuery(sql, params) {
  if (!sql || !params) return sql;
  return Object.entries(params).reduce((s, [key, val]) => {
    const escaped = val == null ? 'NULL' : String(val);
    return s.replace(new RegExp(`:${key}\\b`, 'g'), escaped);
  }, sql);
}

// Copy-to-clipboard button for the query block
function CopyButton({ text }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };
  return (
    <button className="debug-copy-btn" onClick={handleCopy} title="Copy query">
      {copied ? (
        <>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
          Copied!
        </>
      ) : (
        <>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
          </svg>
          Copy
        </>
      )}
    </button>
  );
}

const DebugModal = ({ info, onClose, filters, filterRows, queryParams }) => {
  if (!info) return null;

  const { selectedStates, selectedDistricts, selectedFacilities, selectedLounges, selectedMonths } = filters || {};

  return (
    <div className="debug-modal-overlay" onClick={onClose}>
      <div className="debug-modal-content" onClick={e => e.stopPropagation()}>
        <div className="debug-modal-header">
          <h2>🛠 Validation &amp; Debug Info</h2>
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
            {filterRows ? (
              filterRows.map(({ label, value }) => (
                <p key={label}><strong>{label}:</strong> {value || 'All'}</p>
              ))
            ) : (
              <>
                <p><strong>States:</strong> {selectedStates?.length > 0 ? selectedStates.join(', ') : 'All'}</p>
                <p><strong>Districts:</strong> {selectedDistricts?.length > 0 ? selectedDistricts.join(', ') : 'All'}</p>
                <p><strong>Facilities:</strong> {selectedFacilities?.length > 0 ? selectedFacilities.join(', ') : 'All'}</p>
                <p><strong>Lounges:</strong> {selectedLounges?.length > 0 ? selectedLounges.join(', ') : 'All'}</p>
                <p><strong>Months:</strong> {selectedMonths?.length > 0 ? selectedMonths.join(', ') : 'None'}</p>
              </>
            )}
          </div>

          <div className="debug-section">
            <h3>Applied Logic</h3>
            <p>{info.appliedLogic}</p>
          </div>

          {info.queryLogic && (() => {
            const filledSql = fillQuery(info.queryLogic, queryParams);
            return (
              <div className="debug-section">
                <div className="debug-section-title-row">
                  <h3>Query Logic / Aggregation Logic</h3>
                  <CopyButton text={filledSql} />
                </div>
                <pre className="debug-code-block">{filledSql}</pre>
              </div>
            );
          })()}

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
