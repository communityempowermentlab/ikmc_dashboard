const pool = require('../config/db');

const NON_EXCL_METHODS = JSON.stringify(['3','4','5','6','7','8','9','10','11','12','13','14','15']);

// mysql2 returns SUM/COUNT results as strings for DECIMAL columns; coerce to number
const n = x => Number(x) || 0;

function buildDateRange(startDate, endDate) {
  const today = new Date().toISOString().slice(0, 10);
  const sevenAgo = new Date(Date.now() - 6 * 86400000).toISOString().slice(0, 10);
  return {
    start: startDate || sevenAgo,
    end:   endDate   || today,
  };
}

function parseMultiIds(raw) {
  return (raw || '').toString().split(',').map(s => s.trim()).filter(Boolean).map(Number);
}

function buildFacilityConditions(query, fAlias = 'f', lmAlias = 'lm') {
  const conds  = [`${fAlias}.Status = 1`, `${lmAlias}.status = 1`, `${lmAlias}.phase IS NOT NULL`];
  const values = [];

  const stateIds      = parseMultiIds(query.stateId);
  const districtCodes = parseMultiIds(query.districtCode);
  const typeIds       = parseMultiIds(query.facilityTypeId);
  const facilityIds   = parseMultiIds(query.facilityId);

  if (stateIds.length) {
    const ph = stateIds.map(() => '?').join(',');
    conds.push(`${fAlias}.StateID IN (${ph})`);
    values.push(...stateIds);
  }
  if (districtCodes.length) {
    const ph = districtCodes.map(() => '?').join(',');
    conds.push(`${fAlias}.PRIDistrictCode IN (${ph})`);
    values.push(...districtCodes);
  }
  if (typeIds.length) {
    const ph = typeIds.map(() => '?').join(',');
    conds.push(`${fAlias}.FacilityTypeID IN (${ph})`);
    values.push(...typeIds);
  }
  if (facilityIds.length) {
    const ph = facilityIds.map(() => '?').join(',');
    conds.push(`${lmAlias}.facilityId IN (${ph})`);
    values.push(...facilityIds);
  }

  return { conds, values };
}

// GET /api/v1/district/filters
exports.getFilters = async (req, res) => {
  try {
    const [states] = await pool.query(`
      SELECT DISTINCT sm.stateCode AS id, sm.stateName AS name
      FROM stateMaster sm
      JOIN facilitylist f ON f.StateID = sm.stateCode AND f.Status = 1
      JOIN loungeMaster lm ON lm.facilityId = f.FacilityID AND lm.status = 1 AND lm.phase > 0
      ORDER BY sm.stateName
    `);
    const [districts] = await pool.query(`
      SELECT DISTINCT pd.priDistrictCode AS id, pd.districtNameProperCase AS name, f.StateID AS stateId
      FROM priDistricts pd
      JOIN facilitylist f ON f.PRIDistrictCode = pd.priDistrictCode AND f.Status = 1
      JOIN loungeMaster lm ON lm.facilityId = f.FacilityID AND lm.status = 1 AND lm.phase > 0
      ORDER BY pd.districtNameProperCase
    `);
    const [facilityTypes] = await pool.query(`
      SELECT DISTINCT ft.id, ft.facilityTypeName AS name, ft.priority
      FROM facilityType ft
      JOIN facilitylist f ON f.FacilityTypeID = ft.id AND f.Status = 1
      JOIN loungeMaster lm ON lm.facilityId = f.FacilityID AND lm.status = 1 AND lm.phase > 0
      WHERE ft.status = 1
      ORDER BY ft.priority, ft.facilityTypeName
    `);
    const [facilities] = await pool.query(`
      SELECT f.FacilityID AS id, f.FacilityName AS name,
             f.StateID AS stateId, f.PRIDistrictCode AS districtCode,
             f.FacilityTypeID AS facilityTypeId
      FROM facilitylist f
      JOIN loungeMaster lm ON lm.facilityId = f.FacilityID AND lm.status = 1 AND lm.phase > 0
      WHERE f.Status = 1
      GROUP BY f.FacilityID, f.FacilityName, f.StateID, f.PRIDistrictCode, f.FacilityTypeID
      ORDER BY f.FacilityName
    `);
    res.json({ states, districts, facilityTypes, facilities });
  } catch (err) {
    console.error('getFilters error:', err);
    res.status(500).json({ error: 'Failed to load filters' });
  }
};

