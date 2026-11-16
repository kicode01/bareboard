import type { PackageKind } from '../render/realistic3d';

export interface PackageMeta {
  kind: PackageKind;
  /** Compact repair-tech badge (e.g. "FET", "RES"). */
  short: string;
  /** Compact human-readable name shown inline in lists & breakdown pills (e.g. "Transistor"). */
  friendly: string;
  /** Full descriptive name for headers, tooltips, and the Parts Guide. */
  label: string;
  /** Typical reference designator letter prefixes on circuit boards. */
  prefixes: string;
  /** Plain-English explanation of what the component does and how to spot it. */
  role: string;
  /** Beginner-friendly search keywords mapped to this package type. */
  keywords: string[];
}

export const PACKAGE_META: Record<PackageKind, PackageMeta> = {
  resistor: {
    kind: 'resistor',
    short: 'RES',
    friendly: 'Resistor',
    label: 'Resistor',
    prefixes: 'R, PR',
    role: 'Limits electric current and sets voltage levels. Black top body with silver ends.',
    keywords: ['resistor', 'res', 'ohm', 'current', 'pullup', 'pulldown', 'r'],
  },
  mlcc: {
    kind: 'mlcc',
    short: 'CAP',
    friendly: 'Ceramic Cap',
    label: 'Ceramic Capacitor (MLCC)',
    prefixes: 'C, PC',
    role: 'Stores tiny bursts of charge to filter electrical noise. Usually tan or brown with silver ends.',
    keywords: ['capacitor', 'cap', 'ceramic', 'mlcc', 'filter', 'decoupling', 'bypass', 'c'],
  },
  electrolytic: {
    kind: 'electrolytic',
    short: 'ELYT',
    friendly: 'Electrolytic Cap',
    label: 'Electrolytic Capacitor',
    prefixes: 'C, CE',
    role: 'Round can capacitor for smoothing bulk power rails. Polarized — stripe marks negative (−) side.',
    keywords: ['electrolytic', 'capacitor', 'cap', 'can', 'bulk', 'polarized', 'polymer', 'elyt', 'ce'],
  },
  tantalum: {
    kind: 'tantalum',
    short: 'TANT',
    friendly: 'Tantalum Cap',
    label: 'Tantalum Capacitor',
    prefixes: 'C, PC',
    role: 'Molded block polarized capacitor for compact power filtering. Band marks positive (+) end.',
    keywords: ['tantalum', 'capacitor', 'cap', 'polarized', 'tant'],
  },
  inductor: {
    kind: 'inductor',
    short: 'COIL',
    friendly: 'Inductor',
    label: 'Inductor / Coil',
    prefixes: 'L, PL, FB, FL',
    role: 'Wire coil or shielded ferrite drum storing magnetic energy in power converters.',
    keywords: ['inductor', 'coil', 'choke', 'ferrite', 'bead', 'buck', 'boost', 'l'],
  },
  diode: {
    kind: 'diode',
    short: 'DIOD',
    friendly: 'Diode',
    label: 'Diode',
    prefixes: 'D, PD, ZD',
    role: 'Lets current flow in one direction only. Bright stripe indicates the cathode (−) end.',
    keywords: ['diode', 'zener', 'schottky', 'rectifier', 'tvs', 'cathode', 'd'],
  },
  led: {
    kind: 'led',
    short: 'LED',
    friendly: 'LED',
    label: 'Light-Emitting Diode (LED)',
    prefixes: 'LED',
    role: 'Glows when powered; polarized like a standard diode.',
    keywords: ['led', 'light', 'indicator', 'diode'],
  },
  transistor: {
    kind: 'transistor',
    short: 'FET',
    friendly: 'Transistor',
    label: 'Transistor / MOSFET',
    prefixes: 'Q, PQ, T',
    role: 'Electronic switch or amplifier. Standing metal-tab packages (TO-220) handle high power.',
    keywords: ['transistor', 'mosfet', 'fet', 'switch', 'power', 'amp', 'to220', 'q'],
  },
  ic: {
    kind: 'ic',
    short: 'IC',
    friendly: 'Microchip',
    label: 'Integrated Circuit (Chip)',
    prefixes: 'U, PU, IC',
    role: 'Dark microchip with metal legs (controllers, voltage regulators, memory, logic). Dot marks Pin 1.',
    keywords: ['ic', 'chip', 'microchip', 'controller', 'regulator', 'mcu', 'qfp', 'soic', 'u'],
  },
  bga: {
    kind: 'bga',
    short: 'BGA',
    friendly: 'BGA Chip',
    label: 'BGA Chip (Ball Grid Array)',
    prefixes: 'U, PU',
    role: 'High-pin main processor, GPU, or chipset connected by hidden solder balls underneath.',
    keywords: ['bga', 'chip', 'cpu', 'gpu', 'soc', 'processor', 'ball', 'array', 'u'],
  },
  connector: {
    kind: 'connector',
    short: 'CONN',
    friendly: 'Connector',
    label: 'Connector / Header',
    prefixes: 'J, CN, CON, USB',
    role: 'Plug, socket, or shrouded pin header linking external cables, power, or add-on boards.',
    keywords: ['connector', 'header', 'plug', 'socket', 'port', 'usb', 'hdmi', 'pin', 'j', 'cn'],
  },
  crystal: {
    kind: 'crystal',
    short: 'XTAL',
    friendly: 'Crystal',
    label: 'Crystal Oscillator',
    prefixes: 'Y, X, XTAL, OSC',
    role: 'Quartz timing resonator supplying accurate clock pulses for processors and USB.',
    keywords: ['crystal', 'oscillator', 'xtal', 'clock', 'resonator', 'timing', 'y'],
  },
  fuse: {
    kind: 'fuse',
    short: 'FUSE',
    friendly: 'Fuse',
    label: 'Fuse',
    prefixes: 'F',
    role: 'Overcurrent protection link that sacrifices itself to protect downstream circuitry.',
    keywords: ['fuse', 'protection', 'breaker', 'f'],
  },
  generic: {
    kind: 'generic',
    short: 'PART',
    friendly: 'Component',
    label: 'Component',
    prefixes: '—',
    role: 'General electronic part mounted on the printed circuit board.',
    keywords: ['part', 'component', 'misc'],
  },
};

