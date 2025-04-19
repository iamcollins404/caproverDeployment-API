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
let sessionToken = null;

const getAuthHeaders = () => {
    if (!sessionToken) {
        throw new Error('No session token available. Please authenticate first.');
    }
    const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${sessionToken}`
    };
    console.log('Using headers:', headers);
    return headers;
};

// Helper function to make CapRover API calls
const makeCaproverRequest = async (endpoint, method = 'get', data = null) => {
    try {
        // If we don't have a session token and this isn't a login request, authenticate first
        if (!sessionToken && endpoint !== '/api/v2/login') {
            console.log('No session token, authenticating...');
            await authenticate();
        }

        const url = `${process.env.CAPROVER_URL}${endpoint}`;
        console.log(`Making ${method.toUpperCase()} request to: ${url}`);
        const headers = getAuthHeaders();
        console.log('Using headers:', headers);
        if (data) console.log('Request data:', JSON.stringify(data, null, 2));

        const response = await axios({
            method,
            url,
            headers,
            data,
            validateStatus: function (status) {
                return status >= 200 && status < 500; // Accept all status codes less than 500
            }
        });
        
        console.log('Response received:', {
            status: response.status,
            statusText: response.statusText,
            data: response.data
        });

        if (response.status >= 400) {
            throw new Error(`Request failed with status ${response.status}: ${JSON.stringify(response.data)}`);
        }
        
        return response.data;
    } catch (error) {
        if (error.response?.status === 401) {
            console.log('Received 401, attempting to re-authenticate...');
            // If we get a 401, try to re-authenticate
            await authenticate();
            // Retry the request
            return makeCaproverRequest(endpoint, method, data);
        }
        
        console.error('API Request Failed:', {
            endpoint,
            method,
            error: {
                message: error.message,
                status: error.response?.status,
                statusText: error.response?.statusText,
                data: error.response?.data,
                headers: error.response?.headers,
                stack: error.stack
            }
        });
        throw error;
    }
};

// Check server version and capabilities
const checkServerCapabilities = async () => {
    try {
        console.log('Checking server capabilities...');
        const response = await makeCaproverRequest('/api/v2/system/info');
        console.log('Server info:', response);
        return response;
    } catch (error) {
        console.error('Failed to get server info:', error);
        throw error;
    }
};

// Authentication function
const authenticate = async () => {
    try {
        console.log('Authenticating with CapRover...');
        const response = await axios({
            method: 'post',
            url: `${process.env.CAPROVER_URL}/api/v2/login`,
            headers: {
                'Content-Type': 'application/json'
            },
            data: {
                password: process.env.CAPROVER_PASSWORD
            }
        });
        
        console.log('Authentication response:', response.data);
        
        if (response.data && response.data.data && response.data.data.token) {
            sessionToken = response.data.data.token;
            console.log('Authentication successful, token received:', sessionToken);
        } else {
            console.error('Unexpected authentication response:', response.data);
            throw new Error('No valid token received from authentication');
        }
    } catch (error) {
        console.error('Authentication failed:', {
            message: error.message,
            response: error.response?.data,
            status: error.response?.status,
            url: `${process.env.CAPROVER_URL}/api/v2/login`
        });
        throw error;
    }
};

// Test endpoint to diagnose connection
app.get('/api/test', async (req, res) => {
    try {
        console.log('Testing connection to CapRover...');
        // First try a simple login
        const loginResponse = await axios({
            method: 'post',
            url: `${process.env.CAPROVER_URL}/api/v2/login`,
            headers: {
                'Content-Type': 'application/json'
            },
            data: {
                password: process.env.CAPROVER_PASSWORD
            }
        });
        console.log('Login response:', loginResponse.data);
        
        res.json({ 
            status: 'success',
            loginResponse: loginResponse.data,
            url: process.env.CAPROVER_URL
        });
    } catch (error) {
        console.error('Test failed:', {
            message: error.message,
            response: error.response?.data,
            status: error.response?.status,
            url: process.env.CAPROVER_URL
        });
        res.status(500).json({ 
            error: error.message,
            url: process.env.CAPROVER_URL,
            response: error.response?.data
        });
    }
});

// Health check endpoint
app.get('/api/health', async (req, res) => {
    try {
        console.log('Starting health check...');
        
        // First authenticate
        console.log('Authenticating...');
        await authenticate();
        
        // Try to get apps list directly
        console.log('Fetching apps list...');
        const apps = await makeCaproverRequest('/api/v2/user/apps');
        
        res.json({ 
            status: 'healthy',
            authenticated: true,
            apps: apps || []
        });
    } catch (error) {
        console.error('Health check failed:', {
            message: error.message,
            response: error.response?.data,
            stack: error.stack
        });
        
        // If we get a 500 error, try to get more information about the server
        if (error.response?.status === 500) {
            try {
                console.log('Attempting to get server version...');
                const versionResponse = await makeCaproverRequest('/api/v2/version');
                console.log('Server version:', versionResponse);
            } catch (versionError) {
                console.error('Failed to get server version:', versionError);
            }
        }
        
        res.status(500).json({ 
            status: 'unhealthy',
            error: error.message,
            details: error.response?.data || 'No additional details available',
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
});

// Routes

// Create a new app
app.post('/api/apps', async (req, res) => {
    try {
        const { appName, hasPersistentData } = req.body;
        const response = await makeCaproverRequest('/api/v2/user/apps', 'post', {
            appName,
            hasPersistentData
        });
        res.json(response);
    } catch (error) {
        console.error('Failed to create app:', error);
        res.status(500).json({ 
            error: error.message,
            details: error.response?.data || 'No additional details available'
        });
    }
});

// List all apps
app.get('/api/apps', async (req, res) => {
    try {
        console.log('Fetching apps list...');
        const response = await makeCaproverRequest('/api/v2/user/apps/appDefinitions/list');
        console.log('Apps response:', response);
        res.json(response);
    } catch (error) {
        console.error('Failed to list apps:', {
            message: error.message,
            response: error.response?.data,
            stack: error.stack
        });
        res.status(500).json({ 
            error: error.message,
            details: error.response?.data || 'No additional details available'
        });
    }
});

// Get app details
app.get('/api/apps/:appName', async (req, res) => {
    try {
        const { appName } = req.params;
        const response = await makeCaproverRequest(`/api/v2/user/apps/${appName}`);
        res.json(response);
    } catch (error) {
        console.error(`Failed to get app details for ${appName}:`, error);
        res.status(500).json({ 
            error: error.message,
            details: error.response?.data || 'No additional details available'
        });
    }
});

// Update app configuration
app.put('/api/apps/:appName', async (req, res) => {
    try {
        const { appName } = req.params;
        const response = await makeCaproverRequest(
            `/api/v2/user/apps/${appName}`,
            'put',
            req.body
        );
        res.json(response);
    } catch (error) {
        console.error(`Failed to update app ${appName}:`, error);
        res.status(500).json({ 
            error: error.message,
            details: error.response?.data || 'No additional details available'
        });
    }
});

// Delete an app
app.delete('/api/apps/:appName', async (req, res) => {
    try {
        const { appName } = req.params;
        const response = await makeCaproverRequest(
            `/api/v2/user/apps/${appName}`,
            'delete'
        );
        res.json(response);
    } catch (error) {
        console.error(`Failed to delete app ${appName}:`, error);
        res.status(500).json({ 
            error: error.message,
            details: error.response?.data || 'No additional details available'
        });
    }
});

// Delete an app with volumes
app.delete('/api/apps/:appName/volumes', async (req, res) => {
    try {
        const { appName } = req.params;
        const response = await makeCaproverRequest(
            `/api/v2/user/apps/${appName}?deleteVolumes=true`,
            'delete'
        );
        res.json(response);
    } catch (error) {
        console.error(`Failed to delete app ${appName} with volumes:`, error);
        res.status(500).json({ 
            error: error.message,
            details: error.response?.data || 'No additional details available'
        });
    }
});

// Stop an app
app.post('/api/apps/:appName/stop', async (req, res) => {
    try {
        const { appName } = req.params;
        const response = await makeCaproverRequest(
            `/api/v2/user/apps/${appName}/stop`,
            'post'
        );
        res.json(response);
    } catch (error) {
        console.error(`Failed to stop app ${appName}:`, error);
        res.status(500).json({ 
            error: error.message,
            details: error.response?.data || 'No additional details available'
        });
    }
});

// Scale an app
app.post('/api/apps/:appName/scale', async (req, res) => {
    try {
        const { appName } = req.params;
        const { instanceCount } = req.body;
        const response = await makeCaproverRequest(
            `/api/v2/user/apps/${appName}/scale`,
            'post',
            { instanceCount }
        );
        res.json(response);
    } catch (error) {
        console.error(`Failed to scale app ${appName}:`, error);
        res.status(500).json({ 
            error: error.message,
            details: error.response?.data || 'No additional details available'
        });
    }
});

// Add custom domain
app.post('/api/apps/:appName/domains', async (req, res) => {
    try {
        const { appName } = req.params;
        const { domain } = req.body;
        const response = await makeCaproverRequest(
            `/api/v2/user/apps/${appName}/domains`,
            'post',
            { domain }
        );
        res.json(response);
    } catch (error) {
        console.error(`Failed to add domain to app ${appName}:`, error);
        res.status(500).json({ 
            error: error.message,
            details: error.response?.data || 'No additional details available'
        });
    }
});

// Enable SSL for domain
app.post('/api/apps/:appName/ssl', async (req, res) => {
    try {
        const { appName } = req.params;
        const { domain } = req.body;
        const response = await makeCaproverRequest(
            `/api/v2/user/apps/${appName}/ssl`,
            'post',
            { domain }
        );
        res.json(response);
    } catch (error) {
        console.error(`Failed to enable SSL for app ${appName}:`, error);
        res.status(500).json({ 
            error: error.message,
            details: error.response?.data || 'No additional details available'
        });
    }
});

// Deploy one-click app
app.post('/api/one-click-apps', async (req, res) => {
    try {
        const { appName, templateName, variables } = req.body;
        const response = await makeCaproverRequest(
            '/api/v2/user/apps/one-click',
            'post',
            {
                appName,
                templateName,
                variables
            }
        );
        res.json(response);
    } catch (error) {
        console.error('Failed to deploy one-click app:', error);
        res.status(500).json({ 
            error: error.message,
            details: error.response?.data || 'No additional details available'
        });
    }
});

// Start the server
app.listen(port, () => {
    console.log(`Server running on port ${port}`);
}); 