export function decodeUint(hex) { if (!/^0x[0-9a-fA-F]+$/.test(hex)) throw new Error('bad uint hex'); return BigInt(hex); }
export function decodeAddressWord(word) { return '0x'+word.replace(/^0x/,'').slice(-40); }
export function storageWordAddress(word) { const h=word.replace(/^0x/,'').padStart(64,'0'); return /^0+$/.test(h) ? null : '0x'+h.slice(-40); }
export function decodeAbiString(hex) {
  const h=hex.replace(/^0x/,''); if (h.length<64) return '';
  const first=BigInt('0x'+h.slice(0,64));
  if (first === 32n && h.length>=128) {
    const len=Number(BigInt('0x'+h.slice(64,128)));
    return Buffer.from(h.slice(128,128+len*2),'hex').toString('utf8');
  }
  return Buffer.from(h.slice(0,64).replace(/00+$/,''),'hex').toString('utf8');
}
export function decodeInformationTuple(hex) {
  const h=hex.replace(/^0x/,''); if (h.length<192) throw new Error('information() result too short');
  const stringOffset=Number(BigInt('0x'+h.slice(0,64)));
  const domainSeparator='0x'+h.slice(64,128);
  const conduitController='0x'+h.slice(128+24,192);
  const pos=stringOffset*2;
  const len=Number(BigInt('0x'+h.slice(pos,pos+64)));
  const version=Buffer.from(h.slice(pos+64,pos+64+len*2),'hex').toString('utf8');
  return {version,domainSeparator,conduitController};
}
