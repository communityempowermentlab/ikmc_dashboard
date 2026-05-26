const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());

const locationRoutes  = require('./routes/locationRoutes');
const admissionRoutes = require('./routes/admissionRoutes');
const nurseRoutes     = require('./routes/nurseRoutes');
const districtRoutes  = require('./routes/districtRoutes');

app.use('/api/v1/dashboard', (req, res) => {
    res.json({ message: "Dashboard API is running!" });
});

app.use('/api/v1/locations',  locationRoutes);
app.use('/api/v1/admissions', admissionRoutes);
app.use('/api/v1/nurses',     nurseRoutes);
app.use('/api/v1/district',   districtRoutes);

module.exports = app;
