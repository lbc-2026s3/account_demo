import {
  createPublicClient,
  createWalletClient,
  http,
  parseEther,
  parseGwei,
  formatEther,
  formatGwei,
  type Hash,
  type TransactionReceipt,
} from 'viem'
import { prepareTransactionRequest } from 'viem/actions'
import { privateKeyToAccount } from 'viem/accounts'
import { sepolia } from 'viem/chains'
import dotenv from 'dotenv'

dotenv.config()

async function sendTransactionExample(): Promise<Hash> {
  try {
    // 1. 从环境变量获取私钥
    const privateKey = process.env.PRIVATE_KEY as `0x${string}` | undefined
    if (!privateKey) {
      throw new Error('请在 .env 文件中设置 PRIVATE_KEY')
    }

    // 使用私钥推导账户
    const account = privateKeyToAccount(privateKey)
    const userAddress = account.address
    console.log('账户地址:', userAddress)

    const rpcUrl = process.env.RPC_URL
    if (!rpcUrl) {
      throw new Error('请在 .env 文件中设置 RPC_URL')
    }

    // 创建公共客户端 / 钱包客户端（与 RPC_URL 一致，使用 Sepolia）
    const publicClient = createPublicClient({
      chain: sepolia,
      transport: http(rpcUrl),
    })
    const walletClient = createWalletClient({
      account,
      chain: sepolia,
      transport: http(rpcUrl),
    })

    // 检查网络状态
    const blockNumber = await publicClient.getBlockNumber()
    console.log('当前区块号:', blockNumber)

    // 获取当前 gas 价格（wei → gwei 用 formatGwei，不要用 parseGwei）
    const gasPrice = await publicClient.getGasPrice()
    console.log('当前 gas 价格:', formatGwei(gasPrice), 'gwei')

    // 查询余额
    const balance = await publicClient.getBalance({
      address: userAddress,
    })
    console.log('账户余额:', formatEther(balance), 'ETH')

    // 查询 nonce
    const nonce = await publicClient.getTransactionCount({
      address: userAddress,
    })
    console.log('当前 Nonce:', nonce)

    // 2. 构建交易参数
    const txParams = {
      account,
      to: '0x519a5992573e6f94f93db6dBba22922758dFDd07' as `0x${string}`,
      value: parseEther('0.01'),
      chainId: sepolia.id,
      type: 'eip1559' as const,
      chain: sepolia,

      // EIP-1559 交易参数
      maxFeePerGas: gasPrice * 2n,
      maxPriorityFeePerGas: parseGwei('1.5'),
      gas: 21000n,
      nonce,
    }

    // 自动 Gas 估算及参数验证和补充
    const preparedTx = await prepareTransactionRequest(publicClient, txParams)
    console.log('准备后的交易参数:', {
      ...preparedTx,
      maxFeePerGas: formatGwei(preparedTx.maxFeePerGas!),
      maxPriorityFeePerGas: formatGwei(preparedTx.maxPriorityFeePerGas!),
    })

    // 方式 1：直接发送交易（与方式 2 二选一，同时发会复用同一 nonce）
    // const txHash1 = await walletClient.sendTransaction(preparedTx)
    // console.log('交易哈希:', txHash1)

    // 方式 2：签名后通过 eth_sendRawTransaction 发送
    const signedTx = await walletClient.signTransaction(preparedTx)
    console.log('Signed Transaction:', signedTx)

    const txHash = await publicClient.sendRawTransaction({
      serializedTransaction: signedTx,
    })
    console.log('Transaction Hash:', txHash)

    // 等待交易确认
    const receipt: TransactionReceipt = await publicClient.waitForTransactionReceipt({ hash: txHash })
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

// 执行示例
sendTransactionExample() 