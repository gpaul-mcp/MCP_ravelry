import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

// Paths
const rootDir = path.resolve(__dirname, '..');
const srcDir = path.resolve(rootDir, 'src');
const indexPath = path.resolve(srcDir, 'index.ts');
const prodEnvPath = path.resolve(rootDir, '.env.production');

interface UserInfo {
  User: string;
  pass: string;
}

// Function to extract auth info from .env.production
function getUserInfo(): UserInfo {
  try {
    // Check if .env.production exists
    if (!fs.existsSync(prodEnvPath)) {
      console.error('❌ .env.production file not found!');
      process.exit(1);
    }

    // Parse the .env.production file
    const envConfig = dotenv.config({ path: prodEnvPath });

    if (envConfig.error) {
      console.error('❌ Error parsing .env.production:', envConfig.error);
      process.exit(1);
    }

    const auth = { User: envConfig.parsed?.AUTH_USER, pass: envConfig.parsed?.AUTH_PASS };
    if (!auth.User || !auth.pass) {
      console.error('❌ AUTH_USER or AUTH_PASS not found in .env.production');
      process.exit(1);
    }

    return auth as UserInfo;
  } catch (error) {
    console.error('❌ Error reading auth info:', error);
    process.exit(1);
  }
}

// Function to modify index.ts
function modifyIndexFile(info: UserInfo): void {
  try {
    // Read the index.ts file
    let content = fs.readFileSync(indexPath, 'utf8');

    // Replace the commented AUTH_USER and AUTH_PASS lines
    const commentedAuthPattern =
      /\/\/ process\.env\.AUTH_USER = "XXXXXXXX";\s*\/\/ process\.env\.AUTH_PASS = "XXXXXXXX";/;

    // New content with actual values from .env.production
    const uncommentedReplacement = `// Fallback values for testing only - production should use environment variables
if (!process.env.AUTH_USER) {
  process.env.AUTH_USER = "${info.User}";
}
if (!process.env.AUTH_PASS) {
  process.env.AUTH_PASS = "${info.pass}";
}`;

    // Check if the pattern exists
    if (commentedAuthPattern.test(content)) {
      content = content.replace(commentedAuthPattern, uncommentedReplacement);
    } else {
      console.log(
        'ℹ️ Could not find exact pattern. Trying to locate AUTH_USER and AUTH_PASS comments...',
      );

      // Alternative approach - look for lines with AUTH_USER and AUTH_PASS
      const lines = content.split('\n');
      let authUserIndex = -1;

      for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes('// process.env.AUTH_USER')) {
          authUserIndex = i;
          break;
        }
      }

      if (authUserIndex !== -1) {
        // Found the AUTH_USER line, let's assume AUTH_PASS is on the next line
        lines.splice(authUserIndex, 2, ...uncommentedReplacement.split('\n'));
        content = lines.join('\n');
      } else {
        // Insert the fallback right before the mcpServer initialization
        const mcpServerIndex = content.indexOf('export const mcpServer');
        if (mcpServerIndex !== -1) {
          const beforeMcpServer = content.substring(0, mcpServerIndex);
          const afterMcpServer = content.substring(mcpServerIndex);
          content = beforeMcpServer + uncommentedReplacement + '\n\n' + afterMcpServer;
        } else {
          console.error('❌ Could not find appropriate place to insert auth fallbacks in index.ts');
          process.exit(1);
        }
      }
    }

    // Write the modified content back to index.ts
    fs.writeFileSync(indexPath, content);
    console.log('✅ Successfully updated index.ts with AUTH_USER and AUTH_PASS fallbacks');
  } catch (error) {
    console.error('❌ Error modifying index.ts:', error);
    process.exit(1);
  }
}

// Main function
function main(): void {
  console.log('🔧 Preparing build with auth info from .env.production...');

  // Get the auth info from .env.production
  const userInfo = getUserInfo();

  // Modify the index.ts file
  modifyIndexFile(userInfo);

  console.log('✅ Build preparation completed successfully');
}

// Run the script
main();
