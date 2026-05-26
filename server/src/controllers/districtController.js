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

function buildFacilityConditions(query, fAlias = 'f', lmAlias = 'lm') {
  const { stateId, districtCode, facilityTypeId, facilityId } = query;
  const conds  = [`${fAlias}.Status = 1`, `${lmAlias}.status = 1`, `${lmAlias}.phase IS NOT NULL`];
  const values = [];
  if (stateId)        { conds.push(`${fAlias}.StateID = ?`);        values.push(+stateId); }
  if (districtCode)   { conds.push(`${fAlias}.PRIDistrictCode = ?`); values.push(+districtCode); }
  if (facilityTypeId) { conds.push(`${fAlias}.FacilityTypeID = ?`); values.push(+facilityTypeId); }
  if (facilityId)     { conds.push(`${lmAlias}.facilityId = ?`);    values.push(+facilityId); }
  return { conds, values };
}

// GET /api/v1/district/filters
exports.getFilters = async (req, res) => {
  try {
    const [states] = await pool.query(`
      SELECT DISTINCT sm.stateCode AS id, sm.stateName AS name
      FROM stateMaster sm
      JOIN facilitylist f ON f.StateID = sm.stateCode AND f.Status = 1
      JOIN loungeMaster lm ON lm.facilityId = f.FacilityID AND lm.status = 1 AND lm.phase IS NOT NULL
      ORDER BY sm.stateName
    `);
    const [districts] = await pool.query(`
      SELECT DISTINCT pd.priDistrictCode AS id, pd.districtNameProperCase AS name, f.StateID AS stateId
      FROM priDistricts pd
      JOIN facilitylist f ON f.PRIDistrictCode = pd.priDistrictCode AND f.Status = 1
      JOIN loungeMaster lm ON lm.facilityId = f.FacilityID AND lm.status = 1 AND lm.phase IS NOT NULL
      ORDER BY pd.districtNameProperCase
    `);
    const [facilityTypes] = await pool.query(`
      SELECT DISTINCT ft.id, ft.facilityTypeName AS name, ft.priority
      FROM facilityType ft
      JOIN facilitylist f ON f.FacilityTypeID = ft.id AND f.Status = 1
      JOIN loungeMaster lm ON lm.facilityId = f.FacilityID AND lm.status = 1 AND lm.phase IS NOT NULL
      WHERE ft.status = 1
      ORDER BY ft.priority, ft.facilityTypeName
    `);
    const [facilities] = await pool.query(`
      SELECT f.FacilityID AS id, f.FacilityName AS name,
             f.StateID AS stateId, f.PRIDistrictCode AS districtCode,
             f.FacilityTypeID AS facilityTypeId
      FROM facilitylist f
      JOIN loungeMaster lm ON lm.facilityId = f.FacilityID AND lm.status = 1 AND lm.phase IS NOT NULL
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

    // Daily KMC app use (facility-days with any nurse activity)
    const [appRows] = await pool.query(`
      SELECT COUNT(*) AS facilityDays
      FROM (
        SELECT lm.facilityId, DATE(ndc.addDate) AS dt
        FROM nurseDutyChange ndc
        JOIN loungeMaster lm ON ndc.loungeId = lm.loungeId
        JOIN facilitylist f ON lm.facilityId = f.FacilityID
        WHERE ${condStr} AND DATE(ndc.addDate) BETWEEN ? AND ?
        GROUP BY lm.facilityId, DATE(ndc.addDate)
      ) t
    `, [...values, start, end]);
    const appUseDays      = appRows[0].facilityDays || 0;
    const possibleFacDays = totalFacilities * totalDays;

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
    const [bfRows] = await pool.query(`
      SELECT
        SUM(CASE WHEN non_excl = 0 AND rec_count > 0 THEN 1 ELSE 0 END) AS exclusive,
        COUNT(*) AS bfTotal
      FROM (
        SELECT ba.id,
          SUM(CASE WHEN bdn.breastFeedMethod IS NOT NULL
            AND JSON_OVERLAPS(bdn.breastFeedMethod, ?) THEN 1 ELSE 0 END) AS non_excl,
          COUNT(bdn.id) AS rec_count
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
        appUseDays,
        possibleFacDays,
        appUsePct:     possibleFacDays > 0 ? Math.round((appUseDays / possibleFacDays) * 100) : 0,
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

    // App use per facility per day
    const [appRows] = await pool.query(`
      SELECT lm.facilityId, DATE_FORMAT(DATE(ndc.addDate), '%Y-%m-%d') AS dt
      FROM nurseDutyChange ndc
      JOIN loungeMaster lm ON ndc.loungeId = lm.loungeId
      WHERE lm.facilityId IN (?) AND lm.phase IS NOT NULL
        AND DATE(ndc.addDate) BETWEEN ? AND ?
      GROUP BY lm.facilityId, DATE_FORMAT(DATE(ndc.addDate), '%Y-%m-%d')
    `, [facIds, start, end]);

    const BA_JOIN = 'JOIN loungeMaster lm ON ba.loungeId = lm.loungeId AND lm.phase IS NOT NULL';

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

    // Exclusive BF
    const [bfRows] = await pool.query(`
      SELECT facilityId,
        SUM(CASE WHEN non_excl = 0 AND rec_count > 0 THEN 1 ELSE 0 END) AS exclusive,
        COUNT(*) AS bfTotal
      FROM (
        SELECT lm.facilityId, ba.id,
          SUM(CASE WHEN bdn.breastFeedMethod IS NOT NULL
            AND JSON_OVERLAPS(bdn.breastFeedMethod, ?) THEN 1 ELSE 0 END) AS non_excl,
          COUNT(bdn.id) AS rec_count
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
      JOIN loungeMaster lm ON ma.loungeId = lm.loungeId AND lm.phase IS NOT NULL
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
