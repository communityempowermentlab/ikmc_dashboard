import React from 'react';
import { useSelector } from 'react-redux';

const DebugIcon = ({ info, onClick }) => {
  const debugIcons = useSelector(s => s.filters?.visibility?.debugIcons);

  if (debugIcons === false) return null;

  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        onClick(info);
      }}
      className="debug-icon-btn"
      title="Validation & Debug Info"
      aria-label="Open validation debug panel"
    >
      ⚙
    </button>
  );
};

export default DebugIcon;