export const PACKAGE_GUIDE_ORDER: PackageKind[] = [
  'resistor',
  'mlcc',
  'electrolytic',
  'tantalum',
  'inductor',
  'diode',
  'led',
  'transistor',
  'ic',
  'bga',
  'connector',
  'crystal',
  'fuse',
];

export const BOARD_TERMS_GLOSSARY: readonly { term: string; shortMeaning: string }[] = [
  { term: 'Net', shortMeaning: 'An electrically connected copper path linking pins together (e.g. +3V3 power or SDA data).' },
  { term: 'RefDes (U1, R1…)', shortMeaning: 'Reference Designator — the unique letter + number label printed beside each part on the PCB.' },
  { term: 'GND', shortMeaning: 'Ground — the 0 V common return reference for circuits across the board.' },
  { term: 'NC / Unconnected', shortMeaning: 'No Connection — an unused mechanical or spare pad not routed to a signal.' },
  { term: 'Pin 1 / A1', shortMeaning: 'Starting reference pin marked with a corner dot, notch, or stripe so chips go on the right way.' },
  { term: 'SMD', shortMeaning: 'Surface-Mount Device — components soldered flat onto copper pads without drilling through.' },
  { term: 'Through-hole', shortMeaning: 'Components with metal legs inserted through drilled holes in the PCB for strength.' },
  { term: 'Test point (Nail)', shortMeaning: 'Exposed metal pad on the board for multimeter or factory bed-of-nails probing.' },
  { term: 'Counts (12p / 2n)', shortMeaning: 'Shorthand in tight lists: p = connected pins (e.g. 12p means 12 pins), n = copper nets.' },
  { term: 'mil vs. mm', shortMeaning: '1 mil = 1/1000 inch (0.0254 mm). Traditional PCB layouts measure traces and thickness in mils.' },
];

export type NetCategory =
  | 'ground'
  | 'power'
  | 'bus'
  | 'clock'
  | 'usb'
  | 'control'
  | 'debug'
  | 'sense'
  | 'unconnected'
  | 'signal';

