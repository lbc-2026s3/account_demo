/**
 * 教学版 MPC-TSS（方案 A）：加法秘密分享 + 协作 ECDSA 签名
 *
 * 与 SSS 对比：
 * - SSS：签名前用 threshold 个分片 combine 出完整私钥，再单签
 * - TSS（本文件）：sk ≡ sk1+sk2+...+skn (mod n)，各方用 ski 贡献部分签名后合成
 *               签名过程中不重组、不打印完整私钥
 *
 * 说明：这是便于理解的 n-of-n 加法分享演示，不是生产级 GG18/GG20/FROST。
 *       真正的门限 TSS 支持 t-of-n（例如 5 人里任意 3 人签名），但实现较麻烦：
 *       需要 DKG、多方多轮通信、零知识证明等；课程演示用 n-of-n 即可，
 *       若要 3-of-5 更现实的是接现成库，而不是从零手写。
 */
import {
    http,
    parseEther,
    parseGwei,
    formatEther,
    formatGwei,
    serializeTransaction,
    keccak256,
    createPublicClient,
} from 'viem'
import { sepolia } from 'viem/chains'
import { privateKeyToAccount } from 'viem/accounts'
import { secp256k1 } from '@noble/curves/secp256k1'
import dotenv from 'dotenv'

dotenv.config()

const CURVE_N = secp256k1.CURVE.n

function normalizePrivateKey(privateKey) {
    if (!privateKey || typeof privateKey !== 'string') {
        throw new Error('私钥不能为空')
    }
    const hex = privateKey.trim().replace(/^0x/i, '')
    if (!/^[0-9a-fA-F]{64}$/.test(hex)) {
        throw new Error('私钥必须是 32 字节 hex（64 个字符，0x 可选）')
    }
    return ('0x' + hex.toLowerCase())
}

function randomScalar() {
    return secp256k1.utils.normPrivateKeyToScalar(secp256k1.utils.randomPrivateKey())
}

function modInverse(a, m) {
    // Fermat: a^(m-2) mod m （m 为素数）
    let result = 1n
    let base = ((a % m) + m) % m
    let exp = m - 2n
    while (exp > 0n) {
        if (exp & 1n) result = (result * base) % m
        base = (base * base) % m
        exp >>= 1n
    }
    return result
}

function toHex32(value) {
    return ('0x' + value.toString(16).padStart(64, '0'))
}

/**
 * 加法秘密分享：sk ≡ sum(shares) (mod n)
 * 前 n-1 份随机，最后一份补齐
 */
function generateAdditiveShares(privateKey, totalShares) {
    const sk = BigInt(normalizePrivateKey(privateKey))
    const shares = []
    let acc = 0n
    for (let i = 0; i < totalShares - 1; i++) {
        const share = randomScalar()
        shares.push(share)
        acc = (acc + share) % CURVE_N
    }
    const last = (sk - acc + CURVE_N) % CURVE_N
    shares.push(last)
    return shares
}

/**
 * 校验加法分片是否正确：所有 ski 之和（模曲线阶 n）应等于原始私钥。
 * 注意：这只是演示校验，真实 TSS 不会在某一侧汇总全部 ski。
 */
function verifyAdditiveShares(shares, originalPrivateKey) {
    // 把所有分片 ski 累加：sum = (((0+s0)%n + s1)%n + ... + s4)%n
    // 等价于数学上的 Σ ski mod n（secp256k1 的曲线阶）
    // sum = 0
    // sum = (sum + s0) % n
    // sum = (sum + s1) % n
    // ...
    // sum = (sum + s4) % n
    const sum = shares.reduce((a, b) => (a + b) % CURVE_N, 0n)
    const sk = BigInt(normalizePrivateKey(originalPrivateKey))
    const ok = sum === sk
    console.log('\n验证加法分片:')
    console.log('sum(shares) mod n:', toHex32(sum))
    console.log('是否等于原始私钥标量:', ok)
    return ok
}

/**
 * 协作签名：不重组完整私钥
 * s = k^{-1}(z + r·sk) = k^{-1}·z + Σ (k^{-1}·r·ski)
 */