// GET /api/v1/district/kpiSummary
exports.getKpiSummary = async (req, res) => {
  try {
    const { start, end } = buildDateRange(req.query.startDate, req.query.endDate);
    const { conds, values } = buildFacilityConditions(req.query);
    const condStr = conds.join(' AND ');
    const startTs = `${start} 00:00:00`;
    const endTs   = `${end} 23:59:59`;

    // Total facilities
    const [facCount] = await pool.query(`
      SELECT COUNT(DISTINCT lm.facilityId) AS total
      FROM loungeMaster lm
      JOIN facilitylist f ON lm.facilityId = f.FacilityID
      WHERE ${condStr}
    `, values);
    const totalFacilities = facCount[0].total || 0;

    // Total days in range
    const totalDays = Math.round(
      (new Date(end + 'T12:00:00Z') - new Date(start + 'T12:00:00Z')) / 86400000
    ) + 1;

    // Facilities where at least one lounge was active EVERY day of the range
    const [appRows] = await pool.query(`
      SELECT COUNT(DISTINCT facilityId) AS compliantFacilities
      FROM (
        SELECT lm.loungeId, lm.facilityId, COUNT(DISTINCT DATE(ndc.addDate)) AS daysActive
        FROM nurseDutyChange ndc
        JOIN loungeMaster lm ON ndc.loungeId = lm.loungeId
        JOIN facilitylist f ON lm.facilityId = f.FacilityID
        WHERE ${condStr} AND DATE(ndc.addDate) BETWEEN ? AND ?
        GROUP BY lm.loungeId, lm.facilityId
        HAVING daysActive >= ?
      ) t
    `, [...values, start, end, totalDays]);
    const appUseFacilities = n(appRows[0].compliantFacilities);

    const BA_JOIN = `
      JOIN loungeMaster lm ON ba.loungeId = lm.loungeId
      JOIN facilitylist f ON lm.facilityId = f.FacilityID
    `;

    // Baby totals + 48h stay
    const [babyRows] = await pool.query(`
      SELECT
        COUNT(DISTINCT ba.id) AS totalBaby,
        COUNT(DISTINCT CASE
          WHEN ba.dateOfDischarge IS NOT NULL
           AND TIMESTAMPDIFF(HOUR, ba.admissionDateTime, ba.dateOfDischarge) >= 48
          THEN ba.id END) AS stay48
      FROM babyAdmission ba ${BA_JOIN}
      WHERE ${condStr} AND ba.status = 1
        AND ba.admissionDateTime BETWEEN ? AND ?
    `, [...values, startTs, endTs]);

    // LBW
    const [lbwRows] = await pool.query(`
      SELECT
        COUNT(DISTINCT ba.id) AS lbwAdmitted,
        COUNT(DISTINCT CASE WHEN ba.dateOfDischarge IS NOT NULL THEN ba.id END) AS lbwDischarged
      FROM babyAdmission ba
      JOIN babyRegistration br ON ba.babyId = br.babyId ${BA_JOIN}
      WHERE ${condStr} AND ba.status = 1
        AND ba.admissionDateTime BETWEEN ? AND ?
        AND br.babyWeight < 2500 AND br.birthWeightAvailable = 'Yes'
    `, [...values, startTs, endTs]);

    // Baby assessment
    const [assessRows] = await pool.query(`
      SELECT COUNT(DISTINCT bdm.babyAdmissionId) AS assessed
      FROM babyDailyMonitoring bdm
      JOIN babyAdmission ba ON bdm.babyAdmissionId = ba.id AND ba.status = 1 ${BA_JOIN}
      WHERE ${condStr} AND ba.admissionDateTime BETWEEN ? AND ?
    `, [...values, startTs, endTs]);

    // Exclusive breastfeeding
    // Exclusive = ALL nutrition records for the baby use ONLY method 1 (Breastfeed) or 2 (Expressed BM)
    // rec_count counts only records with a valid (non-NULL, non-empty) breastFeedMethod
    const [bfRows] = await pool.query(`
      SELECT
        SUM(CASE WHEN non_excl = 0 AND rec_count > 0 THEN 1 ELSE 0 END) AS exclusive,
        COUNT(*) AS bfTotal
      FROM (
        SELECT ba.id,
          SUM(CASE WHEN bdn.breastFeedMethod IS NOT NULL
            AND bdn.breastFeedMethod NOT IN ('null', '[]', '')
            AND JSON_OVERLAPS(bdn.breastFeedMethod, ?) THEN 1 ELSE 0 END) AS non_excl,
          SUM(CASE WHEN bdn.breastFeedMethod IS NOT NULL
            AND bdn.breastFeedMethod NOT IN ('null', '[]', '')
            THEN 1 ELSE 0 END) AS rec_count
        FROM babyAdmission ba
        JOIN babyDailyNutrition bdn ON bdn.babyAdmissionId = ba.id ${BA_JOIN}
        WHERE ${condStr} AND ba.status = 1
          AND ba.admissionDateTime BETWEEN ? AND ?
        GROUP BY ba.id
      ) t
    `, [NON_EXCL_METHODS, ...values, startTs, endTs]);

    // Weight gain/stable
    const [wsRows] = await pool.query(`
      SELECT
        SUM(CASE WHEN discharge_wt >= birth_wt THEN 1 ELSE 0 END) AS gainStable,
        COUNT(*) AS wsTotal
      FROM (
        SELECT ba.id,
          (SELECT bdw.babyWeight FROM babyDailyWeight bdw
           WHERE bdw.babyAdmissionId = ba.id AND bdw.weightType = 1 ORDER BY bdw.id LIMIT 1) AS birth_wt,
          (SELECT bdw.babyWeight FROM babyDailyWeight bdw
           WHERE bdw.babyAdmissionId = ba.id AND bdw.weightType = 4 ORDER BY bdw.id DESC LIMIT 1) AS discharge_wt
        FROM babyAdmission ba ${BA_JOIN}
        WHERE ${condStr} AND ba.status = 1
          AND ba.admissionDateTime BETWEEN ? AND ?
      ) t
      WHERE birth_wt IS NOT NULL AND discharge_wt IS NOT NULL
    `, [...values, startTs, endTs]);

    // Total mothers
    const [moRows] = await pool.query(`
      SELECT COUNT(DISTINCT ma.id) AS totalMothers
      FROM motherAdmission ma
      JOIN loungeMaster lm ON ma.loungeId = lm.loungeId
      JOIN facilitylist f ON lm.facilityId = f.FacilityID
      WHERE ${condStr} AND ma.status = 1
        AND ma.addDate BETWEEN ? AND ?
    `, [...values, startTs, endTs]);

    const b   = babyRows[0];
    const lbw = lbwRows[0];
    const bf  = bfRows[0];
    const ws  = wsRows[0];

    const excl      = n(bf.exclusive);
    const bfTot     = n(bf.bfTotal);
    const gainSt    = n(ws.gainStable);
    const wsTot     = n(ws.wsTotal);

    res.json({
      period: { start, end, totalDays },
      kpis: {
        totalFacilities,
        totalDays,
        appUseFacilities: appUseFacilities,
        appUsePct: totalFacilities > 0 ? Math.round((appUseFacilities / totalFacilities) * 100) : 0,
        lbwAdmitted:   n(lbw.lbwAdmitted),
        lbwDischarged: n(lbw.lbwDischarged),
        stay48:        n(b.stay48),
        exclusiveBF:   excl,
        bfTotal:       bfTot,
        bfPct:         bfTot > 0 ? Math.round((excl / bfTot) * 100) : 0,
        gainStable:    gainSt,
        wsTotal:       wsTot,
        gsPct:         wsTot > 0 ? Math.round((gainSt / wsTot) * 100) : 0,
        totalBaby:     n(b.totalBaby),
        babyAssessed:  n(assessRows[0].assessed),
        totalMothers:  n(moRows[0].totalMothers),
      },
    });
  } catch (err) {
    console.error('getKpiSummary error:', err);
    res.status(500).json({ error: 'Failed to load KPI summary' });
  }
};

