// POS Simulator Client-Side Logic

let currentTransaction = null;
let isConnected = false;

// Sanal kart bilgileri
const virtualCards = {
    'visa': {
        name: 'Visa',
        number: '************1234',
        type: 'Kredi Kartı',
        bank: 'İş Bankası'
    },
    'mastercard': {
        name: 'Mastercard',
        number: '************5678',
        type: 'Kredi Kartı',
        bank: 'Garanti BBVA'
    },
    'amex': {
        name: 'American Express',
        number: '************9012',
        type: 'Kredi Kartı',
        bank: 'American Express'
    },
    'troy': {
        name: 'Troy',
        number: '************3456',
        type: 'Banka Kartı',
        bank: 'Akbank'
    },
    'bonus': {
        name: 'Bonus',
        number: '************7890',
        type: 'Kredi Kartı',
        bank: 'Garanti BBVA'
    },
    'world': {
        name: 'World',
        number: '************2468',
        type: 'Kredi Kartı',
        bank: 'Yapı Kredi'
    },
    'paraf': {
        name: 'Paraf',
        number: '************1357',
        type: 'Kredi Kartı',
        bank: 'İş Bankası'
    },
    'maximum': {
        name: 'Maximum',
        number: '************9753',
        type: 'Kredi Kartı',
        bank: 'İş Bankası'
    }
};

// DOM Elements
const display = document.getElementById('display');
const connectionStatus = document.getElementById('connectionStatus');
const transactionInfo = document.getElementById('transactionInfo');
const transactionType = document.getElementById('transactionType');
const transactionAmount = document.getElementById('transactionAmount');
const transactionInstallment = document.getElementById('transactionInstallment');
const cardSlot = document.getElementById('cardSlot');
const cardSelect = document.getElementById('cardSelect');
const scenarioSelect = document.getElementById('scenarioSelect');

const btnApprove = document.getElementById('btnApprove');
const btnDecline = document.getElementById('btnDecline');
const btnCancel = document.getElementById('btnCancel');
const btnTest = document.getElementById('btnTest');

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    console.log('🚀 POS Simulator initialized');
    setupEventListeners();
    checkConnection();

    // Request initial status from main process
    if (window.electronAPI) {
        console.log('✅ electronAPI found');
        window.electronAPI.onPOSCommand(handlePOSCommand);
        window.electronAPI.onConnectionStatus(handleConnectionStatus);
        console.log('✅ Listeners registered');
    } else {
        console.error('❌ electronAPI not found!');
    }
});

function setupEventListeners() {
    btnApprove.addEventListener('click', () => handleResponse('approve'));
    btnDecline.addEventListener('click', () => handleResponse('decline'));
    btnCancel.addEventListener('click', () => handleResponse('cancel'));
    btnTest.addEventListener('click', () => sendTestCommand());
}

// Global test function
window.testPOSCommand = function(amount) {
    console.log('🧪 TEST: Manual command triggered');
    handlePOSCommand({
        command: 'SALE',
        amount: amount || 5000,
        type: 'sale',
        installment: 1
    });
};

function handlePOSCommand(data) {
    console.log('🔵 Received POS command:', data);
    console.log('🔵 Amount:', data.amount);
    console.log('🔵 Type:', data.type);
    console.log('🔵 Installment:', data.installment);

    const { command, amount, type, installment } = data;

    if (command === 'TEST') {
        handleTestCommand();
        return;
    }

    // İşlem varsa kaydet
    if (amount && amount > 0) {
        console.log('✅ Transaction data valid, processing...');

        currentTransaction = {
            type: type || 'sale',
            amount: amount || 0,
            installment: installment || 1
        };

        clearDisplay();
        addDisplayLine('═══════════════════════════', 'normal');
        addDisplayLine('    YENİ İŞLEM BAŞLATILDI', 'normal');
        addDisplayLine('═══════════════════════════', 'normal');
        displayTransaction(currentTransaction);
        simulateCardRead();
    } else {
        console.error('❌ Invalid transaction data - amount:', amount);
        addDisplayLine('⚠️ İşlem bilgisi eksik!', 'warning');
        addDisplayLine(`Gelen veri: ${JSON.stringify(data)}`, 'warning');
    }
}

function handleConnectionStatus(status) {
    isConnected = status.connected;
    updateConnectionStatus();
}

