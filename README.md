# TRUMP DOGE DAPP

这是一个基于Solana区块链的私募DAPP。用户可以使用SOL代币进行私募投资。

## 功能特点

- Solana钱包连接（支持Phantom等）
- SOL代币转账功能
- 现代化UI设计
- 响应式布局

## 开始使用

1. 安装依赖：
```bash
npm install
```

2. 启动开发服务器：
```bash
npm start
```

3. 构建生产版本：
```bash
npm run build
```

## 配置

在使用之前，请确保在 `App.js` 文件中设置了正确的接收钱包地址：

```javascript
const WALLET_ADDRESS = "YOUR_WALLET_ADDRESS"; // 替换为你的SOL钱包地址
```

## 技术栈

- React
- Solana Web3.js
- Solana Wallet Adapter
- CSS3
