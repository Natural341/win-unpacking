const { SerialPort } = require('serialport');
const { ReadlineParser } = require('@serialport/parser-readline');

let posPort = null;
let currentTransaction = null;

/**
 * POS terminal bağlantısı kur
 * @param {string} portPath - COM port yolu (örn: 'COM3' veya '/dev/ttyUSB0')
 */
async function connectPOS(portPath) {
  try {
    posPort = new SerialPort({
      path: portPath,
      baudRate: 9600,
      dataBits: 8,
      parity: 'none',
      stopBits: 1
    });

    const parser = posPort.pipe(new ReadlineParser({ delimiter: '\r\n' }));

    // POS'tan gelen yanıtları dinle
    parser.on('data', (data) => {
      console.log('POS Response:', data);
      handlePOSResponse(data);
    });

    posPort.on('error', (err) => {
      console.error('POS Port Error:', err);
    });

    return { success: true, message: 'POS bağlantısı kuruldu' };
  } catch (error) {
    console.error('POS Connection Error:', error);
    throw error;
  }
}

/**
 * POS'tan gelen yanıtı işle
 */
function handlePOSResponse(response) {
  if (!currentTransaction) return;

  try {
    // POS cihazının yanıt formatına göre parse et
    // Bu format POS cihazına göre değişir
    const parts = response.split('|');
    const status = parts[0];
    const message = parts[1];
    const transactionId = parts[2];

    if (status === 'SUCCESS' || status === 'APPROVED') {
      currentTransaction.resolve({
        success: true,
        message: message || 'İşlem başarılı',
        transactionId: transactionId,
        timestamp: new Date().toISOString()
      });
    } else {
      currentTransaction.reject({
        success: false,
        message: message || 'İşlem reddedildi',
        error: status
      });
    }

    currentTransaction = null;
  } catch (error) {
    console.error('Error parsing POS response:', error);
    if (currentTransaction) {
      currentTransaction.reject({
        success: false,
        message: 'Yanıt işlenirken hata',
        error: error.message
      });
      currentTransaction = null;
    }
  }
}

/**
 * POS işlemi başlat
 * @param {Object} transactionData
 * @param {number} transactionData.amount - Tutar (kuruş olarak)
 * @param {string} transactionData.type - İşlem tipi: 'sale', 'refund'
 * @param {number} transactionData.installment - Taksit sayısı (opsiyonel)
 */
async function processPOSTransaction(transactionData) {
  return new Promise((resolve, reject) => {
    if (!posPort || !posPort.isOpen) {
      reject({
        success: false,
        message: 'POS cihazı bağlı değil',
        error: 'NOT_CONNECTED'
      });
      return;
    }

    // İşlem verisi hazırla
    const { amount, type = 'sale', installment = 1 } = transactionData;

    // POS komut formatı (cihaza göre değişir)
    // Örnek format: SALE|AMOUNT|INSTALLMENT\r\n
    const command = `${type.toUpperCase()}|${amount}|${installment}\r\n`;

    // Transaction promise'i sakla
    currentTransaction = { resolve, reject };

    // Timeout ekle (30 saniye)
    const timeout = setTimeout(() => {
      if (currentTransaction) {
        currentTransaction.reject({
          success: false,
          message: 'İşlem zaman aşımına uğradı',
          error: 'TIMEOUT'
        });
        currentTransaction = null;
      }
    }, 30000);

    // Komutu POS'a gönder
    posPort.write(command, (err) => {
      if (err) {
        clearTimeout(timeout);
        reject({
          success: false,
          message: 'Komut gönderilemedi',
          error: err.message
        });
        currentTransaction = null;
      } else {
        console.log('POS Command sent:', command);
      }
    });
  });
}

/**
 * POS bağlantısını kapat
 */
async function disconnectPOS() {
  if (posPort && posPort.isOpen) {
    await posPort.close();
    posPort = null;
  }
  return { success: true, message: 'POS bağlantısı kapatıldı' };
}

/**
 * Test işlemi - POS cihazı sağlık kontrolü
 */
async function testPOS() {
  if (!posPort || !posPort.isOpen) {
    throw new Error('POS cihazı bağlı değil');
  }

  return new Promise((resolve, reject) => {
    const command = 'TEST\r\n';

    const timeout = setTimeout(() => {
      reject({ success: false, message: 'Test zaman aşımına uğradı' });
    }, 5000);

    posPort.write(command, (err) => {
      clearTimeout(timeout);
      if (err) {
        reject({ success: false, message: err.message });
      } else {
        resolve({ success: true, message: 'POS cihazı yanıt veriyor' });
      }
    });
  });
}

module.exports = {
  connectPOS,
  processPOSTransaction,
  disconnectPOS,
  testPOS
};
