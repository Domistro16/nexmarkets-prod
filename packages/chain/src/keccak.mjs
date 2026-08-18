// Dependency-free Keccak-256 for release-gate hashing. Uses BigInt for clarity, not hot-path performance.
const MASK = (1n << 64n) - 1n;
const RC = [
  0x0000000000000001n,0x0000000000008082n,0x800000000000808an,0x8000000080008000n,
  0x000000000000808bn,0x0000000080000001n,0x8000000080008081n,0x8000000000008009n,
  0x000000000000008an,0x0000000000000088n,0x0000000080008009n,0x000000008000000an,
  0x000000008000808bn,0x800000000000008bn,0x8000000000008089n,0x8000000000008003n,
  0x8000000000008002n,0x8000000000000080n,0x000000000000800an,0x800000008000000an,
  0x8000000080008081n,0x8000000000008080n,0x0000000080000001n,0x8000000080008008n
];
const ROT = [
  [0,36,3,41,18],[1,44,10,45,2],[62,6,43,15,61],[28,55,25,21,56],[27,20,39,8,14]
];
const rol = (x,n) => n === 0 ? x : ((x << BigInt(n)) | (x >> BigInt(64-n))) & MASK;
function round(a, rc) {
  const c = Array(5).fill(0n), d = Array(5).fill(0n), b = Array.from({length:5},()=>Array(5).fill(0n));
  for (let x=0;x<5;x++) for (let y=0;y<5;y++) c[x] ^= a[x][y];
  for (let x=0;x<5;x++) d[x] = c[(x+4)%5] ^ rol(c[(x+1)%5],1);
  for (let x=0;x<5;x++) for (let y=0;y<5;y++) a[x][y] ^= d[x];
  for (let x=0;x<5;x++) for (let y=0;y<5;y++) b[y][(2*x+3*y)%5] = rol(a[x][y], ROT[x][y]);
  for (let x=0;x<5;x++) for (let y=0;y<5;y++) a[x][y] = b[x][y] ^ ((~b[(x+1)%5][y]) & b[(x+2)%5][y]);
  a[0][0] ^= rc;
}
export function keccak256Bytes(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  const rate = 136;
  const padLen = rate - (bytes.length % rate);
  const padded = new Uint8Array(bytes.length + padLen);
  padded.set(bytes); padded[bytes.length] = 0x01; padded[padded.length-1] |= 0x80;
  const a = Array.from({length:5},()=>Array(5).fill(0n));
  for (let off=0; off<padded.length; off+=rate) {
    for (let i=0;i<rate/8;i++) {
      let lane=0n; for (let j=0;j<8;j++) lane |= BigInt(padded[off+i*8+j]) << BigInt(8*j);
      const x=i%5, y=Math.floor(i/5); a[x][y] ^= lane;
    }
    for (const rc of RC) round(a, rc);
  }
  const out = new Uint8Array(32); let k=0;
  for (let i=0;k<32;i++) {
    const x=i%5,y=Math.floor(i/5),lane=a[x][y];
    for (let j=0;j<8 && k<32;j++,k++) out[k]=Number((lane >> BigInt(8*j)) & 0xffn);
  }
  return out;
}
export function keccak256Hex(hex) {
  if (!/^0x[0-9a-fA-F]*$/.test(hex) || (hex.length-2)%2) throw new Error('Invalid hex');
  return '0x'+Buffer.from(keccak256Bytes(Buffer.from(hex.slice(2),'hex'))).toString('hex');
}
export function keccak256Text(text) { return '0x'+Buffer.from(keccak256Bytes(Buffer.from(text,'utf8'))).toString('hex'); }
export function selector(signature) { return keccak256Text(signature).slice(0,10); }
