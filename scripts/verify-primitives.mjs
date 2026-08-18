import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NETWORKS, PRIMITIVES } from '../packages/config/src/networks.mjs';
import { validateDeploymentManifest } from '../packages/config/src/deployment-manifest.mjs';
import { JsonRpcClient, keccak256Hex, keccak256Text, selector, decodeAbiString, decodeInformationTuple, storageWordAddress } from '../packages/chain/src/index.mjs';

const here=dirname(fileURLToPath(import.meta.url)); const repo=resolve(here,'..');
const args=new Set(process.argv.slice(2));
const value=(flag)=>{ const a=process.argv.slice(2); const i=a.indexOf(flag); return i>=0?a[i+1]:null; };
const networkKey=value('--network') || 'robinhood-mainnet';
const strict=args.has('--strict'); const allowBlocked=args.has('--allow-blocked'); const offline=args.has('--offline');
const network=NETWORKS[networkKey]; if(!network) throw new Error(`Unknown network ${networkKey}`);
const manifestPath=resolve(repo,`deployments/${networkKey}.bootstrap.json`);
const manifest=JSON.parse(await readFile(manifestPath,'utf8'));
try { validateDeploymentManifest(manifest,{strict}); } catch (err) {
  console.error(JSON.stringify({status:'BLOCKED',stage:'manifest',network:networkKey,strict,error:err.message},null,2)); process.exit(2);
}
const report={schemaVersion:1,network:networkKey,chainId:network.chainId,strict,startedAt:new Date().toISOString(),status:'RUNNING',checks:[],observed:{}};
const check=(name,status,details={})=>{ report.checks.push({name,status,...details}); return status; };
if (offline) {
  check('rpc_access','BLOCKED',{reason:'offline mode explicitly requested'}); report.status='BLOCKED';
} else {
  const rpcUrl=process.env[network.rpcEnv] || network.defaultRpc; const rpc=new JsonRpcClient(rpcUrl);
  try {
    const chainId=await rpc.chainId(); report.observed.rpcChainId=chainId;
    check('chain_id',chainId===network.chainId?'PASS':'FAIL',{expected:network.chainId,observed:chainId});

    async function codeCheck(label,p,{allowEmpty=false}={}) {
      const code=await rpc.getCode(p.address); const empty=code==='0x'||code==='0x0'; const hash=empty?null:keccak256Hex(code);
      report.observed[label]={address:p.address,codeBytes:empty?0:(code.length-2)/2,runtimeCodeHash:hash};
      if(empty) return check(label,allowEmpty?'EMPTY_ALLOWED':'FAIL',{address:p.address});
      if(p.expectedRuntimeCodeHash) return check(label,hash.toLowerCase()===p.expectedRuntimeCodeHash.toLowerCase()?'PASS':'FAIL',{expectedRuntimeCodeHash:p.expectedRuntimeCodeHash,observedRuntimeCodeHash:hash});
      return check(label,strict?'FAIL':'OBSERVED_NEEDS_PIN',{observedRuntimeCodeHash:hash});
    }

    async function uupsProxyCheck(label,p) {
      await codeCheck(`${label}_runtime`,p);
      const implSlot='0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc';
      const implementation=storageWordAddress(await rpc.getStorageAt(p.address,implSlot));
      report.observed[label]={...(report.observed[`${label}_runtime`]||{}),implementation};
      check(`${label}_implementation_address`,implementation?.toLowerCase()===p.expectedImplementationAddress?.toLowerCase()?'PASS':'FAIL',{expected:p.expectedImplementationAddress,observed:implementation});
      if(implementation){
        const code=await rpc.getCode(implementation); const hash=keccak256Hex(code);
        report.observed[label].implementationCodeHash=hash;
        check(`${label}_implementation_runtime`,hash.toLowerCase()===p.expectedImplementationCodeHash?.toLowerCase()?'PASS':'FAIL',{expected:p.expectedImplementationCodeHash,observed:hash});
      }
      return implementation;
    }

    const firstWord=(hex,index=0)=>hex.replace(/^0x/,'').slice(index*64,(index+1)*64).padStart(64,'0');
    const callAddress=(hex)=>storageWordAddress('0x'+firstWord(hex));
    const callUint=(hex,index=0)=>Number(BigInt('0x'+firstWord(hex,index)));
    const hasRole=async(to,role,address)=>callUint(await rpc.ethCall(to,selector('hasRole(bytes32,address)')+role.slice(2)+address.slice(2).padStart(64,'0')))!==0;

    // USDG mainnet. Testnet mock is deployed in the next phase and therefore may be unset here.
    if (manifest.primitives.usdg.address) {
      const p=manifest.primitives.usdg; await codeCheck('usdg_runtime',p);
      const symbol=decodeAbiString(await rpc.ethCall(p.address,selector('symbol()')));
      const decimals=Number(BigInt(await rpc.ethCall(p.address,selector('decimals()'))));
      const name=decodeAbiString(await rpc.ethCall(p.address,selector('name()')));
      report.observed.usdg={...report.observed.usdg_runtime,name,symbol,decimals};
      check('usdg_symbol',symbol===p.expectedSymbol?'PASS':'FAIL',{expected:p.expectedSymbol,observed:symbol});
      if (Number.isInteger(p.expectedDecimals)) check('usdg_decimals',decimals===p.expectedDecimals?'PASS':'FAIL',{expected:p.expectedDecimals,observed:decimals});
      else check('usdg_decimals',strict?'FAIL':'OBSERVED_NEEDS_PIN',{observed:decimals});
      const implSlot='0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc';
      const adminSlot='0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103';
      const impl=storageWordAddress(await rpc.getStorageAt(p.address,implSlot));
      const admin=storageWordAddress(await rpc.getStorageAt(p.address,adminSlot));
      report.observed.usdg.eip1967={implementation:impl,admin};
      if(p.expectedImplementationAddress) check('usdg_implementation_address',impl?.toLowerCase()===p.expectedImplementationAddress.toLowerCase()?'PASS':'FAIL',{expected:p.expectedImplementationAddress,observed:impl});
      if(impl){ const implCode=await rpc.getCode(impl); const implHash=keccak256Hex(implCode); report.observed.usdg.eip1967.implementationCodeHash=implHash;
        if(p.expectedImplementationCodeHash) check('usdg_implementation',implHash.toLowerCase()===p.expectedImplementationCodeHash.toLowerCase()?'PASS':'FAIL',{expected:p.expectedImplementationCodeHash,observed:implHash});
        else check('usdg_implementation',strict?'FAIL':'OBSERVED_NEEDS_PIN',{observed:implHash});
      } else check('usdg_implementation','OBSERVED_NON_EIP1967_OR_CUSTOM_PROXY',{note:'Resolve proxy/facet/bridge authority before strict mainnet release.'});

      if(network.chainId===4663){
        const supplyControl=callAddress(await rpc.ethCall(p.address,selector('supplyControl()')));
        report.observed.usdg.supplyControl=supplyControl;
        check('usdg_supply_control_link',supplyControl?.toLowerCase()===p.supplyControl.address.toLowerCase()?'PASS':'FAIL',{expected:p.supplyControl.address,observed:supplyControl});
        await uupsProxyCheck('usdg_supply_control',p.supplyControl);

        const tokenAdmin=callAddress(await rpc.ethCall(p.address,selector('defaultAdmin()')));
        const supplyAdmin=callAddress(await rpc.ethCall(p.supplyControl.address,selector('defaultAdmin()')));
        const tokenAdminDelay=callUint(await rpc.ethCall(p.address,selector('defaultAdminDelay()')));
        const supplyAdminDelay=callUint(await rpc.ethCall(p.supplyControl.address,selector('defaultAdminDelay()')));
        report.observed.usdg.authority={tokenAdmin,supplyAdmin,tokenAdminDelay,supplyAdminDelay};
        check('usdg_default_admin',tokenAdmin?.toLowerCase()===p.adminTimelock.address.toLowerCase()?'PASS':'FAIL',{expected:p.adminTimelock.address,observed:tokenAdmin});
        check('usdg_supply_control_default_admin',supplyAdmin?.toLowerCase()===p.adminTimelock.address.toLowerCase()?'PASS':'FAIL',{expected:p.adminTimelock.address,observed:supplyAdmin});
        check('usdg_admin_transfer_delay',tokenAdminDelay===p.adminTimelock.expectedDefaultAdminTransferDelaySeconds&&supplyAdminDelay===p.adminTimelock.expectedDefaultAdminTransferDelaySeconds?'PASS':'FAIL',{expected:p.adminTimelock.expectedDefaultAdminTransferDelaySeconds,tokenObserved:tokenAdminDelay,supplyControlObserved:supplyAdminDelay});
        const tokenPending=await rpc.ethCall(p.address,selector('pendingDefaultAdmin()'));
        const supplyPending=await rpc.ethCall(p.supplyControl.address,selector('pendingDefaultAdmin()'));
        const noPendingAdmin=!callAddress(tokenPending)&&callUint(tokenPending,1)===0&&!callAddress(supplyPending)&&callUint(supplyPending,1)===0;
        check('usdg_no_pending_admin_transfer',noPendingAdmin?'PASS':'FAIL',{tokenPendingAdmin:callAddress(tokenPending),tokenSchedule:callUint(tokenPending,1),supplyPendingAdmin:callAddress(supplyPending),supplySchedule:callUint(supplyPending,1)});

        await codeCheck('usdg_admin_timelock_runtime',p.adminTimelock);
        const minDelay=callUint(await rpc.ethCall(p.adminTimelock.address,selector('getMinDelay()')));
        check('usdg_admin_timelock_delay',minDelay===p.adminTimelock.expectedMinDelaySeconds?'PASS':'FAIL',{expected:p.adminTimelock.expectedMinDelaySeconds,observed:minDelay});

        const authority=p.operationalAuthority.address;
        const authorityCode=await rpc.getCode(authority);
        check('usdg_operational_authority_account_type',authorityCode==='0x'||authorityCode==='0x0'?'PASS':'FAIL',{expected:p.operationalAuthority.expectedAccountType,observedCodeBytes:authorityCode==='0x'||authorityCode==='0x0'?0:(authorityCode.length-2)/2});
        const roleChecks={
          PAUSE_ROLE:await hasRole(p.address,keccak256Text('PAUSE_ROLE'),authority),
          ASSET_PROTECTION_ROLE:await hasRole(p.address,keccak256Text('ASSET_PROTECTION_ROLE'),authority),
          SUPPLY_CONTROLLER_MANAGER_ROLE:await hasRole(p.supplyControl.address,keccak256Text('SUPPLY_CONTROLLER_MANAGER_ROLE'),authority),
          TIMELOCK_PROPOSER_ROLE:await hasRole(p.adminTimelock.address,keccak256Text('PROPOSER_ROLE'),authority),
          TIMELOCK_EXECUTOR_ROLE:await hasRole(p.adminTimelock.address,keccak256Text('EXECUTOR_ROLE'),authority)
        };
        report.observed.usdg.operationalAuthority={address:authority,accountType:'EOA',roles:roleChecks};
        for(const role of p.operationalAuthority.roles) check(`usdg_operational_${role.toLowerCase()}`,roleChecks[role]?'PASS':'FAIL',{address:authority});

        await uupsProxyCheck('usdg_oft_wrapper',p.oftWrapper);
        const transferSettings=await rpc.ethCall(p.address,selector('globalTransferSettings()'));
        const paused=callUint(transferSettings,4)!==0;
        report.observed.usdg.paused=paused;
        check('usdg_not_paused',paused?'FAIL':'PASS',{observed:paused});
      }
    } else check('usdg_runtime',network.chainId===46630?'BLOCKED_TESTNET_MOCK_NOT_DEPLOYED':'FAIL');

    // Seaport.
    const sp=manifest.primitives.seaport16; await codeCheck('seaport16_runtime',sp);
    try {
      const info=decodeInformationTuple(await rpc.ethCall(sp.address,selector('information()'))); report.observed.seaportInformation=info;
      check('seaport_version',info.version.includes(sp.expectedVersion)?'PASS':'FAIL',{expected:sp.expectedVersion,observed:info.version});
      check('seaport_conduit_controller',info.conduitController.toLowerCase()===manifest.primitives.conduitController.address.toLowerCase()?'PASS':'FAIL',{expected:manifest.primitives.conduitController.address,observed:info.conduitController});
    } catch(err) { check('seaport_information','FAIL',{error:err.message}); }

    await codeCheck('conduit_controller_runtime',manifest.primitives.conduitController);
    if(manifest.primitives.immutableCreate2Factory) await codeCheck('immutable_create2_factory_runtime',manifest.primitives.immutableCreate2Factory);
    await codeCheck('safe_singleton_runtime',manifest.primitives.safeSingleton);
    const erc=manifest.primitives.erc6551Registry;
    const ercCode=await rpc.getCode(erc.address); const ercEmpty=ercCode==='0x'||ercCode==='0x0';
    if(ercEmpty) check('erc6551_registry_runtime',erc.allowCanonicalDeploymentIfEmpty?'EMPTY_CANONICAL_DEPLOYMENT_REQUIRED':'FAIL',{address:erc.address});
    else { const h=keccak256Hex(ercCode); report.observed.erc6551Registry={address:erc.address,runtimeCodeHash:h,codeBytes:(ercCode.length-2)/2};
      if(erc.expectedRuntimeCodeHash) check('erc6551_registry_runtime',h.toLowerCase()===erc.expectedRuntimeCodeHash.toLowerCase()?'PASS':'FAIL',{expected:erc.expectedRuntimeCodeHash,observed:h});
      else check('erc6551_registry_runtime',strict?'FAIL':'OBSERVED_NEEDS_PIN',{observed:h});
    }
  } catch(err) {
    check('rpc_access','BLOCKED',{rpc:rpcUrl,error:err.message}); report.status='BLOCKED';
  }
}
if(report.status==='RUNNING'){
  const failed=report.checks.some(x=>x.status==='FAIL');
  const unresolved=report.checks.some(x=>['BLOCKED','OBSERVED_NEEDS_PIN','EMPTY_CANONICAL_DEPLOYMENT_REQUIRED','OBSERVED_NON_EIP1967_OR_CUSTOM_PROXY','BLOCKED_TESTNET_MOCK_NOT_DEPLOYED'].includes(x.status));
  report.status=failed?'FAIL':(unresolved?'BLOCKED':'PASS');
}
report.finishedAt=new Date().toISOString();
const out=resolve(repo,`artifacts/primitive-verification/${networkKey}.json`); await mkdir(dirname(out),{recursive:true}); await writeFile(out,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report,null,2));
if(report.status==='FAIL') process.exitCode=1; else if(report.status==='BLOCKED'&&!allowBlocked) process.exitCode=2;
