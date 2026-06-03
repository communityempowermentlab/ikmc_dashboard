import React from 'react';
import { useSelector } from 'react-redux';

const KpiIcon = ({ emoji, size = 44 }) => {
  const kpiIcons = useSelector(s => s.filters?.visibility?.kpiIcons);
  if (kpiIcons === false) return null;
  return (
    <span
      aria-hidden="true"
      style={{
        fontSize:      size,
        lineHeight:    1,
        userSelect:    'none',
        pointerEvents: 'none',
        filter:        'drop-shadow(0 1px 3px rgba(0,0,0,0.12))',
      }}
    >
      {emoji}
    </span>
  );
};

export default KpiIcon;
