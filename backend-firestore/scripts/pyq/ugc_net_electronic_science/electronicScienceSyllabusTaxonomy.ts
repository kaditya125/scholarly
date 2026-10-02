export interface SyllabusUnit {
  unitNumber: number;
  unitCode: string;
  unitName: string;
  topics: string[];
}

export const UGC_NET_ELECTRONIC_SCIENCE_TAXONOMY: SyllabusUnit[] = [
  {
    unitNumber: 1,
    unitCode: 'UNIT_1_SEMICONDUCTORS_AND_SOLID_STATE_DEVICES',
    unitName: 'Semiconductors and Solid State Devices',
    topics: [
      'Introduction to Semiconductor: Energy bands in solids, concept of effective mass, density of states, Fermi levels',
      'PN Junction: Diode equation, equivalent circuit, Breakdown in diodes, Zener diode, Tunnel diode',
      'Metal Semiconductor Junction: Ohmic and Schottky contacts, barrier potential',
      'Field Effect Transistors: Characteristics and equivalent circuits of JFET, MOSFET',
      'Low Dimensional Semiconductor Devices: Quantum wells, quantum wires, quantum dots',
      'High Electron Mobility Transistor (HEMT)',
      'Optoelectronic Devices: Solar cells (I-V characteristics, fill factor, efficiency), LED, LCD, flexible displays',
      'Emerging Materials for Future Devices: Graphene, Carbon Nanotubes (CNT), ZnO, SiC'
    ]
  },
  {
    unitNumber: 2,
    unitCode: 'UNIT_2_IC_FABRICATION_AND_VLSI_TECHNOLOGY',
    unitName: 'IC Fabrication and VLSI Technology',
    topics: [
      'IC Fabrication Processes: Crystal growth, epitaxy, oxidation, lithography, doping, etching, isolation methods, metallization, bonding',
      'Thin Film Characterization Techniques: XRD, TEM, SEM, EDX, thin film active and passive devices',
      'MOS Technology and VLSI: Scaling of MOS devices, NMOS and CMOS structures and fabrication',
      'MOS Characteristics: Threshold voltage, NMOS and CMOS inverters, switching speed',
      'Charge-Coupled Device (CCD): Structure, charge storage, charge transfer mechanisms',
      'VLSI Design Fundamentals: Stick diagrams, layout design rules, physical design'
    ]
  },
  {
    unitNumber: 3,
    unitCode: 'UNIT_3_NETWORK_ANALYSIS_AND_SIGNALS_SYSTEMS',
    unitName: 'Network Analysis, Signals and Systems, and DSP',
    topics: [
      'Network Theorems: Superposition, Thevenin, Norton, Maximum Power Transfer Theorem',
      'Circuit Analysis: Network elements, network graphs, nodal and mesh analysis',
      'Transforms in Circuit Analysis: Laplace transform, Fourier transform, Z-transform',
      'Network Responses and Parameters: Time and frequency domain response, passive filters, two-port network parameters (Z, Y, ABCD, h parameters), transfer functions',
      'State Variable Method, AC circuit analysis, transient analysis, poles and zeros, Bode plots',
      'Continuous-Time Signals and Systems: Fourier series, sampling theorem and applications',
      'Discrete-Time Signals: Discrete Fourier Transform (DFT), Fast Fourier Transform (FFT)',
      'Digital Signal Processing: Basic concepts, digital filter design (IIR, FIR filters)'
    ]
  },
  {
    unitNumber: 4,
    unitCode: 'UNIT_4_ANALOG_AND_OPERATIONAL_AMPLIFIER_CIRCUITS',
    unitName: 'Analog and Operational Amplifier Circuits',
    topics: [
      'Power Supplies: Rectifiers, voltage regulated ICs, regulated power supply design',
      'Transistor Biasing: BJT and FET biasing, operating point, bias stability',
      'Amplifiers: Classification of amplifiers, small signal analysis, frequency response',
      'Feedback and Oscillators: Concept of feedback, Hartley, Colpitts, Phase Shift oscillators',
      'Operational Amplifiers (Op-Amp): Characteristics, computational applications, comparators, Schmitt trigger',
      'Instrumentation Amplifiers, wave shaping circuits, Phase Locked Loops (PLL), active filters, multivibrators',
      'Converters: Voltage to frequency converters (V/F), Frequency to voltage converters (F/V)'
    ]
  },
  {
    unitNumber: 5,
    unitCode: 'UNIT_5_DIGITAL_CIRCUITS_LOGIC_DESIGN_AND_HDL',
    unitName: 'Digital Circuits, Logic Design and HDL',
    topics: [
      'Logic Fundamentals: Logic families (TTL, CMOS, ECL), logic gates, Boolean algebra, minimization techniques (K-Map, Quine-McCluskey)',
      'Combinational Circuits: Adders, subtractors, multiplexers, demultiplexers, encoders, decoders',
      'Programmable Logic Devices: PLD, CPLD, FPGA architecture',
      'Sequential Circuits: Latches, flip-flops, memories, shift registers, counters (Ring, Ripple, Synchronous, Asynchronous)',
      'Converters: A/D and D/A converters (R-2R ladder, successive approximation, dual slope)',
      'State Machines: Fundamental mode state machines, state variables, state table, state diagrams',
      'Hardware Description Language: Analysis and design of digital circuits using HDL (VHDL/Verilog)'
    ]
  },
  {
    unitNumber: 6,
    unitCode: 'UNIT_6_MICROPROCESSORS_AND_MICROCONTROLLERS',
    unitName: 'Microprocessors and Microcontrollers (8086 & 8051)',
    topics: [
      'Microprocessor 8086: Architecture, addressing modes, instruction set, interrupts, assembly programming, memory and I/O interfacing',
      'Microcontroller 8051 for Embedded Systems: Architecture, register set, addressing modes',
      'Instruction Set of 8051: Data transfer, arithmetic, logic, bit-level, byte-level control transfer instructions',
      '8051 Assembly Programming: Stack operations, subroutines, interrupts, timer/counter programming, serial communication',
      'Interfacing with 8051: RS232, LED/LCD displays, matrix keyboard, stepper motor'
    ]
  },
  {
    unitNumber: 7,
    unitCode: 'UNIT_7_ELECTROMAGNETICS_MICROWAVE_AND_RADAR',
    unitName: 'Electromagnetics, Transmission Lines, Microwave and Radar',
    topics: [
      'Electrostatics and Magnetostatics: Vector calculus, Gauss law, Laplace and Poisson equations, Biot-Savart law, Ampere law, electromagnetic induction',
      'Maxwell Equations: Wave equations, plane wave propagation in free space, dielectrics, conductors, Poynting theorem',
      'Wave Phenomena: Reflection, refraction, polarization, interference, coherence, diffraction',
      'Transmission Lines and Waveguides: Line equations, characteristic impedance, reflections, VSWR, rectangular waveguides',
      'Antennas: Retarded potential, Hertzian dipole, half-wave antenna, radiation pattern, radiation intensity, gain, effective area, Friis transmission equation',
      'Microwave Devices and Sources: Reflex Klystron, Magnetron, TWT, Gunn diode, IMPATT diode, PIN diode, crystal detector',
      'Radar: Block diagram, frequencies and power, radar range equation'
    ]
  },
  {
    unitNumber: 8,
    unitCode: 'UNIT_8_ANALOG_DIGITAL_AND_OPTICAL_COMMUNICATION',
    unitName: 'Analog, Digital, Optical Communication and IoT',
    topics: [
      'Analog Communication: AM, FM, PM modulation and demodulation, superheterodyne receiver',
      'Noise Analysis: Random signals, noise, noise temperature, noise figure',
      'Information Theory: Entropy, channel capacity, error detection and correction codes',
      'Digital Communication: PCM, ASK, FSK, PSK, BPSK, QPSK, QAM modulation techniques',
      'Multiplexing and Multiple Access: TDM, FDM, TDMA, FDMA, CDMA',
      'Data Communications: Modems, codes, mobile communication principles, satellite communication',
      'Optical Communication: Optical sources (LED, semiconductor Lasers), detectors (PIN, APD), optical fibers (attenuation, dispersion, bandwidth, WDM)',
      'Internet of Things (IoT): Fundamentals of IoT for communication protocols and architectures'
    ]
  },
  {
    unitNumber: 9,
    unitCode: 'UNIT_9_POWER_ELECTRONICS_AND_CONTROL_SYSTEMS',
    unitName: 'Power Electronics and Control Systems',
    topics: [
      'Power Semiconductor Devices: SCR, DIAC, TRIAC, power transistors, protection against overvoltage and overcurrent',
      'Thyristor Triggering: dv/dt and di/dt, single pulse and pulse train triggering',
      'Motors and Power Supplies: AC and DC motor construction and speed control, Switched Mode Power Supply (SMPS), UPS',
      'Control Systems: Open loop and closed loop systems, block diagram reduction, transfer function, signal flow graphs',
      'Stability Analysis: Routh-Hurwitz criterion, Nyquist plot, root locus',
      'Controllers: On-off controller, Proportional (P), PI, PD, and PID controllers'
    ]
  },
  {
    unitNumber: 10,
    unitCode: 'UNIT_10_TRANSDUCERS_INSTRUMENTATION_AND_BIOMEDICAL',
    unitName: 'Transducers, Electronic Instrumentation and Biomedical Electronics',
    topics: [
      'Transducers: Resistance, inductance, capacitance, piezoelectric, thermoelectric, Hall effect, photoelectric transducers',
      'Physical Measurements: Displacement, velocity, acceleration, force, torque, strain, temperature, pressure, flow, humidity, pH',
      'Measuring Instruments: Measurement of R, L, C, bridges, potentiometers, voltage, current, power, energy, frequency/time',
      'Electronic Test Equipment: Digital multimeters, CRO, Digital Storage Oscilloscope (DSO), Spectrum Analyzer',
      'Biomedical Instruments: ECG, EEG, blood pressure measurements',
      'MEMS and Sensors: MEMS devices, applications, sensors for IoT applications'
    ]
  }
];

