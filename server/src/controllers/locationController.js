const pool = require('../config/db');

const toTitleCase = (str) => {
    if (!str) return '';
    return str.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
};

const parseIds = (raw) =>
    (raw || '').split(',').map(s => s.trim()).filter(Boolean);

// ── Existing single-ID endpoints (kept for compatibility) ─────────────────────

exports.getStates = async (req, res) => {
    try {
        const [rows] = await pool.query(
            'SELECT stateCode AS id, stateName AS name FROM stateMaster WHERE status = 1 ORDER BY stateName ASC'
        );
        res.json(rows.map(r => ({ ...r, name: toTitleCase(r.name) })));
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error fetching states' });
    }
};

exports.getDistrictsByState = async (req, res) => {
    try {
        const { stateCode } = req.params;
        const [rows] = await pool.query(
            'SELECT priDistrictCode AS id, districtNameProperCase AS name FROM priDistricts WHERE StateCode = ? ORDER BY districtNameProperCase ASC',
            [stateCode]
        );
        res.json(rows.map(r => ({ ...r, name: toTitleCase(r.name) })));
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error fetching districts' });
    }
};

exports.getFacilitiesByDistrict = async (req, res) => {
    try {
        const { districtCode } = req.params;
        const [rows] = await pool.query(
            'SELECT FacilityID AS id, FacilityName AS name FROM facilitylist WHERE PRIDistrictCode = ? ORDER BY FacilityName ASC LIMIT 100',
            [districtCode]
        );
        res.json(rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error fetching facilities' });
    }
};

exports.getLoungesByFacility = async (req, res) => {
    try {
        const { facilityId } = req.params;
        const [rows] = await pool.query(
            'SELECT loungeId AS id, loungeName AS name FROM loungeMaster WHERE facilityId = ? ORDER BY loungeName ASC',
            [facilityId]
        );
        res.json(rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error fetching lounges' });
    }
};

// ── Multi-ID endpoints (used by multi-select filters) ─────────────────────────

// GET /api/v1/locations/districts?stateIds=9,27
exports.getDistrictsByStates = async (req, res) => {
    try {
        const ids = parseIds(req.query.stateIds);
        if (!ids.length) return res.status(400).json({ error: 'stateIds required' });
        const ph = ids.map(() => '?').join(',');
        const [rows] = await pool.query(
            `SELECT priDistrictCode AS id, districtNameProperCase AS name
             FROM priDistricts WHERE StateCode IN (${ph})
             ORDER BY districtNameProperCase ASC`,
            ids
        );
        res.json(rows.map(r => ({ ...r, name: toTitleCase(r.name) })));
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error fetching districts' });
    }
};

// GET /api/v1/locations/facilities?districtIds=136,137
exports.getFacilitiesByDistricts = async (req, res) => {
    try {
        const ids = parseIds(req.query.districtIds);
        if (!ids.length) return res.status(400).json({ error: 'districtIds required' });
        const ph = ids.map(() => '?').join(',');
        const [rows] = await pool.query(
            `SELECT FacilityID AS id, FacilityName AS name
             FROM facilitylist WHERE PRIDistrictCode IN (${ph})
             ORDER BY FacilityName ASC LIMIT 200`,
            ids
        );
        res.json(rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error fetching facilities' });
    }
};

// GET /api/v1/locations/lounges?facilityIds=228,229
exports.getLoungesByFacilities = async (req, res) => {
    try {
        const ids = parseIds(req.query.facilityIds);
        if (!ids.length) return res.status(400).json({ error: 'facilityIds required' });
        const ph = ids.map(() => '?').join(',');
        const [rows] = await pool.query(
            `SELECT loungeId AS id, loungeName AS name
             FROM loungeMaster WHERE facilityId IN (${ph})
             ORDER BY loungeName ASC`,
            ids
        );
        res.json(rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error fetching lounges' });
    }
};

// ── Legacy endpoints ──────────────────────────────────────────────────────────

exports.getLaunchesByDistrict = async (req, res) => {
    const { districtCode } = req.params;
    res.json([
        { id: `L1-${districtCode}`, name: 'Phase 1 Launch' },
        { id: `L2-${districtCode}`, name: 'Phase 2 Launch' }
    ]);
};

exports.getFacilitiesByLaunch = async (req, res) => {
    try {
        const { districtCode } = req.query;
        let query = 'SELECT FacilityID AS id, FacilityName AS name FROM facilitylist';
        const params = [];
        if (districtCode) { query += ' WHERE PRIDistrictCode = ?'; params.push(districtCode); }
        query += ' LIMIT 100';
        const [rows] = await pool.query(query, params);
        res.json(rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error fetching facilities' });
    }
};
