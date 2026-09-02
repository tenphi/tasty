/**
 * Network profiles, in the units CDP wants (bytes/second, milliseconds).
 *
 * These mirror Chrome DevTools' presets, including the throughput discount it
 * applies so the emulated link behaves like the advertised one rather than its
 * theoretical peak. They are written out rather than imported so a DevTools
 * change cannot silently move the benchmark's baseline.
 */
const Mbps = (n) => (n * 1000 * 1000) / 8;
const Kbps = (n) => (n * 1000) / 8;

export const NETWORK_PROFILES = {
  none: null,
  'fast-4g': {
    label: 'Fast 4G',
    download: Mbps(9),
    upload: Mbps(1.5),
    latency: 170,
  },
  'slow-4g': {
    label: 'Slow 4G',
    download: Mbps(1.6),
    upload: Kbps(750),
    latency: 562.5,
  },
  'slow-3g': {
    label: 'Slow 3G',
    download: Kbps(400),
    upload: Kbps(400),
    latency: 2000,
  },
};

export const CPU_RATES = [1, 4];
