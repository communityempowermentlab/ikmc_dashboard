const pool = require('../config/db');
const jwt = require('jsonwebtoken');

const getIpAddress = (req) => {
    let ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1';
    if (ip.includes(',')) {
        ip = ip.split(',')[0].trim(); // Get the first IP if there are multiple proxies
    }
    if (ip.includes('::ffff:')) {
        ip = ip.split('::ffff:')[1];
    } else if (ip === '::1') {
        ip = '127.0.0.1';
    }
    return ip;
};

exports.login = async (req, res) => {
    try {
        const { email, password, rememberMe } = req.body;

        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password are required' });
        }

        // Query user by email (or employeeCode)
        const [users] = await pool.query(
            'SELECT * FROM employeesData WHERE email = ? OR employeeCode = ? LIMIT 1',
            [email, email]
        );

        if (users.length === 0) {
            return res.status(401).json({ error: 'Invalid email or password' });
        }

        const user = users[0];

        // Check status
        if (user.status !== 1) {
            return res.status(403).json({ error: 'Account is disabled' });
        }

        // Compare password (support both MD5 and Base64)
        const crypto = require('crypto');
        const md5Password = crypto.createHash('md5').update(password).digest('hex');
        const base64Password = Buffer.from(password).toString('base64');
        
        if (user.password !== md5Password && user.password !== base64Password) {
            return res.status(401).json({ error: 'Invalid email or password' });
        }

        // Insert Login History
        const ipAddress = getIpAddress(req);
        await pool.query(
            `INSERT INTO employeeLoginMaster 
            (employeeId, userType, ipAddress, type, loginTime, logoutTime, status) 
            VALUES (?, 5, ?, 1, NOW(), NOW(), 1)`,
            [user.id, ipAddress]
        );

        // Fetch facility assignments
        const [assignments] = await pool.query(
            `SELECT DISTINCT facilityId FROM employeeDistrictFacilityLounge WHERE masterId = ? AND status = 1`,
            [user.id]
        );
        let assignedFacilities = null;
        if (assignments && assignments.length > 0) {
            assignedFacilities = assignments.map(a => a.facilityId).filter(id => id);
        }

        const payload = { 
            id: user.id, 
            email: user.email, 
            employeeCode: user.employeeCode,
            name: user.name,
            assignedFacilities // Added assigned facilities to JWT
        };

        const expiresIn = rememberMe ? '30d' : '8h';
        const token = jwt.sign(payload, process.env.JWT_SECRET || 'secret', { expiresIn });

        res.json({
            message: 'Login successful',
            token,
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                employeeCode: user.employeeCode,
                profileImage: user.profileImage,
                assignedFacilities
            }
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};

exports.logout = async (req, res) => {
    try {
        if (!req.user || !req.user.id) {
            return res.status(400).json({ error: 'User not authenticated' });
        }

        const ipAddress = getIpAddress(req);
        
        // Insert Logout History
        await pool.query(
            `INSERT INTO employeeLoginMaster 
            (employeeId, userType, ipAddress, type, loginTime, logoutTime, status) 
            VALUES (?, 5, ?, 2, NOW(), NOW(), 1)`,
            [req.user.id, ipAddress]
        );

        res.json({ message: 'Logout successful' });
    } catch (error) {
        console.error('Logout error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};
