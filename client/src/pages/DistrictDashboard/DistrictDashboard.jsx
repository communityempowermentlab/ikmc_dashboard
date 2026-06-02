import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useDispatch, useSelector } from 'react-redux';
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
          <KpiCard label="iKMC Facilities" value={k.totalFacilities ?? '—'} unit="total" accent="#6366f1" loading={loading.kpis}
            onDebug={setActiveDebugInfo} debugInfo={{
              title: 'iKMC Facilities',
              sourceTable: 'loungeMaster, facilitylist',
              appliedLogic: 'Count of distinct facilities that have at least one active lounge (phase > 0, status = 1) matching the selected filters.',
              queryLogic: `SELECT COUNT(DISTINCT lm.facilityId) AS totalFacilities
FROM   loungeMaster lm
JOIN   facilitylist f ON lm.facilityId = f.FacilityID
WHERE  f.Status = 1
  AND  lm.status = 1
  AND  lm.phase > 0
  AND  f.StateID IN (:stateIds)
  AND  f.PRIDistrictCode IN (:districtCodes)
  AND  f.FacilityTypeID  IN (:typeIds)
  AND  lm.facilityId     IN (:facilityIds)`,
              formulas: ['Total Facilities = COUNT(DISTINCT lm.facilityId)'],
            }} />

          <KpiCard label="Daily App Use" value={k.appUsePct != null ? `${k.appUsePct}%` : '—'}
            sub={`${k.appUseLounges ?? 0} / ${k.totalLounges ?? 0} lounges · all ${k.totalDays ?? 0} days`}
            accent="#0ea5e9" loading={loading.kpis}
            onDebug={setActiveDebugInfo} debugInfo={{
              title: 'Daily App Use % (Fully Compliant Lounges)',
              sourceTable: 'nurseDutyChange, loungeMaster',
              appliedLogic: 'Counts lounges that had at least one nurseDutyChange (nurse check-in) record on EVERY calendar day of the selected range. A lounge active on only 6 of 7 days is NOT counted.',
              queryLogic: `SELECT COUNT(*) AS compliantLounges
FROM (
  SELECT lm.loungeId,
         COUNT(DISTINCT DATE(ndc.addDate)) AS daysActive
  FROM   nurseDutyChange ndc
  JOIN   loungeMaster lm ON ndc.loungeId = lm.loungeId
  WHERE  lm.status = 1
    AND  lm.phase  > 0
    AND  DATE(ndc.addDate) BETWEEN :startDate AND :endDate
  GROUP  BY lm.loungeId
  HAVING daysActive >= :totalDays
) t`,
              formulas: ['Daily App Use % = (lounges active on all days / total lounges) × 100'],
            }} />

          <KpiCard label="Total Babies" value={k.totalBaby ?? '—'} unit="admissions" accent="#8b5cf6" loading={loading.kpis}
            onDebug={setActiveDebugInfo} debugInfo={{
              title: 'Total Babies',
              sourceTable: 'babyAdmission, loungeMaster',
              appliedLogic: 'Count of distinct baby admission records (status IN 1,2) whose admissionDateTime falls within the selected date range.',
              queryLogic: `SELECT COUNT(DISTINCT ba.id) AS totalBaby
FROM   babyAdmission ba
JOIN   loungeMaster lm ON ba.loungeId = lm.loungeId
WHERE  lm.status = 1 AND lm.phase > 0
  AND  ba.status IN (1, 2)
  AND  ba.admissionDateTime BETWEEN :startTs AND :endTs`,
              formulas: ['Total Babies = COUNT(DISTINCT babyAdmission.id)'],
            }} />

          <KpiCard label="LBW Admitted" value={k.lbwAdmitted ?? '—'} unit="LBW babies" accent="#f59e0b" loading={loading.kpis}
            onDebug={setActiveDebugInfo} debugInfo={{
              title: 'LBW Admitted',
              sourceTable: 'babyAdmission, babyRegistration, loungeMaster',
              appliedLogic: 'Count of babies (status IN 1,2) admitted in the period whose birth weight is < 2500 g and birthWeightAvailable = "Yes" in babyRegistration.',
              queryLogic: `SELECT COUNT(DISTINCT ba.id) AS lbwAdmitted
FROM   babyAdmission ba
JOIN   babyRegistration br ON ba.babyId  = br.babyId
JOIN   loungeMaster lm     ON ba.loungeId = lm.loungeId
WHERE  lm.status = 1 AND lm.phase > 0
  AND  ba.status IN (1, 2)
  AND  ba.admissionDateTime BETWEEN :startTs AND :endTs
  AND  br.babyWeight < 2500
  AND  br.birthWeightAvailable = 'Yes'`,
              formulas: ['LBW Admitted = COUNT(DISTINCT ba.id) WHERE br.babyWeight < 2500'],
            }} />

          <KpiCard label="LBW Discharged" value={k.lbwDischarged ?? '—'} unit="LBW babies" accent="#10b981" loading={loading.kpis}
            onDebug={setActiveDebugInfo} debugInfo={{
              title: 'LBW Discharged',
              sourceTable: 'babyAdmission, babyRegistration, loungeMaster',
              appliedLogic: 'Among LBW babies (birth weight < 2500 g), count those discharged (status = 2) whose dateOfDischarge falls within the period.',
              queryLogic: `SELECT COUNT(DISTINCT ba.id) AS lbwDischarged
FROM   babyAdmission ba
JOIN   babyRegistration br ON ba.babyId  = br.babyId
JOIN   loungeMaster lm     ON ba.loungeId = lm.loungeId
WHERE  lm.status = 1 AND lm.phase > 0
  AND  ba.status = 2
  AND  ba.dateOfDischarge BETWEEN :startTs AND :endTs
  AND  br.babyWeight < 2500
  AND  br.birthWeightAvailable = 'Yes'`,
              formulas: ['LBW Discharged = COUNT(DISTINCT ba.id) WHERE ba.status = 2 AND br.babyWeight < 2500'],
            }} />

          <KpiCard
            label="48h Stay"
            value={k.stay48 ?? '—'}
            sub={k.stay48Pct != null ? `${k.stay48Pct}% of ${k.stayEligible ?? 0} eligible babies` : undefined}
            accent="#3b82f6" loading={loading.kpis}
            onDebug={setActiveDebugInfo} debugInfo={{
              title: '48-Hour Stay',
              sourceTable: 'babyAdmission, loungeMaster',
              appliedLogic: 'Discharged babies (status=2) whose dateOfDischarge falls in the period. stay48 = those where TIMESTAMPDIFF(admissionDateTime → dateOfDischarge) ≥ 48h. stayEligible = all discharged in period.',
              queryLogic: `-- stay48
SELECT COUNT(DISTINCT ba.id) AS stay48
FROM   babyAdmission ba
JOIN   loungeMaster lm ON ba.loungeId = lm.loungeId
WHERE  lm.status = 1 AND lm.phase > 0
  AND  ba.status = 2
  AND  ba.dateOfDischarge BETWEEN :startTs AND :endTs
  AND  TIMESTAMPDIFF(HOUR, ba.admissionDateTime, ba.dateOfDischarge) >= 48

-- stayEligible
SELECT COUNT(DISTINCT ba.id) AS stayEligible
FROM   babyAdmission ba
JOIN   loungeMaster lm ON ba.loungeId = lm.loungeId
WHERE  lm.status = 1 AND lm.phase > 0
  AND  ba.status = 2
  AND  ba.dateOfDischarge BETWEEN :startTs AND :endTs`,
              formulas: [
                '48h Stay Count = discharged babies where TIMESTAMPDIFF(admissionDateTime → dateOfDischarge) ≥ 48h',
                '48h Stay % = (stay48 / stayEligible) × 100',
              ],
            }} />

          <KpiCard label="Exclusive BF"
            value={k.bfPct != null ? `${k.bfPct}%` : '—'}
            sub={`${k.exclusiveBF ?? 0} of ${k.bfTotal ?? 0} babies`}
            accent="#ec4899" loading={loading.kpis}
            onDebug={setActiveDebugInfo} debugInfo={{
              title: 'Exclusive Breastfeeding %',
              sourceTable: 'babyAdmission, babyDailyNutrition',
              appliedLogic: 'Exclusive BF evaluated only at discharge (status=2, dateOfDischarge in period). A baby is exclusive if all nutrition records use ONLY method 1 (Breastfeed) or 2 (Expressed BM). Only discharged babies with ≥1 nutrition record are counted.',
              queryLogic: `-- Exclusive BF = breastFeedMethod contains ONLY method 1 (Breastfeed) or 2 (Expressed BM)
-- non_excl: records where method 3-15 (non-exclusive) is present
-- rec_count: only records with a valid, non-null, non-empty breastFeedMethod

SELECT SUM(CASE WHEN non_excl = 0 AND rec_count > 0 THEN 1 ELSE 0 END) AS exclusive,
       COUNT(*) AS bfTotal
FROM (
  SELECT ba.id,
    SUM(CASE WHEN bdn.breastFeedMethod IS NOT NULL
      AND bdn.breastFeedMethod NOT IN ('null', '[]', '')
      AND bdn.breastFeedMethod REGEXP '"(3|4|5|6|7|8|9|10|11|12|13|14|15)"'
      THEN 1 ELSE 0 END) AS non_excl,
    SUM(CASE WHEN bdn.breastFeedMethod IS NOT NULL
      AND bdn.breastFeedMethod NOT IN ('null', '[]', '')
      THEN 1 ELSE 0 END) AS rec_count
  FROM   babyAdmission ba
  JOIN   babyDailyNutrition bdn ON bdn.babyAdmissionId = ba.id
  JOIN   loungeMaster lm ON ba.loungeId = lm.loungeId
  WHERE  lm.status = 1 AND lm.phase > 0
    AND  ba.status = 2
    AND  ba.dateOfDischarge BETWEEN :startTs AND :endTs
  GROUP  BY ba.id
) t`,
              formulas: ['Exclusive BF % = (babies with no non-exclusive BF method / total babies with BF records) × 100'],
            }} />

          <KpiCard label="Wt Gain / Stable"
            value={k.gsPct != null ? `${k.gsPct}%` : '—'}
            sub={`${k.gainStable ?? 0} of ${k.wsTotal ?? 0} babies`}
            accent="#22c55e" loading={loading.kpis}
            onDebug={setActiveDebugInfo} debugInfo={{
              title: 'Weight Gain / Stable %',
              sourceTable: 'babyAdmission, babyDailyWeight',
              appliedLogic: 'Weight outcome evaluated only at discharge (status=2, dateOfDischarge in period). Compares first birth weight (weightType=1) against last discharge weight (weightType=4). Baby is gain/stable if discharge_wt ≥ birth_wt. Only discharged babies with both weight records are included.',
              queryLogic: `SELECT SUM(CASE WHEN discharge_wt >= birth_wt THEN 1 ELSE 0 END) AS gainStable,
       COUNT(*) AS wsTotal
FROM (
  SELECT ba.id,
    (SELECT bdw.babyWeight FROM babyDailyWeight bdw
     WHERE  bdw.babyAdmissionId = ba.id AND bdw.weightType = 1
     ORDER  BY bdw.id LIMIT 1)      AS birth_wt,
    (SELECT bdw.babyWeight FROM babyDailyWeight bdw
     WHERE  bdw.babyAdmissionId = ba.id AND bdw.weightType = 4
     ORDER  BY bdw.id DESC LIMIT 1) AS discharge_wt
  FROM   babyAdmission ba
  JOIN   loungeMaster lm ON ba.loungeId = lm.loungeId
  JOIN   facilitylist  f  ON lm.facilityId = f.FacilityID
  WHERE  f.Status = 1 AND lm.status = 1 AND lm.phase > 0
    AND  ba.status = 1
    AND  ba.admissionDateTime BETWEEN :startTs AND :endTs
) t
WHERE  birth_wt IS NOT NULL AND discharge_wt IS NOT NULL`,
              formulas: ['Wt Gain/Stable % = (discharge_wt ≥ birth_wt count / total babies with both weight records) × 100'],
            }} />

          <KpiCard label="Baby Assessed" value={k.babyAssessed ?? '—'} unit="babies" accent="#f97316" loading={loading.kpis}
            onDebug={setActiveDebugInfo} debugInfo={{
              title: 'Baby Assessed',
              sourceTable: 'babyDailyMonitoring, babyAdmission',
              appliedLogic: 'A baby is "assessed" if COUNT(assessmentDate in period) ≥ stayHours/12 (2 assessments per day). stayHours = TIMESTAMPDIFF(HOUR, MAX(admissionDate, fromDate), MIN(dischargeDate, toDate)). Includes status IN (1,2) — active and discharged babies present during the period.',
              queryLogic: `SELECT COUNT(DISTINCT id) AS assessed
FROM (
  SELECT ba.id,
    COUNT(DISTINCT bdm.assessmentDate) AS actualAss,
    GREATEST(FLOOR(TIMESTAMPDIFF(HOUR,
      GREATEST(DATE(ba.admissionDateTime), :fromDate),
      LEAST(COALESCE(DATE(ba.dateOfDischarge), :toDate), :toDate)
    ) / 12), 1) AS expectedAss
  FROM   babyAdmission ba
  JOIN   loungeMaster lm ON ba.loungeId = lm.loungeId
  JOIN   facilitylist  f  ON lm.facilityId = f.FacilityID
  LEFT   JOIN babyDailyMonitoring bdm ON bdm.babyAdmissionId = ba.id
    AND  bdm.assessmentDate BETWEEN :fromDate AND :toDate
  WHERE  f.Status = 1 AND lm.status = 1 AND lm.phase > 0
    AND  ba.status IN (1, 2)
    AND  DATE(ba.admissionDateTime) <= :toDate
    AND  (ba.dateOfDischarge IS NULL OR DATE(ba.dateOfDischarge) >= :fromDate)
  GROUP  BY ba.id
  HAVING actualAss >= expectedAss
) t`,
              formulas: [
                'Expected Assessments = MAX(FLOOR(stayHours / 12), 1)',
                'stayHours = TIMESTAMPDIFF(HOUR, MAX(admissionDate, fromDate), MIN(dischargeDate, toDate))',
                'Baby Assessed if COUNT(assessmentDate in period) ≥ expectedAssessments',
              ],
            }} />

          <KpiCard label="Total Mothers" value={k.totalMothers ?? '—'} unit="admissions" accent="#a855f7" loading={loading.kpis}
            onDebug={setActiveDebugInfo} debugInfo={{
              title: 'Total Mothers',
              sourceTable: 'motherAdmission',
              appliedLogic: 'Count of distinct mother admission records (status = 1) whose addDate falls within the selected date range.',
              queryLogic: `SELECT COUNT(DISTINCT ma.id) AS totalMothers
FROM   motherAdmission ma
JOIN   loungeMaster lm ON ma.loungeId  = lm.loungeId
JOIN   facilitylist  f  ON lm.facilityId = f.FacilityID
WHERE  f.Status = 1 AND lm.status = 1 AND lm.phase > 0
  AND  ma.status = 1
  AND  ma.addDate BETWEEN :startTs AND :endTs`,
              formulas: ['Total Mothers = COUNT(DISTINCT motherAdmission.id)'],
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
                  sourceTable: 'facilitylist, loungeMaster, nurseDutyChange, babyAdmission, babyRegistration, babyDailyMonitoring, babyDailyNutrition, babyDailyWeight, motherAdmission',
                  appliedLogic: 'Per-facility aggregation of all clinical KPIs plus a daily app-activity grid. Each row represents one facility; coloured squares show whether any nurseDutyChange record exists for that facility on each day. Period totals mirror the KPI card calculations but scoped per facilityId.',
                  queryLogic: `-- App use per lounge per day (facilityId carried for facility-level rollup)
SELECT lm.loungeId, lm.facilityId,
       DATE_FORMAT(DATE(ndc.addDate), '%Y-%m-%d') AS dt
FROM   nurseDutyChange ndc
JOIN   loungeMaster lm ON ndc.loungeId = lm.loungeId
WHERE  lm.facilityId IN (:facilityIds)
  AND  lm.phase > 0
  AND  DATE(ndc.addDate) BETWEEN :startDate AND :endDate
GROUP  BY lm.loungeId, dt

-- 6 additional parallel queries follow the same facilityId GROUP BY pattern:
-- (2) babyAdmission totals + 48h stay
-- (3) LBW admitted + discharged
-- (4) babyDailyMonitoring assessment count
-- (5) exclusive BF via babyDailyNutrition
-- (6) weight gain/stable via babyDailyWeight
-- (7) motherAdmission total`,
                  formulas: [
                    'App% per facility = (days with nurseDutyChange / total days in range) × 100',
                    'LBW % = LBW admitted / total babies admitted',
                    'Exclusive BF % = exclusive babies / babies with BF records × 100',
                    'Wt Gain/Stable % = discharge_wt ≥ birth_wt count / babies with both weights × 100',
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
                      <th className="dd-th-kpi">LBW Admission</th>
                      <th className="dd-th-kpi">LBW Discharge</th>
                      <th className="dd-th-kpi">48h Stay</th>
                      <th className="dd-th-kpi">Exclusive BF</th>
                      <th className="dd-th-kpi">Weight Gain/Stable</th>
                      <th className="dd-th-kpi">Total Baby</th>
                      <th className="dd-th-kpi">Baby Ass.</th>
                      <th className="dd-th-kpi">Total Mother</th>
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

                        <td className="dd-td-kpi">{fac.lbwAdmitted}</td>
                        <td className="dd-td-kpi">{fac.lbwDischarged}</td>
                        <td className="dd-td-kpi">{fac.stay48}</td>
                        <td className="dd-td-kpi">{fac.bfPct  != null ? `${fac.bfPct}%`  : '—'}</td>
                        <td className="dd-td-kpi">{fac.gsPct  != null ? `${fac.gsPct}%`  : '—'}</td>
                        <td className="dd-td-kpi">{fac.totalBaby}</td>
                        <td className="dd-td-kpi">{fac.assessed}</td>
                        <td className="dd-td-kpi">{fac.totalMothers}</td>
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
        {!loading.kpis && !loading.matrix && (
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
          stateIds:      selStateIds.length && selStateIds.length < (filterOptions?.states?.length ?? 0)
                           ? selStateIds.join(', ')
                           : '/* all states */',
          districtCodes: selDistrictIds.length && selDistrictIds.length < (filterOptions?.districts?.length ?? 0)
                           ? selDistrictIds.join(', ')
                           : '/* all districts */',
          typeIds:       selTypeIds.length && selTypeIds.length < (filterOptions?.facilityTypes?.length ?? 0)
                           ? selTypeIds.join(', ')
                           : '/* all types */',
          facilityIds:   selFacilityIds.length && selFacilityIds.length < (filterOptions?.facilities?.length ?? 0)
                           ? selFacilityIds.join(', ')
                           : '/* all facilities */',
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

function KpiCard({ label, value, unit, sub, accent, loading, debugInfo, onDebug }) {
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
