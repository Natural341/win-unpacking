const { safeStorage } = require('electron');
const fs = require('fs');
const path = require('path');
const { app } = require('electron');

/**
 * Güvenli veri saklama modülü
 * Şifreleme ile hassas bilgileri saklar (POS ayarları, API anahtarları vb.)
 */

const STORAGE_FILE = path.join(app.getPath('userData'), 'secure-storage.enc');

/**
 * Veriyi şifreleyerek kaydet
 */
function setSecureData(key, value) {
  try {
    // Mevcut verileri oku
    const data = getAllData();

    // Yeni veriyi ekle
    data[key] = value;

    // Şifrele
    const encrypted = safeStorage.encryptString(JSON.stringify(data));

    // Dosyaya yaz
    fs.writeFileSync(STORAGE_FILE, encrypted);

    return { success: true };
  } catch (error) {
    console.error('Error saving secure data:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Şifreli veriyi oku
 */
function getSecureData(key) {
  try {
    const data = getAllData();
    return data[key] || null;
  } catch (error) {
    console.error('Error reading secure data:', error);
    return null;
  }
}

/**
 * Tüm verileri oku
 */
function getAllData() {
  try {
    if (!fs.existsSync(STORAGE_FILE)) {
      return {};
    }

    const encrypted = fs.readFileSync(STORAGE_FILE);
    const decrypted = safeStorage.decryptString(encrypted);
    return JSON.parse(decrypted);
  } catch (error) {
    console.error('Error reading all data:', error);
    return {};
  }
}

/**
 * Veriyi sil
 */
function deleteSecureData(key) {
  try {
    const data = getAllData();
    delete data[key];

    const encrypted = safeStorage.encryptString(JSON.stringify(data));
    fs.writeFileSync(STORAGE_FILE, encrypted);

    return { success: true };
  } catch (error) {
    console.error('Error deleting secure data:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Tüm verileri temizle
 */
function clearAll() {
  try {
    if (fs.existsSync(STORAGE_FILE)) {
      fs.unlinkSync(STORAGE_FILE);
    }
    return { success: true };
  } catch (error) {
    console.error('Error clearing data:', error);
    return { success: false, error: error.message };
  }
}

/**
 * POS ayarlarını kaydet (örnek)
 */
function savePOSConfig(config) {
  const safeConfig = {
    portPath: config.portPath || '',
    baudRate: parseInt(config.baudRate) || 9600,
    // Hassas bilgiler şifrelenerek saklanır
    merchantId: config.merchantId || '',
    terminalId: config.terminalId || ''
  };

  return setSecureData('pos_config', safeConfig);
}

/**
 * POS ayarlarını oku
 */
function getPOSConfig() {
  return getSecureData('pos_config');
}

/**
 * Yazıcı ayarlarını kaydet
 */
function savePrinterConfig(config) {
  const safeConfig = {
    printerType: config.printerType || 'EPSON',
    interface: config.interface || 'printer:Auto',
    width: parseInt(config.width) || 48
  };

  return setSecureData('printer_config', safeConfig);
}

/**
 * Yazıcı ayarlarını oku
 */
function getPrinterConfig() {
  return getSecureData('printer_config');
}

module.exports = {
  setSecureData,
  getSecureData,
  deleteSecureData,
  clearAll,
  savePOSConfig,
  getPOSConfig,
  savePrinterConfig,
  getPrinterConfig
};
