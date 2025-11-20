const { BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { MockBinding } = require('@serialport/binding-mock');
const { SerialPort } = require('serialport');

class POSSimulatorManager {
    constructor() {
        this.simulatorWindow = null;
        this.virtualPort = null;
        this.mockPort = null;
        this.isConnected = false;
        this.portPath = 'COM_VIRTUAL_POS';
    }

    /**
     * Create and show the POS simulator window
     */
    createSimulatorWindow() {
        if (this.simulatorWindow) {
            this.simulatorWindow.focus();
            return this.simulatorWindow;
        }

        this.simulatorWindow = new BrowserWindow({
            width: 500,
            height: 800,
            title: 'POS Terminal Simulator',
            webPreferences: {
                nodeIntegration: false,
                contextIsolation: true,
                sandbox: true,
                webSecurity: true,
                preload: path.join(__dirname, 'pos-simulator-preload.js')
            },
            icon: path.join(__dirname, '../../assets/icon.png'),
            backgroundColor: '#2d3748',
            resizable: false,
            alwaysOnTop: true
        });

        this.simulatorWindow.loadFile(path.join(__dirname, 'pos-simulator.html'));

        this.simulatorWindow.on('closed', () => {
            this.simulatorWindow = null;
            this.cleanup();
        });

        // Setup IPC handlers
        this.setupIPCHandlers();

        // Initialize virtual serial port
        this.initializeVirtualPort();

        // Send connection status after window loads
        this.simulatorWindow.webContents.on('did-finish-load', () => {
            console.log('✅ Simulator window loaded, sending connection status');
            this.sendConnectionStatus();
        });

        return this.simulatorWindow;
    }

    /**
     * Initialize virtual serial port using mock binding
     */
    initializeVirtualPort() {
        try {
            // Use mock binding for virtual port
            MockBinding.createPort(this.portPath, { echo: false, record: true });

            this.isConnected = true;
            this.sendConnectionStatus();

            console.log(`Virtual POS port created: ${this.portPath}`);
        } catch (error) {
            console.error('Failed to create virtual port:', error);
            this.isConnected = false;
            this.sendConnectionStatus();
        }
    }

    /**
     * Setup IPC handlers for communication with simulator window
     */
    setupIPCHandlers() {
        // Note: pos-response is handled in main.js to avoid conflicts

        // Handle test command from simulator
        ipcMain.on('pos-test-command', (event, command) => {
            console.log('Test command from simulator:', command);
            // Echo back for testing
            if (this.simulatorWindow) {
                this.simulatorWindow.webContents.send('pos-command', {
                    command: command,
                    timestamp: new Date().toISOString()
                });
            }
        });

        // Check connection status
        ipcMain.on('check-connection', () => {
            this.sendConnectionStatus();
        });
    }

    /**
     * Send POS command to simulator (called from main app)
     */
    sendCommandToSimulator(command, data) {
        if (!this.simulatorWindow) {
            console.error('❌ Simulator window not open');
            return false;
        }

        if (this.simulatorWindow.isDestroyed()) {
            console.error('❌ Simulator window is destroyed');
            return false;
        }

        const payload = {
            command: command,
            ...data,
            timestamp: new Date().toISOString()
        };

        console.log('📤 Sending to simulator:', payload);

        // Pencere yüklendiyse gönder, yoksa bekle
        if (this.simulatorWindow.webContents.isLoading()) {
            console.log('⏳ Window still loading, waiting...');
            this.simulatorWindow.webContents.once('did-finish-load', () => {
                console.log('✅ Window loaded, sending now');
                this.simulatorWindow.webContents.send('pos-command', payload);
            });
        } else {
            this.simulatorWindow.webContents.send('pos-command', payload);
            console.log('✅ Command sent immediately');
        }

        return true;
    }

    /**
     * Handle response from simulator and send via virtual serial port
     */
    handleSimulatorResponse(response) {
        // Format response for serial communication
        const serialResponse = this.formatSerialResponse(response);

        // If there's a listener on the virtual port, send the response
        // This will be received by the main app's POS module
        if (this.mockPort) {
            try {
                this.mockPort.port.emitData(Buffer.from(serialResponse + '\r\n'));
                console.log('Response sent via virtual port:', serialResponse);
            } catch (error) {
                console.error('Failed to send via virtual port:', error);
            }
        }

        // Also emit via event for direct IPC communication
        const mainWindow = require('electron').BrowserWindow.getAllWindows()
            .find(w => w.title === 'Barkod Sistemi');

        if (mainWindow) {
            mainWindow.webContents.send('pos-transaction-result', response);
        }
    }

    /**
     * Format response for serial communication
     * Format: STATUS|MESSAGE|TRANSACTION_ID|AUTH_CODE
     */
    formatSerialResponse(response) {
        const parts = [
            response.status || 'UNKNOWN',
            response.message || '',
            response.transactionId || '',
            response.authCode || '',
            response.cardNumber || '',
            response.error || ''
        ];

        return parts.join('|');
    }

    /**
     * Send connection status to simulator
     */
    sendConnectionStatus() {
        if (this.simulatorWindow) {
            this.simulatorWindow.webContents.send('connection-status', {
                connected: this.isConnected,
                portPath: this.portPath
            });
        }
    }

    /**
     * Connect main app to virtual POS port
     */
    async connectMainAppToSimulator() {
        try {
            // Use the mock binding
            SerialPort.Binding = MockBinding;

            this.mockPort = new SerialPort({
                path: this.portPath,
                baudRate: 9600,
                binding: MockBinding
            });

            const { ReadlineParser } = require('@serialport/parser-readline');
            const parser = this.mockPort.pipe(new ReadlineParser({ delimiter: '\r\n' }));

            parser.on('data', (data) => {
                console.log('Data received from virtual port:', data);
            });

            this.mockPort.on('error', (err) => {
                console.error('Virtual port error:', err);
            });

            console.log('Main app connected to virtual POS');
            return { success: true, message: 'Connected to simulator' };
        } catch (error) {
            console.error('Failed to connect to virtual port:', error);
            return { success: false, message: error.message };
        }
    }

    /**
     * Send transaction request from main app to simulator
     */
    async sendTransaction(transactionData) {
        if (!this.simulatorWindow) {
            return {
                success: false,
                message: 'Simulator not running'
            };
        }

        return new Promise((resolve) => {
            // Store resolve callback
            this.currentTransactionResolve = resolve;

            // Send to simulator
            this.sendCommandToSimulator('TRANSACTION', transactionData);

            // Setup timeout
            setTimeout(() => {
                if (this.currentTransactionResolve) {
                    this.currentTransactionResolve({
                        success: false,
                        message: 'Transaction timeout',
                        error: 'TIMEOUT'
                    });
                    this.currentTransactionResolve = null;
                }
            }, 30000);
        });
    }

    /**
     * Get virtual port path for main app
     */
    getVirtualPortPath() {
        return this.portPath;
    }

    /**
     * Check if simulator is running
     */
    isRunning() {
        return this.simulatorWindow !== null;
    }

    /**
     * Cleanup resources
     */
    cleanup() {
        if (this.mockPort && this.mockPort.isOpen) {
            this.mockPort.close();
            this.mockPort = null;
        }

        if (this.virtualPort) {
            this.virtualPort = null;
        }

        this.isConnected = false;
    }

    /**
     * Close simulator window
     */
    closeSimulator() {
        if (this.simulatorWindow) {
            this.simulatorWindow.close();
        }
    }
}

// Singleton instance
let instance = null;

function getPOSSimulatorManager() {
    if (!instance) {
        instance = new POSSimulatorManager();
    }
    return instance;
}

module.exports = {
    getPOSSimulatorManager
};
