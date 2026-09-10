import bip39 from 'bip39'
import { hdkey } from '@ethereumjs/wallet'
import * as util from '@ethereumjs/util'
import readline from 'readline/promises'
import { stdin as input, stdout as output } from 'process'

const rl = readline.createInterface({ input, output })

// 生成助记词
var mnemonic = bip39.generateMnemonic()
console.log("助记词："+ mnemonic );

// BIP39 passphrase：默认为空，直接回车即可
const password = await rl.question('请输入密码（可为空，直接回车）: ')
rl.close()
console.log(password ? `使用密码: ${password}` : '密码为空')

// bip39 v3+: Sync API（第二个参数为可选 passphrase）
var seed = bip39.mnemonicToSeedSync(mnemonic, password);
var hdWallet = hdkey.EthereumHDKey.fromMasterSeed(seed);

for (var i = 0; i < 10; i++) {
  // BIP44 派生路径：m / purpose' / coin_type' / account' / change / address_index
  // m/44'/60'/0'/0/i
  //   44'  — BIP44 规范（hardened）
  //   60'  — 币种：Ethereum（SLIP-44）
  //   0'   — 账户序号（第 0 个账户）
  //   0    — 外部链（0=收款地址，1=找零地址）
  //   i    — 地址索引（0, 1, 2, ...）
  var key = hdWallet.derivePath("m/44'/60'/0'/0/" + i);
  var wallet = key.getWallet();
  var address = wallet.getAddress();
  console.log("--- 账户 " + i + " ---");
  console.log("私钥：" + util.bytesToHex(wallet.getPrivateKey()));
  console.log("地址：" + util.bytesToHex(address));
  console.log("校验和地址：" + util.toChecksumAddress(util.bytesToHex(address)));
}
