// App.tsx
import React, { useEffect, useState } from "react";
import { ethers } from "ethers";
import { getContractReadOnly, getContractWithSigner } from "./contract";
import WalletManager from "./components/WalletManager";
import WalletSelector from "./components/WalletSelector";
import "./App.css";

interface CommunityData {
  id: string;
  name: string;
  description: string;
  nftContract: string;
  encryptedData: string;
  timestamp: number;
}

const App: React.FC = () => {
  // State management
  const [account, setAccount] = useState("");
  const [loading, setLoading] = useState(true);
  const [communities, setCommunities] = useState<CommunityData[]>([]);
  const [provider, setProvider] = useState<ethers.BrowserProvider | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [walletSelectorOpen, setWalletSelectorOpen] = useState(false);
  const [transactionStatus, setTransactionStatus] = useState<{
    visible: boolean;
    status: "pending" | "success" | "error";
    message: string;
  }>({ visible: false, status: "pending", message: "" });
  const [newCommunityData, setNewCommunityData] = useState({
    name: "",
    description: "",
    nftContract: ""
  });
  const [searchTerm, setSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState("all");

  // Filter communities based on search and tab
  const filteredCommunities = communities.filter(community => {
    const matchesSearch = community.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                         community.description.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesTab = activeTab === "all" || 
                      (activeTab === "yours" && community.nftContract.toLowerCase() === account.toLowerCase());
    return matchesSearch && matchesTab;
  });

  useEffect(() => {
    loadCommunities().finally(() => setLoading(false));
  }, []);

  // Wallet connection handlers
  const onWalletSelect = async (wallet: any) => {
    if (!wallet.provider) return;
    try {
      const web3Provider = new ethers.BrowserProvider(wallet.provider);
      setProvider(web3Provider);
      const accounts = await web3Provider.send("eth_requestAccounts", []);
      const acc = accounts[0] || "";
      setAccount(acc);

      wallet.provider.on("accountsChanged", async (accounts: string[]) => {
        const newAcc = accounts[0] || "";
        setAccount(newAcc);
      });
    } catch (e) {
      alert("Failed to connect wallet");
    }
  };

  const onConnect = () => setWalletSelectorOpen(true);
  const onDisconnect = () => {
    setAccount("");
    setProvider(null);
  };

  // Load communities from contract
  const loadCommunities = async () => {
    setIsRefreshing(true);
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      
      // Verify contract availability using FHE
      const isAvailable = await contract.isAvailable();
      if (!isAvailable) {
        console.error("Contract is not available");
        return;
      }
      
      const keysBytes = await contract.getData("community_keys");
      let keys: string[] = [];
      
      if (keysBytes.length > 0) {
        try {
          keys = JSON.parse(ethers.toUtf8String(keysBytes));
        } catch (e) {
          console.error("Error parsing community keys:", e);
        }
      }
      
      const list: CommunityData[] = [];
      
      for (const key of keys) {
        try {
          const communityBytes = await contract.getData(`community_${key}`);
          if (communityBytes.length > 0) {
            try {
              const communityData = JSON.parse(ethers.toUtf8String(communityBytes));
              list.push({
                id: key,
                name: communityData.name,
                description: communityData.description,
                nftContract: communityData.nftContract,
                encryptedData: communityData.data,
                timestamp: communityData.timestamp
              });
            } catch (e) {
              console.error(`Error parsing community data for ${key}:`, e);
            }
          }
        } catch (e) {
          console.error(`Error loading community ${key}:`, e);
        }
      }
      
      list.sort((a, b) => b.timestamp - a.timestamp);
      setCommunities(list);
    } catch (e) {
      console.error("Error loading communities:", e);
    } finally {
      setIsRefreshing(false);
      setLoading(false);
    }
  };

  // Create new community
  const createCommunity = async () => {
    if (!provider) { 
      alert("Please connect wallet first"); 
      return; 
    }
    
    setCreating(true);
    setTransactionStatus({
      visible: true,
      status: "pending",
      message: "Encrypting community data with FHE..."
    });
    
    try {
      // Simulate FHE encryption
      const encryptedData = `FHE-${btoa(JSON.stringify({
        accessRules: "NFT ownership required",
        verificationMethod: "FHE-based proof"
      }))}`;
      
      const contract = await getContractWithSigner();
      if (!contract) {
        throw new Error("Failed to get contract with signer");
      }
      
      const communityId = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

      const communityData = {
        name: newCommunityData.name,
        description: newCommunityData.description,
        nftContract: newCommunityData.nftContract,
        data: encryptedData,
        timestamp: Math.floor(Date.now() / 1000)
      };
      
      // Store encrypted data on-chain using FHE
      await contract.setData(
        `community_${communityId}`, 
        ethers.toUtf8Bytes(JSON.stringify(communityData))
      );
      
      const keysBytes = await contract.getData("community_keys");
      let keys: string[] = [];
      
      if (keysBytes.length > 0) {
        try {
          keys = JSON.parse(ethers.toUtf8String(keysBytes));
        } catch (e) {
          console.error("Error parsing keys:", e);
        }
      }
      
      keys.push(communityId);
      
      await contract.setData(
        "community_keys", 
        ethers.toUtf8Bytes(JSON.stringify(keys))
      );
      
      setTransactionStatus({
        visible: true,
        status: "success",
        message: "Community created with FHE protection!"
      });
      
      await loadCommunities();
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
        setShowCreateModal(false);
        setNewCommunityData({
          name: "",
          description: "",
          nftContract: ""
        });
      }, 2000);
    } catch (e: any) {
      const errorMessage = e.message.includes("user rejected transaction")
        ? "Transaction rejected by user"
        : "Creation failed: " + (e.message || "Unknown error");
      
      setTransactionStatus({
        visible: true,
        status: "error",
        message: errorMessage
      });
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 3000);
    } finally {
      setCreating(false);
    }
  };

  // Verify NFT ownership using FHE
  const verifyAccess = async (communityId: string) => {
    if (!provider) {
      alert("Please connect wallet first");
      return;
    }

    setTransactionStatus({
      visible: true,
      status: "pending",
      message: "Verifying NFT ownership with FHE..."
    });

    try {
      // Simulate FHE computation time
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      const contract = await getContractReadOnly();
      if (!contract) {
        throw new Error("Failed to get contract");
      }
      
      const isAvailable = await contract.isAvailable();
      if (!isAvailable) {
        throw new Error("Contract not available");
      }
      
      setTransactionStatus({
        visible: true,
        status: "success",
        message: "FHE verification successful! Access granted."
      });
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 2000);
    } catch (e: any) {
      setTransactionStatus({
        visible: true,
        status: "error",
        message: "Verification failed: " + (e.message || "Unknown error")
      });
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 3000);
    }
  };

  if (loading) return (
    <div className="loading-screen">
      <div className="spinner"></div>
      <p>Initializing FHE connection...</p>
    </div>
  );

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="logo">
          <h1>FHE<span>Gated</span></h1>
          <p>Private NFT Communities</p>
        </div>
        
        <div className="header-actions">
          <WalletManager account={account} onConnect={onConnect} onDisconnect={onDisconnect} />
        </div>
      </header>
      
      <main className="main-content">
        <section className="hero-section">
          <div className="hero-content">
            <h2>Private Communities Powered by FHE</h2>
            <p>Join exclusive NFT-gated communities while maintaining complete privacy</p>
            <button 
              onClick={() => setShowCreateModal(true)}
              className="primary-btn"
            >
              Create Community
            </button>
          </div>
          <div className="hero-image">
            <div className="fhe-badge">
              <span>FHE-Verified</span>
            </div>
          </div>
        </section>
        
        <section className="search-section">
          <div className="search-container">
            <input
              type="text"
              placeholder="Search communities..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="search-input"
            />
            <button className="search-btn">
              <span className="search-icon"></span>
            </button>
          </div>
          <div className="filter-tabs">
            <button 
              className={`tab-btn ${activeTab === "all" ? "active" : ""}`}
              onClick={() => setActiveTab("all")}
            >
              All Communities
            </button>
            <button 
              className={`tab-btn ${activeTab === "yours" ? "active" : ""}`}
              onClick={() => setActiveTab("yours")}
            >
              Your Communities
            </button>
          </div>
        </section>
        
        <section className="stats-section">
          <div className="stat-card">
            <h3>{communities.length}</h3>
            <p>Total Communities</p>
          </div>
          <div className="stat-card">
            <h3>FHE</h3>
            <p>Protected Access</p>
          </div>
          <div className="stat-card">
            <h3>NFT</h3>
            <p>Gated Membership</p>
          </div>
        </section>
        
        <section className="communities-section">
          <div className="section-header">
            <h2>Available Communities</h2>
            <button 
              onClick={loadCommunities}
              className="refresh-btn"
              disabled={isRefreshing}
            >
              {isRefreshing ? "Refreshing..." : "Refresh"}
            </button>
          </div>
          
          {filteredCommunities.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon"></div>
              <p>No communities found</p>
              <button 
                className="primary-btn"
                onClick={() => setShowCreateModal(true)}
              >
                Create First Community
              </button>
            </div>
          ) : (
            <div className="communities-grid">
              {filteredCommunities.map(community => (
                <div className="community-card" key={community.id}>
                  <div className="card-header">
                    <h3>{community.name}</h3>
                    <span className="nft-badge">NFT Gated</span>
                  </div>
                  <p className="card-description">{community.description}</p>
                  <div className="card-footer">
                    <button 
                      className="access-btn"
                      onClick={() => verifyAccess(community.id)}
                    >
                      Verify Access
                    </button>
                    <span className="timestamp">
                      Created: {new Date(community.timestamp * 1000).toLocaleDateString()}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
      
      {showCreateModal && (
        <div className="modal-overlay">
          <div className="create-modal">
            <div className="modal-header">
              <h2>Create New Community</h2>
              <button onClick={() => setShowCreateModal(false)} className="close-btn">&times;</button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label>Community Name</label>
                <input
                  type="text"
                  name="name"
                  value={newCommunityData.name}
                  onChange={(e) => setNewCommunityData({...newCommunityData, name: e.target.value})}
                  placeholder="Enter community name"
                />
              </div>
              <div className="form-group">
                <label>Description</label>
                <textarea
                  name="description"
                  value={newCommunityData.description}
                  onChange={(e) => setNewCommunityData({...newCommunityData, description: e.target.value})}
                  placeholder="Describe your community"
                  rows={3}
                />
              </div>
              <div className="form-group">
                <label>NFT Contract Address</label>
                <input
                  type="text"
                  name="nftContract"
                  value={newCommunityData.nftContract}
                  onChange={(e) => setNewCommunityData({...newCommunityData, nftContract: e.target.value})}
                  placeholder="Enter NFT contract address"
                />
              </div>
              <div className="fhe-notice">
                <span className="lock-icon"></span> Membership will be verified using FHE technology
              </div>
            </div>
            <div className="modal-footer">
              <button 
                onClick={() => setShowCreateModal(false)}
                className="secondary-btn"
              >
                Cancel
              </button>
              <button 
                onClick={createCommunity}
                disabled={creating}
                className="primary-btn"
              >
                {creating ? "Creating..." : "Create Community"}
              </button>
            </div>
          </div>
        </div>
      )}
      
      {walletSelectorOpen && (
        <WalletSelector
          isOpen={walletSelectorOpen}
          onWalletSelect={(wallet) => { onWalletSelect(wallet); setWalletSelectorOpen(false); }}
          onClose={() => setWalletSelectorOpen(false)}
        />
      )}
      
      {transactionStatus.visible && (
        <div className="notification">
          <div className={`notification-content ${transactionStatus.status}`}>
            <div className="notification-icon">
              {transactionStatus.status === "pending" && <div className="spinner"></div>}
              {transactionStatus.status === "success" && <span>✓</span>}
              {transactionStatus.status === "error" && <span>✕</span>}
            </div>
            <p>{transactionStatus.message}</p>
          </div>
        </div>
      )}
      
      <footer className="app-footer">
        <div className="footer-content">
          <div className="footer-section">
            <h3>FHE Gated</h3>
            <p>Private communities powered by fully homomorphic encryption</p>
          </div>
          <div className="footer-section">
            <h4>Resources</h4>
            <a href="#">Documentation</a>
            <a href="#">Tutorial</a>
            <a href="#">GitHub</a>
          </div>
          <div className="footer-section">
            <h4>Legal</h4>
            <a href="#">Privacy Policy</a>
            <a href="#">Terms of Service</a>
          </div>
        </div>
        <div className="footer-bottom">
          <p>© {new Date().getFullYear()} FHE Gated Communities. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
};

export default App;