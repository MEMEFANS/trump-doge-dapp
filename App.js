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

    const container = createElement('div', {
      style: 'background: linear-gradient(135deg, #1a1f2e 0%, #2a3142 100%); min-height: 100vh; color: white; padding: 20px; font-family: "Roboto", sans-serif;'
    });

    const content = createElement('div', {
      style: `
        max-width: 1200px;
        margin: 0 auto;
        padding: 2rem;
      `
    });

    // Header section with yellow background
    const header = createElement('div', {
      style: `
        background: linear-gradient(135deg, #FFD700 0%, #FFA500 100%);
        padding: 3rem;
        border-radius: 20px;
        text-align: center;
        margin-bottom: 4rem;
        box-shadow: 0 4px 20px rgba(255, 215, 0, 0.3);
      `
    });

    header.appendChild(
      createElement('h1', {
        style: `
          font-size: 4rem;
          font-weight: bold;
          color: #1a1f2e;
          margin-bottom: 1.5rem;
          text-transform: uppercase;
          text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.2);
        `
      }, 'TRUMP DOGE 2025')
    );

    header.appendChild(
      createElement('h2', {
        style: `
          font-size: 2.5rem;
          color: #1a1f2e;
          margin-bottom: 1.5rem;
          text-transform: uppercase;
          font-weight: bold;
          text-shadow: 1px 1px 2px rgba(0, 0, 0, 0.2);
        `
      }, 'CRYPTO IS GREAT AGAIN! 🚀')
    );

    header.appendChild(
      createElement('p', {
        style: `
          font-size: 1.5rem;
          color: #1a1f2e;
          font-weight: 500;
          text-shadow: 1px 1px 2px rgba(0, 0, 0, 0.1);
        `
      }, 'Official Crypto of the Trump Administration')
    );

    content.appendChild(header);

    // Private sale section
    const fundraising = createElement('section', {
      style: `
        background: rgba(26, 31, 46, 0.8);
        padding: 4rem 2rem;
        border-radius: 20px;
        margin-bottom: 4rem;
        border: 1px solid rgba(20, 241, 149, 0.2);
        text-align: center;
      `
    });

    fundraising.appendChild(
      createElement('h2', {
        style: `
          font-size: 4rem;
          font-weight: bold;
          color: #14F195;
          margin-bottom: 3rem;
          text-transform: uppercase;
          text-shadow: 0 0 20px rgba(20, 241, 149, 0.5);
          letter-spacing: 2px;
        `
      }, 'TRUMP DOGE')
    );

    // Add sale details
    const saleDetails = [
      { label: 'Price', value: '1 SOL = 225,000 TDOGE' },
      { label: 'Min Investment', value: '0.1 SOL' },
      { label: 'Total Supply', value: '10,000,000,000 TDOGE' },
      { label: 'Private Sale Allocation', value: '45%' }
    ];

    const detailsContainer = createElement('div', {
      style: 'display: grid; grid-template-columns: repeat(2, 1fr); gap: 1.5rem; margin: 2.5rem auto; padding: 1.5rem; max-width: 700px;'
    });

    saleDetails.forEach(detail => {
      const detailBox = createElement('div', {
        style: 'text-align: center; padding: 2rem; background: rgba(26, 31, 46, 0.8); border-radius: 12px; border: 1px solid rgba(20, 241, 149, 0.2); box-shadow: 0 4px 20px rgba(20, 241, 149, 0.1);'
      });

      detailBox.appendChild(
        createElement('div', {
          style: 'color: #14F195; font-size: 1rem; margin-bottom: 1rem; text-transform: uppercase; letter-spacing: 1px;'
        }, detail.label)
      );

      detailBox.appendChild(
        createElement('div', {
          style: 'color: white; font-size: 1.4rem; font-weight: bold; letter-spacing: 0.5px;'
        }, detail.value)
      );

      detailsContainer.appendChild(detailBox);
    });

    fundraising.appendChild(detailsContainer);

    if (!walletAddress) {
      const connectButton = createElement('button', {
        onclick: connectWallet,
        style: `
          background: linear-gradient(135deg, #14F195 0%, #0fb574 100%);
          color: #1a1f2e;
          border: none;
          padding: 20px 40px;
          border-radius: 12px;
          font-size: 1.4rem;
          cursor: pointer;
          font-weight: bold;
          text-transform: uppercase;
          transition: all 0.3s ease;
          box-shadow: 0 4px 15px rgba(20, 241, 149, 0.3);
          width: 100%;
          max-width: 300px;
        `
      }, 'Connect Wallet');
      fundraising.appendChild(connectButton);
    } else {
      const walletInfo = createElement('p', {
        style: 'color: #14F195; margin-bottom: 2rem; font-size: 1.2rem;'
      }, `Connected: ${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`);
      fundraising.appendChild(walletInfo);

      const inputContainer = createElement('div', {
        style: 'display: flex; justify-content: center; gap: 1.5rem; flex-wrap: wrap; max-width: 600px; margin: 0 auto;'
      });

      const input = createElement('input', {
        type: 'number',
        value: amount,
        placeholder: 'Enter SOL Amount',
        onchange: (e) => { amount = e.target.value; },
        style: `
          padding: 20px;
          border-radius: 12px;
          border: 1px solid #14F195;
          background-color: rgba(20, 241, 149, 0.1);
          color: white;
          width: 250px;
          text-align: center;
          font-size: 1.2rem;
          outline: none;
          transition: all 0.3s ease;
        `
      });

      const donateButton = createElement('button', {
        onclick: handleDonate,
        style: `
          background: linear-gradient(135deg, #14F195 0%, #0fb574 100%);
          color: #1a1f2e;
          border: none;
          padding: 20px 40px;
          border-radius: 12px;
          font-size: 1.2rem;
          cursor: pointer;
          font-weight: bold;
          text-transform: uppercase;
          transition: all 0.3s ease;
          box-shadow: 0 4px 15px rgba(20, 241, 149, 0.3);
          min-width: 250px;
        `
      }, 'CONTRIBUTE NOW');

      inputContainer.appendChild(input);
      inputContainer.appendChild(donateButton);
      fundraising.appendChild(inputContainer);

      // Add referral link section
      const referralSection = createElement('div', {
        style: `
          margin-top: 2rem;
          padding: 2rem;
          background: rgba(26, 31, 46, 0.8);
          border-radius: 12px;
          border: 1px solid rgba(20, 241, 149, 0.2);
        `
      });

      referralSection.appendChild(
        createElement('h3', {
          style: 'color: #FFD700; margin-bottom: 1.5rem; font-size: 1.6rem; text-transform: uppercase;'
        }, 'Your Referral Link')
      );

      const referralLink = generateReferralLink();
      const linkDisplay = createElement('div', {
        style: `
          background: rgba(255, 255, 255, 0.05);
          padding: 1.5rem;
          border-radius: 12px;
          margin-bottom: 1.5rem;
          word-break: break-all;
          color: white;
          font-family: monospace;
          font-size: 1.1rem;
          border: 1px solid rgba(20, 241, 149, 0.2);
        `
      }, referralLink);
      referralSection.appendChild(linkDisplay);

      const copyButton = createElement('button', {
        onclick: copyReferralLink,
        style: `
          background: linear-gradient(135deg, #14F195 0%, #0fb574 100%);
          color: #1a1f2e;
          border: none;
          padding: 15px 30px;
          border-radius: 12px;
          font-size: 1.2rem;
          cursor: pointer;
          font-weight: bold;
          text-transform: uppercase;
          transition: all 0.3s ease;
          width: 100%;
          max-width: 300px;
          margin: 0 auto;
          display: block;
        `
      }, '📋 Copy Referral Link');
      referralSection.appendChild(copyButton);

      // Add referral statistics
      const statsSection = createElement('div', {
        style: `
          margin-top: 2rem;
          padding-top: 2rem;
          border-top: 1px solid rgba(20, 241, 149, 0.2);
        `
      });

      statsSection.appendChild(
        createElement('h4', {
          style: 'color: #14F195; margin-bottom: 1.5rem; font-size: 1.4rem;'
        }, 'Investment Statistics')
      );

      statsSection.appendChild(
        createElement('div', {
          style: 'color: white; font-size: 1.2rem; margin-bottom: 1.5rem;'
        }, `Total Investment Through Your Link: ${referralStats.totalAmount.toFixed(2)} SOL`)
      );

      if (referralStats.transactions.length > 0) {
        const transactionsList = createElement('div', {
          style: 'max-height: 300px; overflow-y: auto;'
        });

        statsSection.appendChild(
          createElement('h4', {
            style: 'color: #14F195; margin-bottom: 1rem; font-size: 1.2rem;'
          }, 'Recent Investments')
        );

        referralStats.transactions.forEach(tx => {
          const txItem = createElement('div', {
            style: `
              padding: 1rem;
              background: rgba(26, 31, 46, 0.8);
              border-radius: 12px;
              margin-bottom: 0.8rem;
              border: 1px solid rgba(20, 241, 149, 0.2);
            `
          });

          txItem.appendChild(
            createElement('div', {
              style: 'color: #14F195; font-size: 1.1rem; margin-bottom: 0.5rem;'
            }, `Amount: ${tx.amount.toFixed(2)} SOL`)
          );

          txItem.appendChild(
            createElement('div', {
              style: 'color: white; font-size: 0.9rem;'
            }, `From: ${tx.from.slice(0, 6)}...${tx.from.slice(-4)}`)
          );

          txItem.appendChild(
            createElement('div', {
              style: 'color: #888; font-size: 0.9rem;'
            }, `Date: ${new Date(tx.timestamp * 1000).toLocaleString()}`)
          );

          transactionsList.appendChild(txItem);
        });

        statsSection.appendChild(transactionsList);
      } else {
        statsSection.appendChild(
          createElement('p', {
            style: 'color: #888; font-style: italic; text-align: center;'
          }, 'No investments through your link yet')
        );
      }

      // Add refresh button
      const refreshButton = createElement('button', {
        onclick: fetchReferralStats,
        style: `
          background: linear-gradient(135deg, #14F195 0%, #0fb574 100%);
          color: #1a1f2e;
          border: none;
          padding: 12px 24px;
          border-radius: 12px;
          font-size: 1.1rem;
          cursor: pointer;
          font-weight: bold;
          transition: all 0.3s ease;
          margin-top: 1.5rem;
          width: 100%;
          max-width: 200px;
          margin: 1.5rem auto 0;
          display: block;
          text-transform: uppercase;
          box-shadow: 0 4px 15px rgba(20, 241, 149, 0.3);
        `
      }, '🔄 Refresh Stats');
      statsSection.appendChild(refreshButton);

      referralSection.appendChild(statsSection);
      fundraising.appendChild(referralSection);
    }

    content.appendChild(fundraising);

    // Main features section
    const mainFeaturesSection = createElement('div', {
      style: `
        background: rgba(26, 31, 46, 0.8);
        padding: 2rem;
        border-radius: 15px;
        margin-bottom: 2rem;
        border: 2px solid #FFD700;
      `
    });

    mainFeaturesSection.appendChild(
      createElement('h3', {
        style: 'color: #FFD700; margin-bottom: 1.5rem; font-size: 1.8rem; text-transform: uppercase;'
      }, 'The People\'s Crypto')
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

    const mainFeaturesList = createElement('div', {
      style: 'display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 1.5rem;'
    });

    mainFeatures.forEach(feature => {
      const featureCard = createElement('div', {
        style: 'background: rgba(255, 255, 255, 0.05); padding: 1.5rem; border-radius: 12px; border: 1px solid rgba(20, 241, 149, 0.2);'
      });
      
      featureCard.appendChild(
        createElement('h4', {
          style: 'color: #14F195; margin-bottom: 1rem; font-size: 1.2rem;'
        }, feature.title)
      );
      
      featureCard.appendChild(
        createElement('p', {
          style: 'color: white; font-size: 1rem; line-height: 1.5;'
        }, feature.description)
      );
      
      mainFeaturesList.appendChild(featureCard);
    });

    mainFeaturesSection.appendChild(mainFeaturesList);

    // Add achievement banner
    const achievementBanner = createElement('div', {
      style: `
        background: linear-gradient(135deg, rgba(20, 241, 149, 0.1) 0%, rgba(255, 215, 0, 0.1) 100%);
        padding: 1.5rem;
        border-radius: 12px;
        margin: 2rem 0;
        border: 2px solid #FFD700;
        text-align: center;
      `
    });

    achievementBanner.appendChild(
      createElement('h3', {
        style: 'color: #FFD700; margin-bottom: 1rem; font-size: 1.6rem;'
      }, '🏆 TRUMP DOGE Achievements')
    );

    const achievements = [
      'Fastest Growing Crypto of 2025',
      'Official Partner of Trump Foundation',
      'Over 1 Million Patriot Holders',
      'Most Secure Token Launch of 2025'
    ];

    achievements.forEach(achievement => {
      achievementBanner.appendChild(
        createElement('div', {
          style: 'color: #14F195; margin: 0.5rem 0; font-size: 1.1rem; font-weight: bold;'
        }, `✓ ${achievement}`)
      );
    });

    mainFeaturesSection.appendChild(achievementBanner);
    content.appendChild(mainFeaturesSection);

    // Project description
    const description = createElement('div', {
      style: 'background: rgba(20, 241, 149, 0.1); padding: 2rem; border-radius: 15px; margin-bottom: 2rem; border: 1px solid rgba(20, 241, 149, 0.2); backdrop-filter: blur(10px);'
    });
    description.appendChild(
      createElement('h2', { 
        style: 'color: #14F195; margin-bottom: 1.5rem; font-size: 2rem;' 
      }, 'About TRUMP DOGE')
    );
    description.appendChild(
      createElement('p', {
        style: 'font-size: 1.1rem; line-height: 1.6; margin-bottom: 1rem;'
      }, 'TRUMP DOGE is the most tremendous, absolutely fantastic fusion of two legendary meme communities. We\'re combining the unstoppable energy of DOGE with the winning spirit of TRUMP to create something truly spectacular!')
    );
    description.appendChild(
      createElement('p', {
        style: 'font-size: 1.1rem; line-height: 1.6; margin-bottom: 1.5rem;'
      }, 'Our mission is simple: We\'re going to make crypto great again, and we\'re going to make it greater than ever before! 🚀')
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

    const descriptionFeaturesList = createElement('div', {
      style: 'display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 1.5rem; margin-top: 2rem;'
    });

    descriptionFeatures.forEach(feature => {
      const featureCard = createElement('div', {
        style: 'background: rgba(255, 255, 255, 0.05); padding: 1.5rem; border-radius: 12px; border: 1px solid rgba(20, 241, 149, 0.2);'
      });
      
      featureCard.appendChild(
        createElement('h4', {
          style: 'color: #14F195; margin-bottom: 1rem; font-size: 1.2rem;'
        }, feature.title)
      );
      
      featureCard.appendChild(
        createElement('p', {
          style: 'color: white; font-size: 1rem;'
        }, feature.description)
      );
      
      descriptionFeaturesList.appendChild(featureCard);
    });

    description.appendChild(descriptionFeaturesList);

    // Tokenomics section
    const tokenomics = createElement('div', {
      style: 'margin-top: 2rem; padding-top: 2rem; border-top: 1px solid rgba(20, 241, 149, 0.2);'
    });

    tokenomics.appendChild(
      createElement('h3', {
        style: 'color: #14F195; margin-bottom: 1.5rem; font-size: 1.8rem;'
      }, 'TRUMP DOGE Tokenomics')
    );

    const tokenomicsDetails = [
      'Total Supply: 10,000,000,000 $TRUMPDOGE',
      'Private Sale: 45%',
      'Liquidity Pool: 5%',
      'Trump Foundation: 50%'
    ];

    const tokenomicsList = createElement('ul', {
      style: 'list-style: none; padding: 0;'
    });

    tokenomicsDetails.forEach(detail => {
      tokenomicsList.appendChild(
        createElement('li', {
          style: 'color: #fff; font-size: 1.1rem; margin-bottom: 0.8rem; display: flex; align-items: center; gap: 0.5rem;'
        }, `🔥 ${detail}`)
      );
    });

    tokenomics.appendChild(tokenomicsList);

    // Add vesting schedule
    const vestingTitle = createElement('h3', {
      style: 'color: #14F195; margin: 2rem 0 1rem; font-size: 1.4rem;'
    }, 'Vesting Schedule');
    tokenomics.appendChild(vestingTitle);

    const vestingDetails = [
      'Launch: 4.5% Unlock',
      '1% Unlock per 500% Price Increase'
    ];

    const vestingList = createElement('ul', {
      style: 'list-style: none; padding: 0;'
    });

    vestingDetails.forEach(detail => {
      vestingList.appendChild(
        createElement('li', {
          style: 'color: #fff; font-size: 1.1rem; margin-bottom: 0.8rem; display: flex; align-items: center; gap: 0.5rem;'
        }, `🚀 ${detail}`)
      );
    });

    tokenomics.appendChild(vestingList);
    description.appendChild(tokenomics);

    // Roadmap preview
    const roadmap = createElement('div', {
      style: 'margin-top: 2rem; padding-top: 2rem; border-top: 1px solid rgba(20, 241, 149, 0.2);'
    });

    roadmap.appendChild(
      createElement('h3', {
        style: 'color: #14F195; margin-bottom: 1.5rem; font-size: 1.8rem;'
      }, 'The Greatest Roadmap Ever')
    );

    roadmap.appendChild(
      createElement('p', {
        style: 'color: #fff; font-size: 1.1rem; line-height: 1.6; margin-bottom: 1rem;'
      }, 'Phase 1: Launch & Community Building 🚀')
    );
    roadmap.appendChild(
      createElement('p', {
        style: 'color: #fff; font-size: 1.1rem; line-height: 1.6; margin-bottom: 1rem;'
      }, 'Phase 2: Exchange Listings & Partnerships 🤝')
    );
    roadmap.appendChild(
      createElement('p', {
        style: 'color: #fff; font-size: 1.1rem; line-height: 1.6;'
      }, 'Phase 3: TRUMP DOGE Ecosystem Expansion 🌟')
    );

    description.appendChild(roadmap);
    content.appendChild(description);

    container.appendChild(content);
    root.appendChild(container);
  };

  // Initial render
  renderApp();
}

// Start the application
window.onload = createApp;
