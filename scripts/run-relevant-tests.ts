import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

// Get modified files in the current commit
const getModifiedFiles = (): string[] => {
  try {
    const gitOutput = execSync('git diff --cached --name-only --diff-filter=ACMR').toString();
    return gitOutput.split('\n').filter(Boolean);
  } catch (error) {
    console.error('Error getting modified files:', error);
    return [];
  }
};

// Check if any source files have been modified
const hasSourceChanges = (files: string[]): boolean => {
  return files.some(
    file =>
      file.startsWith('src/') &&
      file.endsWith('.ts') &&
      !file.endsWith('.d.ts') &&
      !file.endsWith('.test.ts') &&
      !file.endsWith('.spec.ts'),
  );
};

// Check if any test files have been modified
const hasTestChanges = (files: string[]): boolean => {
  return files.some(
    file => file.endsWith('.test.ts') || file.endsWith('.spec.ts') || file.includes('/__tests__/'),
  );
};

// Find corresponding test files for changed source files
const findAffectedTests = (files: string[]): string[] => {
  const affectedTests: string[] = [];

  for (const file of files) {
    // Normalize path separators to forward slashes for consistency
    const normalizedFile = file.replace(/\\/g, '/');

    if (
      normalizedFile.startsWith('src/') &&
      normalizedFile.endsWith('.ts') &&
      !normalizedFile.endsWith('.test.ts') &&
      !normalizedFile.endsWith('.spec.ts')
    ) {
      const baseName = path.basename(normalizedFile, '.ts');
      const dirName = path.dirname(normalizedFile);

      // Check for component.test.ts pattern
      const potentialTest1 = path.join(dirName, `${baseName}.test.ts`).replace(/\\/g, '/');
      if (fs.existsSync(potentialTest1)) {
        console.log(`Found test file: ${potentialTest1}`);
        affectedTests.push(potentialTest1);
      }

      // Check for component.spec.ts pattern
      const potentialTest2 = path.join(dirName, `${baseName}.spec.ts`).replace(/\\/g, '/');
      if (fs.existsSync(potentialTest2)) {
        console.log(`Found test file: ${potentialTest2}`);
        affectedTests.push(potentialTest2);
      }

      // Check for __tests__ directory
      const potentialTestDir = path.join(dirName, '__tests__').replace(/\\/g, '/');
      if (fs.existsSync(potentialTestDir)) {
        const testDirFiles = fs.readdirSync(potentialTestDir);
        const matchingTests = testDirFiles.filter(
          testFile =>
            testFile.includes(baseName) &&
            (testFile.endsWith('.test.ts') || testFile.endsWith('.spec.ts')),
        );
        matchingTests.forEach(test => {
          const testPath = path.join(potentialTestDir, test).replace(/\\/g, '/');
          console.log(`Found test file: ${testPath}`);
          affectedTests.push(testPath);
        });
      }
    }
  }

  return affectedTests;
};

// Main function to decide and run tests
const runRelevantTests = (): void => {
  const modifiedFiles = getModifiedFiles();

  if (modifiedFiles.length === 0) {
    console.log('No modified files detected, skipping tests');
    process.exit(0);
  }

  // If any test files have been changed, run those specific tests
  if (hasTestChanges(modifiedFiles)) {
    const testFiles = modifiedFiles.filter(
      file =>
        file.endsWith('.test.ts') || file.endsWith('.spec.ts') || file.includes('/__tests__/'),
    );

    console.log('Test files have been modified, running only those tests...');
    try {
      // Run only the modified test files
      execSync(`npx jest ${testFiles.join(' ')} --passWithNoTests`, { stdio: 'inherit' });
    } catch (error) {
      process.exit(1); // Exit with error code if tests fail
    }
    process.exit(0);
  }

  // If source files have been changed, find and run affected tests
  if (hasSourceChanges(modifiedFiles)) {
    console.log(
      'Modified source files:',
      modifiedFiles.filter(
        file =>
          file.startsWith('src/') &&
          file.endsWith('.ts') &&
          !file.endsWith('.test.ts') &&
          !file.endsWith('.spec.ts'),
      ),
    );

    const affectedTests = findAffectedTests(modifiedFiles);

    if (affectedTests.length > 0) {
      console.log(
        'Source files with corresponding tests have been modified, running affected tests...',
      );
      console.log('Running tests:', affectedTests);

      try {
        // Use relative paths for Jest instead of absolute paths
        const relativeTests = affectedTests.map(file => file.replace(/\\/g, '/'));
        console.log(`Running Jest command: npx jest ${relativeTests.join(' ')} --passWithNoTests`);
        execSync(`npx jest ${relativeTests.join(' ')} --passWithNoTests`, { stdio: 'inherit' });
      } catch (error) {
        console.error('Jest execution failed:', error);
        process.exit(1); // Exit with error code if tests fail
      }
    } else {
      console.log('No corresponding tests found for modified source files');
    }
    process.exit(0);
  }

  console.log('No relevant source or test files changed, skipping tests');
  process.exit(0);
};

// Run the script
runRelevantTests();
