require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const axios = require('axios');

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());

// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100 // limit each IP to 100 requests per windowMs
});
app.use(limiter);

// CapRover API configuration
const caproverConfig = {
    baseURL: process.env.CAPROVER_URL,
    headers: {
        'Content-Type': 'application/json',
        'x-namespace': 'captain',
        'x-captain-auth': process.env.CAPROVER_PASSWORD
    }
};

// Helper function to make CapRover API calls
const makeCaproverRequest = async (endpoint, method = 'get', data = null) => {
    try {
        console.log(`Making ${method.toUpperCase()} request to: ${caproverConfig.baseURL}${endpoint}`);
        if (data) console.log('Request data:', JSON.stringify(data, null, 2));

        const response = await axios({
            method,
            url: `${caproverConfig.baseURL}${endpoint}`,
            headers: caproverConfig.headers,
            data
        });
        return response.data;
    } catch (error) {
        if (error.response) {
            // The request was made and the server responded with a status code
            // that falls out of the range of 2xx
            console.error('Error Response:', {
                status: error.response.status,
                statusText: error.response.statusText,
                data: error.response.data,
                headers: error.response.headers
            });
        } else if (error.request) {
            // The request was made but no response was received
            console.error('Error Request:', error.request);
        } else {
            // Something happened in setting up the request that triggered an Error
            console.error('Error Message:', error.message);
        }
        throw new Error(error.response?.data?.message || error.message);
    }
};

// Health check endpoint
app.get('/api/health', async (req, res) => {
    try {
        // First try the dashboard API
        const dashboardInfo = await makeCaproverRequest('/api/v1/login', 'post', {
            password: process.env.CAPROVER_PASSWORD
        });
        console.log('Dashboard Info:', dashboardInfo);
        
        // Then try the apps endpoint
        const apps = await makeCaproverRequest('/api/v1/user/apps');
        res.json({ dashboardInfo, apps });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Routes

// Create a new app
app.post('/api/apps', async (req, res) => {
    try {
        const { appName, hasPersistentData } = req.body;
        const response = await makeCaproverRequest('/api/v1/user/apps/appDefinitions/register', 'post', {
            appName,
            hasPersistentData
        });
        res.json(response);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// List all apps
app.get('/api/apps', async (req, res) => {
    try {
        const response = await makeCaproverRequest('/api/v1/user/apps/appDefinitions/get');
        res.json(response);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get app details
app.get('/api/apps/:appName', async (req, res) => {
    try {
        const { appName } = req.params;
        const response = await makeCaproverRequest(`/api/v1/user/apps/appDefinitions/get/${appName}`);
        res.json(response);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Update app configuration
app.put('/api/apps/:appName', async (req, res) => {
    try {
        const { appName } = req.params;
        const response = await makeCaproverRequest(
            `/api/v1/user/apps/appDefinitions/update/${appName}`,
            'post',
            req.body
        );
        res.json(response);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Delete an app
app.delete('/api/apps/:appName', async (req, res) => {
    try {
        const { appName } = req.params;
        const response = await makeCaproverRequest(
            `/api/v1/user/apps/appDefinitions/delete/${appName}`,
            'post'
        );
        res.json(response);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Delete an app with volumes
app.delete('/api/apps/:appName/volumes', async (req, res) => {
    try {
        const { appName } = req.params;
        const response = await makeCaproverRequest(
            `/api/v1/user/apps/appDefinitions/delete/${appName}?deleteVolumes=true`,
            'post'
        );
        res.json(response);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Stop an app
app.post('/api/apps/:appName/stop', async (req, res) => {
    try {
        const { appName } = req.params;
        const response = await makeCaproverRequest(
            `/api/v1/user/apps/appDefinitions/stop/${appName}`,
            'post'
        );
        res.json(response);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Scale an app
app.post('/api/apps/:appName/scale', async (req, res) => {
    try {
        const { appName } = req.params;
        const { instanceCount } = req.body;
        const response = await makeCaproverRequest(
            `/api/v1/user/apps/appDefinitions/scale/${appName}`,
            'post',
            { instanceCount }
        );
        res.json(response);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Add custom domain
app.post('/api/apps/:appName/domains', async (req, res) => {
    try {
        const { appName } = req.params;
        const { domain } = req.body;
        const response = await makeCaproverRequest(
            `/api/v1/user/apps/appDefinitions/customdomain/${appName}`,
            'post',
            { domain }
        );
        res.json(response);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Enable SSL for domain
app.post('/api/apps/:appName/ssl', async (req, res) => {
    try {
        const { appName } = req.params;
        const { domain } = req.body;
        const response = await makeCaproverRequest(
            `/api/v1/user/apps/appDefinitions/enablessl/${appName}`,
            'post',
            { domain }
        );
        res.json(response);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Deploy one-click app
app.post('/api/one-click-apps', async (req, res) => {
    try {
        const { appName, templateName, variables } = req.body;
        const response = await makeCaproverRequest(
            '/api/v1/user/apps/oneclick/secure',
            'post',
            {
                appName,
                templateName,
                variables
            }
        );
        res.json(response);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Start the server
app.listen(port, () => {
    console.log(`Server running on port ${port}`);
}); 