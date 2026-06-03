import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import usePageMeta from '../../hooks/usePageMeta';
import { Link } from 'react-router-dom';
import html2canvas from 'html2canvas';
import {
  fetchDistrictFilters,
  fetchDistrictKpis,
  fetchFacilityMatrix,
  fetchWeeklyInsights,
} from '../../redux/slices/districtSlice';
import DebugIcon from '../../components/common/DebugIcon';
import DebugModal from '../../components/common/DebugModal';
import KpiIcon from '../../components/common/KpiIcon';
import SearchableSelect from '../../components/common/SearchableSelect';
import './DistrictDashboard.css';

const MAX_RANGE_DAYS = 7;

const DAY_ABBR = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const toTitleCase = s => s.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());

const fmtDDMMYYYY = s => (s ? `${s.slice(8)}-${s.slice(5, 7)}-${s.slice(0, 4)}` : '');

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}
function sevenDaysAgoStr() {
  return new Date(Date.now() - 6 * 86400000).toISOString().slice(0, 10);
}

// ── Insight computation ────────────────────────────────────────────────────
function computeInsights(mat, kpis) {
  if (!mat?.facilities?.length || !kpis) return [];

  const facs      = mat.facilities;
  const totalDays = mat.dates.length;
  const insights  = [];

  // Overall app use sentiment
  insights.push({
    type: kpis.appUsePct >= 70 ? 'positive' : kpis.appUsePct >= 40 ? 'warning' : 'critical',
    text: `Daily app compliance: ${kpis.appUsePct}% — ${kpis.appUseLounges} of ${kpis.totalLounges} lounges checked in every day of the ${kpis.totalDays}-day range.`,
  });

  // Best performing facility
  const activeFacs = facs.filter(f => f.appUseDays > 0).sort((a, b) => b.appUsePct - a.appUsePct);
  if (activeFacs.length) {
    const best = activeFacs[0];
    insights.push({
      type: 'positive',
      text: `${best.name} achieved the highest weekly iKMC app usage at ${best.appUsePct}% (${best.appUseDays} of ${totalDays} days).`,
    });
  }

  // Facilities with zero app activity
  const noActivity = facs.filter(f => f.appUseDays === 0);
  if (noActivity.length) {
    const names = noActivity.slice(0, 2).map(f => f.name).join(', ')
      + (noActivity.length > 2 ? ` and ${noActivity.length - 2} more` : '');
    insights.push({
      type: noActivity.length >= Math.ceil(facs.length / 2) ? 'critical' : 'warning',
      text: `${noActivity.length} facilit${noActivity.length > 1 ? 'ies' : 'y'} had no iKMC app activity this week: ${names}.`,
    });
  }

  // Facilities with complete activity
  const fullActivity = facs.filter(f => f.appUsePct === 100);
  if (fullActivity.length) {
    insights.push({
      type: 'positive',
      text: `${fullActivity.length} facilit${fullActivity.length > 1 ? 'ies' : 'y'} maintained complete daily iKMC app usage throughout the week.`,
    });
  }

  // Highest LBW admissions facility
  const lbwFacs = facs.filter(f => f.lbwAdmitted > 0).sort((a, b) => b.lbwAdmitted - a.lbwAdmitted);
  if (lbwFacs.length) {
    insights.push({
      type: 'info',
      text: `${lbwFacs[0].name} recorded the highest LBW admissions this week (${lbwFacs[0].lbwAdmitted} babies).`,
    });
  }

  // Weight gain/stable insight
  if (kpis.wsTotal > 0) {
    insights.push({
      type: kpis.gsPct >= 70 ? 'positive' : kpis.gsPct >= 40 ? 'warning' : 'critical',
      text: `${kpis.gsPct}% of discharged babies with weight records achieved stable or improved weight (${kpis.gainStable} of ${kpis.wsTotal} babies).`,
    });
  } else {
    insights.push({
      type: 'warning',
      text: 'No discharge weight data available this week — weight gain/stable metric cannot be calculated.',
    });
  }

  // Exclusive breastfeeding insight
  if (kpis.bfTotal > 0) {
    insights.push({
      type: kpis.bfPct >= 70 ? 'positive' : kpis.bfPct >= 40 ? 'warning' : 'critical',
      text: `Exclusive breastfeeding compliance: ${kpis.bfPct}% (${kpis.exclusiveBF} of ${kpis.bfTotal} babies with nutrition records).`,
    });
  }

  // Missing baby assessment data
  const noAssess = facs.filter(f => f.totalBaby > 0 && f.assessed === 0);
  if (noAssess.length) {
    const names = noAssess.slice(0, 2).map(f => f.name).join(', ')
      + (noAssess.length > 2 ? ` and ${noAssess.length - 2} more` : '');
    insights.push({
      type: 'warning',
      text: `${noAssess.length} facilit${noAssess.length > 1 ? 'ies' : 'y'} with admissions submitted no baby assessment records: ${names}.`,
    });
  }

  return insights;
}

