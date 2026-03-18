// ESC/POS Commands for 80mm Thermal Printer
export const ESC = 0x1B;
export const GS = 0x1D;
export const LF = 0x0A;
export const CR = 0x0D;

export const ESCPOS = {
  // Initialize printer
  INIT: [ESC, 0x40],
  
  // Text alignment
  ALIGN_LEFT: [ESC, 0x61, 0x00],
  ALIGN_CENTER: [ESC, 0x61, 0x01],
  ALIGN_RIGHT: [ESC, 0x61, 0x02],
  
  // Text size
  TEXT_NORMAL: [ESC, 0x21, 0x00],
  TEXT_DOUBLE_HEIGHT: [ESC, 0x21, 0x10],
  TEXT_DOUBLE_WIDTH: [ESC, 0x21, 0x20],
  TEXT_DOUBLE: [ESC, 0x21, 0x30],
  
  // Text style
  BOLD_ON: [ESC, 0x45, 0x01],
  BOLD_OFF: [ESC, 0x45, 0x00],
  UNDERLINE_ON: [ESC, 0x2D, 0x01],
  UNDERLINE_OFF: [ESC, 0x2D, 0x00],
  
  // Line spacing
  LINE_SPACING_DEFAULT: [ESC, 0x32],
  LINE_SPACING_NARROW: [ESC, 0x33, 0x10],
  
  // Cut paper
  CUT_PAPER: [GS, 0x56, 0x00],
  CUT_PAPER_PARTIAL: [GS, 0x56, 0x01],
  
  // Feed lines
  FEED_LINE: [LF],
  FEED_LINES: (n: number) => [ESC, 0x64, n],
  
  // Horizontal line (using dashes)
  HORIZONTAL_LINE: '------------------------------------------------',
  HORIZONTAL_LINE_DOUBLE: '================================================',
};

// Text encoder for printer
export function textToBytes(text: string): number[] {
  const bytes: number[] = [];
  for (let i = 0; i < text.length; i++) {
    const charCode = text.charCodeAt(i);
    if (charCode < 256) {
      bytes.push(charCode);
    } else {
      // Handle special characters
      bytes.push(0x3F); // '?' for unsupported chars
    }
  }
  return bytes;
}

// Format text with max width (48 chars for 80mm)
export function formatLine(left: string, right: string, maxWidth: number = 48): string {
  const spaces = maxWidth - left.length - right.length;
  if (spaces > 0) {
    return left + ' '.repeat(spaces) + right;
  }
  return (left + ' ' + right).substring(0, maxWidth);
}

// Build KOT print data
export function buildKOTPrintData(kot: {
  tableNumber: string;
  orderId: string;
  items: Array<{
    name: string;
    quantity: number;
    notes?: string;
    addons?: string[];
  }>;
  timestamp: string;
  printedBy: string;
}): number[] {
  const data: number[] = [];
  
  // Initialize printer
  data.push(...ESCPOS.INIT);
  
  // Header - centered, double size
  data.push(...ESCPOS.ALIGN_CENTER);
  data.push(...ESCPOS.TEXT_DOUBLE);
  data.push(...textToBytes('KOT'));
  data.push(...ESCPOS.FEED_LINE);
  
  // Table number - bold
  data.push(...ESCPOS.BOLD_ON);
  data.push(...textToBytes(`TABLE: ${kot.tableNumber}`));
  data.push(...ESCPOS.BOLD_OFF);
  data.push(...ESCPOS.FEED_LINE);
  data.push(...ESCPOS.TEXT_NORMAL);
  
  // Order ID
  data.push(...textToBytes(`Order: #${kot.orderId.slice(-8)}`));
  data.push(...ESCPOS.FEED_LINE);
  
  // Timestamp
  data.push(...textToBytes(kot.timestamp));
  data.push(...ESCPOS.FEED_LINE);
  
  // Separator
  data.push(...ESCPOS.ALIGN_LEFT);
  data.push(...textToBytes(ESCPOS.HORIZONTAL_LINE_DOUBLE));
  data.push(...ESCPOS.FEED_LINE);
  
  // Items
  data.push(...ESCPOS.TEXT_DOUBLE_HEIGHT);
  
  kot.items.forEach((item, index) => {
    // Quantity x Item name
    const itemLine = `${item.quantity}x ${item.name}`;
    data.push(...textToBytes(itemLine));
    data.push(...ESCPOS.FEED_LINE);
    
    // Addons (if any)
    if (item.addons && item.addons.length > 0) {
      data.push(...ESCPOS.TEXT_NORMAL);
      data.push(...textToBytes(`   + ${item.addons.join(', ')}`));
      data.push(...ESCPOS.FEED_LINE);
      data.push(...ESCPOS.TEXT_DOUBLE_HEIGHT);
    }
    
    // Special instructions
    if (item.notes) {
      data.push(...ESCPOS.TEXT_NORMAL);
      data.push(...ESCPOS.BOLD_ON);
      data.push(...textToBytes(`   ** ${item.notes} **`));
      data.push(...ESCPOS.BOLD_OFF);
      data.push(...ESCPOS.FEED_LINE);
      data.push(...ESCPOS.TEXT_DOUBLE_HEIGHT);
    }
  });
  
  // Separator
  data.push(...ESCPOS.TEXT_NORMAL);
  data.push(...textToBytes(ESCPOS.HORIZONTAL_LINE_DOUBLE));
  data.push(...ESCPOS.FEED_LINE);
  
  // Footer
  data.push(...ESCPOS.ALIGN_CENTER);
  data.push(...textToBytes(`Printed by: ${kot.printedBy}`));
  data.push(...ESCPOS.FEED_LINE);
  data.push(...ESCPOS.FEED_LINES(3));
  
  // Cut paper
  data.push(...ESCPOS.CUT_PAPER_PARTIAL);
  
  return data;
}
