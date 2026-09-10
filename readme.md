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