// GET /api/v1/district/facilityMatrix
exports.getFacilityMatrix = async (req, res) => {
  try {
    const { start, end } = buildDateRange(req.query.startDate, req.query.endDate);
    const { conds, values } = buildFacilityConditions(req.query);
    const condStr = conds.join(' AND ');
    const startTs = `${start} 00:00:00`;
    const endTs   = `${end} 23:59:59`;

    const [facilities] = await pool.query(`
      SELECT DISTINCT f.FacilityID AS id, f.FacilityName AS name,
             ft.facilityTypeName AS type,
             pd.districtNameProperCase AS district,
             sm.stateName AS state
      FROM facilitylist f
      JOIN facilityType ft ON f.FacilityTypeID = ft.id
      JOIN priDistricts pd ON f.PRIDistrictCode = pd.priDistrictCode
      JOIN stateMaster sm ON f.StateID = sm.stateCode
      JOIN loungeMaster lm ON lm.facilityId = f.FacilityID
      WHERE ${condStr}
      ORDER BY sm.stateName, pd.districtNameProperCase, f.FacilityName
    `, values);

    if (!facilities.length) {
      return res.json({ facilities: [], dates: [] });
    }

    // Build date list
    const dates = [];
    for (let d = new Date(start + 'T12:00:00Z'); d <= new Date(end + 'T12:00:00Z'); d.setDate(d.getDate() + 1)) {
      dates.push(d.toISOString().slice(0, 10));
    }

    const facIds = facilities.map(f => f.id);

    // App use per lounge per day (facilityId carried for lookup; Set deduplicates facility-days)
    const [appRows] = await pool.query(`
      SELECT lm.loungeId, lm.facilityId, DATE_FORMAT(DATE(ndc.addDate), '%Y-%m-%d') AS dt
      FROM nurseDutyChange ndc
      JOIN loungeMaster lm ON ndc.loungeId = lm.loungeId
      WHERE lm.facilityId IN (?) AND lm.phase > 0
        AND DATE(ndc.addDate) BETWEEN ? AND ?
      GROUP BY lm.loungeId, lm.facilityId, DATE_FORMAT(DATE(ndc.addDate), '%Y-%m-%d')
    `, [facIds, start, end]);

    const BA_JOIN = 'JOIN loungeMaster lm ON ba.loungeId = lm.loungeId AND lm.phase > 0';

    // Baby totals + 48h
    const [babyRows] = await pool.query(`
      SELECT lm.facilityId,
        COUNT(DISTINCT ba.id) AS totalBaby,
        COUNT(DISTINCT CASE
          WHEN ba.dateOfDischarge IS NOT NULL
           AND TIMESTAMPDIFF(HOUR, ba.admissionDateTime, ba.dateOfDischarge) >= 48
          THEN ba.id END) AS stay48
      FROM babyAdmission ba ${BA_JOIN}
      WHERE lm.facilityId IN (?) AND ba.status = 1
        AND ba.admissionDateTime BETWEEN ? AND ?
      GROUP BY lm.facilityId
    `, [facIds, startTs, endTs]);

    // LBW
    const [lbwRows] = await pool.query(`
      SELECT lm.facilityId,
        COUNT(DISTINCT ba.id) AS lbwAdmitted,
        COUNT(DISTINCT CASE WHEN ba.dateOfDischarge IS NOT NULL THEN ba.id END) AS lbwDischarged
      FROM babyAdmission ba
      JOIN babyRegistration br ON ba.babyId = br.babyId ${BA_JOIN}
      WHERE lm.facilityId IN (?) AND ba.status = 1
        AND ba.admissionDateTime BETWEEN ? AND ?
        AND br.babyWeight < 2500 AND br.birthWeightAvailable = 'Yes'
      GROUP BY lm.facilityId
    `, [facIds, startTs, endTs]);

    // Assessment
    const [assessRows] = await pool.query(`
      SELECT lm.facilityId, COUNT(DISTINCT bdm.babyAdmissionId) AS assessed
      FROM babyDailyMonitoring bdm
      JOIN babyAdmission ba ON bdm.babyAdmissionId = ba.id AND ba.status = 1 ${BA_JOIN}
      WHERE lm.facilityId IN (?) AND ba.admissionDateTime BETWEEN ? AND ?
      GROUP BY lm.facilityId
    `, [facIds, startTs, endTs]);

    // Exclusive BF — method 1 (Breastfeed) or 2 (Expressed BM) ONLY = exclusive
    const [bfRows] = await pool.query(`
      SELECT facilityId,
        SUM(CASE WHEN non_excl = 0 AND rec_count > 0 THEN 1 ELSE 0 END) AS exclusive,
        COUNT(*) AS bfTotal
      FROM (
        SELECT lm.facilityId, ba.id,
          SUM(CASE WHEN bdn.breastFeedMethod IS NOT NULL
            AND bdn.breastFeedMethod NOT IN ('null', '[]', '')
            AND JSON_OVERLAPS(bdn.breastFeedMethod, ?) THEN 1 ELSE 0 END) AS non_excl,
          SUM(CASE WHEN bdn.breastFeedMethod IS NOT NULL
            AND bdn.breastFeedMethod NOT IN ('null', '[]', '')
            THEN 1 ELSE 0 END) AS rec_count
        FROM babyAdmission ba
        JOIN babyDailyNutrition bdn ON bdn.babyAdmissionId = ba.id ${BA_JOIN}
        WHERE lm.facilityId IN (?) AND ba.status = 1
          AND ba.admissionDateTime BETWEEN ? AND ?
        GROUP BY lm.facilityId, ba.id
      ) t
      GROUP BY facilityId
    `, [NON_EXCL_METHODS, facIds, startTs, endTs]);

    // Weight gain/stable
    const [wsRows] = await pool.query(`
      SELECT facilityId,
        SUM(CASE WHEN discharge_wt >= birth_wt THEN 1 ELSE 0 END) AS gainStable,
        COUNT(*) AS wsTotal
      FROM (
        SELECT lm.facilityId,
          (SELECT bdw.babyWeight FROM babyDailyWeight bdw
           WHERE bdw.babyAdmissionId = ba.id AND bdw.weightType = 1 ORDER BY bdw.id LIMIT 1) AS birth_wt,
          (SELECT bdw.babyWeight FROM babyDailyWeight bdw
           WHERE bdw.babyAdmissionId = ba.id AND bdw.weightType = 4 ORDER BY bdw.id DESC LIMIT 1) AS discharge_wt
        FROM babyAdmission ba ${BA_JOIN}
        WHERE lm.facilityId IN (?) AND ba.status = 1
          AND ba.admissionDateTime BETWEEN ? AND ?
      ) t
      WHERE birth_wt IS NOT NULL AND discharge_wt IS NOT NULL
      GROUP BY facilityId
    `, [facIds, startTs, endTs]);

    // Total mothers
    const [moRows] = await pool.query(`
      SELECT lm.facilityId, COUNT(DISTINCT ma.id) AS totalMothers
      FROM motherAdmission ma
      JOIN loungeMaster lm ON ma.loungeId = lm.loungeId AND lm.phase > 0
      WHERE lm.facilityId IN (?) AND ma.status = 1
        AND ma.addDate BETWEEN ? AND ?
      GROUP BY lm.facilityId
    `, [facIds, startTs, endTs]);

    // Build lookup maps
    const appMap = {};
    appRows.forEach(r => {
      if (!appMap[r.facilityId]) appMap[r.facilityId] = new Set();
      appMap[r.facilityId].add(r.dt);
    });
    const toMap = rows => Object.fromEntries(rows.map(r => [r.facilityId, r]));
    const babyMap   = toMap(babyRows);
    const lbwMap    = toMap(lbwRows);
    const assessMap = toMap(assessRows);
    const bfMap     = toMap(bfRows);
    const wsMap     = toMap(wsRows);
    const moMap     = toMap(moRows);

    const matrix = facilities.map(fac => {
      const fid     = fac.id;
      const appDays = appMap[fid]   || new Set();
      const b       = babyMap[fid]  || {};
      const lbw     = lbwMap[fid]   || {};
      const ass     = assessMap[fid]|| {};
      const bf      = bfMap[fid]    || {};
      const ws      = wsMap[fid]    || {};
      const mo      = moMap[fid]    || {};
      const excl  = n(bf.exclusive);
      const bfTot = n(bf.bfTotal);
      const gainSt = n(ws.gainStable);
      const wsTot  = n(ws.wsTotal);
      const bfPct  = bfTot > 0 ? Math.round((excl  / bfTot) * 100) : null;
      const gsPct  = wsTot > 0 ? Math.round((gainSt / wsTot) * 100) : null;
      return {
        ...fac,
        appUseDays:    appDays.size,
        appUsePct:     dates.length > 0 ? Math.round((appDays.size / dates.length) * 100) : 0,
        dailyAppUse:   dates.map(dt => appDays.has(dt)),
        totalBaby:     n(b.totalBaby),
        stay48:        n(b.stay48),
        lbwAdmitted:   n(lbw.lbwAdmitted),
        lbwDischarged: n(lbw.lbwDischarged),
        assessed:      n(ass.assessed),
        exclusiveBF:   excl,
        bfTotal:       bfTot,
        bfPct,
        gainStable:    gainSt,
        wsTotal:       wsTot,
        gsPct,
        totalMothers: n(mo.totalMothers),
      };
    });

    res.json({ facilities: matrix, dates });
  } catch (err) {
    console.error('getFacilityMatrix error:', err);
    res.status(500).json({ error: 'Failed to load facility matrix' });
  }
};

