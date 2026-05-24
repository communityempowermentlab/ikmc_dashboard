import React, { useState, useRef, useEffect, useMemo } from 'react';
import './SearchableSelect.css';

const SearchableSelect = ({
  id,
  label,
  options = [],
  value,           // string (single) | string[] (multiSelect)
  onChange,
  disabled = false,
  loading = false,
  placeholder = 'Select...',
  searchable = true,
  multiSelect = false,
  pluralLabel = 'items',   // used in "3 States selected"
}) => {
  const [isOpen, setIsOpen]         = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const wrapperRef    = useRef(null);
  const searchInputRef = useRef(null);
  const optionsRef    = useRef(null);

  // ── Derived values ──────────────────────────────────────────────────────────
  const selectedValues = useMemo(() => {
    if (!multiSelect) return null;
    return Array.isArray(value) ? value.map(String) : [];
  }, [multiSelect, value]);

  const formattedOptions = useMemo(
    () => options.map(opt => ({ ...opt, displayName: opt.name })),
    [options]
  );

  const filteredOptions = useMemo(() => {
    if (!searchTerm) return formattedOptions;
    const lower = searchTerm.toLowerCase();
    return formattedOptions.filter(o => o.displayName.toLowerCase().includes(lower));
  }, [formattedOptions, searchTerm]);

  // Single-select: currently selected option object
  const selectedOption = useMemo(
    () => multiSelect ? null : formattedOptions.find(o => String(o.id) === String(value)),
    [formattedOptions, value, multiSelect]
  );

  // Multi-select: "All X" / "3 X selected" / name / placeholder
  const multiTriggerText = useMemo(() => {
    if (!multiSelect) return null;
    const n = selectedValues.length;
    if (n === 0) return null;
    if (n === formattedOptions.length && formattedOptions.length > 0)
      return `All ${pluralLabel}`;
    if (n === 1) {
      const opt = formattedOptions.find(o => String(o.id) === selectedValues[0]);
      return opt ? opt.displayName : `1 ${pluralLabel.replace(/s$/, '')} selected`;
    }
    return `${n} ${pluralLabel} selected`;
  }, [multiSelect, selectedValues, formattedOptions, pluralLabel]);

  const isAllSelected = multiSelect
    && formattedOptions.length > 0
    && selectedValues.length === formattedOptions.length;

  // Filtered all-check (for when user is searching)
  const isAllFilteredSelected = multiSelect
    && filteredOptions.length > 0
    && filteredOptions.every(o => selectedValues.includes(String(o.id)));

  // ── Event handlers ──────────────────────────────────────────────────────────

  useEffect(() => {
    const onOutside = (e) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) setIsOpen(false);
    };
    document.addEventListener('mousedown', onOutside);
    return () => document.removeEventListener('mousedown', onOutside);
  }, []);

  useEffect(() => {
    if (isOpen) {
      setSearchTerm('');
      setFocusedIndex(-1);
      if (searchable && searchInputRef.current)
        setTimeout(() => searchInputRef.current?.focus(), 50);
    }
  }, [isOpen, searchable]);

  useEffect(() => {
    if (isOpen && focusedIndex >= 0 && optionsRef.current) {
      const el = optionsRef.current.children[focusedIndex];
      if (el) el.scrollIntoView({ block: 'nearest' });
    }
  }, [focusedIndex, isOpen]);

  const handleToggle = () => {
    if (!disabled && !loading) setIsOpen(v => !v);
  };

  // Single-select: pick & close
  const handleSingleSelect = (optId) => { onChange(optId); setIsOpen(false); };

  // Multi-select: toggle without closing
  const handleMultiToggle = (optId) => {
    const sid = String(optId);
    if (selectedValues.includes(sid)) {
      onChange((value || []).filter(v => String(v) !== sid));
    } else {
      onChange([...(value || []), optId]);
    }
  };

  // Multi-select: select all filtered / deselect all filtered
  const handleToggleAll = () => {
    if (isAllFilteredSelected) {
      const filteredIds = filteredOptions.map(o => String(o.id));
      onChange((value || []).filter(v => !filteredIds.includes(String(v))));
    } else {
      const existing = new Set((value || []).map(String));
      filteredOptions.forEach(o => existing.add(String(o.id)));
      // Preserve original IDs (not coerced to string) using options list
      const allIds = formattedOptions
        .filter(o => existing.has(String(o.id)))
        .map(o => o.id);
      onChange(allIds);
    }
  };

  const handleClearAll = (e) => { e.stopPropagation(); onChange([]); };
  const handleClearSingle = (e) => { e.stopPropagation(); onChange(''); };

  const handleKeyDown = (e) => {
    if (disabled || loading) return;
    if (!isOpen) {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
        e.preventDefault(); setIsOpen(true);
      }
      return;
    }
    switch (e.key) {
      case 'Escape':   setIsOpen(false); break;
      case 'ArrowDown':
        e.preventDefault();
        setFocusedIndex(p => p < filteredOptions.length - 1 ? p + 1 : p);
        break;
      case 'ArrowUp':
        e.preventDefault();
        setFocusedIndex(p => p > 0 ? p - 1 : 0);
        break;
      case 'Enter':
        e.preventDefault();
        if (focusedIndex >= 0 && focusedIndex < filteredOptions.length) {
          const opt = filteredOptions[focusedIndex];
          multiSelect ? handleMultiToggle(opt.id) : handleSingleSelect(opt.id);
        }
        break;
      default: break;
    }
  };

  // ── Render helpers ──────────────────────────────────────────────────────────

  const hasSelection = multiSelect ? selectedValues.length > 0 : Boolean(value);
  const triggerText  = multiSelect
    ? (multiTriggerText || placeholder)
    : (loading ? 'Loading...' : (selectedOption ? selectedOption.displayName : placeholder));
  const isPlaceholder = !loading && (multiSelect ? !multiTriggerText : !selectedOption);

  return (
    <div className="ss-wrapper" ref={wrapperRef}>
      {label && <label className="ss-label" htmlFor={id}>{label}</label>}

      <div
        className={`ss-trigger ${isOpen ? 'ss-open' : ''} ${(disabled || loading) ? 'ss-disabled' : ''}`}
        onClick={handleToggle}
        onKeyDown={handleKeyDown}
        tabIndex={disabled || loading ? -1 : 0}
        role="combobox"
        aria-expanded={isOpen}
        aria-controls={`${id}-listbox`}
        aria-haspopup="listbox"
        id={id}
      >
        <span className={`ss-trigger-text ${isPlaceholder ? 'ss-placeholder' : ''}`}>
          {loading ? 'Loading...' : triggerText}
        </span>

        {hasSelection && !disabled && !loading ? (
          <button
            type="button"
            className="ss-clear"
            onClick={multiSelect ? handleClearAll : handleClearSingle}
            title="Clear selection"
            aria-label="Clear selection"
          >×</button>
        ) : (
          <svg className="ss-chevron" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
          </svg>
        )}
      </div>

      {isOpen && (
        <div className="ss-dropdown">
          {searchable && (
            <div className="ss-search-wrap">
              <div className="ss-search-inner">
                <svg className="ss-search-icon" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" />
                </svg>
                <input
                  ref={searchInputRef}
                  type="text"
                  className="ss-search-input"
                  placeholder="Search..."
                  value={searchTerm}
                  onChange={e => { setSearchTerm(e.target.value); setFocusedIndex(-1); }}
                  onKeyDown={handleKeyDown}
                />
              </div>
            </div>
          )}

          {/* Select all / deselect all row (multi-select only) */}
          {multiSelect && !loading && filteredOptions.length > 0 && (
            <div className="ss-select-all" onClick={handleToggleAll}>
              <span className={`ss-mcheck ${isAllFilteredSelected ? 'ss-mcheck-on' : ''}`}>
                {isAllFilteredSelected && (
                  <svg width="9" height="9" viewBox="0 0 12 12" fill="none">
                    <path d="M2 6l3 3 5-5" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                )}
              </span>
              <span>{isAllFilteredSelected ? 'Deselect all' : 'Select all'}</span>
              {!searchTerm && (
                <span className="ss-select-all-count">{formattedOptions.length} total</span>
              )}
            </div>
          )}

          <div
            className="ss-options"
            ref={optionsRef}
            role="listbox"
            id={`${id}-listbox`}
          >
            {loading ? (
              <div className="ss-loading">
                <div className="ss-spinner"></div>Loading options...
              </div>
            ) : filteredOptions.length === 0 ? (
              <div className="ss-empty">No results found</div>
            ) : (
              filteredOptions.map((opt, idx) => {
                const isSelected = multiSelect
                  ? selectedValues.includes(String(opt.id))
                  : String(opt.id) === String(value);
                const isFocused = idx === focusedIndex;

                return (
                  <div
                    key={opt.id}
                    className={`ss-option ${isSelected ? 'ss-selected' : ''} ${isFocused ? 'ss-focused' : ''} ${multiSelect ? 'ss-option-multi' : ''}`}
                    onClick={() => multiSelect ? handleMultiToggle(opt.id) : handleSingleSelect(opt.id)}
                    role="option"
                    aria-selected={isSelected}
                  >
                    {multiSelect ? (
                      <span className={`ss-mcheck ${isSelected ? 'ss-mcheck-on' : ''}`}>
                        {isSelected && (
                          <svg width="9" height="9" viewBox="0 0 12 12" fill="none">
                            <path d="M2 6l3 3 5-5" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        )}
                      </span>
                    ) : (
                      <svg className="ss-option-check" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    )}
                    {opt.displayName}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default SearchableSelect;
