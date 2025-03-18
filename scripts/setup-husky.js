const fs = require('fs');
const path = require('path');

const huskyDir = path.join(__dirname, '..', '.husky');
const preCommitFile = path.join(huskyDir, 'pre-commit');

// Create .husky directory if it doesn't exist
if (!fs.existsSync(huskyDir)) {
  fs.mkdirSync(huskyDir, { recursive: true });
}

// Create pre-commit hook with correct line endings for the platform
const preCommitContent = `#!/usr/bin/env sh
. "$(dirname -- "$0")/_/husky.sh"

# Run lint-staged for code quality checks
npx lint-staged

# Run tests only for affected files
npx ts-node scripts/run-relevant-tests.ts
`;

// Write the file with platform-specific line endings
fs.writeFileSync(preCommitFile, preCommitContent.replace(/\n/g, require('os').EOL));

// Make the pre-commit hook executable (Unix only)
if (process.platform !== 'win32') {
  fs.chmodSync(preCommitFile, '755');
}

console.log('✅ Husky pre-commit hook has been configured successfully');
