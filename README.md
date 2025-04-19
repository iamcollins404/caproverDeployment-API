# CapRover Deployment API

A Node.js API to manage CapRover apps. This API provides endpoints to interact with CapRover's functionality programmatically.

## Features

- Create and manage apps
- Add custom domains
- Enable SSL
- Update app configurations
- Deploy one-click apps
- List and fetch apps
- Delete apps (with volume support)
- Stop and scale apps

## Installation

1. Clone the repository
2. Install dependencies:
```bash
npm install
```

3. Create a `.env` file in the root directory with the following variables:
```
CAPROVER_URL=your_caprover_url
CAPROVER_PASSWORD=your_caprover_password
PORT=3000
```

## Usage

Start the server:
```bash
npm start
```

For development with auto-reload:
```bash
npm run dev
```

## API Endpoints

### Apps Management
- `POST /api/apps` - Create a new app
- `GET /api/apps` - List all apps
- `GET /api/apps/:appName` - Get app details
- `PUT /api/apps/:appName` - Update app configuration
- `DELETE /api/apps/:appName` - Delete an app
- `DELETE /api/apps/:appName/volumes` - Delete an app with its volumes
- `POST /api/apps/:appName/stop` - Stop an app
- `POST /api/apps/:appName/scale` - Scale an app

### Domain Management
- `POST /api/apps/:appName/domains` - Add custom domain
- `POST /api/apps/:appName/ssl` - Enable SSL for domain

### One-Click Apps
- `POST /api/one-click-apps` - Deploy a one-click app

## Security

The API includes:
- Rate limiting
- CORS protection
- Helmet security headers
- Environment variable configuration

## License

MIT 