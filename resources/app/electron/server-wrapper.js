const path = require('path');
const fs = require('fs');

// Set up paths for Next.js standalone mode
// asar kapalı olduğu için direkt app klasörü
const resourcesPath = process.resourcesPath
  ? path.join(process.resourcesPath, 'app')
  : path.join(__dirname, '..');

// Standalone klasörünü bul
function findStandalonePath() {
  const baseStandalone = path.join(resourcesPath, '.next', 'standalone');

  if (!fs.existsSync(baseStandalone)) {
    console.error('❌ Standalone directory not found:', baseStandalone);
    return null;
  }

  // server.js dosyasını recursive olarak ara
  function findServerJs(dir, depth = 0) {
    if (depth > 10) return null; // Max depth

    const serverPath = path.join(dir, 'server.js');
    if (fs.existsSync(serverPath)) {
      return dir;
    }

    try {
      const items = fs.readdirSync(dir);
      for (const item of items) {
        const itemPath = path.join(dir, item);
        if (fs.statSync(itemPath).isDirectory()) {
          const found = findServerJs(itemPath, depth + 1);
          if (found) return found;
        }
      }
    } catch (e) {
      // ignore
    }
    return null;
  }

  return findServerJs(baseStandalone);
}

const standalonePath = findStandalonePath();

if (!standalonePath) {
  console.error('❌ Could not find standalone server.js');
  process.exit(1);
}

console.log('✅ Found standalone path:', standalonePath);

// Static ve public dosyaları zaten build sırasında kopyalanmış olmalı
// Kopyalama işlemini kaldırıyoruz çünkü Program Files'a yazma izni yok

// Change to standalone directory
process.chdir(standalonePath);

// Start the Next.js server
console.log('Starting Next.js server...');
require(path.join(standalonePath, 'server.js'));
