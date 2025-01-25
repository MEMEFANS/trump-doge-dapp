// Helper function to create DOM elements
function createElement(tag, attributes = {}, ...children) {
  const element = document.createElement(tag);
  Object.entries(attributes).forEach(([key, value]) => {
    if (key.startsWith('on')) {
      element.addEventListener(key.toLowerCase().slice(2), value);
    } else {
      element.setAttribute(key, value);
    }
  });
  children.forEach(child => {
    if (typeof child === 'string') {
      element.appendChild(document.createTextNode(child));
    } else if (child instanceof Node) {
      element.appendChild(child);
    }
  });
  return element;
}

// Main application
function createApp() {
  let walletAddress = null;
  let amount = '';
  let referralId = '';
  let referralStats = {
    totalAmount: 0,
    transactions: []
  };
  let userPresaleStats = {
    solAmount: 0,
    tokenAmount: 0
  };

  // Check if localStorage is available
  const isStorageAvailable = () => {
    try {
      const test = '__storage_test__';
      localStorage.setItem(test, test);
      localStorage.removeItem(test);
      return true;
    } catch (e) {
      return false;
    }
  };

  // Try to load saved stats
  if (isStorageAvailable()) {
    try {
      const savedStats = localStorage.getItem('referralStats');
      if (savedStats) {
        const parsed = JSON.parse(savedStats);
        referralStats = {
          totalAmount: Number(parsed.totalAmount.toFixed(1)),
          transactions: parsed.transactions.map(tx => ({
            ...tx,
            amount: Number(tx.amount.toFixed(1))
          }))
        };
      }
    } catch (err) {
      console.error('Error loading saved stats:', err);
    }
  }

  // Save referral stats to localStorage
  function saveReferralStats(stats) {
    if (isStorageAvailable()) {
      try {
        const statsToSave = {
          totalAmount: Number(stats.totalAmount.toFixed(1)),
          transactions: stats.transactions.map(tx => ({
            ...tx,
            amount: Number(tx.amount.toFixed(1))
          }))
        };
        localStorage.setItem('referralStats', JSON.stringify(statsToSave));
      } catch (err) {
        console.error('Error saving stats:', err);
      }
    }
    referralStats = stats;
  }

  // Clear referral stats
  const clearReferralStats = () => {
    if (isStorageAvailable()) {
      try {
        localStorage.removeItem('referralStats');
      } catch (err) {
        console.error('Error clearing stats:', err);
      }
    }
    referralStats = {
      totalAmount: 0,
      transactions: []
    };
    renderApp();
  };

  // Get referral ID from URL if exists
  const urlParams = new URLSearchParams(window.location.search);
  const ref = urlParams.get('ref');
  if (ref) {
    referralId = ref;
    // Store referral ID in localStorage
    if (isStorageAvailable()) {
      try {
        localStorage.setItem('referralId', ref);
      } catch (err) {
        console.error('Error saving referral ID:', err);
      }
    }
  } else {
    // Check if there's a stored referral ID
    if (isStorageAvailable()) {
      try {
        const storedRef = localStorage.getItem('referralId');
        if (storedRef) {
          referralId = storedRef;
        }
      } catch (err) {
        console.error('Error loading referral ID:', err);
      }
    }
  }

  // Initialize referral stats
  const defaultReferralStats = {
    totalAmount: 0,
    transactions: []
  };

  // Generate referral link
  function generateReferralLink() {
    if (!walletAddress) return '';
    // 使用实际部署的域名
    return `https://www.trumpdoge.club/?ref=${walletAddress}`;
  }

  // Copy referral link to clipboard
  async function copyReferralLink() {
    const link = generateReferralLink();
    if (!link) {
      alert('Please connect your wallet first!');
      return;
    }
    try {
      // 尝试使用现代 Clipboard API
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(link);
        alert('Referral link copied to clipboard!');
        return;
      }

      // 后备方案：创建临时输入框
      const tempInput = document.createElement('input');
      tempInput.style.position = 'fixed';
      tempInput.style.opacity = '0';
      tempInput.value = link;
      document.body.appendChild(tempInput);
      tempInput.select();
      tempInput.setSelectionRange(0, 99999); // 用于移动设备
      document.execCommand('copy');
      document.body.removeChild(tempInput);
      alert('Referral link copied to clipboard!');
    } catch (err) {
      console.error('Failed to copy:', err);
      // 如果复制失败，至少显示链接让用户手动复制
      alert('Unable to copy automatically. Your referral link is: ' + link);
    }
  }

  // 检查钱包是否已安装
  const checkWalletAvailable = () => {
    const { solana } = window;
    if (!solana) {
      if (/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)) {
        // 移动端：打开钱包内置浏览器
        window.location.href = 'https://phantom.app/ul/browse/' + window.location.href;
      } else {
        // PC端：提示安装钱包
        showError('Please install Phantom Wallet from phantom.app');
      }
      return false;
    }
    return true;
  };

  // 连接钱包
  const connectWallet = async () => {
    try {
      if (!checkWalletAvailable()) return;

      // 检查是否已连接
      const { solana } = window;
      if (solana.isConnected && walletAddress) {
        return;
      }

      // 添加加载提示
      const connectButton = document.querySelector('.connect-button');
      if (connectButton) {
        connectButton.textContent = 'Connecting...';
        connectButton.disabled = true;
      }

      // 尝试连接钱包
      try {
        const response = await Promise.race([
          solana.connect(),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Connection timeout')), 10000)
          )
        ]);
        
        walletAddress = response.publicKey.toString();
        
        // 连接成功后立即获取所有数据
        await Promise.all([
          fetchUserPresaleStats(),  // 获取用户私募数据
          fetchRealTimeStats()      // 获取推荐数据
        ]);
        
        // 设置定时刷新（改为60秒刷新一次）
        const refreshInterval = setInterval(async () => {
          await Promise.all([
            fetchUserPresaleStats(),
            fetchRealTimeStats()
          ]);
        }, 60000);
        
        // 当钱包断开时清除定时器
        window.solana.on('disconnect', () => {
          clearInterval(refreshInterval);
        });

      } catch (err) {
        if (err.message === 'Connection timeout') {
          showError('Connection timeout. Please try again.');
        } else {
          showError('Error connecting wallet. Please try again.');
        }
        console.error('Connection error:', err);
      }

      renderApp();
    } catch (error) {
      showError('Error connecting wallet');
      console.error(error);
    } finally {
      // 恢复按钮状态
      const connectButton = document.querySelector('.connect-button');
      if (connectButton) {
        connectButton.textContent = 'Connect Wallet';
        connectButton.disabled = false;
      }
    }
  };

  // 自动重连钱包
  const autoReconnectWallet = async () => {
    const { solana } = window;
    if (solana && solana.isPhantom) {
      try {
        const resp = await solana.connect({ onlyIfTrusted: true });
        walletAddress = resp.publicKey.toString();
        await Promise.all([
          fetchUserPresaleStats(),
          fetchRealTimeStats()  // 修改这里，使用正确的函数名
        ]);
        renderApp();
      } catch (err) {
        console.log('Auto reconnect failed:', err);
      }
    }
  };

  // 页面加载完成后自动重连
  window.addEventListener('load', autoReconnectWallet);

  // 创建连接
  const connection = new solanaWeb3.Connection(
    "https://black-lingering-fog.solana-mainnet.quiknode.pro/4d7783df09fe07db6ce511d870249fc3eb642683",
    {
      commitment: "confirmed",
      wsEndpoint: "wss://black-lingering-fog.solana-mainnet.quiknode.pro/4d7783df09fe07db6ce511d870249fc3eb642683"
    }
  );

  // 添加延迟函数
  const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

  // 带重试的RPC请求函数
  async function retryRpcRequest(fn, retries = 3, delay = 1000) {
    for (let i = 0; i < retries; i++) {
      try {
        return await fn();
      } catch (err) {
        console.log(`RPC request failed (attempt ${i + 1}/${retries}):`, err);
        if (i === retries - 1) throw err;
        await new Promise(resolve => setTimeout(resolve, delay));
        delay *= 2; // 指数退避
      }
    }
  }

  // 获取用户私募数据
  const fetchUserPresaleStats = async () => {
    try {
      if (!connection || !walletAddress) {
        console.log('No connection or wallet');
        return;
      }

      // 预售地址
      const presaleAddress = new solanaWeb3.PublicKey('4RNFQfHE2EdpLQRLWVMzTs8KUMxJi9bV21uzFJUktQQF');
      
      // 获取所有交易
      const signatures = await connection.getSignaturesForAddress(
        presaleAddress,
        { limit: 100 }
      );

      let totalSol = 0;

      // 处理每个交易
      for (const sigInfo of signatures) {
        try {
          const tx = await connection.getTransaction(sigInfo.signature, {
            maxSupportedTransactionVersion: 0
          });

          if (!tx || !tx.meta) continue;

          // 检查是否是当前用户的交易
          const fromAddress = tx.transaction.message.accountKeys[0].toString();
          
          if (fromAddress === walletAddress) {
            // 获取转账金额
            const preBalance = tx.meta.preBalances[0] || 0;
            const postBalance = tx.meta.postBalances[0] || 0;
            const change = (preBalance - postBalance) / solanaWeb3.LAMPORTS_PER_SOL;
            
            // 如果是转出交易，累加金额
            if (change > 0) {
              totalSol += change;
            }
          }
        } catch (err) {
          continue;
        }
      }

      // 更新状态，1 SOL = 225,000 TDOGE
      userPresaleStats = {
        solAmount: totalSol,
        tokenAmount: totalSol * 225000
      };

      renderApp();
    } catch (error) {
      console.error('Error:', error);
      userPresaleStats = {
        solAmount: 0,
        tokenAmount: 0
      };
      renderApp();
    }
  };

  // 计算代币数量
  const calculateTokens = (solAmount) => {
    return solAmount * 225000;
  };

  // 处理私募
  const handleContribute = async () => {
    try {
      if (!connection || !walletAddress) {
        showError('Please connect your wallet first');
        return;
      }

      const amountInput = document.querySelector('input[type="number"]');
      const amountValue = amountInput ? parseFloat(amountInput.value) : 0;

      if (!amountValue || isNaN(amountValue) || amountValue < 0.1) {
        showError('Minimum contribution is 0.1 SOL');
        return;
      }

      const transaction = new solanaWeb3.Transaction();
      
      // 添加转账指令
      transaction.add(
        solanaWeb3.SystemProgram.transfer({
          fromPubkey: new solanaWeb3.PublicKey(walletAddress),
          toPubkey: new solanaWeb3.PublicKey('4RNFQfHE2EdpLQRLWVMzTs8KUMxJi9bV21uzFJUktQQF'),
          lamports: Math.floor(amountValue * solanaWeb3.LAMPORTS_PER_SOL)
        })
      );

      // 如果有推荐人ID，添加memo指令
      if (referralId) {
        console.log('Adding referral memo:', referralId);
        const memoProgram = new solanaWeb3.PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr');
        const memoInstruction = new solanaWeb3.TransactionInstruction({
          keys: [],
          programId: memoProgram,
          data: Buffer.from(referralId)
        });
        transaction.add(memoInstruction);
      }

      // 获取最新的 blockhash
      const { blockhash } = await connection.getLatestBlockhash('confirmed');
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = new solanaWeb3.PublicKey(walletAddress);

      // 发送交易
      const signed = await window.solana.signAndSendTransaction(transaction);
      console.log('Transaction sent:', signed.signature);

      // 等待确认
      const confirmation = await connection.confirmTransaction(signed.signature);
      if (confirmation.value.err) {
        throw new Error('Transaction failed');
      }

      // 清空输入
      if (amountInput) {
        amountInput.value = '';
      }

      // 更新数据
      await Promise.all([
        fetchUserPresaleStats(),  // 获取用户私募数据
        fetchRealTimeStats()      // 获取推荐数据
      ]);

      showSuccess('Contribution successful!');
    } catch (error) {
      console.error('Contribution error:', error);
      if (error.message.includes('User rejected')) {
        showError('Transaction cancelled by user');
      } else {
        showError('Transaction failed. Please try again.');
      }
    }
  };

  // 获取实时推荐数据
  async function fetchRealTimeStats() {
    try {
      if (!connection || !walletAddress) {
        console.log('No connection or wallet');
        return;
      }

      console.log('Fetching referral stats for wallet:', walletAddress);

      // 收款地址
      const receiverAddress = new solanaWeb3.PublicKey('4RNFQfHE2EdpLQRLWVMzTs8KUMxJi9bV21uzFJUktQQF');
      
      // 获取所有转账到该地址的交易
      let signatures = await retryRpcRequest(async () => {
        return await connection.getSignaturesForAddress(
          receiverAddress,
          { limit: 20 }
        );
      });
      
      console.log(`Found ${signatures.length} transactions`);

      let totalAmount = 0;
      const transactions = [];

      // 处理每个交易
      for (const sigInfo of signatures) {
        try {
          console.log('Processing transaction:', sigInfo.signature);
          
          // 从memo中提取钱包地址
          let referralAddress = null;
          if (sigInfo.memo) {
            const match = sigInfo.memo.match(/\[\d+\]\s*(.+)/);
            if (match) {
              try {
                referralAddress = new solanaWeb3.PublicKey(match[1]);
              } catch (err) {
                console.log('Invalid referral address in memo');
              }
            }
          }

          // 如果memo中的地址匹配，获取交易详情
          if (referralAddress && referralAddress.toString() === walletAddress) {
            const tx = await retryRpcRequest(async () => {
              return await connection.getTransaction(sigInfo.signature, {
                maxSupportedTransactionVersion: 0
              });
            });

            if (!tx || !tx.meta || tx.meta.err) {
              console.log('Invalid transaction:', sigInfo.signature);
              continue;
            }

            // 计算转账金额
            const postBalances = tx.meta.postBalances;
            const preBalances = tx.meta.preBalances;
            const receiverIndex = tx.transaction.message.accountKeys.findIndex(
              key => key.toString() === receiverAddress.toString()
            );

            if (receiverIndex === -1) {
              console.log('Receiver not found in transaction');
              continue;
            }

            const amount = (postBalances[receiverIndex] - preBalances[receiverIndex]) / solanaWeb3.LAMPORTS_PER_SOL;
            if (amount <= 0) {
              console.log('No SOL transfer in transaction');
              continue;
            }

            console.log('Found referral transaction:', sigInfo.signature);
            console.log('Transaction amount:', amount, 'SOL');
            totalAmount += amount;
            transactions.push({
              signature: sigInfo.signature,
              amount: amount,
              timestamp: tx.blockTime
            });
          }

          // 添加小延迟避免请求过快
          await delay(500);
        } catch (err) {
          console.error('Error processing transaction:', err);
          continue;
        }
      }

      console.log('Total referral amount:', totalAmount, 'SOL');
      console.log('Number of referral transactions:', transactions.length);

      // 更新状态
      const newStats = {
        totalAmount: Number(totalAmount.toFixed(2)),
        transactions: transactions.sort((a, b) => b.timestamp - a.timestamp)
      };
      
      // 保存并更新
      saveReferralStats(newStats);
      renderApp();

    } catch (error) {
      console.error('Error fetching real-time stats:', error);
      showError('Failed to fetch referral stats. Please try again.');
    }
  }

  const renderApp = () => {
    const root = document.getElementById('root');
    root.innerHTML = '';

    // Create main container
    const container = createElement('div', { class: 'container' });

    // Create logo section
    const logoSection = createElement('div', { class: 'logo-section' });
    const title = createElement('h1', {}, 'TRUMP DOGE 2025');
    const slogan = createElement('h2', {}, 'CRYPTO IS GREAT AGAIN! 🚀');
    const subtitle = createElement('p', {}, 'Official Crypto of the Trump Administration');
    logoSection.append(title, slogan, subtitle);
    container.appendChild(logoSection);

    // Create info grid
    const infoGrid = createElement('div', { class: 'info-grid' });
    
    // Price info
    const priceBox = createElement('div', { class: 'info-box' });
    const priceTitle = createElement('div', { class: 'info-title' }, 'PRICE');
    const priceValue = createElement('div', { class: 'info-value' }, '1 SOL = 225,000 TDOGE');
    priceBox.append(priceTitle, priceValue);

    // Min investment info
    const minBox = createElement('div', { class: 'info-box' });
    const minTitle = createElement('div', { class: 'info-title' }, 'MIN INVESTMENT');
    const minValue = createElement('div', { class: 'info-value' }, '0.1 SOL');
    minBox.append(minTitle, minValue);

    // Total supply info
    const supplyBox = createElement('div', { class: 'info-box' });
    const supplyTitle = createElement('div', { class: 'info-title' }, 'TOTAL SUPPLY');
    const supplyValue = createElement('div', { class: 'info-value' }, '10,000,000,000 TDOGE');
    supplyBox.append(supplyTitle, supplyValue);

    // Private sale allocation info
    const allocBox = createElement('div', { class: 'info-box' });
    const allocTitle = createElement('div', { class: 'info-title' }, 'PRIVATE SALE ALLOCATION');
    const allocValue = createElement('div', { class: 'info-value' }, '45%');
    allocBox.append(allocTitle, allocValue);

    infoGrid.append(allocBox, minBox, supplyBox, priceBox);
    container.appendChild(infoGrid);

    // Create referral section
    const referralSection = createElement('div', { class: 'referral-container' });
    
    // Create fundraising input section first
    const fundraisingInput = createElement('div', { class: 'fundraising-input' });
    
    // Wallet status
    if (window.solana?.publicKey) {
        const walletStatus = createElement('div', { class: 'wallet-status' },
            'Connected: ' + window.solana.publicKey.toString().slice(0, 6) + '...' + window.solana.publicKey.toString().slice(-4)
        );
        fundraisingInput.appendChild(walletStatus);
        
        // Input container
        const inputContainer = createElement('div', { class: 'input-container' });
        const amountInput = createElement('input', {
            type: 'number',
            placeholder: 'Amount (SOL)',
            min: '0.1',
            step: '0.1',
            value: amount,
            onchange: (e) => { amount = e.target.value; }
        });
        
        // Contribute button
        const contributeButton = createElement('button', {
            class: 'contribute-button',
            onclick: handleContribute
        }, 'CONTRIBUTE NOW');
        
        inputContainer.appendChild(amountInput);
        inputContainer.appendChild(contributeButton);
        fundraisingInput.appendChild(inputContainer);
    } else {
        const connectButton = createElement('button', {
            class: 'connect-button',
            onclick: connectWallet
        }, 'CONNECT WALLET');
        fundraisingInput.appendChild(connectButton);
    }
    
    // Add fundraising input to referral section
    referralSection.appendChild(fundraisingInput);
    
    // Create referral content
    const referralContent = createElement('div', { class: 'referral-content' });
    
    // Referral title
    const referralTitle = createElement('h3', { class: 'referral-title' }, 'YOUR REFERRAL LINK');
    
    // Referral link
    const referralLink = createElement('div', { class: 'referral-link' },
        generateReferralLink()
    );
    
    // Copy button
    const copyButton = createElement('button', {
        class: 'copy-button',
        onclick: copyReferralLink
    }, '📋 COPY REFERRAL LINK');
    
    // Stats section
    const statsSection = createElement('div', { class: 'stats-section' });
    const statsTitle = createElement('h4', { class: 'stats-title' }, 'Private Sale Through Your Link');
    const statsContainer = createElement('div', { class: 'stats-container' });
    const totalStats = createElement('div', { class: 'total-stats' });
    const statLabel = createElement('div', { class: 'stat-label' }, 'Total Referral Earnings:');
    const statValue = createElement('div', { class: 'stat-value' }, `${referralStats ? referralStats.totalAmount.toFixed(1) : '0.0'} SOL`);
    totalStats.append(statLabel, statValue);
    statsContainer.appendChild(totalStats);
    if (referralStats && referralStats.transactions.length > 0) {
      const transactionsList = createElement('div', { class: 'transactions-list' });
      const transactionsHeader = createElement('div', { class: 'transactions-header' }, 'Recent Referrals:');
      transactionsList.appendChild(transactionsHeader);
      referralStats.transactions.forEach(tx => {
        const transactionItem = createElement('div', { class: 'transaction-item' });
        const amount = createElement('span', { class: 'amount' }, `+${tx.amount.toFixed(1)} SOL`);
        const time = createElement('span', { class: 'time' }, new Date(tx.timestamp * 1000).toLocaleString());
        transactionItem.append(amount, time);
        transactionsList.appendChild(transactionItem);
      });
      statsContainer.appendChild(transactionsList);
    } else {
      const noTransactions = createElement('div', { class: 'no-transactions' }, 'No private sale through your link yet');
      statsContainer.appendChild(noTransactions);
    }
    statsSection.append(statsTitle, statsContainer);
    const refreshButton = createElement('button', {
        class: 'refresh-button',
        onclick: fetchRealTimeStats
    }, '🔄 REFRESH STATS');
    statsSection.appendChild(refreshButton);
    referralContent.append(referralTitle, referralLink, copyButton, statsSection);
    referralSection.appendChild(referralContent);
    
    // Create user presale stats section
    const userPresaleStatsSection = createElement('div', { class: 'user-presale-stats-section' });
    const userPresaleStatsTitle = createElement('h4', { class: 'user-presale-stats-title' }, 'Your Private Sale Stats');
    const userPresaleStatsValue = createElement('div', { class: 'user-presale-stats-value' }, `Your Private Sale Contribution: ${userPresaleStats.solAmount.toFixed(1)} SOL`);
    const userPresaleStatsTokenValue = createElement('div', { class: 'user-presale-stats-token-value' }, `Your Private Sale Tokens: ${userPresaleStats.tokenAmount} TDOGE`);
    userPresaleStatsSection.append(userPresaleStatsTitle, userPresaleStatsValue, userPresaleStatsTokenValue);
    referralSection.appendChild(userPresaleStatsSection);
    
    container.appendChild(referralSection);

    // Create main features section
    const mainFeaturesSection = createElement('div', { class: 'main-features-section' });
    mainFeaturesSection.appendChild(
      createElement('h3', { class: 'section-title' }, 'The People\'s Crypto')
    );

    const mainFeatures = [
      {
        title: 'Presidential Partnership',
        description: '50% tokens dedicated to Trump Foundation initiatives - Making America and Crypto Great Again!'
      },
      {
        title: 'Revolutionary Growth Model',
        description: 'Innovative 500% price increase unlocking mechanism - Proven success in the Trump era'
      },
      {
        title: 'America First Crypto',
        description: 'Built on Solana - Fast, secure, and energy-efficient American technology'
      },
      {
        title: 'Patriot Community',
        description: 'Join millions of patriots in the fastest-growing crypto community'
      }
    ];

    const mainFeaturesList = createElement('div', { class: 'features-list' });
    mainFeatures.forEach(feature => {
      const featureCard = createElement('div', { class: 'feature-card' });
      featureCard.appendChild(
        createElement('h4', { class: 'feature-title' }, feature.title)
      );
      featureCard.appendChild(
        createElement('p', { class: 'feature-description' }, feature.description)
      );
      mainFeaturesList.appendChild(featureCard);
    });
    mainFeaturesSection.appendChild(mainFeaturesList);

    // Add achievement banner
    const achievementBanner = createElement('div', { class: 'achievement-banner' });
    achievementBanner.appendChild(
      createElement('h3', { class: 'achievement-title' }, '🏆 TRUMP DOGE Achievements')
    );

    const achievements = [
      'Fastest Growing Crypto of 2025',
      'Official Partner of Trump Foundation',
      'Over 1 Million Patriot Holders',
      'Most Secure Token Launch of 2025'
    ];

    achievements.forEach(achievement => {
      achievementBanner.appendChild(
        createElement('div', { class: 'achievement-item' }, `✓ ${achievement}`)
      );
    });

    mainFeaturesSection.appendChild(achievementBanner);
    container.appendChild(mainFeaturesSection);

    // Project description
    const description = createElement('div', { class: 'description-section' });
    description.appendChild(
      createElement('h2', { class: 'description-title' }, 'About TRUMP DOGE')
    );
    description.appendChild(
      createElement('p', { class: 'description-text' }, 
        'TRUMP DOGE is the most tremendous, absolutely fantastic fusion of two legendary meme communities. We\'re combining the unstoppable energy of DOGE with the winning spirit of TRUMP to create something truly spectacular!'
      )
    );
    description.appendChild(
      createElement('p', { class: 'description-text' }, 
        'Our mission is simple: We\'re going to make crypto great again, and we\'re going to make it greater than ever before! 🚀'
      )
    );

    // Key Features section
    const descriptionFeatures = [
      {
        title: 'HUGE Community Power',
        description: 'Join the strongest and most passionate community in crypto. We have the best people, absolutely the best!'
      },
      {
        title: 'TREMENDOUS Security',
        description: 'Built with the most secure and reliable blockchain technology. Nobody does security better than us!'
      },
      {
        title: 'INCREDIBLE Growth',
        description: 'Our token price only goes up, it\'s true! The gains are going to be beautiful, believe me!'
      },
      {
        title: 'AMAZING Team',
        description: 'We have assembled the greatest team in crypto. These people are incredible, they\'re winners!'
      }
    ];

    const descriptionFeaturesList = createElement('div', { class: 'description-features-list' });
    descriptionFeatures.forEach(feature => {
      const featureCard = createElement('div', { class: 'description-feature-card' });
      featureCard.appendChild(
        createElement('h4', { class: 'description-feature-title' }, feature.title)
      );
      featureCard.appendChild(
        createElement('p', { class: 'description-feature-text' }, feature.description)
      );
      descriptionFeaturesList.appendChild(featureCard);
    });
    description.appendChild(descriptionFeaturesList);

    // Add tokenomics section
    const tokenomics = createElement('div', { class: 'tokenomics-section' });
    tokenomics.appendChild(
      createElement('h3', { class: 'tokenomics-title' }, 'TRUMP DOGE Tokenomics')
    );

    const tokenomicsDetails = [
      'Total Supply: 10,000,000,000 $TRUMPDOGE',
      'Private Sale: 45%',
      'Liquidity Pool: 5%',
      'Trump Foundation: 50%'
    ];

    const tokenomicsList = createElement('div', { class: 'tokenomics-list' });
    tokenomicsDetails.forEach(detail => {
      tokenomicsList.appendChild(
        createElement('div', { class: 'tokenomics-item' }, `🔥 ${detail}`)
      );
    });
    tokenomics.appendChild(tokenomicsList);

    // Add vesting schedule
    const vestingSchedule = createElement('div', { class: 'vesting-schedule' });
    vestingSchedule.appendChild(
      createElement('h3', { class: 'vesting-title' }, 'Vesting Schedule')
    );

    const vestingDetails = [
      'Launch: 4.5% Unlock',
      '1% Unlock per 500% Price Increase'
    ];

    vestingDetails.forEach(detail => {
      vestingSchedule.appendChild(
        createElement('div', { class: 'vesting-item' }, `🚀 ${detail}`)
      );
    });
    tokenomics.appendChild(vestingSchedule);
    description.appendChild(tokenomics);

    // Add roadmap
    const roadmap = createElement('div', { class: 'roadmap-section' });
    roadmap.appendChild(
      createElement('h3', { class: 'roadmap-title' }, 'The Greatest Roadmap Ever')
    );

    const roadmapPhases = [
      'Phase 1: Launch & Community Building 🚀',
      'Phase 2: Exchange Listings & Partnerships 🤝',
      'Phase 3: TRUMP DOGE Ecosystem Expansion 🌟'
    ];

    roadmapPhases.forEach(phase => {
      roadmap.appendChild(
        createElement('p', { class: 'roadmap-item' }, phase)
      );
    });

    description.appendChild(roadmap);
    container.appendChild(description);

    // Add social links section at the bottom
    const socialLinks = createElement('div', { class: 'social-links-container' });
    
    const communityText = createElement('div', { class: 'community-text' }, 'JOIN COMMUNITY');
    const socialIconsContainer = createElement('div', { class: 'social-links' });
    
    // Twitter/X link
    const xLink = createElement('a', { 
      class: 'social-link',
      href: 'https://x.com/TRUMPDogecoin_',
      target: '_blank',
      rel: 'noopener noreferrer'
    });
    const xIcon = createElement('img', {
      class: 'social-icon',
      src: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMzAwIiBoZWlnaHQ9IjMwMCIgdmlld0JveD0iMCAwIDMwMCAzMDAiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PHBhdGggZD0iTTIzNi43NDggNDEuOTU1TDE1MS4zMjkgMTQ1LjE5TDIzOC45NDEgMjU4LjA0NUgxOTYuNjE4TDEzNy45NjEgMTgwLjA3NEw3MC4yNjQ1IDI1OC4wNDVIMjQuNjIwNkwxMTQuOTg4IDE0OS4wMTlMMzEuMTcxNyA0MS45NTVINzQuNzE1Mkw xMjcuNzIyIDExMy40NzFMMTkwLjg4NCA0MS45NTVIMjM2Ljc0OFoiIGZpbGw9IiNGRkZGRkYiLz48L3N2Zz4=',
      alt: 'X (Twitter) Icon'
    });
    xLink.appendChild(xIcon);
    
    // Telegram link
    const telegramLink = createElement('a', { 
      class: 'social-link',
      href: 'https://t.me/TDOGE1',
      target: '_blank',
      rel: 'noopener noreferrer'
    });
    const telegramIcon = createElement('img', {
      class: 'social-icon',
      src: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCI+PHBhdGggZmlsbD0iI2ZmZmZmZiIgZD0iTTkuNzggMTguNjVMOS45NiAxNC4zTDkuOTYgMTQuM0wxNy4wOSA3Ljk3QzE3LjQyIDcuNjggMTcuMDIgNy41MyAxNi41OSA3Ljc5TDcuODEgMTMuMDlMMy41NiAxMS43NUMzLjU2IDExLjc1IDIuNjQgMTEuNDYgMi42NCAxMC43NUMyLjY0IDEwLjE3IDMuNzcgOS44NSA0LjM4IDkuNjJMNS4wNCA5LjM3TDE4Ljc2IDMuODRDMTguNzYgMy44NCAyMi41IDIuNDEgMjIuNSA0Ljk1QzIyLjUgNS45NSAyMS44OCA2LjM3IDIxLjg4IDYuMzdMMjEuODggNi4zN0wxOC4yOSAxOC4zMUMxOC4yOSAxOC4zMSAxNy44NSAxOS42MSAxNi42NSAxOS42MUMxNS42IDE5LjYxIDE0LjgzIDE4LjkyIDE0LjgzIDE4LjkyTDE0LjgzIDE4LjkyTDExLjQyIDE2LjQxTDkuNzggMTguNjVaIi8+PC9zdmc+',
      alt: 'Telegram Icon'
    });
    telegramLink.appendChild(telegramIcon);
    
    socialIconsContainer.append(xLink, telegramLink);
    socialLinks.append(communityText, socialIconsContainer);
    container.appendChild(socialLinks);

    root.appendChild(container);
  };

  // Initial render
  renderApp();
}

// Start the application
window.onload = createApp;