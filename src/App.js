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
        referralStats = JSON.parse(savedStats);
      }
    } catch (err) {
      console.error('Error loading saved stats:', err);
    }
  }

  // Save referral stats to localStorage
  function saveReferralStats(stats) {
    if (isStorageAvailable()) {
      try {
        localStorage.setItem('referralStats', JSON.stringify(stats));
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
    const baseUrl = window.location.origin;
    const ref = walletAddress;
    return `${baseUrl}?ref=${ref}`;
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
        
        // 连接成功后获取数据
        await Promise.all([
          fetchUserPresaleStats(),
          fetchReferralStats()
        ]);

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
          fetchReferralStats()
        ]);
        renderApp();
      } catch (err) {
        console.log('Auto reconnect failed:', err);
      }
    }
  };

  // 页面加载完成后自动重连
  window.addEventListener('load', autoReconnectWallet);

  // Initialize connection outside of the function
  const connection = new solanaWeb3.Connection(
    "https://black-lingering-fog.solana-mainnet.quiknode.pro/4d7783df09fe07db6ce511d870249fc3eb642683",
    {
      commitment: "confirmed",
      wsEndpoint: "wss://black-lingering-fog.solana-mainnet.quiknode.pro/4d7783df09fe07db6ce511d870249fc3eb642683"
    }
  );

  // 获取用户私募数据
  const fetchUserPresaleStats = async () => {
    try {
      if (!connection || !walletAddress) {
        console.log('No connection or wallet');
        return;
      }

      // 私募合约地址
      const presaleAddress = new solanaWeb3.PublicKey('4FU4rwed2zZAzqmn5FJYZ6oteGxdZrozamvYVAjTvopX');
      
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

  // 获取推荐统计数据
  const fetchReferralStats = async () => {
    if (!connection || !walletAddress) return;
    
    try {
      // 获取所有转账到私募地址的交易
      const signatures = await connection.getSignaturesForAddress(
        new solanaWeb3.PublicKey('4FU4rwed2zZAzqmn5FJYZ6oteGxdZrozamvYVAjTvopX'),
        { limit: 100 }
      );

      let totalAmount = 0;
      const transactions = [];

      // 处理每个交易
      for (const sig of signatures) {
        try {
          const tx = await connection.getTransaction(sig.signature, {
            maxSupportedTransactionVersion: 0
          });

          if (!tx || !tx.meta || tx.meta.err) continue;

          // 确保交易消息和账户存在
          if (!tx.transaction?.message?.accountKeys?.[0]) continue;

          const message = tx.transaction.message;
          
          // 查找 Memo 指令
          const memoInstr = message.instructions.find(instr => 
            instr.programId && instr.programId.toString() === 'MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr'
          );

          if (memoInstr && memoInstr.data) {
            const memoData = Buffer.from(memoInstr.data).toString();
            
            // 检查 memo 是否包含当前钱包地址
            if (memoData.includes(walletAddress)) {
              // 查找转账指令
              const transferInstr = message.instructions.find(instr =>
                instr.programId && instr.programId.toString() === '11111111111111111111111111111111'
              );

              if (transferInstr) {
                const fromIndex = message.accountKeys.findIndex(key => 
                  key && key.toString() === message.accountKeys[0].toString()
                );

                if (fromIndex !== -1) {
                  const preBalances = tx.meta.preBalances;
                  const postBalances = tx.meta.postBalances;
                  const amount = (preBalances[fromIndex] - postBalances[fromIndex]) / solanaWeb3.LAMPORTS_PER_SOL;

                  if (amount > 0) {
                    totalAmount += amount;
                    transactions.push({
                      signature: sig.signature,
                      amount: amount,
                      timestamp: tx.blockTime
                    });
                  }
                }
              }
            }
          }
        } catch (err) {
          console.error('Error processing transaction:', err);
          continue;
        }
      }

      // 更新推荐统计
      referralStats = {
        totalAmount: totalAmount,
        transactions: transactions.sort((a, b) => b.timestamp - a.timestamp)
      };

      // 保存到 localStorage
      try {
        localStorage.setItem('referralStats', JSON.stringify(referralStats));
      } catch (err) {
        console.error('Error saving referral stats:', err);
      }

      renderApp();
    } catch (error) {
      console.error('Error fetching referral stats:', error);
    }
  };

  const handleDonate = async () => {
    try {
      if (!window.solana) {
        alert('Please install Phantom wallet!');
        return;
      }

      if (!walletAddress) {
        alert('Please connect your wallet first!');
        return;
      }

      if (!amount || amount <= 0) {
        alert('Please enter a valid amount!');
        return;
      }

      if (amount < 0.1) {
        alert('Minimum investment is 0.1 SOL!');
        return;
      }

      const recipientAddress = '4FU4rwed2zZAzqmn5FJYZ6oteGxdZrozamvYVAjTvopX';
      
      try {
        // Convert amount to lamports
        const lamports = Math.floor(amount * solanaWeb3.LAMPORTS_PER_SOL);

        // Create transaction
        const transaction = new solanaWeb3.Transaction().add(
          solanaWeb3.SystemProgram.transfer({
            fromPubkey: new solanaWeb3.PublicKey(walletAddress),
            toPubkey: new solanaWeb3.PublicKey('4FU4rwed2zZAzqmn5FJYZ6oteGxdZrozamvYVAjTvopX'),
            lamports: lamports
          })
        );

        // Add memo instruction if there's a referral
        if (referralId) {
          const memoInstruction = new solanaWeb3.TransactionInstruction({
            keys: [],
            programId: new solanaWeb3.PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr'),
            data: Buffer.from(`ref:${referralId}`)
          });
          transaction.add(memoInstruction);
        }

        // Get latest blockhash
        const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
        transaction.recentBlockhash = blockhash;
        transaction.feePayer = new solanaWeb3.PublicKey(walletAddress);

        // Request signature from wallet
        const { signature } = await window.solana.signAndSendTransaction(transaction);
        console.log('Transaction sent:', signature);

        // Wait for confirmation
        console.log('Waiting for confirmation...');
        const confirmationStatus = await connection.confirmTransaction({
          signature,
          blockhash,
          lastValidBlockHeight
        }, 'confirmed');

        console.log('Transaction confirmed:', confirmationStatus);

        if (confirmationStatus.value && confirmationStatus.value.err) {
          throw new Error('Transaction failed');
        }

        alert('Transaction successful! Thank you for your support!');
        amount = '';
        renderApp();
      } catch (err) {
        console.error('Transaction error:', err);
        if (err.message.includes('User rejected')) {
          alert('Transaction was cancelled by user');
        } else {
          alert('Transaction failed. Please check your wallet balance and try again!');
        }
      }
    } catch (error) {
      console.error('Error:', error);
      alert('Transaction failed. Please make sure you have enough SOL and try again!');
    }
  };

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
            onclick: handleDonate
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
    const statsValue = createElement('div', { class: 'stats-value' }, `Total: ${referralStats.totalAmount.toFixed(2)} SOL`);
    const statsTokenValue = createElement('div', { class: 'stats-token-value' }, `≈ ${(referralStats.totalAmount * 225000).toLocaleString()} TDOGE`);
    const statsNote = createElement('div', { class: 'stats-note' }, referralStats.totalAmount > 0 ? '' : 'No private sale through your link yet');
    
    // Refresh button
    const refreshButton = createElement('button', {
        class: 'refresh-button',
        onclick: fetchReferralStats
    }, '🔄 REFRESH STATS');
    
    // Append all elements
    statsSection.append(statsTitle, statsValue, statsTokenValue, statsNote, refreshButton);
    referralContent.append(referralTitle, referralLink, copyButton, statsSection);
    referralSection.appendChild(referralContent);
    
    // Create user presale stats section
    const userPresaleStatsSection = createElement('div', { class: 'user-presale-stats-section' });
    const userPresaleStatsTitle = createElement('h4', { class: 'user-presale-stats-title' }, 'Your Private Sale Stats');
    const userPresaleStatsValue = createElement('div', { class: 'user-presale-stats-value' }, `Your Private Sale Contribution: ${userPresaleStats.solAmount.toFixed(2)} SOL`);
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