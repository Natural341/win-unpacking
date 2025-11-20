const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
    // Receive commands from main process (from main app)
    onPOSCommand: (callback) => {
        // Remove any existing listeners first to prevent duplicates
        ipcRenderer.removeAllListeners('pos-command');
        ipcRenderer.on('pos-command', (_event, data) => {
            console.log('📥 Preload received pos-command:', data);
            callback(data);
        });
    },

    // Send response back to main process
    sendPOSResponse: (response) => {
        ipcRenderer.send('pos-response', response);
    },

    // Send command (for testing)
    sendPOSCommand: (command) => {
        ipcRenderer.send('pos-test-command', command);
    },

    // Connection status
    onConnectionStatus: (callback) => {
        ipcRenderer.removeAllListeners('connection-status');
        ipcRenderer.on('connection-status', (_event, status) => callback(status));
    },

    checkConnection: () => {
        ipcRenderer.send('check-connection');
    }
});
