const { contextBridge, ipcRenderer } = require('electron');

// Güvenlik: İzin verilen IPC kanalları (whitelist)
const ALLOWED_CHANNELS = [
  'get-printers',
  'print-label',
  'get-serial-ports',
  'pos-transaction',
  'open-pos-simulator',
  'close-pos-simulator',
  'get-simulator-status',
  'pos-transaction-result'
];

// Güvenlik: İzin verilen kanalları kontrol et
function isValidChannel(channel) {
  return ALLOWED_CHANNELS.includes(channel);
}

// Güvenli bir şekilde hardware API'lerini expose et
contextBridge.exposeInMainWorld('hardware', {
  // Yazıcı işlemleri
  getPrinters: () => {
    return ipcRenderer.invoke('get-printers');
  },

  printLabel: (labelData) => {
    // Client-side validation
    if (!labelData || typeof labelData !== 'object') {
      return Promise.reject(new Error('Invalid label data'));
    }

    // Sadece gerekli alanları gönder (data leak önleme)
    const safeData = {
      barcode: String(labelData.barcode || ''),
      name: String(labelData.name || ''),
      price: parseFloat(labelData.price || 0),
      unit: String(labelData.unit || 'adet')
    };

    return ipcRenderer.invoke('print-label', safeData);
  },

  // Serial port işlemleri
  getSerialPorts: () => {
    return ipcRenderer.invoke('get-serial-ports');
  },

  // POS terminal işlemleri
  posTransaction: (transactionData) => {
    // Client-side validation
    if (!transactionData || typeof transactionData !== 'object') {
      return Promise.reject(new Error('Invalid transaction data'));
    }

    if (typeof transactionData.amount !== 'number' || transactionData.amount <= 0) {
      return Promise.reject(new Error('Invalid amount'));
    }

    // Sadece gerekli alanları gönder
    const safeData = {
      amount: parseFloat(transactionData.amount),
      type: String(transactionData.type || 'sale'),
      installment: parseInt(transactionData.installment || 1)
    };

    return ipcRenderer.invoke('pos-transaction', safeData);
  },

  // POS Simulator kontrolü
  openPOSSimulator: () => {
    return ipcRenderer.invoke('open-pos-simulator');
  },

  closePOSSimulator: () => {
    return ipcRenderer.invoke('close-pos-simulator');
  },

  getSimulatorStatus: () => {
    return ipcRenderer.invoke('get-simulator-status');
  },

  // POS işlem sonucu için listener
  onPOSTransactionResult: (callback) => {
    const listener = (event, result) => callback(result);
    ipcRenderer.on('pos-transaction-result', listener);

    // Cleanup fonksiyonu döndür
    return () => {
      ipcRenderer.removeListener('pos-transaction-result', listener);
    };
  }
});

// Platform bilgisi (read-only)
contextBridge.exposeInMainWorld('platform', {
  isElectron: true,
  os: process.platform
});

// Güvenlik log'lama (production'da kaldırılabilir)
console.log('[Preload] Context bridge initialized securely');
console.log('[Preload] Node integration:', process.versions.node ? 'ENABLED (UNSAFE!)' : 'disabled');
console.log('[Preload] Context isolation:', 'enabled');
