const { ThermalPrinter, PrinterTypes } = require('node-thermal-printer');
const escpos = require('escpos');
escpos.USB = require('escpos-usb');

/**
 * Kullanılabilir yazıcıları listele
 */
async function listPrinters() {
  try {
    const devices = escpos.USB.findPrinter();
    return devices.map((device, index) => ({
      id: index,
      name: `USB Printer ${index + 1}`,
      vendorId: device.deviceDescriptor.idVendor,
      productId: device.deviceDescriptor.idProduct
    }));
  } catch (error) {
    console.error('Error listing printers:', error);
    return [];
  }
}

/**
 * Barkod etiketi yazdır
 * @param {Object} labelData - Etiket verisi
 * @param {string} labelData.barcode - Barkod numarası
 * @param {string} labelData.name - Ürün adı
 * @param {number} labelData.price - Fiyat
 * @param {string} labelData.unit - Birim
 */
async function printLabel(labelData) {
  try {
    // Thermal Printer kurulumu
    const printer = new ThermalPrinter({
      type: PrinterTypes.EPSON,
      interface: 'tcp://localhost:9100', // USB için: 'printer:Auto' kullanın
      characterSet: 'TURKEY',
      removeSpecialCharacters: false,
      lineCharacter: '=',
      options: {
        timeout: 5000
      }
    });

    const isConnected = await printer.isPrinterConnected();
    if (!isConnected) {
      throw new Error('Yazıcı bağlı değil');
    }

    // Etiket içeriği
    printer.alignCenter();
    printer.setTextSize(1, 1);
    printer.bold(true);
    printer.println(labelData.name);
    printer.bold(false);
    printer.newLine();

    // Barkod yazdır
    printer.printBarcode(labelData.barcode, {
      type: 'EAN13',
      height: 60,
      width: 2,
      hri: true // Human readable interpretation
    });
    printer.newLine();

    // Fiyat
    printer.setTextSize(1, 1);
    printer.bold(true);
    printer.println(`₺${labelData.price.toFixed(2)} / ${labelData.unit}`);
    printer.bold(false);

    printer.newLine();
    printer.newLine();
    printer.cut();

    await printer.execute();
    console.log('Label printed successfully');

    return { success: true, message: 'Etiket başarıyla yazdırıldı' };
  } catch (error) {
    console.error('Print error:', error);
    throw new Error(`Yazdırma hatası: ${error.message}`);
  }
}

/**
 * ESC/POS kullanarak alternatif yazdırma
 */
async function printLabelESCPOS(labelData) {
  try {
    const device = new escpos.USB();
    const printer = new escpos.Printer(device);

    device.open((error) => {
      if (error) {
        throw new Error(`Yazıcı açılamadı: ${error.message}`);
      }

      printer
        .font('a')
        .align('ct')
        .style('bu')
        .size(1, 1)
        .text(labelData.name)
        .style('normal')
        .text('')
        .barcode(labelData.barcode, 'EAN13', {
          width: 2,
          height: 60
        })
        .text('')
        .size(1, 1)
        .style('b')
        .text(`₺${labelData.price.toFixed(2)} / ${labelData.unit}`)
        .style('normal')
        .text('')
        .text('')
        .cut()
        .close();
    });

    return { success: true, message: 'Etiket başarıyla yazdırıldı' };
  } catch (error) {
    console.error('ESC/POS print error:', error);
    throw error;
  }
}

module.exports = {
  listPrinters,
  printLabel,
  printLabelESCPOS
};
