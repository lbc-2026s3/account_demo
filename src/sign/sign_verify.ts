import {
    concat,
    createWalletClient,
    http,
    keccak256,
    size,
    stringToHex,
    verifyMessage,
    type Hex,
} from 'viem'
import { privateKeyToAccount, sign } from 'viem/accounts'
import { mainnet } from 'viem/chains'
import dotenv from 'dotenv'

dotenv.config()

/**
 * EIP-191 personal_sign（version 0x45）：
 * digest = keccak256("\x19Ethereum Signed Message:\n" + len(message) + message)
 * signature = secp256k1.sign(digest, privateKey)
 *
 * 不调用 walletClient.signMessage / accounts.signMessage，手动拆出 hash + 签名两步。
 */
async function signMessageEip191(
    message: string,
    privateKey: Hex,
): Promise<{ hash: Hex; signature: Hex }> {
    const messageHex = stringToHex(message)
    const prefix = stringToHex(`\x19Ethereum Signed Message:\n${size(messageHex)}`)
    const hash = keccak256(concat([prefix, messageHex]))
    const signature = await sign({ hash, privateKey, to: 'hex' })
    return { hash, signature }
}

async function main() {
    const privateKey = process.env.PRIVATE_KEY as Hex | undefined
    if (!privateKey) {
        throw new Error('请在 .env 文件中设置 PRIVATE_KEY')
    }

    const account = privateKeyToAccount(privateKey)
    console.log('钱包地址:', account.address)

    const walletClient = createWalletClient({
        account,
        chain: mainnet,
        transport: http(),
    })

    const message = 'hello world 123'

    // 方式 1：基于 EIP-191 手动签名
    const { hash, signature: eip191Signature } = await signMessageEip191(
        message,
        privateKey,
    )
    console.log('EIP-191 hash:', hash)
    console.log('手动 EIP-191 签名:', eip191Signature)

    // 方式 2：walletClient.signMessage（内部同样走 EIP-191）
    const signMessageSignature = await walletClient.signMessage({ message })
    console.log('signMessage 签名:', signMessageSignature)

    console.log(
        '两种签名是否一致:',
        eip191Signature === signMessageSignature ? '一致' : '不一致',
    )

    // 验证签名（与 personal_sign / signMessage 兼容）
    const isValid = await verifyMessage({
        address: account.address,
        message,
        signature: eip191Signature,
    })

    // Solidity 合约验证：
    // function recover(bytes memory message, bytes memory signature) public pure returns (address) {
    //     bytes32 hash = MessageHashUtils.toEthSignedMessageHash(message);
    //     return ECDSA.recover(hash, signature);
    // }

    console.log('签名验证结果:', isValid ? '验证成功' : '验证失败')
}

main().catch((error) => {
    console.error('发生错误:', error)
    process.exit(1)
})
