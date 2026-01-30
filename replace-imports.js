const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

// This is the official MedusaJS replace-imports codemod
// Based on: https://docs.medusajs.com/learn/codemods/replace-imports

const importReplacements = {
  '@mikro-orm/core': '@medusajs/framework/mikro-orm/core',
  '@mikro-orm/postgresql': '@medusajs/framework/mikro-orm/postgresql',
  awilix: '@medusajs/framework/awilix',
  pg: '@medusajs/framework/pg',
  '@opentelemetry/instrumentation-pg':
    '@medusajs/framework/opentelemetry/instrumentation-pg',
  '@opentelemetry/resources': '@medusajs/framework/opentelemetry/resources',
  '@opentelemetry/sdk-node': '@medusajs/framework/opentelemetry/sdk-node',
  '@opentelemetry/sdk-trace-node':
    '@medusajs/framework/opentelemetry/sdk-trace-node',
};

function replaceImports(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  let modified = false;

  Object.entries(importReplacements).forEach(([oldImport, newImport]) => {
    const importRegex = new RegExp(
      `(['"])(${oldImport.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})(\\1)`,
      'g'
    );
    if (content.match(importRegex)) {
      content = content.replace(importRegex, `$1${newImport}$3`);
      modified = true;
    }
  });

  if (modified) {
    fs.writeFileSync(filePath, content);
    console.log(`Updated imports in: ${filePath}`);
  }
}

function processDirectory(dir) {
  const files = fs.readdirSync(dir);
  files.forEach(file => {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);

    if (
      stat.isDirectory() &&
      !file.startsWith('.') &&
      file !== 'node_modules'
    ) {
      processDirectory(fullPath);
    } else if (file.endsWith('.ts') || file.endsWith('.js')) {
      replaceImports(fullPath);
    }
  });
}

console.log('Running MedusaJS import replacements...');
processDirectory('./src');
processDirectory('./tests');
console.log('Import replacement complete!');
