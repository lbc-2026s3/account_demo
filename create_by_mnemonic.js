var bip39 = require('bip39')
var { hdkey } = require('@ethereumjs/wallet')
var util = require('@ethereumjs/util')

// 生成助记词
var mnemonic = bip39.generateMnemonic()
console.log(mnemonic)

console.log("助记词："+ mnemonic );

// bip39 v3+: Sync API (or await mnemonicToSeed)
var seed = bip39.mnemonicToSeedSync(mnemonic);
var hdWallet = hdkey.EthereumHDKey.fromMasterSeed(seed);

for (var i = 0; i < 10; i++) {
  var key = hdWallet.derivePath("m/44'/60'/0'/0/" + i);
  var wallet = key.getWallet();
  var address = wallet.getAddress();
  console.log("--- 账户 " + i + " ---");
  console.log("私钥：" + util.bytesToHex(wallet.getPrivateKey()));
  console.log("地址：" + util.bytesToHex(address));
  console.log("校验和地址：" + util.toChecksumAddress(util.bytesToHex(address)));
}
