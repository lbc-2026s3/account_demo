# Readme

## install

Compatible with Node.js 18+ (tested on Node 24):

```
npm install
```

Copy env sample and set a test private key:

```
cp .env.example .env
```

1. create eth account by random private key

```
npm run create_by_raw
```

2. create ethereum account by random mnemonic

```
npm run create_by_mnemonic
```

3. encrypt / decrypt private key with keystore

```
npm run keystore_demo
```

4. send tx with keystore (需要先启动 anvil，并生成兼容的 keystore)

```
anvil
npm run keystore_demo
npm run build_tx_keystore
```

5. SSS 分片演示发交易（Sepolia）

```
npm run build_tx_mpc_sss
```

6. TSS 加法分片协作签名发交易（Sepolia，教学版）

```
npm run build_tx_mpc_tss
```
