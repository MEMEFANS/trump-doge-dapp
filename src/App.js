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
    return `${window.location.origin}/?ref=${walletAddress}`;
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

      console.log(`\n找到 ${signatures.length} 笔交易`);

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

  // 添加 Memo 数据
  const addReferralMemo = async () => {
    if (!walletAddress) return;
    
    const urlParams = new URLSearchParams(window.location.search);
    const ref = urlParams.get('ref');
    
    if (ref) {
      try {
        // 验证推荐人地址
        const refPubkey = new solanaWeb3.PublicKey(ref);
        console.log('添加推荐 Memo:', refPubkey.toBase58());
        memoStr = refPubkey.toBase58();
      } catch (e) {
        console.error('无效的推荐地址:', e);
        memoStr = '';
      }
    }
  };

  // 获取推荐统计数据
  const fetchReferralStats = async () => {
    if (!connection || !walletAddress) {
      console.log('❌ 连接或钱包地址为空');
      return;
    }
    
    try {
      console.log('\n=== 开始获取推荐统计 ===');
      console.log('👛 钱包地址:', walletAddress);
      
      // 获取最近的交易
      const signatures = await connection.getSignaturesForAddress(
        new solanaWeb3.PublicKey('4FU4rwed2zZAzqmn5FJYZ6oteGxdZrozamvYVAjTvopX'),
        { 
          limit: 1000,
          commitment: 'confirmed'
        }
      );

      console.log(`\n找到 ${signatures.length} 笔交易`);

      let totalAmount = 0;
      const transactions = [];

      for (const sig of signatures) {
        try {
          console.log('\n检查交易:', sig.signature);
          
          // 使用 confirmed commitment 获取交易
          const tx = await connection.getTransaction(sig.signature, {
            maxSupportedTransactionVersion: 0,
            commitment: 'confirmed'
          });
          
          if (!tx) {
            console.log('交易未确认');
            continue;
          }

          if (!tx.meta) {
            console.log('交易meta为空');
            continue;
          }

          if (tx.meta.err) {
            console.log('交易失败:', tx.meta.err);
            continue;
          }

          // 检查转账金额
          const preBalance = tx.meta.preBalances[0];
          const postBalance = tx.meta.postBalances[0];
          const amount = (preBalance - postBalance) / solanaWeb3.LAMPORTS_PER_SOL;
          const roundedAmount = Math.floor(amount * 10) / 10; // 向下取整到0.1位
          
          console.log('转账金额:', amount.toFixed(4), 'SOL');
          console.log('保留1位小数:', roundedAmount.toFixed(1), 'SOL');
          
          // 检查是否大于等于0.1 SOL
          if (roundedAmount < 0.1) {
            console.log('金额小于 0.1 SOL');
            continue;
          }

          // 检查交易指令
          if (!tx.transaction?.message?.instructions) {
            console.log('无交易指令');
            continue;
          }

          // 查找 Memo 指令
          let foundMemo = false;
          for (const instr of tx.transaction.message.instructions) {
            try {
              if (!instr.programId) continue;

              const programId = instr.programId.toBase58();
              if (programId === 'MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr') {
                if (!instr.data) {
                  console.log('Memo数据为空');
                  continue;
                }

                const memoData = Buffer.from(instr.data).toString('utf8').trim();
                console.log('Memo内容:', memoData);
                console.log('当前钱包:', walletAddress);

                try {
                  const memoPubkey = new solanaWeb3.PublicKey(memoData);
                  const walletPubkey = new solanaWeb3.PublicKey(walletAddress);
                  
                  if (memoPubkey.toBase58() === walletPubkey.toBase58()) {
                    console.log('✅ 找到推荐交易!');
                    console.log('详情:', {
                      signature: sig.signature,
                      originalAmount: amount.toFixed(4),
                      roundedAmount: roundedAmount.toFixed(1),
                      time: tx.blockTime ? new Date(tx.blockTime * 1000).toLocaleString() : 'unknown'
                    });
                    
                    totalAmount += roundedAmount; // 使用四舍五入后的金额
                    transactions.push({
                      signature: sig.signature,
                      amount: roundedAmount, // 使用四舍五入后的金额
                      timestamp: tx.blockTime || Date.now() / 1000
                    });
                    
                    foundMemo = true;
                    break;
                  } else {
                    console.log('❌ Memo地址与钱包不匹配');
                    console.log('Memo地址:', memoPubkey.toBase58());
                    console.log('钱包地址:', walletPubkey.toBase58());
                  }
                } catch (e) {
                  console.log('❌ Memo不是有效的钱包地址:', e.message);
                  continue;
                }
              }
            } catch (e) {
              console.log('处理指令出错:', e.message);
              continue;
            }
          }

          if (!foundMemo) {
            console.log('未找到匹配的Memo');
          }

        } catch (err) {
          console.error('处理交易出错:', err.message);
          continue;
        }
      }

      console.log('\n=== 统计结果 ===');
      console.log('总金额:', totalAmount.toFixed(4), 'SOL');
      console.log('交易数量:', transactions.length);

      referralStats = {
        totalAmount: totalAmount,
        transactions: transactions.sort((a, b) => b.timestamp - a.timestamp)
      };

      renderApp();
    } catch (error) {
      console.error('获取统计出错:', error.message);
    }
  };

  // 处理捐赠
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

      // 创建交易
      const transaction = new solanaWeb3.Transaction();

      // 添加转账指令
      transaction.add(
        solanaWeb3.SystemProgram.transfer({
          fromPubkey: new solanaWeb3.PublicKey(walletAddress),
          toPubkey: new solanaWeb3.PublicKey('4FU4rwed2zZAzqmn5FJYZ6oteGxdZrozamvYVAjTvopX'),
          lamports: Math.floor(amount * solanaWeb3.LAMPORTS_PER_SOL)
        })
      );

      // 如果有推荐人，添加 memo 指令
      if (referralId) {
        console.log('Adding referral memo:', referralId);
        transaction.add(
          new solanaWeb3.TransactionInstruction({
            keys: [],
            programId: new solanaWeb3.PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr'),
            data: Buffer.from(referralId)
          })
        );
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

      alert('Transaction successful!');
      
      // 刷新统计
      await Promise.all([
        fetchUserPresaleStats(),
        fetchReferralStats()
      ]);

      // 清空输入
      amount = '';
      renderApp();

    } catch (error) {
      console.error('Transaction error:', error);
      if (error.message.includes('User rejected')) {
        alert('Transaction cancelled by user');
      } else {
        alert('Transaction failed. Please try again!');
      }
    }
  };

  const renderApp = () => {
    const statsHtml = referralStats ? `
      <div class="text-center mt-4">
        <h4>Your Private Sale Stats</h4>
        <p>
          Total Referral Earnings: ${referralStats.totalAmount.toFixed(1)} SOL
        </p>
        ${referralStats.transactions.length > 0 ? `
          <div class="mt-3">
            <h5>Recent Referral Transactions:</h5>
            ${referralStats.transactions.map(tx => `
              <div class="mt-2">
                <small>Amount: ${tx.amount.toFixed(1)} SOL</small><br>
                <small>Time: ${new Date(tx.timestamp * 1000).toLocaleString()}</small>
              </div>
            `).join('')}
          </div>
        ` : '<p>No private sale through your link yet</p>'}
      </div>
    ` : '';

    const content = `
      <div class="container">
        <div class="text-center py-4">
          <h1>TRUMP DOGE 2025</h1>
          <h2>CRYPTO IS GREAT AGAIN! 🚀</h2>
          <p>Official Crypto of the Trump Administration</p>
        </div>

        <div class="row justify-content-center">
          <div class="col-md-6">
            <div class="card mb-4">
              <div class="card-body">
                <div class="row">
                  <div class="col-6">
                    <div class="text-center mb-4">
                      <h5>PRIVATE SALE ALLOCATION</h5>
                      <h2>45%</h2>
                    </div>
                  </div>
                  <div class="col-6">
                    <div class="text-center mb-4">
                      <h5>MIN INVESTMENT</h5>
                      <h2>0.1 SOL</h2>
                    </div>
                  </div>
                </div>
                <div class="row">
                  <div class="col-6">
                    <div class="text-center">
                      <h5>TOTAL SUPPLY</h5>
                      <h2>10,000,000,000 TDOGE</h2>
                    </div>
                  </div>
                  <div class="col-6">
                    <div class="text-center">
                      <h5>PRICE</h5>
                      <h2>1 SOL = ${calculateTokens(1)} TDOGE</h2>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            ${walletAddress ? `
              <div class="card mb-4">
                <div class="card-body">
                  <p class="text-center mb-2">Connected: ${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}</p>
                  <div class="form-group">
                    <input type="number" class="form-control text-center mb-3" value="0.1" step="0.1" min="0.1" id="amount" />
                  </div>
                  <button class="btn btn-warning btn-lg w-100" onclick="handleDonate()">CONTRIBUTE NOW</button>
                </div>
              </div>

              <div class="card mb-4">
                <div class="card-body">
                  <h4 class="text-center mb-3">YOUR REFERRAL LINK</h4>
                  <div class="input-group mb-3">
                    <input type="text" class="form-control" readonly value="${generateReferralLink()}" id="referral-link" />
                    <button class="btn btn-success" onclick="copyReferralLink()">
                      📋 COPY REFERRAL LINK
                    </button>
                  </div>
                  <p class="text-center text-success mb-0">Private Sale Through Your Link</p>
                  ${statsHtml}
                </div>
              </div>
            ` : `
              <div class="card mb-4">
                <div class="card-body text-center">
                  <button class="btn btn-lg btn-primary" onclick="connectWallet()">Connect Wallet</button>
                </div>
              </div>
            `}
          </div>
        </div>
      </div>
    `;

    document.getElementById('app').innerHTML = content;
  };

  // Initial render
  renderApp();
}

// Start the application
window.onload = createApp;