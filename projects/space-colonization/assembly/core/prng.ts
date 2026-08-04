const PHILOX_M0: u64 = 0xD2511F53;
const PHILOX_M1: u64 = 0xCD9E8D57;
const PHILOX_W0: u32 = 0x9E3779B9;
const PHILOX_W1: u32 = 0xBB67AE85;

/** Stateless Philox4x32-10 stream suitable for order-independent generation. */
export function philoxWord(seed: u64, sectorHi: u32, sectorLo: u32, ordinal: u32, channel: u32): u32 {
  let c0: u32 = sectorLo;
  let c1: u32 = ordinal;
  let c2: u32 = sectorHi;
  let c3: u32 = channel;
  let k0: u32 = <u32>seed;
  let k1: u32 = <u32>(seed >> 32);
  for (let round = 0; round < 10; round++) {
    const p0: u64 = <u64>c0 * PHILOX_M0;
    const p1: u64 = <u64>c2 * PHILOX_M1;
    const next0: u32 = <u32>(p1 >> 32) ^ c1 ^ k0;
    const next1: u32 = <u32>p1;
    const next2: u32 = <u32>(p0 >> 32) ^ c3 ^ k1;
    const next3: u32 = <u32>p0;
    c0 = next0;
    c1 = next1;
    c2 = next2;
    c3 = next3;
    k0 += PHILOX_W0;
    k1 += PHILOX_W1;
  }
  return c0;
}

export function philoxUnit(seed: u64, sectorHi: u32, sectorLo: u32, ordinal: u32, channel: u32): f64 {
  return <f64>philoxWord(seed, sectorHi, sectorLo, ordinal, channel) / 4294967296.0;
}
