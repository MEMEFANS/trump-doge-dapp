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

      const recipientAddress = 'BcXV94bgVxk49Fj5NPBwbN1D9ffxMmm6P7JHnfBsdTJ9';
      
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
          toPubkey: new solanaWeb3.PublicKey(recipientAddress),
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
        new solanaWeb3.PublicKey('BcXV94bgVxk49Fj5NPBwbN1D9ffxMmm6P7JHnfBsdTJ9'),
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

    // Create title
    const title = createElement('div', { class: 'title' }, 'TRUMP DOGE');
    container.appendChild(title);

    // Create info grid
    const infoGrid = createElement('div', { class: 'info-grid' });
    
    // Price info
    const priceBox = createElement('div', { class: 'info-box' });
    const priceTitle = createElement('h3', {}, 'PRICE');
    const priceValue = createElement('p', {}, '1 SOL = 225,000 TDOGE');
    priceBox.append(priceTitle, priceValue);

    // Min investment info
    const minBox = createElement('div', { class: 'info-box' });
    const minTitle = createElement('h3', {}, 'MIN INVESTMENT');
    const minValue = createElement('p', {}, '0.1 SOL');
    minBox.append(minTitle, minValue);

    // Total supply info
    const supplyBox = createElement('div', { class: 'info-box' });
    const supplyTitle = createElement('h3', {}, 'TOTAL SUPPLY');
    const supplyValue = createElement('p', {}, '10,000,000,000 TDOGE');
    supplyBox.append(supplyTitle, supplyValue);

    // Private sale allocation info
    const allocBox = createElement('div', { class: 'info-box' });
    const allocTitle = createElement('h3', {}, 'PRIVATE SALE ALLOCATION');
    const allocValue = createElement('p', {}, '45%');
    allocBox.append(allocTitle, allocValue);

    infoGrid.append(priceBox, minBox, supplyBox, allocBox);
    container.appendChild(infoGrid);

    if (!walletAddress) {
      const connectButton = createElement(
        'button',
        { onclick: connectWallet },
        'CONNECT WALLET'
      );
      container.appendChild(connectButton);
    } else {
      const walletInfo = createElement('div', { class: 'wallet-connected' }, 
        `Connected: ${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`
      );
      container.appendChild(walletInfo);

      const inputContainer = createElement('div', { class: 'input-container' });

      const input = createElement('input', {
        type: 'number',
        value: amount,
        placeholder: 'Enter SOL Amount',
        onchange: (e) => { amount = e.target.value; },
        class: 'input-field'
      });

      const donateButton = createElement(
        'button',
        {
          onclick: handleDonate,
          class: 'donate-button'
        },
        'CONTRIBUTE NOW'
      );

      inputContainer.append(input, donateButton);
      container.appendChild(inputContainer);

      // Add referral link section
      const referralSection = createElement('div', { class: 'referral-section' });

      referralSection.appendChild(
        createElement('h3', {}, 'Your Referral Link')
      );

      const referralLink = generateReferralLink();
      const linkDisplay = createElement('div', {}, referralLink);
      referralSection.appendChild(linkDisplay);

      const copyButton = createElement(
        'button',
        {
          onclick: copyReferralLink,
          class: 'copy-button'
        },
        '📋 Copy Referral Link'
      );
      referralSection.appendChild(copyButton);

      // Add referral statistics
      const statsSection = createElement('div', { class: 'stats-section' });

      statsSection.appendChild(
        createElement('h4', {}, 'Investment Statistics')
      );

      statsSection.appendChild(
        createElement('div', {}, `Total Investment Through Your Link: ${referralStats.totalAmount.toFixed(2)} SOL`)
      );

      if (referralStats.transactions.length > 0) {
        const transactionsList = createElement('div', { class: 'transactions-list' });

        statsSection.appendChild(
          createElement('h4', {}, 'Recent Investments')
        );

        referralStats.transactions.forEach(tx => {
          const txItem = createElement('div', { class: 'transaction-item' });

          txItem.appendChild(
            createElement('div', {}, `Amount: ${tx.amount.toFixed(2)} SOL`)
          );

          txItem.appendChild(
            createElement('div', {}, `From: ${tx.from.slice(0, 6)}...${tx.from.slice(-4)}`)
          );

          txItem.appendChild(
            createElement('div', {}, `Date: ${new Date(tx.timestamp * 1000).toLocaleString()}`)
          );

          transactionsList.appendChild(txItem);
        });

        statsSection.appendChild(transactionsList);
      } else {
        statsSection.appendChild(
          createElement('p', {}, 'No investments through your link yet')
        );
      }

      // Add refresh button
      const refreshButton = createElement(
        'button',
        {
          onclick: fetchReferralStats,
          class: 'refresh-button'
        },
        '🔄 Refresh Stats'
      );
      statsSection.appendChild(refreshButton);

      referralSection.appendChild(statsSection);
      container.appendChild(referralSection);
    }

    root.appendChild(container);
  };

  // Initial render
  renderApp();
}

// Start the application
window.onload = createApp;
