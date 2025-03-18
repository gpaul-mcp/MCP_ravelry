# TypeScript Boilerplate

A modern, production-ready TypeScript boilerplate featuring comprehensive tooling, development workflow automation, and a clean project structure.

## Features

### Core
- 🚀 [TypeScript](https://www.typescriptlang.org/) setup with latest ECMAScript features
- 📁 Clean project structure
- ⚡️ Path aliases for clean imports
- 🔄 Hot reload with [Nodemon](https://nodemon.io/)

### Development Tools
- 🎨 ESLint + Prettier integration
- 🧹 Pre-commit hooks with Husky
- 📝 Consistent code style enforcement
- 🐛 Debugging configuration
- 🌍 Environment configuration (development/production)

## Project Structure

```
src/
  └── index.ts        # Application entry point
dist/                 # Compiled JavaScript files
scripts/              # Build and setup scripts
```

## Getting Started

### Prerequisites
- Node.js (v14 or higher)
- npm or yarn

### Installation

1. Clone the repository
```bash
git clone <repository-url>
cd ts-boilerplate
```

2. Install dependencies
```bash
npm install
```

3. Create your environment files
```bash
# Create both development and production env files
touch .env.development .env.production
```

4. Start development server
```bash
npm run dev
```

### Available Scripts

- `npm run dev` - Start development server with hot reload
- `npm run build` - Build for production
- `npm start` - Start production server
- `npm run lint` - Run ESLint
- `npm run lint:fix` - Fix ESLint errors
- `npm run format` - Format code with Prettier
- `npm run format:check` - Check for format errors with Prettier
- `npm run prepare` - Setup Husky hooks

## Development Guidelines

### Path Aliases
The project uses path aliases for cleaner imports. Configure them in `tsconfig.json`:

```typescript
{
  "compilerOptions": {
    "baseUrl": "./src",
    "paths": {
      "@/*": ["*"]
    }
  }
}
```

Example usage:
```typescript
import { someUtil } from '@/utils/someUtil';
```

### Code Style

The project uses ESLint and Prettier for code formatting. Configuration files:
- `.eslintrc` - ESLint configuration
- `.prettierrc` - Prettier configuration

Pre-commit hooks will automatically:
- Fix ESLint errors
- Format code with Prettier
- Run type checking

### Environment Configuration

Create two environment files in the root directory:
- `.env.development` - Development environment variables
- `.env.production` - Production environment variables

Example environment file:
```env
API_KEY=your_api_key
DATABASE_URL=your_database_url
```

The environment files are loaded based on the NODE_ENV value in `src/index.ts`:
```typescript
const envFile = process.env.NODE_ENV === 'production' 
  ? '.env.production' 
  : '.env.development';
```

## Production Deployment

1. Build the project
```bash
npm run build
```

2. Ensure your `.env.production` file is configured
```env
NODE_ENV=production
```

3. Start the server
```bash
npm start
```
## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Author

Gpaul | Faldin