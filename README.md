# Ravelry MCP Server

A Model Context Protocol (MCP) server that provides tools for interacting with the Ravelry API, allowing AI assistants to search for, explore, and retrieve knitting and crochet patterns.

[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)](https://nodejs.org/)

## 🌟 Overview

This MCP server wraps the Ravelry API to create a reliable interface that can be used by AI assistants. It provides tools to:
- Search for knitting and crochet patterns
- Get detailed pattern information
- Retrieve multiple pattern details at once

This project was inspired by my girlfriend, whose passion for knitting and crochet encouraged me to create this bridge between AI assistants and the Ravelry crafting community. Since she's not very tech-savvy and somewhat skeptical about AI, this serves as my way of connecting with her interests and showing how technology can enhance her crafting experience rather than replace it.

## 🚀 Features

- **🔍 Pattern Search**: Search Ravelry's database of patterns using keywords and filters
- **📋 Pattern Details**: Get comprehensive information about specific patterns
- **🧶 Craft Filtering**: Filter patterns by craft type (knitting or crochet)
- **💰 Price Options**: Filter patterns by availability (free, paid, etc.)
- **🤖 AI Assistant Integration**: Designed to work with AI assistants through the Model Context Protocol

## 📋 Prerequisites

- Node.js (v14 or higher)
- npm or yarn
- Ravelry API credentials (username and password)

## 🔧 Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd ravelry-mcp
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   ```bash
   # Create development environment file
   cp .env.example .env.development
   # Create production environment file
   cp .env.example .env.production
   ```

4. **Configure API credentials**
   - Get your Ravelry username and password
   - Add your credentials to both `.env.development` and `.env.production` files:
     ```
     AUTH_USER=your_ravelry_username
     AUTH_PASS=your_ravelry_password
     ```

## 🎮 Usage

### Development Mode

```bash
npm run dev
```

This starts the MCP server in development mode with hot reload.

### Production Mode

```bash
npm run build
npm start
```

Or use the shorthand:

```bash
npm run prod
```

## 🔗 Integrating with Claude Desktop

To add this MCP server to Claude Desktop and enable Ravelry browsing capabilities:

1. **Start the MCP server**
   Make sure your server is running locally or on a remote host that Claude Desktop can access.

2. **Open Claude Desktop settings**
   - Launch Claude Desktop
   - Click on your profile picture or icon in the top right
   - Select "Settings" from the dropdown menu

3. **Navigate to Extensions settings**
   - In the Settings sidebar, click on "Extensions"
   - Select "Add Custom MCP"

4.1 **Configure the MCP connection**
   - Name: `Ravelry MCP` (or any name you prefer)
   - URL: Enter the URL where your MCP server is running (e.g., `http://localhost:3000` for local development)
   - Click "Add MCP"

4.2 **Alternative: Configure the MCP connection via command**
   - You first need to build the project and provide your full path to the compiled server
   - Add the following to your Claude Desktop configuration:

   ```json
   "ravelry": {
     "command": "node",
     "args": [
       "YOUR_CUSTOM_PATH/dist/index.js"
     ]
   }
   ```

5. **Enable the MCP**
   - Toggle the switch next to your newly added Ravelry MCP to enable it
   - Claude Desktop will attempt to connect to your MCP server

6. **Verify connection**
   - Start a new conversation with Claude
   - Type "Can you help me find some knitting patterns on Ravelry?"
   - Claude should now be able to use the Ravelry tools to search and browse patterns

7. **Troubleshooting**
   - If Claude cannot connect to your MCP server, check that:
     - The server is running and accessible from Claude Desktop
     - The correct URL is configured in Claude Desktop settings
     - Your API credentials are valid and properly configured in the server

### Usage Examples with Claude

Once connected, you can ask Claude to:

- "Find me some free crochet hat patterns on Ravelry"
- "Search for knitting patterns for socks"
- "Get more details about pattern ID 12345"
- "Find patterns that are suitable for beginners"

## 🧠 Available Tools

The server exposes several tools that can be used by AI assistants:

### `search-patterns`
Searches for patterns based on query parameters.

**Parameters:**
- `query`: Search term (required)
- `page`: Page number for pagination (default: 1)
- `craft`: Craft type (e.g., "knitting", "crochet")
- `availability`: Price filter (default: "free", options: "free", "ravelry", "online")

### `get-pattern-details`
Retrieves detailed information for a specific pattern.

**Parameters:**
- `id`: Pattern ID (required)

### `get-multiple-pattern-details`
Retrieves details for multiple patterns at once.

**Parameters:**
- `ids`: Array of pattern IDs (required)

## 🔍 How It Works

The server uses axios to make authenticated requests to the Ravelry API:

1. Authenticates requests using Basic Auth with your Ravelry credentials
2. Makes requests to various Ravelry API endpoints
3. Parses and returns the data in a structured format
4. Exposes endpoints as MCP tools that can be called by AI assistants

## 🛠️ Project Structure

```
src/
  ├── class/
  │   └── ravelry.class.ts       # Main client for Ravelry API
  ├── endpoints/
  │   ├── getMultiplePatternDetails.ts  # Get details for multiple patterns
  │   ├── getPatternDetails.ts         # Get details for a single pattern
  │   ├── searchPatterns.ts           # Search for patterns
  │   └── index.ts                    # Endpoint exports
  ├── types/
  │   ├── patternDetailed.d.ts       # Type definitions for detailed patterns
  │   └── patternSimple.d.ts         # Type definitions for simple patterns
  └── index.ts                      # Entry point and MCP server setup
```

## ⚙️ Development

### Environment Configuration

The server uses different environment files for development and production:
- `.env.development` - Used when running in development mode
- `.env.production` - Used when running in production mode

### Testing

Run the test suite with:

```bash
npm test
```

### Linting and Formatting

```bash
# Run ESLint
npm run lint

# Fix ESLint errors
npm run lint:fix

# Format code with Prettier
npm run format
```

## 📝 Notes for Deployment

When deploying to production:

1. Ensure your `.env.production` file contains valid Ravelry credentials
2. The build process will embed these credentials in the compiled code
3. Use `npm run prod` to build and start the production server

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