export interface NetMeta {
  category: NetCategory;
  badge: string;
  friendly: string;
  description: string;
  keywords: string[];
}

export interface NetGuideItem {
  id: string;
  codes: string;
  title: string;
  badge: string;
  role: string;
  searchTerm: string;
}

export const NET_SIGNAL_GUIDE: readonly NetGuideItem[] = [
  {
    id: 'net-gnd',
    codes: 'GND · AGND · DGND · VSS',
    title: 'Ground Reference',
    badge: 'Ground',
    role: 'The 0 V common return path shared across the circuit board.',
    searchTerm: 'ground',
  },
  {
    id: 'net-rails',
    codes: '+3V3 · +5V · +1V8 · PP3V3…',
    title: 'Regulated Power Rails',
    badge: 'Power',
    role: 'Fixed DC supply voltages (+3.3 V, +5 V, +1.8 V, etc.) powering microchips and sensors.',
    searchTerm: 'power',
  },
  {
    id: 'net-vin',
    codes: 'VIN · VBUS · VBAT · VCC / VDD',
    title: 'Main Supply & Battery Inputs',
    badge: 'Power',
    role: 'Incoming power from a barrel jack/DC input (VIN), USB port (VBUS), or battery (VBAT).',
    searchTerm: 'power',
  },
  {
    id: 'net-i2c',
    codes: 'SDA · SCL · SMBUS',
    title: 'I²C Data & Clock Bus',
    badge: 'I2C Bus',
    role: 'Two-wire communication bus where SDA carries data bits and SCL carries clock timing.',
    searchTerm: 'i2c',
  },
  {
    id: 'net-usb',
    codes: 'USB_DP / D+ · USB_DM / D− · CC1/2',
    title: 'USB Data & USB-C Config',
    badge: 'USB',
    role: 'Balanced +/− data pair carrying USB signals, plus CC wires that negotiate USB-C power.',
    searchTerm: 'usb',
  },
  {
    id: 'net-clk',
    codes: 'CLK · SCK · MCLK · XTAL',
    title: 'Clock Timing Signals',
    badge: 'Clock',
    role: 'Steady electrical pulse keeping processors, memory, and buses synchronized.',
    searchTerm: 'clock',
  },
  {
    id: 'net-reset',
    codes: 'RESET · RST · NRST',
    title: 'System Reset Line',
    badge: 'Control',
    role: 'Restarts a microchip back to a clean startup state when pulled active (often active-low NRST).',
    searchTerm: 'reset',
  },
  {
    id: 'net-boot',
    codes: 'BOOT0 · BOOT1',
    title: 'Boot Mode Selector',
    badge: 'Control',
    role: 'Configures whether a microcontroller runs its normal app or enters firmware-flashing mode.',
    searchTerm: 'boot',
  },
  {
    id: 'net-pwm',
    codes: 'PWM · EN · INT / IRQ',
    title: 'Control, Dimming & Interrupts',
    badge: 'Control',
    role: 'Switches rails on/off (EN), dims LEDs via fast pulses (PWM), or alerts the CPU (INT/IRQ).',
    searchTerm: 'control',
  },
  {
    id: 'net-uart-spi',
    codes: 'TX / RX · MOSI / MISO / CS',
    title: 'Serial (UART & SPI) Buses',
    badge: 'Bus',
    role: 'Point-to-point serial telemetry (TX/RX) or fast chip-to-memory/display data (SPI).',
    searchTerm: 'serial',
  },
  {
    id: 'net-debug',
    codes: 'SWDIO · SWCLK · JTAG',
    title: 'Programming & Debug Port',
    badge: 'Debug',
    role: 'Factory and developer header lines used to flash firmware or inspect live CPU state.',
    searchTerm: 'debug',
  },
  {
    id: 'net-sense',
    codes: 'ADC · TEMP · NTC · VSENSE',
    title: 'Analog Sensor & Feedback',
    badge: 'Sense',
    role: 'Continuously varying voltage reporting temperature, current draw, or battery level.',
    searchTerm: 'sense',
  },
];

