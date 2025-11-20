const { app, BrowserWindow, ipcMain, session, Menu } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const { getPOSSimulatorManager } = require('./simulator/pos-simulator-manager');
const { setupDatabaseURL, backupDatabase, cleanOldBackups } = require('./database');

let mainWindow;
let nextServer;
let posSimulator = null;

// Güvenlik: Rate limiting için
const rateLimits = new Map();
const RATE_LIMIT_WINDOW = 1000; // 1 saniye
const MAX_REQUESTS = 10; // Saniyede max 10 istek

function checkRateLimit(channel) {
  const now = Date.now();
  const limit = rateLimits.get(channel) || { count: 0, resetTime: now + RATE_LIMIT_WINDOW };

  if (now > limit.resetTime) {
    rateLimits.set(channel, { count: 1, resetTime: now + RATE_LIMIT_WINDOW });
    return true;
  }

  if (limit.count >= MAX_REQUESTS) {
    console.warn(`Rate limit exceeded for channel: ${channel}`);
    return false;
  }

  limit.count++;
  return true;
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    show: true, // V3: Hemen göster (loading ile)
    backgroundColor: '#000', // Siyah arka plan
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      experimentalFeatures: false,
      enableBlinkFeatures: '',
      preload: path.join(__dirname, 'preload.js'),
      backgroundThrottling: false, // Arka planda performans düşmemesi için
      v8CacheOptions: 'code' // V2: V8 cache optimization
    },
    icon: path.join(__dirname, '../assets/icon.png'),
    title: 'Barkod Sistemi'
  });

  // Content Security Policy
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          "default-src 'self'",
          "script-src 'self' 'unsafe-inline' 'unsafe-eval'", // Next.js için gerekli
          "style-src 'self' 'unsafe-inline'",
          "img-src 'self' data: blob:",
          "font-src 'self' data:",
          "connect-src 'self' http://localhost:3000 ws://localhost:3000",
          "media-src 'self' blob:",
          "frame-src 'none'",
          "object-src 'none'",
          "base-uri 'self'"
        ].join('; ')
      }
    });
  });

  const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

  if (isDev) {
    // Development mode: Next.js dev server çalışıyor
    mainWindow.loadURL('http://localhost:3000');
    mainWindow.webContents.openDevTools();
  } else {
    // V4: Önce loading ekranını göster (hemen!)
    mainWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(`
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body {
              display: flex;
              justify-content: center;
              align-items: center;
              min-height: 100vh;
              background: #000;
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            }
            .container {
              text-align: center;
              color: #fff;
            }
            .logo {
              font-size: 64px;
              margin-bottom: 32px;
              animation: pulse 2s ease-in-out infinite;
            }
            @keyframes pulse {
              0%, 100% { opacity: 1; transform: scale(1); }
              50% { opacity: 0.8; transform: scale(0.98); }
            }
            h1 {
              font-size: 24px;
              font-weight: 300;
              margin-bottom: 40px;
              letter-spacing: 2px;
            }
            .progress-container {
              width: 300px;
              height: 2px;
              background: #333;
              border-radius: 2px;
              overflow: hidden;
              margin: 0 auto;
            }
            .progress-bar {
              height: 100%;
              background: #fff;
              width: 0%;
              transition: width 0.3s ease;
            }
            .percentage {
              margin-top: 16px;
              font-size: 14px;
              font-weight: 300;
              color: #999;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="logo">📦</div>
            <h1>BARKOD SİSTEMİ</h1>
            <div class="progress-container">
              <div class="progress-bar" id="progress"></div>
            </div>
            <div class="percentage" id="percent">0%</div>
          </div>
          <script>
            let progress = 0;
            const interval = setInterval(() => {
              progress += Math.random() * 15;
              if (progress > 95) progress = 95;
              document.getElementById('progress').style.width = progress + '%';
              document.getElementById('percent').textContent = Math.floor(progress) + '%';
            }, 250);
          </script>
        </body>
      </html>
    `)}`)

    // Production mode: Next.js standalone server başlat
    const serverWrapperPath = path.join(process.resourcesPath, 'app', 'electron', 'server-wrapper.js');

    console.log('Starting Next.js server from:', serverWrapperPath);

    // Database path'ini al
    const { getDatabasePath } = require('./database');
    const dbPath = getDatabasePath();
    const databaseURL = `file:${dbPath}`;

    console.log('📁 Database Path:', dbPath);
    console.log('🔗 DATABASE_URL:', databaseURL);

    nextServer = spawn('node', [serverWrapperPath], {
      env: {
        ...process.env,
        PORT: '3000',
        HOSTNAME: 'localhost',
        NODE_ENV: 'production',
        DATABASE_URL: databaseURL
      },
      stdio: 'pipe'
    });

    nextServer.stdout.on('data', (data) => {
      console.log(`Next.js: ${data}`);
    });

    nextServer.stderr.on('data', (data) => {
      console.error(`Next.js Error: ${data}`);
    });

    nextServer.on('error', (error) => {
      console.error('Failed to start Next.js server:', error);
    });

    // V4: Wait for server (loading already shown)
    const waitForServer = async () => {
      const maxAttempts = 60; // 60 deneme (15 saniye)
      let attempts = 0;
      const startTime = Date.now();
      const http = require('http');

      while (attempts < maxAttempts) {
        try {
          await new Promise((resolve, reject) => {
            const req = http.get('http://localhost:3000', (res) => {
              resolve(true);
            });
            req.on('error', reject);
            req.setTimeout(100); // V3: 100ms timeout (ultra-fast)
            req.end();
          });

          const elapsedTime = ((Date.now() - startTime) / 1000).toFixed(1);
          console.log(`✅ Next.js server ready in ${elapsedTime}s!`);

          // V3: Instant load (no delay)
          mainWindow.loadURL('http://localhost:3000');
          return;
        } catch (error) {
          attempts++;
          await new Promise(resolve => setTimeout(resolve, 250)); // V3: 250ms bekleme (daha hızlı)
        }
      }

      console.error('❌ Failed to connect to Next.js server');
      mainWindow.loadURL('http://localhost:3000');
    };

    waitForServer();
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  // Veritabanı yolunu ayarla (SQLite - PostgreSQL gerekmez!)
  setupDatabaseURL();

  // Otomatik yedek al
  backupDatabase();

  // Eski yedekleri temizle
  cleanOldBackups();

  createWindow();
  createAppMenu();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (nextServer) {
    nextServer.kill();
  }
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('will-quit', () => {
  if (nextServer) {
    nextServer.kill();
  }
});

// Güvenlik: Input validation
function validateLabelData(data) {
  if (!data || typeof data !== 'object') {
    throw new Error('Invalid label data');
  }

  const { barcode, name, price, unit } = data;

  if (!barcode || typeof barcode !== 'string' || barcode.length > 50) {
    throw new Error('Invalid barcode');
  }

  if (!name || typeof name !== 'string' || name.length > 200) {
    throw new Error('Invalid product name');
  }

  if (typeof price !== 'number' || price < 0 || price > 1000000) {
    throw new Error('Invalid price');
  }

  if (!unit || typeof unit !== 'string' || unit.length > 20) {
    throw new Error('Invalid unit');
  }

  // XSS koruması: HTML/Script taglerini temizle
  return {
    barcode: String(barcode).replace(/[<>]/g, ''),
    name: String(name).replace(/[<>]/g, ''),
    price: parseFloat(price),
    unit: String(unit).replace(/[<>]/g, '')
  };
}

function validatePOSTransaction(data) {
  if (!data || typeof data !== 'object') {
    throw new Error('Invalid transaction data');
  }

  const { amount, type = 'sale', installment = 1 } = data;

  if (typeof amount !== 'number' || amount <= 0 || amount > 10000000) {
    throw new Error('Invalid amount');
  }

  if (!['sale', 'refund'].includes(type)) {
    throw new Error('Invalid transaction type');
  }

  if (!Number.isInteger(installment) || installment < 1 || installment > 12) {
    throw new Error('Invalid installment');
  }

  return {
    amount: parseFloat(amount),
    type: String(type),
    installment: parseInt(installment)
  };
}

// IPC Handlers - Hardware kontrolü için (Güvenli)
ipcMain.handle('get-printers', async (event) => {
  if (!checkRateLimit('get-printers')) {
    throw new Error('Rate limit exceeded');
  }

  try {
    const { listPrinters } = require('./hardware/printer');
    return await listPrinters();
  } catch (error) {
    console.error('Error getting printers:', error);
    return [];
  }
});

ipcMain.handle('print-label', async (event, labelData) => {
  if (!checkRateLimit('print-label')) {
    throw new Error('Rate limit exceeded');
  }

  try {
    // Input validation
    const validatedData = validateLabelData(labelData);

    const { printLabel } = require('./hardware/printer');
    return await printLabel(validatedData);
  } catch (error) {
    console.error('Error printing label:', error);
    return {
      success: false,
      message: error.message || 'Yazdırma hatası'
    };
  }
});

ipcMain.handle('get-serial-ports', async (event) => {
  if (!checkRateLimit('get-serial-ports')) {
    throw new Error('Rate limit exceeded');
  }

  try {
    const { SerialPort } = require('serialport');
    const ports = await SerialPort.list();

    // Sadece gerekli bilgileri döndür (güvenlik)
    return ports.map(port => ({
      path: port.path,
      manufacturer: port.manufacturer || 'Unknown'
    }));
  } catch (error) {
    console.error('Error getting serial ports:', error);
    return [];
  }
});

ipcMain.handle('pos-transaction', async (event, transactionData) => {
  if (!checkRateLimit('pos-transaction')) {
    throw new Error('Rate limit exceeded');
  }

  try {
    // Input validation
    const validatedData = validatePOSTransaction(transactionData);

    // Check if simulator is running
    if (posSimulator && posSimulator.isRunning()) {
      console.log('Using POS simulator for transaction', validatedData);
      posSimulator.sendCommandToSimulator('SALE', validatedData);

      // Wait for simulator response
      return new Promise((resolve) => {
        const timeout = setTimeout(() => {
          resolve({
            success: false,
            message: 'Simulator timeout',
            error: 'TIMEOUT'
          });
        }, 35000);

        // Listen for response from simulator
        ipcMain.once('simulator-transaction-complete', (event, result) => {
          clearTimeout(timeout);
          resolve(result);
        });
      });
    } else {
      // Use real POS hardware
      const { processPOSTransaction } = require('./hardware/pos');
      return await processPOSTransaction(validatedData);
    }
  } catch (error) {
    console.error('Error processing POS transaction:', error);
    return {
      success: false,
      message: error.message || 'POS işlem hatası'
    };
  }
});

// POS Simulator IPC Handlers
ipcMain.handle('open-pos-simulator', async () => {
  try {
    posSimulator = getPOSSimulatorManager();
    posSimulator.createSimulatorWindow();
    return { success: true, message: 'Simulator started' };
  } catch (error) {
    console.error('Error starting simulator:', error);
    return { success: false, message: error.message };
  }
});

ipcMain.handle('close-pos-simulator', async () => {
  if (posSimulator) {
    posSimulator.closeSimulator();
    return { success: true, message: 'Simulator closed' };
  }
  return { success: false, message: 'Simulator not running' };
});

ipcMain.handle('get-simulator-status', async () => {
  return {
    running: posSimulator ? posSimulator.isRunning() : false,
    portPath: posSimulator ? posSimulator.getVirtualPortPath() : null
  };
});

// Handle simulator response and forward to renderer
ipcMain.on('pos-response', (event, response) => {
  console.log('POS Simulator response received:', response);

  // Forward to main window
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('pos-transaction-result', response);
  }

  // Complete the transaction promise
  ipcMain.emit('simulator-transaction-complete', null, response);
});

// Application Menu with Simulator option
function createAppMenu() {
  const template = [
    {
      label: 'Dosya',
      submenu: [
        { role: 'quit', label: 'Çıkış' }
      ]
    },
    {
      label: 'Geliştirici',
      submenu: [
        {
          label: 'POS Simulator Aç',
          click: () => {
            posSimulator = getPOSSimulatorManager();
            posSimulator.createSimulatorWindow();
          }
        },
        {
          label: 'POS Simulator Kapat',
          click: () => {
            if (posSimulator) {
              posSimulator.closeSimulator();
            }
          }
        },
        { type: 'separator' },
        { role: 'toggleDevTools', label: 'Geliştirici Araçları' },
        { role: 'reload', label: 'Yeniden Yükle' }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}
