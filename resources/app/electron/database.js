const { app } = require('electron');
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

/**
 * Veritabanı yolunu belirle ve klasörü oluştur
 * Production'da: %APPDATA%/BarkodSistemi/database.db
 * Development'da: ./dev.db
 */
function getDatabasePath() {
  const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

  if (isDev) {
    // Development: Proje klasöründe
    return path.join(process.cwd(), 'dev.db');
  } else {
    // Production: AppData klasöründe (güvenli)
    const userDataPath = app.getPath('userData');
    const dbDir = path.join(userDataPath, 'database');

    // Klasör yoksa oluştur
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }

    return path.join(dbDir, 'barkod.db');
  }
}

/**
 * DATABASE_URL environment variable'ını ayarla
 */
function setupDatabaseURL() {
  const dbPath = getDatabasePath();
  process.env.DATABASE_URL = `file:${dbPath}`;

  console.log('📁 Database Path:', dbPath);
  console.log('🔗 DATABASE_URL:', process.env.DATABASE_URL);

  // İlk kurulumda veritabanı yoksa pakettekini kopyala
  if (!fs.existsSync(dbPath)) {
    console.log('🔄 İlk kurulum - veritabanı kopyalanıyor...');
    copyTemplateDatabase(dbPath);
  }

  return dbPath;
}

/**
 * İlk kurulumda paketteki veritabanını kopyala
 */
function copyTemplateDatabase(dbPath) {
  try {
    const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

    if (isDev) {
      return;
    }

    // Paketteki template veritabanını bul
    const templatePaths = [
      path.join(process.resourcesPath, 'app', 'dev.db'),
      path.join(process.resourcesPath, 'app', 'prisma', 'dev.db'),
      path.join(process.resourcesPath, 'app', '.next', 'standalone', 'prisma', 'dev.db')
    ];

    let templatePath = null;
    for (const p of templatePaths) {
      if (fs.existsSync(p)) {
        templatePath = p;
        break;
      }
    }

    // Ayrıca standalone içinde ara
    if (!templatePath) {
      const standaloneBase = path.join(process.resourcesPath, 'app', '.next', 'standalone');
      templatePath = findFileRecursive(standaloneBase, 'dev.db');
    }

    if (templatePath) {
      fs.copyFileSync(templatePath, dbPath);
      console.log('✅ Veritabanı kopyalandı:', templatePath);
    } else {
      console.error('❌ Template veritabanı bulunamadı');
      // Boş dosya oluştur
      fs.writeFileSync(dbPath, '');
    }
  } catch (error) {
    console.error('❌ Veritabanı kopyalama hatası:', error);
  }
}

function findFileRecursive(dir, filename) {
  if (!fs.existsSync(dir)) return null;

  try {
    const items = fs.readdirSync(dir);
    for (const item of items) {
      const itemPath = path.join(dir, item);
      if (item === filename) return itemPath;
      if (fs.statSync(itemPath).isDirectory()) {
        const found = findFileRecursive(itemPath, filename);
        if (found) return found;
      }
    }
  } catch (e) {}
  return null;
}

/**
 * Veritabanı yedeği al
 */
function backupDatabase() {
  const dbPath = getDatabasePath();

  if (!fs.existsSync(dbPath)) {
    console.log('⚠️  Database file not found, skipping backup');
    return null;
  }

  const backupDir = path.join(path.dirname(dbPath), 'backups');

  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = path.join(backupDir, `backup_${timestamp}.db`);

  try {
    fs.copyFileSync(dbPath, backupPath);
    console.log('✅ Database backup created:', backupPath);
    return backupPath;
  } catch (error) {
    console.error('❌ Backup failed:', error);
    return null;
  }
}

/**
 * Eski yedekleri temizle (30 günden eski olanlar)
 */
function cleanOldBackups() {
  const dbPath = getDatabasePath();
  const backupDir = path.join(path.dirname(dbPath), 'backups');

  if (!fs.existsSync(backupDir)) {
    return;
  }

  const files = fs.readdirSync(backupDir);
  const now = Date.now();
  const maxAge = 30 * 24 * 60 * 60 * 1000; // 30 gün

  files.forEach(file => {
    const filePath = path.join(backupDir, file);
    const stats = fs.statSync(filePath);
    const age = now - stats.mtime.getTime();

    if (age > maxAge) {
      fs.unlinkSync(filePath);
      console.log('🗑️  Old backup deleted:', file);
    }
  });
}

module.exports = {
  getDatabasePath,
  setupDatabaseURL,
  backupDatabase,
  cleanOldBackups
};