function extractVoltageLabel(upper: string): string | null {
  const m = upper.match(/(?:^|[+_P])(\d{1,2})V(\d{1,2})?(?:$|[_A-Z])/);
  if (!m) return null;
  const whole = m[1];
  const frac = m[2];
  if (!frac && upper.includes('VIN')) return null;
  return frac ? `${whole}.${frac} V` : `${whole} V`;
}

export function describeNet(netName: string): NetMeta | null {
  const raw = netName.trim();
  const upper = raw.toUpperCase();
  if (!upper || upper === 'NC' || upper === 'N.C.' || upper === 'UNCONNECTED' || upper === 'NO_CONNECT' || upper === 'DNC') {
    return {
      category: 'unconnected',
      badge: 'Unconnected',
      friendly: 'No connect',
      description: 'Unused mechanical or spare pad with no electrical signal routed to it.',
      keywords: ['unconnected', 'nc', 'no connection', 'unused', 'floating'],
    };
  }

  const tokens = upper.split(/[^A-Z0-9+-]+/).filter(Boolean);
  const hasToken = (...candidates: string[]) => candidates.some((c) => tokens.includes(c));

  if (
    hasToken('GND', 'GROUND', 'AGND', 'DGND', 'PGND', 'SGND', 'VSS', 'AVSS', 'DVSS', 'EARTH') ||
    upper.startsWith('GND_') ||
    upper.endsWith('_GND')
  ) {
    return {
      category: 'ground',
      badge: 'Ground',
      friendly: '0 V ref',
      description: 'Common 0 V electrical return reference shared across the board.',
      keywords: ['ground', 'gnd', '0v', 'return', 'reference', 'vss'],
    };
  }

  if (hasToken('SDA', 'SMBDATA') || upper.endsWith('_SDA') || upper.includes('I2C_SDA')) {
    return {
      category: 'bus',
      badge: 'I2C Bus',
      friendly: 'I2C data',
      description: 'Two-wire I²C serial data line — exchanges configuration and sensor data alongside SCL.',
      keywords: ['i2c', 'sda', 'data', 'bus', 'serial', 'smbus'],
    };
  }

  if (hasToken('SCL', 'SMBCLK') || upper.endsWith('_SCL') || upper.includes('I2C_SCL')) {
    return {
      category: 'bus',
      badge: 'I2C Bus',
      friendly: 'I2C clock',
      description: 'Two-wire I²C serial clock line — keeps data timing in sync on SDA.',
      keywords: ['i2c', 'scl', 'clock', 'bus', 'serial', 'smbus'],
    };
  }

  if (
    upper.includes('USB_DP') ||
    upper.includes('USB_D+') ||
    upper.includes('USBD_P') ||
    hasToken('USB_P', 'D+', 'DP')
  ) {
    return {
      category: 'usb',
      badge: 'USB',
      friendly: 'USB Data +',
      description: 'Positive wire of a USB differential data pair (works alongside USB_DM / D−).',
      keywords: ['usb', 'data', 'differential', 'dp', 'd+', 'plus'],
    };
  }

  if (
    upper.includes('USB_DM') ||
    upper.includes('USB_D-') ||
    upper.includes('USBD_N') ||
    hasToken('USB_N', 'D-', 'DM')
  ) {
    return {
      category: 'usb',
      badge: 'USB',
      friendly: 'USB Data −',
      description: 'Negative wire of a USB differential data pair (paired with USB_DP / D+).',
      keywords: ['usb', 'data', 'differential', 'dm', 'd-', 'minus'],
    };
  }

  if (hasToken('CC1', 'CC2', 'USB_CC1', 'USB_CC2') || upper.includes('USB_CC')) {
    return {
      category: 'usb',
      badge: 'USB-C',
      friendly: 'Config ch',
      description: 'USB-C Configuration Channel wire used to detect plug orientation and negotiate power.',
      keywords: ['usb', 'usbc', 'usb-c', 'cc', 'power delivery', 'pd'],
    };
  }

  if (hasToken('VIN', 'V_IN', 'DCIN', 'DC_IN', 'ACIN', 'PWR_IN') || upper.startsWith('VIN_')) {
    return {
      category: 'power',
      badge: 'Power',
      friendly: 'Voltage in',
      description: 'Main incoming DC power supply rail before on-board voltage regulators.',
      keywords: ['power', 'voltage', 'input', 'supply', 'vin', 'dc'],
    };
  }

  if (hasToken('VBUS', 'USB_VBUS', 'V_BUS')) {
    return {
      category: 'power',
      badge: 'Power',
      friendly: 'USB power',
      description: 'Power wire fed from the USB port (5 V default or higher negotiated USB-PD voltage).',
      keywords: ['power', 'usb', 'vbus', '5v', 'supply'],
    };
  }

  if (hasToken('VBAT', 'VBATT', 'BATT+') || upper.startsWith('PPVBAT') || upper.includes('BATT_V')) {
    return {
      category: 'power',
      badge: 'Power',
      friendly: 'Battery rail',
      description: 'Direct battery voltage rail powering charging and main system power circuits.',
      keywords: ['power', 'battery', 'vbat', 'supply'],
    };
  }

  const voltLabel = extractVoltageLabel(upper);
  if (
    voltLabel ||
    hasToken('VCC', 'VDD', 'VDDQ', 'VCORE', 'AVDD', 'DVDD', 'PVDD', 'VOUT', 'VREG', 'PWR') ||
    upper.startsWith('PPBUS') ||
    upper.startsWith('PP3V') ||
    upper.startsWith('PP5V') ||
    upper.startsWith('PP1V')
  ) {
    return {
      category: 'power',
      badge: 'Power',
      friendly: voltLabel ? `${voltLabel} rail` : 'Power rail',
      description: voltLabel
        ? `Regulated ${voltLabel} DC power supply rail feeding connected chips and logic.`
        : 'Regulated DC voltage supply rail powering connected components.',
      keywords: ['power', 'rail', 'voltage', 'supply', 'vcc', 'vdd', ...(voltLabel ? [voltLabel.toLowerCase()] : [])],
    };
  }

  if (hasToken('BOOT0', 'BOOT1', 'BOOT') || upper.startsWith('BOOT_')) {
    return {
      category: 'control',
      badge: 'Control',
      friendly: 'Boot mode',
      description: 'Startup configuration pin selecting normal app execution vs. bootloader firmware flashing.',
      keywords: ['boot', 'bootloader', 'flash', 'control', 'firmware', 'dfu'],
    };
  }

  if (hasToken('RESET', 'RST', 'NRST', 'SYS_RST', 'RESET_N') || upper.endsWith('_RST') || upper.endsWith('_RESET')) {
    return {
      category: 'control',
      badge: 'Control',
      friendly: 'Reset pin',
      description: 'Control signal that restarts a chip back to its clean initial state.',
      keywords: ['reset', 'rst', 'restart', 'control'],
    };
  }

  if (hasToken('PWM') || upper.includes('PWM')) {
    return {
      category: 'control',
      badge: 'Control',
      friendly: 'PWM signal',
      description: 'Pulse-Width Modulation — rapidly switches voltage ON/OFF to dim LEDs, drive fans, or control power.',
      keywords: ['pwm', 'pulse', 'dim', 'led', 'control', 'driver'],
    };
  }

  if (
    hasToken('CLK', 'SCK', 'SCLK', 'MCLK', 'BCLK', 'SYSCLK', 'XTAL1', 'XTAL2') ||
    upper.endsWith('_CLK') ||
    upper.startsWith('CLK_')
  ) {
    return {
      category: 'clock',
      badge: 'Clock',
      friendly: 'Clock timing',
      description: 'Steady square-wave timing signal keeping digital chips synchronized.',
      keywords: ['clock', 'clk', 'timing', 'oscillator', 'sck', 'sync'],
    };
  }

  if (hasToken('TX', 'TXD', 'UART_TX') || upper.endsWith('_TX') || upper.startsWith('TX_')) {
    return {
      category: 'bus',
      badge: 'UART',
      friendly: 'Serial TX',
      description: 'Asynchronous serial (UART) transmit wire sending outgoing data or debug logs.',
      keywords: ['uart', 'serial', 'transmit', 'tx', 'bus'],
    };
  }

  if (hasToken('RX', 'RXD', 'UART_RX') || upper.endsWith('_RX') || upper.startsWith('RX_')) {
    return {
      category: 'bus',
      badge: 'UART',
      friendly: 'Serial RX',
      description: 'Asynchronous serial (UART) receive wire receiving incoming data or commands.',
      keywords: ['uart', 'serial', 'receive', 'rx', 'bus'],
    };
  }

  if (
    hasToken('MOSI', 'MISO', 'NSS', 'SPI_CS') ||
    upper.includes('MOSI') ||
    upper.includes('MISO') ||
    upper.endsWith('_CS')
  ) {
    return {
      category: 'bus',
      badge: 'SPI Bus',
      friendly: 'SPI bus',
      description: 'High-speed SPI bus signal connecting a processor to flash memory, displays, or sensors.',
      keywords: ['spi', 'serial', 'bus', 'mosi', 'miso', 'flash'],
    };
  }

  if (hasToken('SWDIO', 'SWCLK', 'SWO', 'TCK', 'TMS', 'TDI', 'TDO', 'JTAG') || upper.includes('JTAG') || upper.includes('SWD')) {
    return {
      category: 'debug',
      badge: 'Debug',
      friendly: 'Debug port',
      description: 'Hardware debugging & firmware programming line (SWD / JTAG).',
      keywords: ['debug', 'jtag', 'swd', 'flash', 'program'],
    };
  }

  if (hasToken('EN', 'ENABLE', 'SHDN', 'CE') || upper.endsWith('_EN') || upper.startsWith('EN_')) {
    return {
      category: 'control',
      badge: 'Control',
      friendly: 'Enable pin',
      description: 'Logic control signal that switches a regulator or subsystem ON or OFF.',
      keywords: ['enable', 'en', 'power on', 'control', 'shutdown'],
    };
  }

  if (hasToken('INT', 'IRQ', 'NIRQ', 'ALERT') || upper.endsWith('_INT') || upper.endsWith('_IRQ')) {
    return {
      category: 'control',
      badge: 'Control',
      friendly: 'Interrupt',
      description: 'Alert line letting a peripheral wake or notify the processor immediately.',
      keywords: ['interrupt', 'irq', 'int', 'alert', 'control'],
    };
  }

  if (hasToken('LED') || upper.includes('_LED') || upper.startsWith('LED_')) {
    return {
      category: 'control',
      badge: 'Indicator',
      friendly: 'LED drive',
      description: 'Signal trace controlling an indicator Light-Emitting Diode.',
      keywords: ['led', 'light', 'indicator', 'status'],
    };
  }

  if (upper.startsWith('ADC') || upper.includes('TEMP') || upper.includes('NTC') || upper.includes('VSENSE') || upper.includes('ISENSE')) {
    return {
      category: 'sense',
      badge: 'Sense',
      friendly: 'Sensor / analog',
      description: 'Analog feedback line reporting voltage, current, or temperature to a controller.',
      keywords: ['sense', 'sensor', 'analog', 'adc', 'temperature', 'ntc'],
    };
  }

  if (/^(?:N\$?\d+|NET_?\d+)$/.test(upper)) {
    return {
      category: 'signal',
      badge: 'Signal',
      friendly: 'Board trace',
      description: 'Auto-numbered internal copper trace connecting component pins together.',
      keywords: ['signal', 'net', 'trace'],
    };
  }

  return null;
}

export function getPackageMeta(kind: PackageKind): PackageMeta {
  return PACKAGE_META[kind] ?? PACKAGE_META.generic;
}

export function formatMountType(type: 'smd' | 'through' | 'bga'): string {
  if (type === 'through') return 'Through-hole';
  if (type === 'bga') return 'Ball grid (BGA)';
  return 'Surface-mount (SMD)';
}

export function describeSpecialNet(netName: string): string | null {
  const meta = describeNet(netName);
  if (!meta) return null;
  if (meta.category === 'ground') return 'Ground (0 V reference)';
  if (meta.category === 'unconnected') return 'Not connected (unused pad)';
  return `${meta.badge} · ${meta.friendly}`;
}
