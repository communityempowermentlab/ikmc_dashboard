const pool = require('../config/db');

module.exports = async (req, res, next) => {
    if (!req.user || !req.user.id) {
        return next();
    }

    try {
        // Dynamically fetch assigned facilities from DB to ensure it's up to date
        // and to handle existing tokens that don't have assignedFacilities.
        const [assignments] = await pool.query(
            `SELECT DISTINCT facilityId FROM employeeDistrictFacilityLounge WHERE masterId = ? AND status = 1`,
            [req.user.id]
        );

        let assigned = null;
        if (assignments && assignments.length > 0) {
            assigned = assignments.map(a => a.facilityId).filter(id => id);
        }

        // Expose to req.user so other controllers (like districtController) can use it
        req.user.assignedFacilities = assigned;

        // If user has no assigned facilities, bypass scoping.
        console.log("Middleware check:", req.user.assignedFacilities);
        if (!assigned || assigned.length === 0) {
            return next();
        }

        // Helper to intersect client requested IDs with server assigned IDs.
        const intersect = (incoming) => {
            if (!incoming) return assigned.join(',');
            const incomingIds = incoming.toString().split(',').map(s => s.trim()).filter(Boolean).map(Number);
            if (incomingIds.length === 0) return assigned.join(',');
            
            const valid = incomingIds.filter(id => assigned.includes(id));
            return valid.length > 0 ? valid.join(',') : '-1';
        };

        // Override req.query.facilityId
        if (req.query) {
            req.query = Object.assign({}, req.query, {
                facilityId: intersect(req.query.facilityId)
            });
        }
        
        // Override req.body.facilityId for POST requests
        if (req.body && typeof req.body === 'object' && !Array.isArray(req.body)) {
            req.body = Object.assign({}, req.body, {
                facilityId: intersect(req.body.facilityId)
            });
        }

        // Override req.body.facilities for insights API
        if (req.body && req.body.facilities && Array.isArray(req.body.facilities)) {
            req.body.facilities = req.body.facilities.filter(f => assigned.includes(f.id));
        }

        next();
    } catch (err) {
        console.error('Facility Scope Middleware Error:', err);
        next();
    }
};
