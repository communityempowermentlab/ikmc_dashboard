import React from 'react';

const DebugIcon = ({ info, onClick }) => {
  // Only render if VITE_DEBUG_MODE is enabled
  if (import.meta.env.VITE_DEBUG_MODE !== 'true') return null;

  return (
    <button 
      onClick={(e) => {
        e.stopPropagation();
        onClick(info);
      }}
      className="debug-icon-btn"
      title="Settings / Info / Debug"
      aria-label="Open validation debug panel"
    >
      ⚙
    </button>
  );
};

export default DebugIcon;
