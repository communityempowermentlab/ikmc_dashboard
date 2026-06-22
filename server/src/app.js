const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());

const authRoutes      = require('./routes/authRoutes');
const locationRoutes  = require('./routes/locationRoutes');
const admissionRoutes = require('./routes/admissionRoutes');
const nurseRoutes     = require('./routes/nurseRoutes');
const districtRoutes  = require('./routes/districtRoutes');

// Import Middlewares
const authMiddleware  = require('./middleware/authMiddleware');
const facilityScopeMiddleware = require('./middleware/facilityScopeMiddleware');

// Mount API routes
app.use('/api/v1/auth',       authRoutes);

app.use('/api/v1/dashboard', authMiddleware, facilityScopeMiddleware, (req, res) => {
    res.json({ message: 'Dashboard API placeholder' });
});

app.use('/api/v1/locations',  authMiddleware, facilityScopeMiddleware, locationRoutes);
app.use('/api/v1/admissions', authMiddleware, facilityScopeMiddleware, admissionRoutes);
app.use('/api/v1/nurses',     authMiddleware, facilityScopeMiddleware, nurseRoutes);
app.use('/api/v1/district',   authMiddleware, facilityScopeMiddleware, districtRoutes);

module.exports = app;