function displayTransaction(transaction) {
    transactionInfo.style.display = 'block';

    const typeMap = {
        'sale': 'SATIŞ',
        'refund': 'İADE'
    };

    const amount = (transaction.amount / 100).toFixed(2);

    transactionType.textContent = typeMap[transaction.type] || transaction.type.toUpperCase();
    transactionAmount.textContent = `₺${amount}`;
    transactionInstallment.textContent = transaction.installment === 1
        ? 'Tek Çekim'
        : `${transaction.installment} Taksit`;

    addDisplayLine('');
    addDisplayLine(`📌 İşlem Tipi: ${typeMap[transaction.type]}`, 'normal');
    addDisplayLine(`💰 Tutar: ₺${amount}`, 'success');
    addDisplayLine(`💳 Taksit: ${transaction.installment === 1 ? 'Tek Çekim' : transaction.installment + ' Taksit'}`, 'normal');
    addDisplayLine('');
    addDisplayLine('───────────────────────────', 'normal');
    addDisplayLine('🔵 KREDİ KARTI BEKLENİYOR...', 'normal');
    addDisplayLine('───────────────────────────', 'normal');
    addDisplayLine('Lütfen kartınızı okutun veya', 'normal');
    addDisplayLine('chip\'i takın', 'normal');
}

function simulateCardRead() {
    // Seçilen kartı al
    const selectedCardType = cardSelect.value;
    const selectedCard = virtualCards[selectedCardType];

    cardSlot.classList.add('active');
    cardSlot.textContent = `💳 ${selectedCard.name} Okunuyor...`;

    setTimeout(() => {
        cardSlot.classList.remove('active');
        cardSlot.textContent = `✓ ${selectedCard.name} Okundu`;

        addDisplayLine('');
        addDisplayLine('✓ Kart başarıyla okundu', 'success');
        addDisplayLine('───────────────────────────', 'normal');
        addDisplayLine(`Kart: ${selectedCard.name}`, 'normal');
        addDisplayLine(`Numara: ${selectedCard.number}`, 'normal');
        addDisplayLine(`Banka: ${selectedCard.bank}`, 'normal');
        addDisplayLine(`Tip: ${selectedCard.type}`, 'normal');
        addDisplayLine('───────────────────────────', 'normal');
        addDisplayLine('⚠️  İŞLEMİ ONAYLAYIN', 'warning');
        addDisplayLine('───────────────────────────', 'normal');
        addDisplayLine('', 'normal');
        addDisplayLine('Test senaryosu seçin ve', 'normal');
        addDisplayLine('"ONAYLA" butonuna basın', 'normal');
    }, 2000);
}

function handleResponse(action) {
    if (!currentTransaction && action !== 'cancel') {
        clearDisplay();
        addDisplayLine('═══════════════════════════', 'normal');
        addDisplayLine('⚠️  AKTİF İŞLEM YOK!', 'warning');
        addDisplayLine('═══════════════════════════', 'normal');
        addDisplayLine('', 'normal');
        addDisplayLine('Lütfen önce ana uygulamadan', 'normal');
        addDisplayLine('bir satış işlemi başlatın.', 'normal');
        addDisplayLine('', 'normal');
        addDisplayLine('Ödeme yöntemi olarak', 'normal');
        addDisplayLine('"Kredi Kartı" seçilmelidir.', 'normal');
        return;
    }

    // İşlem başlatıldı mesajı
    clearDisplay();
    addDisplayLine('═══════════════════════════', 'normal');
    addDisplayLine('⏳ İŞLEM İŞLENİYOR...', 'normal');
    addDisplayLine('═══════════════════════════', 'normal');
    addDisplayLine('', 'normal');
    addDisplayLine('Lütfen bekleyiniz...', 'normal');

    const scenario = scenarioSelect.value;
    let response;

    // 1 saniye sonra işlemi tamamla (gerçekçi görünsün)
    setTimeout(() => {
        switch (action) {
            case 'approve':
                response = generateResponse(scenario);
                break;
            case 'decline':
                response = generateDeclineResponse();
                break;
            case 'cancel':
                response = generateCancelResponse();
                break;
        }

        if (response) {
            displayResponse(response);

            // 2 saniye sonra yanıtı gönder
            setTimeout(() => {
                sendResponse(response);
            }, 2000);
        }
    }, 1500);
}