function tssSignHash(shares, messageHash) {
    const z = BigInt(messageHash)

    // 各方本地生成 nonce 分片 ki，公开 Ri = ki·G，聚合 R
    const kShares = shares.map(() => randomScalar())
    console.log('\nTSS nonce 分片 k_i:')
    kShares.forEach((ki, i) => {
        console.log(`  party ${i}: ${toHex32(ki)}`)
    })

    const k = kShares.reduce((a, b) => (a + b) % CURVE_N, 0n)
    if (k === 0n) {
        throw new Error('nonce 之和为 0，请重试')
    }
    // 教学演示：k 仅用于计算，不把完整私钥拼出来；仍避免打印 k 的明文也可，这里为对照打印
    console.log('聚合 nonce k = Σ k_i:', toHex32(k))

    const R = secp256k1.ProjectivePoint.BASE.multiply(k)
    const r = R.x % CURVE_N
    let yParity = (R.y & 1n) === 1n ? 1 : 0
    console.log('聚合 R.x (r):', toHex32(r))
    console.log('R.yParity:', yParity)

    const kInv = modInverse(k, CURVE_N)

    // 各方用自己的 ski 计算部分签名（不需要完整 sk）
    const partials = shares.map((ski, i) => {
        const partial = (kInv * r * ski) % CURVE_N
        return { index: i, ski: toHex32(ski), partialS: toHex32(partial) }
    })
    console.log('\n各方部分签名 s_i = k^{-1} · r · sk_i:')
    console.log(partials)

    // 合成：s = k^{-1}·z + Σ s_i
    const zPart = (kInv * z) % CURVE_N
    console.log('消息部分 k^{-1} · z:', toHex32(zPart))

    let s = zPart
    for (const p of partials) {
        s = (s + BigInt(p.partialS)) % CURVE_N
    }

    // EIP-2 low-s
    if (s > CURVE_N / 2n) {
        s = CURVE_N - s
        yParity = yParity ^ 1
        console.log('已归一化为 low-s，并翻转 yParity')
    }

    console.log('\n合成签名:')
    console.log('  r:', toHex32(r))
    console.log('  s:', toHex32(s))
    console.log('  yParity:', yParity)
    console.log('  （签名过程未重组、未打印完整私钥）')

    return {
        r: toHex32(r),
        s: toHex32(s),
        yParity,
    }
}

async function tssSignTransaction(shares, transaction) {
    // 先序列化未签名交易并哈希
    const unsignedSerialized = serializeTransaction(transaction)
    const txHash = keccak256(unsignedSerialized)
    console.log('\n未签名交易哈希:', txHash)

    const signature = tssSignHash(shares, txHash)
    const signedTx = serializeTransaction(transaction, signature)
    return signedTx
}

async function sendTransactionWithTSS() {
    try {
        const privateKey = normalizePrivateKey(process.env.PRIVATE_KEY)
        console.log('原始私钥:', privateKey)
        console.log('模式: 教学版 MPC-TSS（加法秘密分享）')

        const publicClient = createPublicClient({
            chain: sepolia,
            transport: http(process.env.RPC_URL),
        })

        const account = privateKeyToAccount(privateKey)
        const userAddress = account.address
        console.log('账户地址:', userAddress)

        // n-of-n 加法分片（教学：全部参与方都要在线）
        const totalShares = 5
        const shares = generateAdditiveShares(privateKey, totalShares)
        console.log(`\n生成了 ${totalShares} 个加法私钥分片（n-of-n，需全部参与签名）`)
        console.log('shares:', shares.map((share, i) => ({
            index: i,
            hex: toHex32(share),
        })))

        if (!verifyAdditiveShares(shares, privateKey)) {
            throw new Error('加法分片校验失败')
        }

        const blockNumber = await publicClient.getBlockNumber()
        console.log('========================================')
        console.log('当前区块号:', blockNumber)

        const gasPrice = await publicClient.getGasPrice()
        console.log('当前 gas 价格:', formatGwei(gasPrice), 'gwei')

        const balance = await publicClient.getBalance({ address: userAddress })
        console.log('账户余额:', formatEther(balance), 'ETH')

        const nonce = await publicClient.getTransactionCount({ address: userAddress })
        console.log('当前 Nonce:', nonce)

        const txParams = {
            to: '0x519a5992573e6f94f93db6dBba22922758dFDd07',
            value: parseEther('0.01'),
            chainId: sepolia.id,
            type: 'eip1559',
            maxFeePerGas: gasPrice * 2n,
            maxPriorityFeePerGas: parseGwei('1.5'),
            gas: 21000n,
            nonce,
        }
        console.log('\n交易参数:', {
            ...txParams,
            value: txParams.value.toString(),
            maxFeePerGas: txParams.maxFeePerGas.toString(),
            maxPriorityFeePerGas: txParams.maxPriorityFeePerGas.toString(),
            gas: txParams.gas.toString(),
        })

        console.log('\n开始 TSS 协作签名过程...')
        const signedTx = await tssSignTransaction(shares, txParams)
        console.log('TSS 签名完成')
        console.log('Signed Transaction:', signedTx)

        const txHash = await publicClient.sendRawTransaction({
            serializedTransaction: signedTx,
        })
        console.log('Transaction Hash:', txHash)

        const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash })
        console.log('交易状态:', receipt.status === 'success' ? '成功' : '失败')
        console.log('区块号:', receipt.blockNumber)
        console.log('Gas 使用量:', receipt.gasUsed.toString())

        return txHash
    } catch (error) {
        console.error('错误:', error)
        if (error instanceof Error) {
            console.error('错误信息:', error.message)
        }
        if (error && typeof error === 'object' && 'details' in error) {
            console.error('错误详情:', error.details)
        }
        throw error
    }
}

sendTransactionWithTSS()