// ── Main component ─────────────────────────────────────────────────────────
export default function DistrictDashboard() {
  const dispatch = useDispatch();
  const { filterOptions, kpis, matrix, weeklyInsights, insightsError, loading } = useSelector(s => s.district);
  const { weeklyAnalysis: showWeeklyAnalysis, debugIcons: showDebugIcons } = useSelector(s => s.filters?.visibility ?? {});

  usePageMeta({
    title:       'District Weekly Performance — iKMC Programme',
    description: 'District-level weekly performance dashboard for the iKMC Programme — facility matrix, daily app compliance, LBW admissions, clinical KPIs, and AI-generated Hindi insights.',
    keywords:    'iKMC, district dashboard, KMC, facility performance, weekly report, LBW, CEL, ICMR',
  });

  // Independent local filter state (arrays = multi-select) — does NOT share with main dashboard
  const [selStateIds,    setSelStateIds]    = useState([]);
  const [selDistrictIds, setSelDistrictIds] = useState([]);
  const [selTypeIds,     setSelTypeIds]     = useState([]);
  const [selFacilityIds, setSelFacilityIds] = useState([]);
  const [startDate,      setStartDate]      = useState(sevenDaysAgoStr());
  const [endDate,        setEndDate]        = useState(todayStr());
  const [filtersReady,   setFiltersReady]   = useState(false);

  const [dismissedInsights, setDismissedInsights] = useState(new Set());
  const [activeDebugInfo,   setActiveDebugInfo]   = useState(null);

  useEffect(() => {
    dispatch(fetchDistrictFilters());
  }, [dispatch]);

  // Auto-select ALL options when filterOptions loads for the first time
  useEffect(() => {
    if (!filterOptions || filtersReady) return;
    setSelStateIds(   filterOptions.states?.map(s => s.id)         || []);
    setSelDistrictIds(filterOptions.districts?.map(d => d.id)      || []);
    setSelTypeIds(    filterOptions.facilityTypes?.map(t => t.id)  || []);
    setSelFacilityIds(filterOptions.facilities?.map(f => f.id)     || []);
    setFiltersReady(true);
  }, [filterOptions, filtersReady]);

  // Pass empty string when ALL options selected → server applies no filter (= all data)
  const fetchData = useCallback(() => {
    const allStates     = filterOptions?.states?.length         || 0;
    const allDistricts  = filterOptions?.districts?.length      || 0;
    const allTypes      = filterOptions?.facilityTypes?.length  || 0;
    const allFacilities = filterOptions?.facilities?.length     || 0;
    const args = {
      stateId:        selStateIds.length    === allStates     ? '' : selStateIds.join(','),
      districtCode:   selDistrictIds.length === allDistricts  ? '' : selDistrictIds.join(','),
      facilityTypeId: selTypeIds.length     === allTypes      ? '' : selTypeIds.join(','),
      facilityId:     selFacilityIds.length === allFacilities ? '' : selFacilityIds.join(','),
      startDate,
      endDate,
    };
    dispatch(fetchDistrictKpis(args));
    dispatch(fetchFacilityMatrix(args));
  }, [selStateIds, selDistrictIds, selTypeIds, selFacilityIds, startDate, endDate, dispatch, filterOptions]);

  useEffect(() => {
    if (filtersReady) fetchData();
  }, [fetchData, filtersReady]);

  // Reset dismissed when data refreshes
  useEffect(() => {
    setDismissedInsights(new Set());
  }, [matrix, kpis]);

  // Generate Hindi insights via Gemini once both KPIs and matrix are loaded
  useEffect(() => {
    if (!kpis?.kpis || !matrix?.facilities?.length) return;
    dispatch(fetchWeeklyInsights({
      kpis:       kpis.kpis,
      facilities: matrix.facilities,
      period:     kpis.period,
    }));
  }, [kpis, matrix, dispatch]);

  // ── Cascaded filter options (client-side, all pre-loaded) ──────────────────
  const stateOptions = filterOptions?.states || [];
  const typeOptions  = filterOptions?.facilityTypes || [];

  // Districts: filtered to selected states; if all states selected, show all
  const districtOptions = useMemo(() => {
    const all = filterOptions?.districts || [];
    const allStates = filterOptions?.states || [];
    if (!selStateIds.length || selStateIds.length === allStates.length) return all;
    const set = new Set(selStateIds.map(String));
    return all.filter(d => set.has(String(d.stateId)));
  }, [filterOptions, selStateIds]);

  // Facilities: filtered by states, districts, AND types
  const facilityOptions = useMemo(() => {
    const all           = filterOptions?.facilities    || [];
    const allStates     = filterOptions?.states        || [];
    const allDistricts  = filterOptions?.districts     || [];
    const allTypes      = filterOptions?.facilityTypes || [];
    const stateSet = new Set(selStateIds.map(String));
    const distSet  = new Set(selDistrictIds.map(String));
    const typeSet  = new Set(selTypeIds.map(String));
    return all.filter(f =>
      (selStateIds.length    === allStates.length    || stateSet.has(String(f.stateId)))      &&
      (selDistrictIds.length === allDistricts.length || distSet.has(String(f.districtCode)))  &&
      (selTypeIds.length     === allTypes.length     || typeSet.has(String(f.facilityTypeId)))
    );
  }, [filterOptions, selStateIds, selDistrictIds, selTypeIds]);

  // ── Cascade handlers: auto-select all valid children when parent changes ───
  const handleStatesChange = (vals) => {
    setSelStateIds(vals);
    const allDistricts  = filterOptions?.districts  || [];
    const allFacilities = filterOptions?.facilities || [];
    const allStates     = filterOptions?.states     || [];
    if (!vals.length || vals.length === allStates.length) {
      // All / none → select all children
      setSelDistrictIds(allDistricts.map(d => d.id));
      setSelFacilityIds(allFacilities.map(f => f.id));
    } else {
      const set = new Set(vals.map(String));
      const validDists = allDistricts.filter(d => set.has(String(d.stateId)));
      setSelDistrictIds(validDists.map(d => d.id));
      const validDistSet = new Set(validDists.map(d => String(d.id)));
      setSelFacilityIds(allFacilities.filter(f =>
        set.has(String(f.stateId)) && validDistSet.has(String(f.districtCode))
      ).map(f => f.id));
    }
  };

  const handleDistrictsChange = (vals) => {
    setSelDistrictIds(vals);
    const allFacilities = filterOptions?.facilities || [];
    const allDistricts  = filterOptions?.districts  || [];
    if (!vals.length || vals.length === allDistricts.length) {
      setSelFacilityIds(allFacilities.map(f => f.id));
    } else {
      const set = new Set(vals.map(String));
      setSelFacilityIds(allFacilities.filter(f => set.has(String(f.districtCode))).map(f => f.id));
    }
  };

  const handleTypesChange = (vals) => {
    setSelTypeIds(vals);
    const allFacilities = filterOptions?.facilities    || [];
    const allTypes      = filterOptions?.facilityTypes || [];
    if (!vals.length || vals.length === allTypes.length) {
      setSelFacilityIds(allFacilities.map(f => f.id));
    } else {
      const set = new Set(vals.map(String));
      setSelFacilityIds(allFacilities.filter(f => set.has(String(f.facilityTypeId))).map(f => f.id));
    }
  };

  // ── Debug filter summary ───────────────────────────────────────────────────
  const debugFilterRows = useMemo(() => {
    const names = (ids, opts) =>
      ids.length
        ? ids.map(id => opts.find(o => String(o.id) === String(id))?.name || id).join(', ')
        : 'All';
    return [
      { label: 'State',         value: names(selStateIds,    stateOptions) },
      { label: 'District',      value: names(selDistrictIds, districtOptions) },
      { label: 'Facility Type', value: names(selTypeIds,     typeOptions) },
      { label: 'Facility',      value: names(selFacilityIds, facilityOptions) },
      { label: 'Date Range',    value: `${fmtDDMMYYYY(startDate)} to ${fmtDDMMYYYY(endDate)}` },
    ];
  }, [selStateIds, selDistrictIds, selTypeIds, selFacilityIds, startDate, endDate,
      stateOptions, districtOptions, typeOptions, facilityOptions]);

  // Pure UTC date arithmetic — avoids timezone-shift when converting back to ISO string
  const utcDaysBetween = (a, b) => {
    const [ay, am, ad] = a.split('-').map(Number);
    const [by, bm, bd] = b.split('-').map(Number);
    return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86400000);
  };
  const utcAddDays = (dateStr, days) => {
    const [y, m, d] = dateStr.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
  };

  // ── 7-day range handlers — gap is always exactly 7 days (inclusive) ────────
  const handleStartDateChange = (val) => {
    setStartDate(val);
    setEndDate(utcAddDays(val, MAX_RANGE_DAYS - 1));
  };

  const handleEndDateChange = (val) => {
    setEndDate(val);
    setStartDate(utcAddDays(val, -(MAX_RANGE_DAYS - 1)));
  };

  const k   = kpis?.kpis   || {};
  const mat = matrix        || { facilities: [], dates: [] };

  const allInsights = useMemo(() => computeInsights(mat, k), [mat, k]);
  const visibleInsights = allInsights.filter((_, i) => !dismissedInsights.has(i));

  const logoSrc = `${import.meta.env.BASE_URL}cel_logo.png`;

  const [isExporting, setIsExporting] = useState(false);

  const exportImage = async () => {
    setIsExporting(true);
    try {
      const el = document.querySelector('.dd-page');
      const canvas = await html2canvas(el, {
        scale: 2,
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#f1f5f9',
        ignoreElements: el => el.classList.contains('dd-filter-bar'),
      });
      const link = document.createElement('a');
      const period = kpis?.period;
      const filename = period
        ? `iKMC-District-${period.start}-to-${period.end}.png`
        : 'iKMC-District-Dashboard.png';
      link.download = filename;
      link.href = canvas.toDataURL('image/png');
      link.click();
    } catch (err) {
      console.error('Image export failed:', err);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="dd-page">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <header className="dd-header">
        <div className="dd-header-left">
          <img
            src={logoSrc}
            alt="CEL · ICMR"
            className="dd-header-logo"
            onError={e => { e.currentTarget.style.display = 'none'; }}
          />
          <div className="dd-header-divider" />
          <div className="dd-title-block">
            <h1 className="dd-title">District Weekly Performance</h1>
            <p className="dd-subtitle">
              {kpis?.period
                ? `${fmtDDMMYYYY(kpis.period.start)} — ${fmtDDMMYYYY(kpis.period.end)} · ${kpis.period.totalDays} days`
                : 'Facility-level iKMC monitoring dashboard'}
            </p>
          </div>
        </div>

        <div className="dd-header-right">
          <button className="dd-export-btn" onClick={exportImage} disabled={isExporting} title="Export as Image">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/>
              <polyline points="21 15 16 10 5 21"/>
            </svg>
            {isExporting ? 'Exporting…' : 'Export Image'}
          </button>
          <button className="dd-export-btn" onClick={() => window.print()} title="Export as PDF">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2"/>
              <rect x="6" y="14" width="12" height="8"/>
            </svg>
            Export PDF
          </button>
          <Link to="/dashboard" className="dd-main-dash-btn">← Main Dashboard</Link>
        </div>
      </header>

      {/* ── Print-only filter summary (hidden on screen, visible in PDF) ────── */}
      <div className="dd-print-filters">
        <div className="dd-print-filters-grid">
          {debugFilterRows.map(({ label, value }) => (
            <div key={label} className="dd-print-filter-item">
              <span className="dd-print-filter-label">{label}</span>
              <span className="dd-print-filter-value">{value}</span>
            </div>
          ))}
        </div>
        <div className="dd-print-meta">
          <span>iKMC Programme — District Weekly Performance Dashboard</span>
          <span>Printed: {new Date().toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</span>
        </div>
      </div>

      {/* ── Filter Bar ─────────────────────────────────────────────────────── */}
      <div className="dd-filter-bar">
        <FilterGroup label="State">
          <SearchableSelect
            id="dd-sel-state"
            placeholder="All States"
            options={stateOptions}
            value={selStateIds}
            onChange={handleStatesChange}
            multiSelect
            pluralLabel="States"
          />
        </FilterGroup>

        <FilterGroup label="District">
          <SearchableSelect
            id="dd-sel-district"
            placeholder="All Districts"
            options={districtOptions}
            value={selDistrictIds}
            onChange={handleDistrictsChange}
            multiSelect
            pluralLabel="Districts"
          />
        </FilterGroup>

        <FilterGroup label="Facility Type">
          <SearchableSelect
            id="dd-sel-type"
            placeholder="All Types"
            options={typeOptions}
            value={selTypeIds}
            onChange={handleTypesChange}
            multiSelect
            pluralLabel="Types"
          />
        </FilterGroup>

        <FilterGroup label="Facility">
          <SearchableSelect
            id="dd-sel-facility"
            placeholder="All Facilities"
            options={facilityOptions}
            value={selFacilityIds}
            onChange={setSelFacilityIds}
            multiSelect
            pluralLabel="Facilities"
          />
        </FilterGroup>

        <FilterGroup label="From">
          <input
            type="date"
            className="dd-date-input"
            value={startDate}
            max={endDate}
            onChange={e => handleStartDateChange(e.target.value)}
          />
        </FilterGroup>

        <FilterGroup label="To">
          <input
            type="date"
            className="dd-date-input"
            value={endDate}
            min={startDate}
            max={todayStr()}
            onChange={e => handleEndDateChange(e.target.value)}
          />
        </FilterGroup>

      </div>

      <div className="dd-body">

        {/* ── KPI Cards ───────────────────────────────────────────────────── */}
        <section className="dd-kpi-section">
          <KpiCard label="iKMC Facilities" icon={<KpiIcon emoji="🏥" />} value={k.totalFacilities ?? '—'} unit="total" accent="#6366f1" loading={loading.kpis}
            onDebug={setActiveDebugInfo} debugInfo={{
              title: 'iKMC Facilities',
              sourceTable: 'loungeMaster, facilitylist',
              appliedLogic: 'Count of distinct facilities that have at least one active lounge (phase > 0, status = 1) matching the selected filters.',
              queryLogic: `SELECT COUNT(DISTINCT lm.facilityId) AS totalFacilities
FROM   loungeMaster  lm
JOIN   facilitylist  f  ON lm.facilityId = f.FacilityID
WHERE  f.Status            = 1
  AND  lm.status           = 1
  AND  lm.phase            > 0
  AND  f.StateID        IN (:stateIds)
  AND  f.PRIDistrictCode IN (:districtCodes)
  AND  f.FacilityTypeID  IN (:typeIds)
  AND  lm.facilityId     IN (:facilityIds)`,
              formulas: ['Total Facilities = COUNT(DISTINCT lm.facilityId)'],
            }} />

          <KpiCard label="Daily App Use" icon={<KpiIcon emoji="📱" />} value={k.appUsePct != null ? `${k.appUsePct}%` : '—'}
            sub={`${k.appUseLounges ?? 0} / ${k.totalLounges ?? 0} lounges · all ${k.totalDays ?? 0} days`}
            accent="#0ea5e9" loading={loading.kpis}
            onDebug={setActiveDebugInfo} debugInfo={{
              title: 'Daily App Use % (Fully Compliant Lounges)',
              sourceTable: 'nurseDutyChange, loungeMaster, facilitylist',
              appliedLogic: 'Counts lounges that had at least one nurseDutyChange (nurse check-in) record on EVERY calendar day of the selected range. A lounge active on only 6 of 7 days is NOT counted.',
              queryLogic: `SELECT COUNT(*) AS compliantLounges
FROM (
  SELECT   lm.loungeId,
           COUNT(DISTINCT DATE(ndc.addDate)) AS daysActive
  FROM     nurseDutyChange ndc
  JOIN     loungeMaster    lm ON ndc.loungeId   = lm.loungeId
  JOIN     facilitylist    f  ON lm.facilityId  = f.FacilityID
  WHERE    f.Status            = 1
    AND    lm.status           = 1
    AND    lm.phase            > 0
    AND    DATE(ndc.addDate)   BETWEEN :startDate AND :endDate
    AND    f.StateID        IN (:stateIds)
    AND    f.PRIDistrictCode IN (:districtCodes)
    AND    f.FacilityTypeID  IN (:typeIds)
    AND    lm.facilityId     IN (:facilityIds)
  GROUP BY lm.loungeId
  HAVING   daysActive >= :totalDays
) t`,
              formulas: ['Daily App Use % = (lounges active on all days / total lounges) × 100'],
            }} />

          <KpiCard label="Total Admitted" icon={<KpiIcon emoji="👶" />} value={k.totalBaby ?? '—'} unit="babies" accent="#8b5cf6" loading={loading.kpis}
            onDebug={setActiveDebugInfo} debugInfo={{
              title: 'Total Babies',
              sourceTable: 'babyAdmission, loungeMaster, facilitylist',
              appliedLogic: 'Count of distinct baby admission records (status IN 1,2) whose admissionDateTime falls within the selected date range.',
              queryLogic: `SELECT COUNT(DISTINCT ba.id) AS totalBaby
FROM   babyAdmission ba
JOIN   loungeMaster  lm ON ba.loungeId   = lm.loungeId
JOIN   facilitylist  f  ON lm.facilityId = f.FacilityID
WHERE  f.Status            = 1
  AND  lm.status           = 1
  AND  lm.phase            > 0
  AND  ba.status        IN (1, 2)
  AND  ba.admissionDateTime  BETWEEN :startTs AND :endTs
  AND  f.StateID        IN (:stateIds)
  AND  f.PRIDistrictCode IN (:districtCodes)
  AND  f.FacilityTypeID  IN (:typeIds)
  AND  lm.facilityId     IN (:facilityIds)`,
              formulas: ['Total Babies = COUNT(DISTINCT babyAdmission.id)'],
            }} />

          <KpiCard label="LBW Admitted" icon={<KpiIcon emoji="⚖️" />} value={k.lbwAdmitted ?? '—'} unit="LBW babies" accent="#f59e0b" loading={loading.kpis}
            onDebug={setActiveDebugInfo} debugInfo={{
              title: 'LBW Admitted',
              sourceTable: 'babyAdmission, babyRegistration, loungeMaster, facilitylist',
              appliedLogic: 'Count of babies (status IN 1,2) admitted in the period whose birth weight is < 2500 g and birthWeightAvailable = "Yes" in babyRegistration.',
              queryLogic: `SELECT COUNT(DISTINCT ba.id) AS lbwAdmitted
FROM   babyAdmission    ba
JOIN   babyRegistration br ON ba.babyId      = br.babyId
JOIN   loungeMaster     lm ON ba.loungeId    = lm.loungeId
JOIN   facilitylist     f  ON lm.facilityId  = f.FacilityID
WHERE  f.Status                = 1
  AND  lm.status               = 1
  AND  lm.phase                > 0
  AND  ba.status            IN (1, 2)
  AND  ba.admissionDateTime    BETWEEN :startTs AND :endTs
  AND  br.babyWeight           < 2500
  AND  br.birthWeightAvailable = 'Yes'
  AND  f.StateID        IN (:stateIds)
  AND  f.PRIDistrictCode IN (:districtCodes)
  AND  f.FacilityTypeID  IN (:typeIds)
  AND  lm.facilityId     IN (:facilityIds)`,
              formulas: ['LBW Admitted = COUNT(DISTINCT ba.id) WHERE br.babyWeight < 2500'],
            }} />

          <KpiCard label="LBW Discharged" icon={<KpiIcon emoji="🏠" />} value={k.lbwDischarged ?? '—'} unit="LBW babies" accent="#10b981" loading={loading.kpis}
            onDebug={setActiveDebugInfo} debugInfo={{
              title: 'LBW Discharged',
              sourceTable: 'babyAdmission, babyRegistration, loungeMaster, facilitylist',
              appliedLogic: 'Among LBW babies (birth weight < 2500 g), count those discharged (status = 2) whose dateOfDischarge falls within the period.',
              queryLogic: `SELECT COUNT(DISTINCT ba.id) AS lbwDischarged
FROM   babyAdmission    ba
JOIN   babyRegistration br ON ba.babyId      = br.babyId
JOIN   loungeMaster     lm ON ba.loungeId    = lm.loungeId
JOIN   facilitylist     f  ON lm.facilityId  = f.FacilityID
WHERE  f.Status                = 1
  AND  lm.status               = 1
  AND  lm.phase                > 0
  AND  ba.status               = 2
  AND  ba.dateOfDischarge      BETWEEN :startTs AND :endTs
  AND  br.babyWeight           < 2500
  AND  br.birthWeightAvailable = 'Yes'
  AND  f.StateID        IN (:stateIds)
  AND  f.PRIDistrictCode IN (:districtCodes)
  AND  f.FacilityTypeID  IN (:typeIds)
  AND  lm.facilityId     IN (:facilityIds)`,
              formulas: ['LBW Discharged = COUNT(DISTINCT ba.id) WHERE ba.status = 2 AND br.babyWeight < 2500'],
            }} />

          <KpiCard
            label="48hrs Stay"
            icon={<KpiIcon emoji="⏱️" />}
            value={k.stay48 ?? '—'}
            sub={k.stay48Pct != null ? `${k.stay48Pct}% of ${k.stayEligible ?? 0} eligible babies` : undefined}
            accent="#3b82f6" loading={loading.kpis}
            onDebug={setActiveDebugInfo} debugInfo={{
              title: '48-Hour Stay',
              sourceTable: 'babyAdmission, babyRegistration, loungeMaster, facilitylist',
              appliedLogic: 'LBW discharged babies (babyWeight < 2500g, status=2) whose dateOfDischarge falls in the period. stay48 = those where TIMESTAMPDIFF(admissionDateTime → dateOfDischarge) ≥ 48h. stayEligible = all LBW discharged in period.',
              queryLogic: `-- stay48: LBW discharged babies who stayed ≥ 48 hours
SELECT COUNT(DISTINCT ba.id) AS stay48
FROM   babyAdmission    ba
JOIN   babyRegistration br ON ba.babyId      = br.babyId
JOIN   loungeMaster     lm ON ba.loungeId    = lm.loungeId
JOIN   facilitylist     f  ON lm.facilityId  = f.FacilityID
WHERE  f.Status                = 1
  AND  lm.status               = 1
  AND  lm.phase                > 0
  AND  ba.status               = 2
  AND  ba.dateOfDischarge      BETWEEN :startTs AND :endTs
  AND  TIMESTAMPDIFF(HOUR, ba.admissionDateTime, ba.dateOfDischarge) >= 48
  AND  br.babyWeight           < 2500
  AND  br.birthWeightAvailable = 'Yes'
  AND  f.StateID        IN (:stateIds)
  AND  f.PRIDistrictCode IN (:districtCodes)
  AND  f.FacilityTypeID  IN (:typeIds)
  AND  lm.facilityId     IN (:facilityIds)

-- stayEligible: all LBW discharged in the period
SELECT COUNT(DISTINCT ba.id) AS stayEligible
FROM   babyAdmission    ba
JOIN   babyRegistration br ON ba.babyId      = br.babyId
JOIN   loungeMaster     lm ON ba.loungeId    = lm.loungeId
JOIN   facilitylist     f  ON lm.facilityId  = f.FacilityID
WHERE  f.Status                = 1
  AND  lm.status               = 1
  AND  lm.phase                > 0
  AND  ba.status               = 2
  AND  ba.dateOfDischarge      BETWEEN :startTs AND :endTs
  AND  br.babyWeight           < 2500
  AND  br.birthWeightAvailable = 'Yes'
  AND  f.StateID        IN (:stateIds)
  AND  f.PRIDistrictCode IN (:districtCodes)
  AND  f.FacilityTypeID  IN (:typeIds)
  AND  lm.facilityId     IN (:facilityIds)`,
              formulas: [
                '48h Stay Count = LBW discharged babies where TIMESTAMPDIFF(admissionDateTime → dateOfDischarge) ≥ 48h',
                '48h Stay % = (stay48 / stayEligible) × 100',
              ],
            }} />

          <KpiCard label="Exclusive Breastfeeding" icon={<KpiIcon emoji="🤱" />}
            value={k.bfPct != null ? `${k.bfPct}%` : '—'}
            sub={`${k.exclusiveBF ?? 0} of ${k.bfTotal ?? 0} babies`}
            accent="#ec4899" loading={loading.kpis}
            onDebug={setActiveDebugInfo} debugInfo={{
              title: 'Exclusive Breastfeeding %',
              sourceTable: 'babyAdmission, babyDailyNutrition, babyRegistration, loungeMaster, facilitylist',
              appliedLogic: 'LBW discharged babies (babyWeight < 2500g, status=2, dateOfDischarge in period). Exclusive if all nutrition records use ONLY method 1 (Breastfeed) or 2 (Expressed BM). Only babies with ≥1 nutrition record are counted.',
              queryLogic: `-- Exclusive BF: all nutrition records use ONLY method 1 (Breastfeed) or 2 (Expressed BM)
-- non_excl : count of records where method 3–15 (non-exclusive) is present
-- rec_count: count of records with a valid, non-null, non-empty breastFeedMethod

SELECT SUM(CASE WHEN non_excl = 0 AND rec_count > 0 THEN 1 ELSE 0 END) AS exclusive,
       COUNT(*)                                                           AS bfTotal
FROM (
  SELECT   ba.id,
    SUM(CASE
      WHEN bdn.breastFeedMethod IS NOT NULL
       AND bdn.breastFeedMethod NOT IN ('null', '[]', '')
       AND bdn.breastFeedMethod REGEXP '"(3|4|5|6|7|8|9|10|11|12|13|14|15)"'
      THEN 1 ELSE 0
    END) AS non_excl,
    SUM(CASE
      WHEN bdn.breastFeedMethod IS NOT NULL
       AND bdn.breastFeedMethod NOT IN ('null', '[]', '')
      THEN 1 ELSE 0
    END) AS rec_count
  FROM     babyAdmission      ba
  JOIN     babyDailyNutrition bdn ON bdn.babyAdmissionId = ba.id
  JOIN     babyRegistration   br  ON ba.babyId           = br.babyId
  JOIN     loungeMaster       lm  ON ba.loungeId         = lm.loungeId
  JOIN     facilitylist       f   ON lm.facilityId       = f.FacilityID
  WHERE    f.Status                = 1
    AND    lm.status               = 1
    AND    lm.phase                > 0
    AND    ba.status               = 2
    AND    ba.dateOfDischarge      BETWEEN :startTs AND :endTs
    AND    br.babyWeight           < 2500
    AND    br.birthWeightAvailable = 'Yes'
    AND    f.StateID        IN (:stateIds)
    AND    f.PRIDistrictCode IN (:districtCodes)
    AND    f.FacilityTypeID  IN (:typeIds)
    AND    lm.facilityId     IN (:facilityIds)
  GROUP BY ba.id
) t`,
              formulas: ['Exclusive BF % = (babies with no non-exclusive BF method / total babies with BF records) × 100'],
            }} />

          <KpiCard label="Weight Gain / Stable" icon={<KpiIcon emoji="📈" />}
            value={k.gsPct != null ? `${k.gsPct}%` : '—'}
            sub={`${k.gainStable ?? 0} of ${k.wsTotal ?? 0} LBW discharged`}
            accent="#22c55e" loading={loading.kpis}
            onDebug={setActiveDebugInfo} debugInfo={{
              title: 'Weight Gain / Stable %',
              sourceTable: 'babyAdmission, babyRegistration, babyDailyWeight, loungeMaster, facilitylist',
              appliedLogic: 'Weight outcome for LBW discharged babies (babyWeight < 2500g, status=2, dateOfDischarge in period). Compares first birth weight (weightType=1) against last discharge weight (weightType=4). Baby is gain/stable if discharge_wt ≥ birth_wt. Denominator = LBW discharged babies with both weight records.',
              queryLogic: `SELECT SUM(CASE WHEN discharge_wt >= birth_wt THEN 1 ELSE 0 END) AS gainStable,
       COUNT(*)                                                       AS wsTotal
FROM (
  SELECT ba.id,
    (SELECT bdw.babyWeight
     FROM   babyDailyWeight bdw
     WHERE  bdw.babyAdmissionId = ba.id AND bdw.weightType = 1
     ORDER  BY bdw.id     LIMIT 1)      AS birth_wt,
    (SELECT bdw.babyWeight
     FROM   babyDailyWeight bdw
     WHERE  bdw.babyAdmissionId = ba.id AND bdw.weightType = 4
     ORDER  BY bdw.id DESC LIMIT 1)     AS discharge_wt
  FROM   babyAdmission    ba
  JOIN   babyRegistration br ON ba.babyId      = br.babyId
  JOIN   loungeMaster     lm ON ba.loungeId    = lm.loungeId
  JOIN   facilitylist     f  ON lm.facilityId  = f.FacilityID
  WHERE  f.Status                = 1
    AND  lm.status               = 1
    AND  lm.phase                > 0
    AND  ba.status               = 2
    AND  ba.dateOfDischarge      BETWEEN :startTs AND :endTs
    AND  br.babyWeight           < 2500
    AND  br.birthWeightAvailable = 'Yes'
    AND  f.StateID        IN (:stateIds)
    AND  f.PRIDistrictCode IN (:districtCodes)
    AND  f.FacilityTypeID  IN (:typeIds)
    AND  lm.facilityId     IN (:facilityIds)
) t`,
              formulas: [
                'Wt Gain/Stable % = (discharge_wt ≥ birth_wt count / all LBW discharged) × 100',
                'Denominator = all LBW discharged babies in period (including those without weight records)',
                'Babies without weight records contribute 0 to numerator — NULL >= NULL evaluates to ELSE 0 in CASE WHEN',
              ],
            }} />

          <KpiCard label="Baby Assessment" icon={<KpiIcon emoji="📋" />} value={k.babyAssessed ?? '—'} unit="babies"
            sub={k.assessTotal > 0 ? `of ${k.assessTotal ?? 0} babies in period` : undefined}
            accent="#f97316" loading={loading.kpis}
            onDebug={setActiveDebugInfo} debugInfo={{
              title: 'Baby Assessed',
              sourceTable: 'babyDailyMonitoring, babyAdmission, loungeMaster, facilitylist',
              appliedLogic: 'A baby is "assessed" if COUNT(assessmentDate in period) ≥ stayHours/12 (2 assessments per day). stayHours = TIMESTAMPDIFF(HOUR, MAX(admissionDate, startDate), MIN(dischargeDate, endDate)). Includes status IN (1,2) — active and discharged babies present during the period.',
              queryLogic: `SELECT SUM(CASE WHEN actualAss >= expectedAss THEN 1 ELSE 0 END) AS assessed,
       COUNT(*)                                                        AS assessTotal
FROM (
  SELECT   ba.id,
           COUNT(DISTINCT bdm.assessmentDate) AS actualAss,
           GREATEST(
             FLOOR(
               TIMESTAMPDIFF(HOUR,
                 GREATEST(DATE(ba.admissionDateTime), :startDate),
                 LEAST(COALESCE(DATE(ba.dateOfDischarge), :endDate), :endDate)
               ) / 12
             ), 1
           )                                  AS expectedAss
  FROM     babyAdmission       ba
  JOIN     loungeMaster        lm  ON ba.loungeId         = lm.loungeId
  JOIN     facilitylist        f   ON lm.facilityId       = f.FacilityID
  LEFT JOIN babyDailyMonitoring bdm ON bdm.babyAdmissionId = ba.id
         AND bdm.assessmentDate BETWEEN :startDate AND :endDate
  WHERE    f.Status            = 1
    AND    lm.status           = 1
    AND    lm.phase            > 0
    AND    ba.status        IN (1, 2)
    AND    DATE(ba.admissionDateTime)                      <= :endDate
    AND    (ba.dateOfDischarge IS NULL OR DATE(ba.dateOfDischarge) >= :startDate)
    AND    f.StateID        IN (:stateIds)
    AND    f.PRIDistrictCode IN (:districtCodes)
    AND    f.FacilityTypeID  IN (:typeIds)
    AND    lm.facilityId     IN (:facilityIds)
  GROUP BY ba.id
) t`,
              formulas: [
                'Baby Assessed if COUNT(assessmentDate in period) ≥ expectedAssessments',
                'Expected Assessments = GREATEST(FLOOR(stayHours / 12), 1)',
                'stayHours = TIMESTAMPDIFF(HOUR, GREATEST(admissionDate, startDate), LEAST(dischargeDate, endDate))',
                '─── GREATEST() usage ───',
                'GREATEST(DATE(ba.admissionDateTime), :startDate) — clips the effective stay start to the period boundary. A baby admitted before the period starts is treated as entering on :startDate, so stay hours are not over-counted.',
                'GREATEST(FLOOR(stayHours / 12), 1) — enforces a minimum of 1 expected assessment. A baby admitted and discharged on the same day has 0 clipped hours → FLOOR(0/12) = 0, which would make every baby pass automatically. GREATEST ensures at least 1 assessment is always required.',
              ],
            }} />

        </section>

        {/* ── Facility Matrix ─────────────────────────────────────────────── */}
        <section className="dd-matrix-section">
          <div className="dd-card">
            <div className="dd-card-header">
              <div className="dd-card-title-row">
                <h2 className="dd-card-title">Facility Performance Matrix</h2>
                <DebugIcon onClick={setActiveDebugInfo} info={{
                  title: 'Facility Performance Matrix',
                  sourceTable: 'facilitylist, loungeMaster, nurseDutyChange, babyAdmission, babyRegistration, babyDailyMonitoring, babyDailyNutrition, babyDailyWeight',
                  appliedLogic: 'Per-facility aggregation of all clinical KPIs plus a daily app-activity grid. Each row represents one facility; coloured squares show whether any nurseDutyChange record exists for that facility on each day. Six parallel queries run per request, each grouped by facilityId.',
                  queryLogic: `-- ① App Use: lounges with ≥1 nurse check-in per day
SELECT   lm.loungeId, lm.facilityId,
         DATE_FORMAT(DATE(ndc.addDate), '%Y-%m-%d') AS dt
FROM     nurseDutyChange ndc
JOIN     loungeMaster    lm ON ndc.loungeId  = lm.loungeId AND lm.phase > 0
WHERE    lm.facilityId  IN (:facilityIds)
  AND    DATE(ndc.addDate) BETWEEN :startDate AND :endDate
GROUP BY lm.loungeId, lm.facilityId, dt

-- ② Total Babies admitted in period (status IN 1, 2)
SELECT   lm.facilityId, COUNT(DISTINCT ba.id) AS totalBaby
FROM     babyAdmission ba
JOIN     loungeMaster  lm ON ba.loungeId = lm.loungeId AND lm.phase > 0
WHERE    lm.facilityId  IN (:facilityIds)
  AND    ba.status      IN (1, 2)
  AND    ba.admissionDateTime BETWEEN :startTs AND :endTs
GROUP BY lm.facilityId

-- ③ 48h Stay: LBW discharged in period, TIMESTAMPDIFF >= 48h (mirrors KPI logic)
SELECT   lm.facilityId,
         COUNT(DISTINCT CASE
           WHEN TIMESTAMPDIFF(HOUR, ba.admissionDateTime, ba.dateOfDischarge) >= 48
           THEN ba.id
         END)                  AS stay48,
         COUNT(DISTINCT ba.id) AS stayEligible
FROM     babyAdmission    ba
JOIN     babyRegistration br ON ba.babyId   = br.babyId
JOIN     loungeMaster     lm ON ba.loungeId = lm.loungeId AND lm.phase > 0
WHERE    lm.facilityId          IN (:facilityIds)
  AND    ba.status               = 2
  AND    ba.dateOfDischarge      BETWEEN :startTs AND :endTs
  AND    br.babyWeight           < 2500
  AND    br.birthWeightAvailable = 'Yes'
GROUP BY lm.facilityId

-- ④ LBW Admitted + Discharged (single combined query)
SELECT   lm.facilityId,
         COUNT(DISTINCT CASE
           WHEN ba.admissionDateTime BETWEEN :startTs AND :endTs
           THEN ba.id END)     AS lbwAdmitted,
         COUNT(DISTINCT CASE
           WHEN ba.status = 2
            AND ba.dateOfDischarge BETWEEN :startTs AND :endTs
           THEN ba.id END)     AS lbwDischarged
FROM     babyAdmission    ba
JOIN     babyRegistration br ON ba.babyId   = br.babyId
JOIN     loungeMaster     lm ON ba.loungeId = lm.loungeId AND lm.phase > 0
WHERE    lm.facilityId          IN (:facilityIds)
  AND    ba.status              IN (1, 2)
  AND    br.babyWeight           < 2500
  AND    br.birthWeightAvailable = 'Yes'
GROUP BY lm.facilityId

-- ⑤ Baby Assessed: COUNT(assessmentDate in period) >= GREATEST(FLOOR(stayHours/12), 1)
SELECT   facilityId,
         SUM(CASE WHEN actualAss >= expectedAss THEN 1 ELSE 0 END) AS assessed,
         COUNT(*)                                                    AS assessTotal
FROM (
  SELECT   lm.facilityId, ba.id,
           COUNT(DISTINCT bdm.assessmentDate) AS actualAss,
           GREATEST(
             FLOOR(
               TIMESTAMPDIFF(HOUR,
                 GREATEST(DATE(ba.admissionDateTime), :startDate),
                 LEAST(COALESCE(DATE(ba.dateOfDischarge), :endDate), :endDate)
               ) / 12
             ), 1
           )                                  AS expectedAss
  FROM     babyAdmission        ba
  JOIN     loungeMaster         lm  ON ba.loungeId         = lm.loungeId
                                   AND lm.phase            > 0
  LEFT JOIN babyDailyMonitoring bdm ON bdm.babyAdmissionId = ba.id
         AND bdm.assessmentDate BETWEEN :startDate AND :endDate
  WHERE    lm.facilityId  IN (:facilityIds)
    AND    ba.status    IN (1, 2)
    AND    DATE(ba.admissionDateTime)                      <= :endDate
    AND    (ba.dateOfDischarge IS NULL OR DATE(ba.dateOfDischarge) >= :startDate)
  GROUP BY lm.facilityId, ba.id
) t
GROUP BY facilityId

-- ⑥ Exclusive Breastfeeding (LBW discharged; all BF records must be method 1 or 2 only)
SELECT   facilityId,
         SUM(CASE WHEN non_excl = 0 AND rec_count > 0 THEN 1 ELSE 0 END) AS exclusive,
         COUNT(*)                                                           AS bfTotal
FROM (
  SELECT   lm.facilityId, ba.id,
    SUM(CASE
      WHEN bdn.breastFeedMethod IS NOT NULL
       AND bdn.breastFeedMethod NOT IN ('null', '[]', '')
       AND bdn.breastFeedMethod REGEXP '"(3|4|5|6|7|8|9|10|11|12|13|14|15)"'
      THEN 1 ELSE 0
    END) AS non_excl,
    SUM(CASE
      WHEN bdn.breastFeedMethod IS NOT NULL
       AND bdn.breastFeedMethod NOT IN ('null', '[]', '')
      THEN 1 ELSE 0
    END) AS rec_count
  FROM     babyAdmission      ba
  JOIN     babyDailyNutrition bdn ON bdn.babyAdmissionId = ba.id
  JOIN     loungeMaster       lm  ON ba.loungeId         = lm.loungeId
                                 AND lm.phase            > 0
  WHERE    lm.facilityId  IN (:facilityIds)
    AND    ba.status           = 2
    AND    ba.dateOfDischarge  BETWEEN :startTs AND :endTs
  GROUP BY lm.facilityId, ba.id
) t
GROUP BY facilityId

-- ⑦ Weight Gain / Stable (LBW discharged; birth weightType=1 vs last discharge weightType=4)
SELECT   facilityId,
         SUM(CASE WHEN discharge_wt >= birth_wt THEN 1 ELSE 0 END) AS gainStable,
         COUNT(*)                                                     AS wsTotal
FROM (
  SELECT   lm.facilityId,
    (SELECT bdw.babyWeight
     FROM   babyDailyWeight bdw
     WHERE  bdw.babyAdmissionId = ba.id AND bdw.weightType = 1
     ORDER  BY bdw.id     LIMIT 1)      AS birth_wt,
    (SELECT bdw.babyWeight
     FROM   babyDailyWeight bdw
     WHERE  bdw.babyAdmissionId = ba.id AND bdw.weightType = 4
     ORDER  BY bdw.id DESC LIMIT 1)     AS discharge_wt
  FROM     babyAdmission    ba
  JOIN     babyRegistration br ON ba.babyId   = br.babyId
  JOIN     loungeMaster     lm ON ba.loungeId = lm.loungeId AND lm.phase > 0
  WHERE    lm.facilityId          IN (:facilityIds)
    AND    ba.status               = 2
    AND    ba.dateOfDischarge      BETWEEN :startTs AND :endTs
    AND    br.babyWeight           < 2500
    AND    br.birthWeightAvailable = 'Yes'
) t
GROUP BY facilityId`,
                  formulas: [
                    'App Use % per facility = (days with ≥1 nurseDutyChange / total days in range) × 100',
                    'LBW % = LBW admitted / total babies admitted × 100',
                    'Exclusive BF % = exclusive babies / babies with BF records × 100',
                    'Wt Gain/Stable % = (discharge_wt ≥ birth_wt count / LBW discharged with both weight records) × 100',
                    '48h Stay % = stay48 / stayEligible × 100',
                  ],
                }} />
              </div>
              <p className="dd-card-sub">
                Daily iKMC app use (squares) + period aggregates per facility
              </p>
            </div>

            {loading.matrix ? (
              <div className="dd-loading">Loading matrix…</div>
            ) : mat.facilities.length === 0 ? (
              <div className="dd-empty">No facilities match the selected filters.</div>
            ) : (
              <div className="dd-matrix-wrap">
                <table className="dd-matrix-table">
                  <thead>
                    <tr>
                      <th className="dd-th-fac dd-sticky-col">Facility</th>
                      {mat.dates.map(dt => {
                        const d = new Date(dt + 'T12:00:00Z');
                        return (
                          <th key={dt} className="dd-th-day">
                            <div className="dd-day-dow">{DAY_ABBR[d.getUTCDay()]}</div>
                            <div className="dd-day-date">{`${dt.slice(8)}-${dt.slice(5, 7)}`}</div>
                          </th>
                        );
                      })}
                      <th className="dd-th-kpi">Total Baby</th>
                      <th className="dd-th-kpi">LBW Admission</th>
                      <th className="dd-th-kpi">LBW Discharge</th>
                      <th className="dd-th-kpi">48hrs Stay</th>
                      <th className="dd-th-kpi">Exclusive Breastfeeding</th>
                      <th className="dd-th-kpi">Weight Gain / Stable</th>
                      <th className="dd-th-kpi">Baby Assessment</th>
                    </tr>
                  </thead>
                  <tbody>
                    {mat.facilities.map(fac => (
                      <tr key={fac.id} className="dd-row">
                        <td className="dd-td-fac dd-sticky-col">
                          <div className="dd-fac-name">{fac.name}</div>
                          <div className="dd-fac-meta">
                            <span className="dd-type-badge">{fac.type}</span>
                            <span className="dd-fac-district">{fac.district}</span>
                          </div>
                        </td>

                        {fac.dailyAppUse.map((used, i) => (
                          <td key={i} className="dd-td-day">
                            <div
                              className={`dd-sq ${used ? 'dd-sq--on' : 'dd-sq--off'}`}
                              title={`${fmtDDMMYYYY(mat.dates[i])}${used ? ' · ✓ App used' : ' · ✗ No check-in'}`}
                            />
                          </td>
                        ))}

                        <td className="dd-td-kpi">{fac.totalBaby}</td>
                        <td className="dd-td-kpi">{fac.lbwAdmitted}</td>
                        <td className="dd-td-kpi">{fac.lbwDischarged}</td>
                        <td className="dd-td-kpi">{fac.stay48}</td>
                        <td className="dd-td-kpi">{fac.bfPct  != null ? `${fac.bfPct}%`  : '—'}</td>
                        <td className="dd-td-kpi">{fac.gsPct  != null ? `${fac.gsPct}%`  : '—'}</td>
                        <td className="dd-td-kpi">{fac.assessed}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {!loading.matrix && mat.facilities.length > 0 && (
              <div className="dd-legend">
                <span className="dd-leg-item">
                  <span className="dd-leg-sq dd-leg-on" /> App Used (check-in recorded)
                </span>
                <span className="dd-leg-item">
                  <span className="dd-leg-sq dd-leg-off" /> No Check-in (alert)
                </span>
              </div>
            )}
          </div>
        </section>

        {/* ── Weekly Insights (Gemini — Hindi) ─────────────────────────── */}
        {!loading.kpis && !loading.matrix && showWeeklyAnalysis !== false && (
          <section className="dd-insights-section">
            <div className="dd-insights-header">
              <span className="dd-insights-title">
                <InsightIcon type="info" size={16} />
                साप्ताहिक विश्लेषण
              </span>
              {weeklyInsights?.length > 0 && dismissedInsights.size < weeklyInsights.length && (
                <button
                  className="dd-insights-clear"
                  onClick={() => setDismissedInsights(new Set(weeklyInsights.map((_, i) => i)))}
                >
                  सभी हटाएं
                </button>
              )}
            </div>

            {/* Loading state */}
            {loading.insights && (
              <div className="dd-insights-loading">
                <div className="dd-insights-spinner" />
                <LoadingDots />
              </div>
            )}

            {/* Error state — show real server/Gemini error */}
            {!loading.insights && insightsError && (
              <div className="dd-insights-notice">
                ⚠️ <strong>Gemini Error:</strong> {insightsError}
                <br />
                <span style={{ fontSize: '12px', marginTop: 4, display: 'block' }}>
                  सुनिश्चित करें कि <code>server/.env</code> में सही <code>GEMINI_API_KEY</code> है और सर्वर को पुनः चालू करें।
                </span>
              </div>
            )}

            {/* Insights grid */}
            {!loading.insights && weeklyInsights?.length > 0 && (
              <div className="dd-insights-grid">
                {weeklyInsights.map((insight, i) => {
                  if (dismissedInsights.has(i)) return null;
                  return (
                    <div key={i} className={`dd-insight-card dd-insight-${insight.type || 'info'}`}>
                      <div className="dd-insight-icon">
                        <InsightIcon type={insight.type || 'info'} size={18} />
                      </div>
                      <p className="dd-insight-text">{insight.text}</p>
                      <button
                        className="dd-insight-dismiss"
                        onClick={() => setDismissedInsights(prev => new Set([...prev, i]))}
                        title="हटाएं"
                      >×</button>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        )}

      </div>

      <DebugModal
        info={activeDebugInfo}
        onClose={() => setActiveDebugInfo(null)}
        filterRows={debugFilterRows}
        queryParams={{
          startDate:     `'${startDate}'`,
          endDate:       `'${endDate}'`,
          startTs:       `'${startDate} 00:00:00'`,
          endTs:         `'${endDate} 23:59:59'`,
          totalDays:     String(kpis?.period?.totalDays ?? mat.dates.length ?? 7),
          stateIds:      selStateIds.length      ? selStateIds.join(', ')    : '/* none */',
          districtCodes: selDistrictIds.length   ? selDistrictIds.join(', ') : '/* none */',
          typeIds:       selTypeIds.length        ? selTypeIds.join(', ')     : '/* none */',
          facilityIds:   selFacilityIds.length    ? selFacilityIds.join(', ') : '/* none */',
        }}
      />
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────

function LoadingDots() {
  const [dot, setDot] = React.useState(0);
  React.useEffect(() => {
    const t = setInterval(() => setDot(d => (d + 1) % 4), 500);
    return () => clearInterval(t);
  }, []);
  const msgs = [
    'साप्ताहिक विश्लेषण तैयार हो रहा है',
    'डेटा का विश्लेषण किया जा रहा है',
    'अंतर्दृष्टि तैयार की जा रही है',
    'कृपया प्रतीक्षा करें',
  ];
  return (
    <span>
      {msgs[dot % msgs.length]}
      <span style={{ letterSpacing: 2, marginLeft: 2 }}>
        {'•'.repeat((dot % 3) + 1)}
      </span>
    </span>
  );
}

function FilterGroup({ label, children }) {
  return (
    <div className="dd-filter-group">
      <label className="dd-filter-label">{label}</label>
      {children}
    </div>
  );
}

function KpiCard({ label, icon, value, unit, sub, accent, loading, debugInfo, onDebug }) {
  return (
    <div className="dd-kpi-card" style={{ '--kpi-accent': accent }}>
      <div className="dd-kpi-accent-bar" />
      <div className="dd-kpi-body">
        {/* Label + settings icon always at top */}
        <div className="dd-kpi-label">
          {label}
          {debugInfo && onDebug && <DebugIcon onClick={onDebug} info={debugInfo} />}
        </div>
        {loading ? (
          <div className="dd-kpi-shimmer" />
        ) : (
          <div className="dd-kpi-val">{value}</div>
        )}
        {!loading && unit && <div className="dd-kpi-unit">{unit}</div>}
        {!loading && sub  && <div className="dd-kpi-sub">{sub}</div>}
      </div>
      {icon && (
        <div className="dd-kpi-icon-right">
          {icon}
        </div>
      )}
    </div>
  );
}

function InsightIcon({ type, size = 20 }) {
  const icons = {
    positive: (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10"/><path d="M9 12l2 2 4-4"/>
      </svg>
    ),
    warning: (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#d97706" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
      </svg>
    ),
    critical: (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>
      </svg>
    ),
    info: (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#0369a1" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
      </svg>
    ),
  };
  return icons[type] || icons.info;
}