function generateResponse(scenario) {
    const transactionId = generateTransactionId();
    const timestamp = new Date().toISOString();

    // Seçilen kartı al
    const selectedCardType = cardSelect.value;
    const selectedCard = virtualCards[selectedCardType];

    const scenarios = {
        'success': {
            success: true,
            status: 'SUCCESS',
            message: 'İşlem Başarılı',
            transactionId: transactionId,
            timestamp: timestamp,
            cardNumber: selectedCard.number,
            cardName: selectedCard.name,
            cardBank: selectedCard.bank,
            authCode: generateAuthCode()
        },
        'declined': {
            success: false,
            status: 'DECLINED',
            message: 'Kart Reddedildi',
            error: 'CARD_DECLINED',
            timestamp: timestamp
        },
        'timeout': {
            success: false,
            status: 'TIMEOUT',
            message: 'İşlem Zaman Aşımına Uğradı',
            error: 'TIMEOUT',
            timestamp: timestamp
        },
        'insufficient': {
            success: false,
            status: 'DECLINED',
            message: 'Yetersiz Bakiye',
            error: 'INSUFFICIENT_FUNDS',
            timestamp: timestamp
        },
        'invalid_card': {
            success: false,
            status: 'ERROR',
            message: 'Geçersiz Kart',
            error: 'INVALID_CARD',
            timestamp: timestamp
        },
        'pin_error': {
            success: false,
            status: 'DECLINED',
            message: 'Hatalı PIN',
            error: 'WRONG_PIN',
            timestamp: timestamp
        }
    };

    return scenarios[scenario] || scenarios['success'];
}

function generateDeclineResponse() {
    return {
        success: false,
        status: 'DECLINED',
        message: 'İşlem Reddedildi',
        error: 'USER_DECLINED',
        timestamp: new Date().toISOString()
    };
}

function generateCancelResponse() {
    return {
        success: false,
        status: 'CANCELLED',
        message: 'İşlem İptal Edildi',
        error: 'USER_CANCELLED',
        timestamp: new Date().toISOString()
    };
}

function generateTransactionId() {
    return 'TXN' + Date.now() + Math.random().toString(36).substr(2, 9).toUpperCase();
}

function generateAuthCode() {
    return Math.random().toString(36).substr(2, 6).toUpperCase();
}

function sendResponse(response) {
    if (window.electronAPI) {
        window.electronAPI.sendPOSResponse(response);
    }

    currentTransaction = null;

    setTimeout(() => {
        resetTransaction();
    }, 3000);
}

