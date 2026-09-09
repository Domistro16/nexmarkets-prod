import { readFile } from 'node:fs/promises';
import { Contract, Interface, JsonRpcProvider, Wallet, formatEther, formatUnits, id } from 'ethers';

const deployment = JSON.parse(await readFile(new URL('../deployments/base-sepolia.v1-deployment.json', import.meta.url), 'utf8'));
const rpc = process.env.BASE_SEPOLIA_RPC_URL || 'https://sepolia.base.org';
const provider = new JsonRpcProvider(rpc, 84532, { staticNetwork: true });
const signer = process.env.DEPLOYER_PRIVATE_KEY ? new Wallet(process.env.DEPLOYER_PRIVATE_KEY, provider) : null;
const factory = deployment.contracts.NexPassFactory.address;
const signerAddress = signer?.address || deployment.protocolAdminSafe.owners[0];
const config = ['NexMarkets Base interface probe', 'NMBIP', signerAddress, id(`base-interface-probe:${Date.now()}`), 1, id('base-interface-art'), 'data:application/json,{}#'];
const legacyConfig = [...config]; legacyConfig[2] = deployment.protocolAdminSafe.address;
const direct = new Interface(['function createEdition((string,string,address,bytes32,uint32,bytes32,string),bytes32) returns(address)']);
const legacy = new Interface(['function createEdition((string,string,address,bytes32,uint32,bytes32,string),address,bytes32) returns(address)']);

async function simulate(label, from, data) {
  try {
    const result = await provider.call({ from, to: factory, data });
    return { label, supported: true, result };
  } catch (error) {
    return { label, supported: false, reason: error.shortMessage || error.reason || error.message };
  }
}

const usdc = new Contract(deployment.usdc.address, ['function symbol() view returns(string)','function decimals() view returns(uint8)','function balanceOf(address) view returns(uint256)'], provider);
const block = await provider.getBlockNumber();
const report = {
  network: 'base-sepolia',
  chainId: 84532,
  block,
  signer: signer ? {
    address: signer.address,
    nativeBalance: formatEther(await provider.getBalance(signer.address)),
    usdcBalance: formatUnits(await usdc.balanceOf(signer.address), Number(await usdc.decimals()))
  } : null,
  usdc: { address: deployment.usdc.address, symbol: await usdc.symbol(), decimals: Number(await usdc.decimals()) },
  factory: {
    address: factory,
    direct: await simulate('direct-permissionless', signerAddress, direct.encodeFunctionData('createEdition', [config, id(`direct:${Date.now()}`)])),
    legacyViaSafe: await simulate('legacy-safe', deployment.protocolAdminSafe.address, legacy.encodeFunctionData('createEdition', [legacyConfig, signerAddress, id(`legacy:${Date.now()}`)]))
  }
};

console.log(JSON.stringify(report, null, 2));