// GET /api/v1/district/dailyAppUsage
exports.getDailyAppUsage = async (req, res) => {
  try {
    const { start, end } = buildDateRange(req.query.startDate, req.query.endDate);
    const { conds, values } = buildFacilityConditions(req.query);
    const condStr = conds.join(' AND ');

    // Per-day count of UNIQUE facilities with ≥1 nurse check-in (facility = active if any lounge had activity)
    const [rows] = await pool.query(`
      SELECT
        DATE_FORMAT(DATE(ndc.addDate), '%Y-%m-%d') AS dt,
        COUNT(DISTINCT lm.facilityId)              AS activeFacilities
      FROM nurseDutyChange ndc
      JOIN loungeMaster lm ON ndc.loungeId = lm.loungeId
      JOIN facilitylist  f  ON lm.facilityId = f.FacilityID
      WHERE ${condStr}
        AND DATE(ndc.addDate) BETWEEN ? AND ?
      GROUP BY DATE_FORMAT(DATE(ndc.addDate), '%Y-%m-%d')
      ORDER BY dt
    `, [...values, start, end]);

    // Total facilities in scope (denominator)
    const [facRows] = await pool.query(`
      SELECT COUNT(DISTINCT lm.facilityId) AS total
      FROM loungeMaster lm
      JOIN facilitylist f ON lm.facilityId = f.FacilityID
      WHERE ${condStr}
    `, values);

    const totalFacilities = n(facRows[0].total);

    // Build full date series — fill missing dates with 0
    const dates = [];
    for (let d = new Date(start + 'T12:00:00Z'); d <= new Date(end + 'T12:00:00Z'); d.setDate(d.getDate() + 1)) {
      dates.push(d.toISOString().slice(0, 10));
    }
    const map = Object.fromEntries(rows.map(r => [r.dt, Number(r.activeFacilities)]));
    const series = dates.map(dt => ({ dt, activeFacilities: map[dt] || 0 }));

    res.json({ totalFacilities, series });
  } catch (err) {
    console.error('getDailyAppUsage error:', err);
    res.status(500).json({ error: 'Failed to load daily app usage' });
  }
};