function displayResponse(response) {
    const isSuccess = response.status === 'SUCCESS';

    clearDisplay();

    if (isSuccess) {
        // BAŞARILI İŞLEM FİŞİ
        const amount = currentTransaction ? (currentTransaction.amount / 100).toFixed(2) : '0.00';

        addDisplayLine('═══════════════════════════', 'success');
        addDisplayLine('   ✓ İŞLEM BAŞARILI', 'success');
        addDisplayLine('═══════════════════════════', 'success');
        addDisplayLine('', 'normal');
        addDisplayLine('────── ÖDEME FİŞİ ──────', 'normal');
        addDisplayLine('', 'normal');
        addDisplayLine(`Tarih: ${new Date().toLocaleString('tr-TR')}`, 'normal');
        addDisplayLine(`İşlem No: ${response.transactionId}`, 'normal');
        addDisplayLine(`Onay Kodu: ${response.authCode}`, 'normal');
        addDisplayLine('', 'normal');
        addDisplayLine(`Kart: ${response.cardName || 'Bilinmeyen'}`, 'normal');
        addDisplayLine(`Kart No: ${response.cardNumber}`, 'normal');
        addDisplayLine(`Banka: ${response.cardBank || 'Bilinmeyen'}`, 'normal');
        addDisplayLine('', 'normal');
        addDisplayLine('───────────────────────────', 'normal');
        addDisplayLine(`TUTAR: ₺${amount}`, 'success');
        addDisplayLine('───────────────────────────', 'normal');
        addDisplayLine('', 'normal');
        addDisplayLine(`Taksit: ${currentTransaction?.installment || 1} ${currentTransaction?.installment === 1 ? '(Tek Çekim)' : 'Taksit'}`, 'normal');
        addDisplayLine('', 'normal');
        addDisplayLine('───────────────────────────', 'normal');
        addDisplayLine('  MÜŞTERİ NÜSHASI', 'normal');
        addDisplayLine('───────────────────────────', 'normal');
        addDisplayLine('', 'normal');
        addDisplayLine('✓ Ödeme onaylandı', 'success');
        addDisplayLine('Ana uygulamaya gönderiliyor...', 'normal');

    } else {
        // BAŞARISIZ İŞLEM
        addDisplayLine('═══════════════════════════', 'error');
        addDisplayLine('   ✗ İŞLEM BAŞARISIZ', 'error');
        addDisplayLine('═══════════════════════════', 'error');
        addDisplayLine('', 'normal');
        addDisplayLine(`Sebep: ${response.message}`, 'error');
        addDisplayLine('', 'normal');

        if (response.error) {
            const errorMessages = {
                'CARD_DECLINED': 'Kartınız reddedildi',
                'INSUFFICIENT_FUNDS': 'Yetersiz bakiye',
                'INVALID_CARD': 'Geçersiz kart',
                'WRONG_PIN': 'Hatalı PIN kodu',
                'USER_DECLINED': 'İşlem reddedildi',
                'USER_CANCELLED': 'İşlem iptal edildi',
                'TIMEOUT': 'İşlem zaman aşımına uğradı'
            };

            const errorDetail = errorMessages[response.error] || response.error;
            addDisplayLine(`Detay: ${errorDetail}`, 'warning');
        }

        addDisplayLine('', 'normal');
        addDisplayLine('───────────────────────────', 'normal');
        addDisplayLine('Lütfen tekrar deneyin veya', 'normal');
        addDisplayLine('başka bir kart kullanın', 'normal');
    }
}

function resetTransaction() {
    transactionInfo.style.display = 'none';
    cardSlot.textContent = '💳 Kart Okutun veya Chip Takın';
    currentTransaction = null;

    clearDisplay();
    addDisplayLine('POS Terminal Hazır');
    addDisplayLine('İşlem bekleniyor...');
}

function handleTestCommand() {
    addDisplayLine('🔧 Test komutu alındı');

    const response = {
        status: 'SUCCESS',
        message: 'Test Başarılı - POS Terminal Yanıt Veriyor',
        timestamp: new Date().toISOString()
    };

    sendResponse(response);
    addDisplayLine('✓ Test yanıtı gönderildi', 'success');
}

function sendTestCommand() {
    if (window.electronAPI) {
        window.electronAPI.sendPOSCommand('TEST');
        addDisplayLine('🔧 Test komutu gönderildi...');
    }
}

function addDisplayLine(text, type = 'normal') {
    const line = document.createElement('div');
    line.className = 'display-line';

    const colors = {
        'success': '#48bb78',
        'error': '#f56565',
        'warning': '#ed8936',
        'normal': '#48bb78'
    };

    line.style.color = colors[type];
    line.textContent = text;

    display.appendChild(line);

    // Keep only last 10 lines
    while (display.children.length > 10) {
        display.removeChild(display.firstChild);
    }

    // Scroll to bottom
    display.scrollTop = display.scrollHeight;
}

function clearDisplay() {
    display.innerHTML = `
        <div class="display-line">
            <span class="status-indicator online"></span>
            POS Terminal Hazır
        </div>
    `;
}

function checkConnection() {
    if (window.electronAPI) {
        window.electronAPI.checkConnection();
    }

    setTimeout(checkConnection, 5000); // Check every 5 seconds
}

function updateConnectionStatus() {
    const indicator = connectionStatus.querySelector('.status-indicator');

    if (isConnected) {
        connectionStatus.className = 'connection-status connected';
        connectionStatus.innerHTML = '<span class="status-indicator online"></span> Bağlı - COM Port Aktif';
        indicator.classList.remove('offline');
        indicator.classList.add('online');
    } else {
        connectionStatus.className = 'connection-status disconnected';
        connectionStatus.innerHTML = '<span class="status-indicator offline"></span> Bağlantı Bekleniyor...';
        indicator.classList.remove('online');
        indicator.classList.add('offline');
    }
}

// Format amount helper
function formatAmount(amount) {
    return `₺${(amount / 100).toFixed(2)}`;
}