export function mapElectronicScienceTopicToUnit(text: string): { unitNumber: number; unitName: string } {
  const lower = text.toLowerCase();

  // Unit 6: Microprocessor & Microcontroller
  if (
    lower.includes('8086') || lower.includes('8051') || lower.includes('microprocessor') ||
    lower.includes('microcontroller') || lower.includes('addressing mode') || lower.includes('instruction set') ||
    lower.includes('stepper motor') || lower.includes('rs232') || lower.includes('interrupt') ||
    lower.includes('subroutine') || lower.includes('timer/counter')
  ) {
    return { unitNumber: 6, unitName: 'Microprocessors and Microcontrollers (8086 & 8051)' };
  }

  // Unit 7: Electromagnetics, Microwave, Antennas & Radar
  if (
    lower.includes('maxwell') || lower.includes('waveguide') || lower.includes('antenna') ||
    lower.includes('poynting') || lower.includes('radar') || lower.includes('klystron') ||
    lower.includes('magnetron') || lower.includes('gunn diode') || lower.includes('impatt') ||
    lower.includes('vswr') || lower.includes('transmission line') || lower.includes('dipole') ||
    lower.includes('friis') || lower.includes('hertzian') || lower.includes('twt')
  ) {
    return { unitNumber: 7, unitName: 'Electromagnetics, Transmission Lines, Microwave and Radar' };
  }

  // Unit 8: Communication & Optical Fiber
  if (
    lower.includes('modulation') || lower.includes('demodulation') || lower.includes('superheterodyne') ||
    lower.includes('pcm') || lower.includes('qam') || lower.includes('psk') || lower.includes('fsk') ||
    lower.includes('optical fiber') || lower.includes('laser') || lower.includes('multiplexing') ||
    lower.includes('tdm') || lower.includes('fdm') || lower.includes('apds') || lower.includes('noise figure') ||
    lower.includes('channel capacity') || lower.includes('satellite communication') || lower.includes('iot')
  ) {
    return { unitNumber: 8, unitName: 'Analog, Digital, Optical Communication and IoT' };
  }

  // Unit 9: Power Electronics & Control Systems
  if (
    lower.includes('scr') || lower.includes('triac') || lower.includes('diac') ||
    lower.includes('thyristor') || lower.includes('smps') || lower.includes('ups') ||
    lower.includes('nyquist') || lower.includes('routh-hurwitz') || lower.includes('routh hurwitz') ||
    lower.includes('control system') || lower.includes('pid controller') || lower.includes('signal flow') ||
    lower.includes('transfer function') || lower.includes('speed control') || lower.includes('dc motor')
  ) {
    return { unitNumber: 9, unitName: 'Power Electronics and Control Systems' };
  }

  // Unit 10: Transducers & Electronic Instrumentation
  if (
    lower.includes('transducer') || lower.includes('piezoelectric') || lower.includes('strain gauge') ||
    lower.includes('hall effect') || lower.includes('thermocouple') || lower.includes('cro') ||
    lower.includes('oscilloscope') || lower.includes('spectrum analyzer') || lower.includes('multimeter') ||
    lower.includes('ecg') || lower.includes('eeg') || lower.includes('biomedical') ||
    lower.includes('bridge') || lower.includes('potentiometer') || lower.includes('mems')
  ) {
    return { unitNumber: 10, unitName: 'Transducers, Electronic Instrumentation and Biomedical Electronics' };
  }

  // Unit 5: Digital Circuits & Logic Design
  if (
    lower.includes('logic gate') || lower.includes('boolean') || lower.includes('k-map') ||
    lower.includes('karnaugh') || lower.includes('flip-flop') || lower.includes('flip flop') ||
    lower.includes('counter') || lower.includes('shift register') || lower.includes('multiplexer') ||
    lower.includes('demultiplexer') || lower.includes('adc') || lower.includes('dac') ||
    lower.includes('fpga') || lower.includes('cpld') || lower.includes('vhdl') || lower.includes('verilog') ||
    lower.includes('state machine') || lower.includes('state diagram')
  ) {
    return { unitNumber: 5, unitName: 'Digital Circuits, Logic Design and HDL' };
  }

  // Unit 4: Analog & Op-Amp Circuits
  if (
    lower.includes('op-amp') || lower.includes('opamp') || lower.includes('operational amplifier') ||
    lower.includes('rectifier') || lower.includes('schmitt trigger') || lower.includes('hartley') ||
    lower.includes('colpitt') || lower.includes('oscillator') || lower.includes('bipolar junction') ||
    lower.includes('bjt') || lower.includes('amplifier') || lower.includes('active filter') ||
    lower.includes('pll') || lower.includes('multivibrator')
  ) {
    return { unitNumber: 4, unitName: 'Analog and Operational Amplifier Circuits' };
  }

  // Unit 3: Network Analysis & DSP
  if (
    lower.includes('thevenin') || lower.includes('norton') || lower.includes('superposition') ||
    lower.includes('maximum power') || lower.includes('two-port') || lower.includes('bode plot') ||
    lower.includes('laplace transform') || lower.includes('z-transform') || lower.includes('fourier') ||
    lower.includes('fft') || lower.includes('dft') || lower.includes('fir filter') || lower.includes('iir filter') ||
    lower.includes('sampling theorem') || lower.includes('mesh analysis') || lower.includes('nodal analysis')
  ) {
    return { unitNumber: 3, unitName: 'Network Analysis, Signals and Systems, and DSP' };
  }

  // Unit 2: IC Fabrication & VLSI
  if (
    lower.includes('fabrication') || lower.includes('epitaxy') || lower.includes('lithography') ||
    lower.includes('etching') || lower.includes('xrd') || lower.includes('sem') || lower.includes('tem') ||
    lower.includes('vlsi') || lower.includes('cmos') || lower.includes('nmos') || lower.includes('stick diagram') ||
    lower.includes('threshold voltage') || lower.includes('charge-coupled') || lower.includes('ccd')
  ) {
    return { unitNumber: 2, unitName: 'IC Fabrication and VLSI Technology' };
  }

  // Unit 1: Semiconductors & Solid State Devices (Default)
  return { unitNumber: 1, unitName: 'Semiconductors and Solid State Devices' };
}