// POST /api/v1/district/generateInsights
// Sends weekly KPI + facility data to Gemini and returns insights in simple Hindi
exports.generateInsights = async (req, res) => {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey || apiKey === 'your_google_gemini_api_key_here') {
      return res.status(503).json({ error: 'GEMINI_API_KEY not configured in .env' });
    }

    const { kpis, facilities, period } = req.body;

    // Build a concise summary for the prompt
    const facSummary = (facilities || []).slice(0, 15).map(f =>
      `  - ${f.name} (${f.district || ''}): App ${f.appUsePct ?? 0}%, LBW=${f.lbwAdmitted ?? 0}, Baby=${f.totalBaby ?? 0}, BF=${f.bfPct != null ? f.bfPct + '%' : 'N/A'}, Wt=${f.gsPct != null ? f.gsPct + '%' : 'N/A'}`
    ).join('\n');

    const prompt = `
आप एक iKMC (Kangaroo Mother Care) कार्यक्रम के स्वास्थ्य डेटा विश्लेषक हैं।

नीचे दिए गए साप्ताहिक डेटा के आधार पर 5 महत्वपूर्ण अंतर्दृष्टि (insights) सरल हिंदी में तैयार करें।

समयावधि: ${period?.start} से ${period?.end} (${period?.totalDays} दिन)

समग्र KPI:
- कुल सुविधाएं: ${kpis?.totalFacilities ?? 0}
- डेली ऐप अनुपालन: ${kpis?.appUsePct ?? 0}% (${kpis?.appUseFacilities ?? 0} / ${kpis?.totalFacilities ?? 0} सुविधाएं हर दिन सक्रिय)
- कुल बच्चे भर्ती: ${kpis?.totalBaby ?? 0}
- LBW भर्ती: ${kpis?.lbwAdmitted ?? 0}, LBW छुट्टी: ${kpis?.lbwDischarged ?? 0}
- 48 घंटे रुके: ${kpis?.stay48 ?? 0}
- विशेष स्तनपान: ${kpis?.bfPct ?? 0}% (${kpis?.exclusiveBF ?? 0} / ${kpis?.bfTotal ?? 0} बच्चे)
- वजन में सुधार/स्थिर: ${kpis?.gsPct ?? 0}% (${kpis?.gainStable ?? 0} / ${kpis?.wsTotal ?? 0} बच्चे)
- बच्चों का मूल्यांकन: ${kpis?.babyAssessed ?? 0}
- कुल माताएं: ${kpis?.totalMothers ?? 0}

सुविधा-वार प्रदर्शन:
${facSummary || '  डेटा उपलब्ध नहीं'}

निर्देश:
- बिल्कुल 5 अंतर्दृष्टि दें।
- सरल, स्पष्ट हिंदी में लिखें जो स्वास्थ्य कर्मी आसानी से समझ सकें।
- संख्याओं का उपयोग करें जहाँ जरूरी हो।
- अच्छे प्रदर्शन की सराहना और सुधार के क्षेत्र दोनों शामिल करें।

केवल यह JSON array लौटाएं, कोई अन्य टेक्स्ट नहीं:
[
  {"type": "positive", "text": "हिंदी में अंतर्दृष्टि..."},
  {"type": "warning",  "text": "हिंदी में अंतर्दृष्टि..."},
  {"type": "critical", "text": "हिंदी में अंतर्दृष्टि..."},
  {"type": "info",     "text": "हिंदी में अंतर्दृष्टि..."},
  {"type": "positive", "text": "हिंदी में अंतर्दृष्टि..."}
]

type के मान: "positive" (अच्छा), "warning" (ध्यान दें), "critical" (गंभीर), "info" (जानकारी)
`;

    const { GoogleGenerativeAI } = require('@google/generative-ai');
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

    const result = await model.generateContent(prompt);
    const raw    = result.response.text().trim();

    // Extract JSON array from response (Gemini sometimes wraps in markdown code block)
    const jsonMatch = raw.match(/\[[\s\S]*\]/);
    if (!jsonMatch) throw new Error('Gemini response did not contain a JSON array');

    const insights = JSON.parse(jsonMatch[0]);
    res.json({ insights });

  } catch (err) {
    console.error('generateInsights error:', err.message);
    res.status(500).json({ error: err.message || 'Failed to generate insights' });
  }
};
