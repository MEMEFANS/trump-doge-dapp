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

  // Get referral ID from URL if exists
  const urlParams = new URLSearchParams(window.location.search);
  const ref = urlParams.get('ref');
  if (ref) {
    referralId = ref;
    // Store referral ID in localStorage
    localStorage.setItem('referralId', ref);
  } else {
    // Check if there's a stored referral ID
    const storedRef = localStorage.getItem('referralId');
    if (storedRef) {
      referralId = storedRef;
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
      await navigator.clipboard.writeText(link);
      alert('Referral link copied to clipboard!');
    } catch (err) {
      console.error('Failed to copy:', err);
      alert('Failed to copy referral link');
    }
  }

  const connectWallet = async () => {
    try {
      // Check for Solana object from Phantom wallet
      const provider = window.solana;
      
      if (!provider) {
        alert('Please install Phantom wallet!');
        return;
      }

      try {
        // Try to connect
        const response = await provider.connect();
        walletAddress = response.publicKey.toString();
        console.log('Connected to wallet:', walletAddress);
        
        // Store provider for later use
        window.solanaProvider = provider;
        
        // Fetch referral stats after connecting
        await fetchReferralStats();
        
        renderApp();
      } catch (err) {
        console.error('Connection error:', err);
        alert('Failed to connect wallet. Please try again!');
      }
    } catch (error) {
      console.error('Error:', error);
      alert('Wallet connection failed. Please try again!');
    }
  };

  // Initialize connection outside of the function
  const connection = new solanaWeb3.Connection(
    "https://black-lingering-fog.solana-mainnet.quiknode.pro/4d7783df09fe07db6ce511d870249fc3eb642683",
    {
      commitment: "confirmed",
      wsEndpoint: "wss://black-lingering-fog.solana-mainnet.quiknode.pro/4d7783df09fe07db6ce511d870249fc3eb642683"
    }
  );

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

      const recipientAddress = '4RNFQfHE2EdpLQRLWVMzTs8KUMxJi9bV21uzFJUktQQF';
      
      try {
        // Convert amount to lamports
        const lamports = Math.floor(amount * solanaWeb3.LAMPORTS_PER_SOL);

        // Create transaction
        const transaction = new solanaWeb3.Transaction();

        // Add memo instruction if there's a referral
        if (referralId) {
          const memoInstruction = new solanaWeb3.TransactionInstruction({
            keys: [],
            programId: new solanaWeb3.PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr'),
            data: Buffer.from(`ref:${referralId}`)
          });
          transaction.add(memoInstruction);
        }

        // Create transfer instruction
        const transferInstruction = solanaWeb3.SystemProgram.transfer({
          fromPubkey: new solanaWeb3.PublicKey(walletAddress),
          toPubkey: new solanaWeb3.PublicKey('4RNFQfHE2EdpLQRLWVMzTs8KUMxJi9bV21uzFJUktQQF'),
          lamports: lamports
        });

        // Add transfer instruction
        transaction.add(transferInstruction);

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

  // Fetch referral statistics
  const fetchReferralStats = async () => {
    if (!walletAddress) return;
    
    try {
      // Get all signatures for the recipient address
      const signatures = await connection.getSignaturesForAddress(
        new solanaWeb3.PublicKey('4RNFQfHE2EdpLQRLWVMzTs8KUMxJi9bV21uzFJUktQQF'),
        { limit: 1000 }
      );

      let total = 0;
      const txs = [];

      // Process each transaction
      for (const sig of signatures) {
        const tx = await connection.getTransaction(sig.signature, {
          maxSupportedTransactionVersion: 0
        });

        if (!tx || !tx.meta || tx.meta.err) continue;

        // Look for memo instruction with referral
        const memoInstr = tx.transaction.message.instructions.find(instr => 
          instr.programId.toString() === 'MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr'
        );

        if (memoInstr) {
          const memo = Buffer.from(memoInstr.data).toString();
          if (memo.startsWith('ref:') && memo.slice(4) === walletAddress) {
            // Find the transfer instruction
            const transferInstr = tx.transaction.message.instructions.find(instr =>
              instr.programId.toString() === '11111111111111111111111111111111'
            );

            if (transferInstr) {
              const amount = transferInstr.data.readBigUInt64LE(0) / BigInt(solanaWeb3.LAMPORTS_PER_SOL);
              total += Number(amount);
              txs.push({
                signature: sig.signature,
                amount: Number(amount),
                timestamp: sig.blockTime,
                from: tx.transaction.message.accountKeys[0].toString()
              });
            }
          }
        }
      }

      referralStats = {
        totalAmount: total,
        transactions: txs.sort((a, b) => b.timestamp - a.timestamp)
      };

      renderApp();
    } catch (error) {
      console.error('Error fetching referral stats:', error);
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
    const statsTitle = createElement('h4', { class: 'stats-title' }, 'Investment Statistics');
    const statsValue = createElement('div', { class: 'stats-value' }, `Total Investment Through Your Link: ${referralStats.totalAmount.toFixed(2)} SOL`);
    const statsNote = createElement('div', { class: 'stats-note' }, 'No investments through your link yet');
    
    // Refresh button
    const refreshButton = createElement('button', {
        class: 'refresh-button',
        onclick: fetchReferralStats
    }, '🔄 REFRESH STATS');
    
    // Append all elements
    statsSection.append(statsTitle, statsValue, statsNote, refreshButton);
    referralContent.append(referralTitle, referralLink, copyButton, statsSection);
    referralSection.appendChild(referralContent);
    
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

    root.appendChild(container);
  };

  // Initial render
  renderApp();
}

// Start the application
window.onload = createApp;
